'use client';

import React from 'react';
import { formatEstDate, formatEstDateTime, yearsAgoEstDate } from '@/lib/time/eastern';

type SourceInfo = {
  label: string;
  history: 'range' | 'snapshot' | 'file' | 'none';
  historyNote: string | null;
  supportsLive: boolean;
  liveSince: string | null;
  lastLiveRunAt: string | null;
  lastRunStatus: string | null;
  lastRunMessage: string | null;
  storedFrom: string | null;
  storedThrough: string | null;
};

const inputStyle: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 6px', fontSize: '12px' };

/**
 * Nightly-pull status plus an on-demand date-range sync for one company + operational source.
 * Sources whose system can't supply history explain why instead of showing the date inputs.
 */
export default function OperationalDateRangeSync({
  companyId,
  sourceCode,
  onSynced,
}: {
  companyId: string;
  sourceCode: string;
  onSynced?: () => void;
}) {
  const [info, setInfo] = React.useState<SourceInfo | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [startDate, setStartDate] = React.useState(() => yearsAgoEstDate(3));
  const [endDate, setEndDate] = React.useState(() => formatEstDate());
  const [syncing, setSyncing] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const response = await fetch(
      `/api/operational-data/store/sources?companyId=${encodeURIComponent(companyId)}&sourceCode=${encodeURIComponent(sourceCode)}`,
      { cache: 'no-store' },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Failed to load source');
    return body as SourceInfo;
  }, [companyId, sourceCode]);

  React.useEffect(() => {
    let cancelled = false;
    load()
      .then((loaded) => {
        if (!cancelled) setInfo(loaded);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Failed to load source');
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const syncRange = async () => {
    if (!startDate || !endDate || startDate > endDate) {
      alert('Choose a start date on or before the end date.');
      return;
    }
    setSyncing(true);
    setResult(null);
    try {
      const response = await fetch('/api/operational-data/store/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, sourceCode, action: 'run_live', startDate, endDate }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(body?.error || body?.skipped || 'Date range sync failed');
      const written = (body.datasets || []).reduce((sum: number, dataset: { written?: number }) => sum + Number(dataset.written || 0), 0);
      setResult(`Stored ${written.toLocaleString('en-US')} row(s) for ${startDate} – ${endDate}.`);
      setInfo(await load());
      onSynced?.();
    } catch (syncError) {
      setResult(syncError instanceof Error ? syncError.message : 'Date range sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (error) return <div style={{ fontSize: '12px', color: '#b91c1c' }}>{error}</div>;
  if (!info) return <div style={{ fontSize: '12px', color: '#64748b' }}>Loading sync options…</div>;

  return (
    <div style={{ fontSize: '12px', color: '#334155', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px', background: '#f8fafc' }}>
      <div style={{ fontWeight: 700, marginBottom: '4px' }}>Nightly pull and date range sync</div>
      <div style={{ color: '#64748b' }}>
        {info.supportsLive
          ? `Pulls automatically every night (recent days).${info.lastLiveRunAt ? ` Last live pull ${formatEstDateTime(info.lastLiveRunAt)}.` : ' No live pull yet.'}`
          : 'This source has no live API pull.'}
        {info.storedFrom && info.storedThrough ? ` Live data stored ${info.storedFrom} – ${info.storedThrough}.` : ''}
      </div>
      {info.historyNote && <div style={{ color: '#64748b', marginTop: '2px' }}>{info.historyNote}</div>}
      {info.lastRunStatus === 'ERROR' && info.lastRunMessage && (
        <div style={{ color: '#b91c1c', marginTop: '2px' }}>Last run failed: {info.lastRunMessage}</div>
      )}
      {info.history === 'range' ? (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
          <label>
            Start (EST){' '}
            <input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} style={inputStyle} />
          </label>
          <label>
            End (EST){' '}
            <input type="date" value={endDate} max={formatEstDate()} onChange={(event) => setEndDate(event.target.value)} style={inputStyle} />
          </label>
          <button
            onClick={() => void syncRange()}
            disabled={syncing}
            style={{
              padding: '4px 10px',
              background: syncing ? '#94a3b8' : '#1d4ed8',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: syncing ? 'not-allowed' : 'pointer',
            }}
          >
            {syncing ? 'Syncing…' : 'Sync Date Range'}
          </button>
        </div>
      ) : (
        <div style={{ color: '#64748b', marginTop: '4px' }}>
          {info.history === 'snapshot'
            ? 'Date range sync is not available: this system only provides current data, so history builds up from nightly pulls.'
            : info.history === 'file'
              ? 'Date range sync is not available: history comes from the uploaded files. Upload older files to add earlier periods.'
              : 'Date range sync is not available: no live connection exists for this source yet.'}
        </div>
      )}
      {result && <div style={{ marginTop: '4px', color: result.startsWith('Stored') ? '#166534' : '#b91c1c' }}>{result}</div>}
    </div>
  );
}
