'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';
import { BANK_STATEMENT_SOURCE_LABELS } from '@/lib/bank-statements/providers';
import type { BankStatementDocumentView, BankStatementsState, CoverageStatus } from '@/lib/bank-statements/service';
import BankStatementUploader from '../bank-statements/BankStatementUploader';
import { useBankConnect } from '../bank-statements/useBankConnect';
import { STATUS_COLORS, formatMonthLabel } from './cashProofClient';
import { buttonStyle, cardStyle, stickyCol, tdStyle, thStyle } from './cashProofStyles';

type BankStatementsResponse = BankStatementsState & {
  companyId: string;
  dataRoomReady: boolean;
  canUpload: boolean;
  error?: string;
};

const COVERAGE: Record<CoverageStatus, { short: string; label: string; colors: { bg: string; fg: string; border: string } }> = {
  BANK_API: { short: 'API', label: 'Bank API', colors: STATUS_COLORS.TIED },
  BANK_DATA: { short: 'DATA', label: 'Bank Data, No PDF', colors: { bg: '#f0fdfa', fg: '#0f766e', border: '#5eead4' } },
  VERIFIED_UPLOAD: { short: 'VER', label: 'Verified Upload', colors: STATUS_COLORS.RECEIVED },
  UPLOAD: { short: 'UP', label: 'Upload, Not Verified', colors: STATUS_COLORS.CLEARED },
  SUSPECT_UPLOAD: { short: 'SUS', label: 'Suspect Upload', colors: STATUS_COLORS.EXCEPTION },
  MISSING: { short: '—', label: 'Missing', colors: STATUS_COLORS.REQUESTED },
};

const TAMPER_LABELS: Record<string, string> = {
  PENDING: 'Checking',
  AUTHENTIC: 'Authentic',
  SUSPECT: 'Suspect',
  FAILED: 'Check Failed',
};

const SCAN_LABELS: Record<string, string> = {
  clean: 'Clean',
  blocked: 'Blocked',
  scan_failed: 'Scan Failed',
  pending_scan: 'Pending',
};

