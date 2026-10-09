'use client';

import React from 'react';
import { upload } from '@vercel/blob/client';
import { formatEstDateTime } from '@/lib/time/eastern';
import OperationalDateRangeSync from './OperationalDateRangeSync';

type CoverageDataset = {
  datasetKey: string;
  label: string;
  dataMode: string;
  rowCount: number;
  minDate: string | null;
  maxDate: string | null;
  lastSyncedAt: string | null;
};

type CoverageSource = {
  sourceCode: string;
  label: string;
  provider: string | null;
  connectionStatus: string | null;
  hasAdapter: boolean;
  supportsLive: boolean;
  supportsMock: boolean;
  supportsUpload: boolean;
  builtInDatasets: Array<{ dataset: string; rowCount: number }>;
  mode: 'LIVE' | 'MOCK' | 'NONE';
  mockEnabled: boolean;
  liveSince: string | null;
  lastRunStatus: string | null;
  lastRunMessage: string | null;
  datasets: CoverageDataset[];
  gap: string | null;
};

type Coverage = {
  sources: CoverageSource[];
  availableAdapters: Array<{ sourceCode: string; label: string }>;
  accountingDatasets: Array<{ dataset: string; rowCount: number; minDate: string | null; maxDate: string | null }>;
};

type SourceAction = 'enable_mock' | 'disable_mock' | 'run_live' | 'run_mock';

const MODE_STYLES: Record<CoverageSource['mode'], { label: string; color: string; background: string }> = {
  LIVE: { label: 'Live', color: '#166534', background: '#dcfce7' },
  MOCK: { label: 'Mock', color: '#92400e', background: '#fef3c7' },
  NONE: { label: 'No data', color: '#991b1b', background: '#fee2e2' },
};

const buttonStyle = (color: string, disabled: boolean): React.CSSProperties => ({
  padding: '4px 8px',
  background: 'white',
  color,
  border: `1px solid ${color}`,
  borderRadius: '6px',
  fontSize: '11px',
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
});

const cell: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid #e2e8f0', textAlign: 'left' };

