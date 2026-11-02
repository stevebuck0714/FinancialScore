'use client';

import { ChangeEvent, useState } from 'react';

const BENNS_GRANT_PRODUCTION_COMPANY_ID = 'cmvzrhzis0000kw08conjfsll';

export default function CompanyPromotionPage() {
  const [promotionPackage, setPromotionPackage] = useState<unknown>(null);
  const [fileName, setFileName] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  async function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPromotionPackage(null);
    setFileName('');
    setStatus(null);
    setError(null);
    if (!file) return;

    try {
      setPromotionPackage(JSON.parse(await file.text()));
      setFileName(file.name);
    } catch {
      setError('Choose a valid Corelytics promotion package JSON file.');
    }
  }

  async function importPackage() {
    if (!promotionPackage || confirmation !== BENNS_GRANT_PRODUCTION_COMPANY_ID) {
      setError('Choose the package and type the production company ID exactly to confirm.');
      return;
    }

    setIsImporting(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch('/api/siteadmin/company-promotion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetCompanyId: BENNS_GRANT_PRODUCTION_COMPANY_ID,
          confirmation,
          promotionPackage,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Import failed.');
      setStatus(`Imported ${Number(payload.totalRows || 0).toLocaleString()} rows for ${payload.targetCompany}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: '48px auto', padding: '0 24px', fontFamily: 'Arial, sans-serif', color: '#0f172a' }}>
      <p style={{ color: '#2563eb', fontWeight: 700, fontSize: 13, letterSpacing: '0.08em' }}>SITE ADMIN · ONE-TIME DATA PROMOTION</p>
      <h1 style={{ fontSize: 32, margin: '8px 0 12px' }}>Import Benns Grant development data</h1>
      <p style={{ color: '#475569', lineHeight: 1.55 }}>
        This replaces only Benns Grant’s promoted business data in production. It does not alter QBD credentials, users, passwords, sync queues, or other companies.
      </p>

      <section style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 24, marginTop: 28 }}>
        <label style={{ display: 'block', fontWeight: 700, marginBottom: 8 }}>Promotion package</label>
        <input type="file" accept="application/json,.json" onChange={onFileSelected} />
        {fileName ? <p style={{ color: '#166534', marginBottom: 0 }}>Loaded: {fileName}</p> : null}

        <label style={{ display: 'block', fontWeight: 700, marginTop: 28, marginBottom: 8 }}>
          Confirm production company ID
        </label>
        <code style={{ display: 'block', background: '#f1f5f9', padding: 10, borderRadius: 6 }}>{BENNS_GRANT_PRODUCTION_COMPANY_ID}</code>
        <input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="Type the company ID exactly"
          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #94a3b8', borderRadius: 6, padding: 10, marginTop: 10 }}
        />

        <button
          type="button"
          onClick={importPackage}
          disabled={isImporting || !promotionPackage || confirmation !== BENNS_GRANT_PRODUCTION_COMPANY_ID}
          style={{ marginTop: 24, border: 0, borderRadius: 6, padding: '11px 16px', background: '#b91c1c', color: 'white', fontWeight: 700, cursor: 'pointer', opacity: isImporting ? 0.7 : 1 }}
        >
          {isImporting ? 'Importing…' : 'Replace Benns Grant business data'}
        </button>
        {status ? <p style={{ color: '#166534', fontWeight: 700 }}>{status}</p> : null}
        {error ? <p style={{ color: '#b91c1c', fontWeight: 700 }}>{error}</p> : null}
      </section>
    </main>
  );
}