async function fetchBankStatements(companyId: string): Promise<BankStatementsResponse> {
  const res = await fetch(`/api/bank-statements?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
  const json = (await res.json().catch(() => ({}))) as BankStatementsResponse;
  if (!res.ok) throw new Error(json?.error || `Failed to load bank statements (${res.status})`);
  return json;
}

function verificationLabel(doc: BankStatementDocumentView) {
  if (doc.source !== 'UPLOAD') return 'From bank';
  return doc.tamperStatus ? TAMPER_LABELS[doc.tamperStatus] || doc.tamperStatus : 'Not checked';
}

function Badge({ status }: { status: CoverageStatus }) {
  const c = COVERAGE[status].colors;
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: '28px',
        padding: '1px 4px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: 700,
        textAlign: 'center',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
      }}
    >
      {COVERAGE[status].short}
    </span>
  );
}

export default function BankStatementsWorkspace({ companyId }: { companyId: string | null }) {
  const [data, setData] = useState<BankStatementsResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(companyId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      setData(await fetchBankStatements(companyId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    fetchBankStatements(companyId)
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const bank = useBankConnect(companyId || '', load);

  const uploadOnly = useMemo(() => new Set(data?.uploadOnlyMonths || []), [data]);
  const accountName = (id: string | null) => (id && data?.accounts.find((a) => a.id === id)?.accountName) || '—';

  if (!companyId) return <div style={cardStyle}>Select a company to work on its bank statements.</div>;
  if (loading) return <div style={cardStyle}>Loading bank statements…</div>;
  if (!data) return <div style={{ ...cardStyle, color: '#b91c1c' }}>{error || 'Bank statements are unavailable.'}</div>;

  const { summary } = data;
  const canConnect = data.dataRoomReady && data.canUpload;
  const unplaced = data.documents.filter((d) => d.unplacedReason);

  return (
    <div>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#1e293b', margin: 0 }}>Bank Statements</h2>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', maxWidth: 760 }}>
              Connect the client&apos;s bank to pull up to 24 months of statements directly from the bank. When the bank does not provide
              statement PDFs, 24 months of bank data (transactions and balances) is pulled instead. Upload months 25–36 and statements
              from banks the connectors do not support. Everything is stored in the Data Room Bank Statements folder.
            </div>
          </div>
          <button style={buttonStyle()} onClick={() => void load()}>
            Refresh
          </button>
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '12px', fontSize: '12px', color: '#334155' }}>
          <span>
            <strong>{summary.covered}</strong> of {summary.accountMonths} account-months received
          </span>
          <span>
            <strong>{summary.bankApi}</strong> from the bank
          </span>
          <span>
            <strong>{summary.uploads}</strong> uploaded
          </span>
          <span>
            <strong>{summary.missing}</strong> missing
          </span>
        </div>
        <div
          style={{
            marginTop: '10px',
            fontSize: '12px',
            padding: '8px 10px',
            borderRadius: '6px',
            border: `1px solid ${data.privateStorage && data.publicStatementCount === 0 ? '#6ee7b7' : '#fcd34d'}`,
            background: data.privateStorage && data.publicStatementCount === 0 ? '#ecfdf5' : '#fffbeb',
            color: data.privateStorage && data.publicStatementCount === 0 ? '#047857' : '#b45309',
          }}
        >
          {!data.privateStorage
            ? 'Private storage is not set up yet. New statements are saved to the standard Data Room store until it is.'
            : data.publicStatementCount > 0
              ? `Private storage is on. ${data.publicStatementCount} older statement${data.publicStatementCount === 1 ? ' is' : 's are'} still in the standard store and should be moved.`
              : 'Private storage is on. Statements are only served to signed-in users with Data Room access.'}
        </div>
        {error && <div style={{ marginTop: '8px', fontSize: '12px', color: '#b91c1c' }}>{error}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '12px' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>Connect a Bank</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', marginBottom: '10px' }}>
            The client signs in to their bank in the provider&apos;s secure window. We never see bank credentials, and the connection is
            removed as soon as the statements are pulled.
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {data.providers.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ fontSize: '12px', color: '#334155' }}>
                  <div style={{ fontWeight: 600 }}>{p.label}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{p.coverage}</div>
                </div>
                <button
                  style={{ ...buttonStyle('primary', !p.available || !canConnect || Boolean(bank.busyProvider)), whiteSpace: 'nowrap' }}
                  disabled={!p.available || !canConnect || Boolean(bank.busyProvider)}
                  title={p.available ? undefined : 'Available after this connector is set up'}
                  onClick={() => void bank.connect(p.id)}
                >
                  {bank.busyProvider === p.id ? 'Connecting…' : `Connect with ${p.label}`}
                </button>
              </div>
            ))}
          </div>
          {bank.status && (
            <div
              style={{
                marginTop: '10px',
                fontSize: '12px',
                color: bank.status.tone === 'error' ? '#b91c1c' : bank.status.tone === 'success' ? '#047857' : '#475569',
              }}
            >
              {bank.status.message}
            </div>
          )}
          {!canConnect && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#b45309' }}>
              {!data.dataRoomReady
                ? 'Enable the Data Room for this company before connecting a bank.'
                : 'You do not have upload access to the Bank Statements folder.'}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>Upload Statements</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', marginBottom: '10px' }}>
            For months 25–36 and banks the connectors do not reach. Uploaded statements are marked as uploads in the QoE report.
          </div>
          {!data.dataRoomReady ? (
            <div style={{ fontSize: '12px', color: '#b45309' }}>Enable the Data Room for this company before uploading statements.</div>
          ) : !data.canUpload ? (
            <div style={{ fontSize: '12px', color: '#64748b' }}>You do not have upload access to the Bank Statements folder.</div>
          ) : (
            <BankStatementUploader companyId={companyId} privateStorage={data.privateStorage} onUploaded={() => void load()} />
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>Statement Coverage</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              {data.months.length > 0 &&
                `${formatMonthLabel(data.months[0])} – ${formatMonthLabel(data.months[data.months.length - 1])}. Shaded months are older than the connectors return and must be uploaded.`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', fontSize: '11px', color: '#475569' }}>
            {(Object.keys(COVERAGE) as CoverageStatus[]).map((s) => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Badge status={s} /> {COVERAGE[s].label}
              </span>
            ))}
          </div>
        </div>
        {data.accounts.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>
            Start the Cash Proof to list the company&apos;s bank accounts. Statements are matched to accounts by the last 4 digits.
          </div>
        ) : (
          <div style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '10px' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, ...stickyCol(220), background: '#f8fafc', zIndex: 2 }}>Account</th>
                  {data.months.map((m) => (
                    <th key={m} style={{ ...thStyle, textAlign: 'center', background: uploadOnly.has(m) ? '#f1f5f9' : '#f8fafc' }}>
                      {formatMonthLabel(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((a) => (
                  <tr key={a.id}>
                    <td style={{ ...tdStyle, ...stickyCol(220) }}>
                      {a.accountName}
                      {a.accountLast4 ? <span style={{ color: '#64748b' }}> · x{a.accountLast4}</span> : null}
                    </td>
                    {data.months.map((m) => {
                      const cell = data.coverage[`${a.id}|${m}`];
                      const docId = cell?.documentIds[0];
                      return (
                        <td key={m} style={{ ...tdStyle, textAlign: 'center', background: uploadOnly.has(m) ? '#f8fafc' : 'white' }}>
                          {docId ? (
                            <a href={`/api/dataroom/documents/${docId}/view`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                              <Badge status={cell.status} />
                            </a>
                          ) : (
                            <Badge status={cell?.status || 'MISSING'} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>Statements</div>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
          {data.documents.length} file{data.documents.length === 1 ? '' : 's'} in the Bank Statements folder
          {unplaced.length > 0 ? `; ${unplaced.length} not on the coverage grid yet.` : '.'}
        </div>
        {data.documents.length > 0 && (
          <div style={{ overflow: 'auto', maxHeight: 420, border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '10px' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }}>File</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Account</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Month</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Source</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Verification</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Virus Scan</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Added</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.documents.map((d) => (
                  <tr key={d.id}>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>
                      <a href={`/api/dataroom/documents/${d.id}/view`} target="_blank" rel="noreferrer" style={{ color: '#2751d0' }}>
                        {d.fileName}
                      </a>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>
                      {d.coveredLast4s.length > 0 ? (
                        d.coveredLast4s.map((l) => `x${l}`).join(', ')
                      ) : (
                        <>
                          {accountName(d.bankAccountId)}
                          {d.accountLast4 ? <span style={{ color: '#64748b' }}> · x{d.accountLast4}</span> : null}
                        </>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>
                      {d.month
                        ? formatMonthLabel(d.month)
                        : d.period
                          ? `${formatMonthLabel(d.period.start)} – ${formatMonthLabel(d.period.end)}`
                          : '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>{BANK_STATEMENT_SOURCE_LABELS[d.source]}</td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>{verificationLabel(d)}</td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>{SCAN_LABELS[d.scanStatus] || d.scanStatus}</td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>
                      {formatEstDateTime(d.retrievedAt || d.uploadedAt)}
                      {d.uploadedByName && d.source === 'UPLOAD' ? <span style={{ color: '#64748b' }}> · {d.uploadedByName}</span> : null}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'left', whiteSpace: 'normal', minWidth: 240, color: d.unplacedReason ? '#b45309' : '#64748b' }}>
                      {d.unplacedReason || (d.isPrivate ? 'Private storage' : 'Standard storage')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