export default function OperationalDataCoveragePanel({ companyId }: { companyId: string }) {
  const [open, setOpen] = React.useState(false);
  const [coverage, setCoverage] = React.useState<Coverage | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/operational-data/store/coverage?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'Failed to load coverage');
      setCoverage(body as Coverage);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load coverage');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const toggleOpen = () => {
    if (!open && !coverage) void load();
    setOpen(!open);
  };

  const runAction = async (sourceCode: string, action: SourceAction) => {
    setBusyKey(`${sourceCode}:${action}`);
    try {
      const response = await fetch('/api/operational-data/store/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, sourceCode, action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) alert(body?.error || body?.skipped || 'Action failed');
      await load();
    } finally {
      setBusyKey(null);
    }
  };

  const uploadWorkbook = async (sourceCode: string, file: File) => {
    setBusyKey(`${sourceCode}:upload`);
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/company-documents/upload',
        clientPayload: JSON.stringify({ companyId, category: 'OTHER', originalFileName: file.name, sizeBytes: file.size }),
      });
      const docResponse = await fetch('/api/company-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, category: 'OTHER', originalFileName: file.name, blob }),
      });
      const docBody = await docResponse.json().catch(() => ({}));
      if (!docResponse.ok || !docBody?.document?.id) throw new Error(docBody?.error || 'Failed to register workbook');
      const response = await fetch('/api/operational-data/store/workbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, sourceCode, documentId: docBody.document.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(body?.error || body?.skipped || 'Workbook import failed');
      await load();
    } catch (uploadError) {
      alert(uploadError instanceof Error ? uploadError.message : 'Workbook import failed');
    } finally {
      setBusyKey(null);
    }
  };

  const gaps = coverage?.sources.filter((source) => source.gap).length || 0;

  return (
    <div style={{ marginTop: '8px', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Ask Corelytics Data Coverage</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Which operational sources are stored in tables (live or mock) and visible to Ask Corelytics.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {open && (
            <button onClick={() => void load()} disabled={loading} style={buttonStyle('#334155', loading)}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          )}
          <button onClick={toggleOpen} style={buttonStyle('#1d4ed8', false)}>
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#334155' }}>
          {error && <div style={{ color: '#b91c1c' }}>{error}</div>}
          {coverage && (
            <>
              <div style={{ marginBottom: '6px', color: gaps ? '#b45309' : '#166534', fontWeight: 600 }}>
                {coverage.sources.length === 0
                  ? 'No operational sources connected.'
                  : gaps
                    ? `${gaps} of ${coverage.sources.length} source(s) are not visible to Ask Corelytics yet.`
                    : `All ${coverage.sources.length} source(s) are stored and visible to Ask Corelytics.`}
              </div>

              {coverage.sources.map((source) => {
                const mode = MODE_STYLES[source.mode];
                const busy = (action: SourceAction) => busyKey === `${source.sourceCode}:${action}`;
                return (
                  <div key={source.sourceCode} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 700 }}>{source.label}</span>{' '}
                        <span style={{ color: '#64748b' }}>
                          ({source.sourceCode}
                          {source.connectionStatus ? ` · connection ${source.connectionStatus}` : ''})
                        </span>{' '}
                        <span style={{ padding: '1px 6px', borderRadius: '999px', color: mode.color, background: mode.background, fontWeight: 600 }}>
                          {mode.label}
                        </span>
                        {source.liveSince && (
                          <span style={{ color: '#64748b' }}> · live since {formatEstDateTime(source.liveSince)}</span>
                        )}
                      </div>
                      {source.hasAdapter && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {source.supportsLive && (
                            <button onClick={() => void runAction(source.sourceCode, 'run_live')} disabled={Boolean(busyKey)} style={buttonStyle('#1d4ed8', Boolean(busyKey))}>
                              {busy('run_live') ? 'Syncing…' : 'Sync Live Now'}
                            </button>
                          )}
                          {source.supportsUpload && (
                            <label style={{ ...buttonStyle('#1d4ed8', Boolean(busyKey)), display: 'inline-block' }}>
                              {busyKey === `${source.sourceCode}:upload` ? 'Importing…' : 'Upload Workbook'}
                              <input
                                type="file"
                                accept=".xlsx,.xls,.xlsm,.csv"
                                disabled={Boolean(busyKey)}
                                style={{ display: 'none' }}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = '';
                                  if (file) void uploadWorkbook(source.sourceCode, file);
                                }}
                              />
                            </label>
                          )}
                          {source.supportsMock && !source.liveSince && (
                            source.mockEnabled ? (
                              <>
                                <button onClick={() => void runAction(source.sourceCode, 'run_mock')} disabled={Boolean(busyKey)} style={buttonStyle('#b45309', Boolean(busyKey))}>
                                  {busy('run_mock') ? 'Refreshing…' : 'Refresh Mock'}
                                </button>
                                <button onClick={() => void runAction(source.sourceCode, 'disable_mock')} disabled={Boolean(busyKey)} style={buttonStyle('#b91c1c', Boolean(busyKey))}>
                                  Remove Mock
                                </button>
                              </>
                            ) : (
                              <button onClick={() => void runAction(source.sourceCode, 'enable_mock')} disabled={Boolean(busyKey)} style={buttonStyle('#b45309', Boolean(busyKey))}>
                                {busy('enable_mock') ? 'Generating…' : 'Store Mock Data'}
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>
                    {source.hasAdapter && (
                      <div style={{ marginTop: '6px' }}>
                        <OperationalDateRangeSync companyId={companyId} sourceCode={source.sourceCode} onSynced={() => void load()} />
                      </div>
                    )}
                    {source.gap && <div style={{ marginTop: '4px', color: '#b45309' }}>{source.gap}</div>}
                    {source.builtInDatasets.length > 0 && (
                      <div style={{ marginTop: '4px', color: '#64748b' }}>
                        Ask reads this source from:{' '}
                        {source.builtInDatasets.map((dataset) => `${dataset.dataset} (${dataset.rowCount.toLocaleString('en-US')} rows)`).join(', ')}
                      </div>
                    )}
                    {source.lastRunMessage && !source.gap && (
                      <div style={{ marginTop: '4px', color: source.lastRunStatus === 'ERROR' ? '#b91c1c' : '#64748b' }}>
                        Last run: {source.lastRunMessage}
                      </div>
                    )}
                    {source.datasets.length > 0 && (
                      <table style={{ width: '100%', marginTop: '6px', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                          <tr style={{ color: '#64748b' }}>
                            <th style={cell}>Dataset</th>
                            <th style={cell}>Mode</th>
                            <th style={cell}>Rows</th>
                            <th style={cell}>Date Range</th>
                            <th style={cell}>Last Stored</th>
                          </tr>
                        </thead>
                        <tbody>
                          {source.datasets.map((dataset) => (
                            <tr key={dataset.datasetKey}>
                              <td style={cell}>{dataset.label} <span style={{ color: '#94a3b8' }}>{dataset.datasetKey}</span></td>
                              <td style={cell}>{dataset.dataMode === 'LIVE' ? 'Live' : 'Mock'}</td>
                              <td style={cell}>{dataset.rowCount.toLocaleString('en-US')}</td>
                              <td style={cell}>{dataset.minDate && dataset.maxDate ? `${dataset.minDate} – ${dataset.maxDate}` : '—'}</td>
                              <td style={cell}>{dataset.lastSyncedAt ? formatEstDateTime(dataset.lastSyncedAt) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}

              {coverage.availableAdapters.length > 0 && (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>Other registered sources (not set up for this company)</div>
                  <div style={{ color: '#64748b' }}>
                    {coverage.availableAdapters.map((adapter) => adapter.label).join(', ')}. Connect a source to start storing its data (mock data is stored automatically until live data arrives).
                  </div>
                </div>
              )}

              <div style={{ marginTop: '8px', color: '#64748b' }}>
                Accounting datasets visible to Ask:{' '}
                {coverage.accountingDatasets.length
                  ? coverage.accountingDatasets
                      .map((dataset) => `${dataset.dataset} (${dataset.rowCount.toLocaleString('en-US')}${dataset.maxDate ? `, through ${dataset.maxDate}` : ''})`)
                      .join(', ')
                  : 'none'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
