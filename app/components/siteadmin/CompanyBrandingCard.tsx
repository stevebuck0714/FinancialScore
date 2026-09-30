'use client';

import React, { useRef, useState } from 'react';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

interface CompanyBrandingCardProps {
  company: {
    id: string;
    name?: string | null;
    userDefinedAllocations?: Record<string, any> | null;
  };
  onUpdated: (companyId: string, userDefinedAllocations: Record<string, any>) => void;
}

export default function CompanyBrandingCard({ company, onUpdated }: CompanyBrandingCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const logoUrl = String(company.userDefinedAllocations?.branding?.logoUrl || '').trim();

  const uploadLogo = async (file: File) => {
    setError('');
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Use a PNG, JPG, WebP, or GIF image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo files must be 2 MB or smaller.');
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.set('logo', file);
      const response = await fetch(`/api/companies/${encodeURIComponent(company.id)}/logo`, {
        method: 'POST',
        body,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Unable to upload logo');
      onUpdated(company.id, payload.company?.userDefinedAllocations || {});
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Unable to upload logo');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    setError('');
    setBusy(true);
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(company.id)}/logo`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Unable to remove logo');
      onUpdated(company.id, payload.company?.userDefinedAllocations || {});
    } catch (removeError: any) {
      setError(removeError?.message || 'Unable to remove logo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '12px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>Company Branding</div>
      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
        Upload a logo for the navigation bar. PNG, JPG, WebP, and GIF are supported; logos display proportionally within the header.
      </div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: '150px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', border: '1px dashed #cbd5e1', borderRadius: '6px', background: '#f8fafc' }}>
          {logoUrl ? (
            <img src={logoUrl} alt={`${company.name || 'Company'} logo`} style={{ maxWidth: '100%', maxHeight: '40px', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>No logo uploaded</span>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadLogo(file);
          }}
          disabled={busy}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{ padding: '7px 11px', border: 'none', borderRadius: '6px', background: busy ? '#94a3b8' : '#2563eb', color: 'white', fontSize: '12px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
        >
          {busy ? 'Saving…' : logoUrl ? 'Replace Logo' : 'Upload Logo'}
        </button>
        {logoUrl && (
          <button
            type="button"
            onClick={() => void removeLogo()}
            disabled={busy}
            style={{ padding: '7px 11px', border: '1px solid #dc2626', borderRadius: '6px', background: 'white', color: '#b91c1c', fontSize: '12px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
          >
            Delete Logo
          </button>
        )}
      </div>
      {error && <div style={{ color: '#b91c1c', fontSize: '12px', marginTop: '8px' }}>{error}</div>}
    </div>
  );
}
