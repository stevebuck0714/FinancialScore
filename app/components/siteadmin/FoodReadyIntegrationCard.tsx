'use client';

import { useEffect, useState } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';
import OperationalDateRangeSync from './OperationalDateRangeSync';

const SOURCE_CODE = 'FOODREADY_AI';
const DEFAULT_BASE_URL = 'https://api.foodready.ai';
type Domain = { dataDomain: string; sourceObject: string; enabled: boolean };
const field = { display: 'block', width: '100%', boxSizing: 'border-box' as const, border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, fontSize: 12, marginTop: 5 };
const label = { fontSize: 12, fontWeight: 700, color: '#334155' };
const button = (color = '#334155') => ({ padding: '7px 10px', background: color, color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' });
/** Same button look as the BambooHR and HubSpot operational containers. */
const actionButton = (background: string, disabled: boolean) => ({
  padding: '8px 12px', background: disabled ? '#cbd5e1' : background, color: disabled ? '#334155' : 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
});

export default function FoodReadyIntegrationCard({ companyId }: { companyId: string }) {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [organizationId, setOrganizationId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('NOT_CONNECTED');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncFrequency, setSyncFrequency] = useState('daily');
  const [syncTime, setSyncTime] = useState('08:00');
  const [initialSyncStartDate, setInitialSyncStartDate] = useState('');
  const [incrementalSync, setIncrementalSync] = useState<'YES' | 'NO'>('YES');
  const [overlapDays, setOverlapDays] = useState('7');
  const [domains, setDomains] = useState<Domain[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState<'validate' | 'probe' | 'sync_test' | null>(null);
  const busy = saving || syncing || checking !== null;
  const [syncMessage, setSyncMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const [settingsResponse, domainsResponse] = await Promise.all([
      fetch(`/api/operational-system-integrations/foodready/settings?companyId=${encodeURIComponent(companyId)}`),
      fetch(`/api/operational-system-integrations/source-domains?companyId=${encodeURIComponent(companyId)}&sourceCode=${SOURCE_CODE}`),
    ]);
    const [settings, domainData] = await Promise.all([settingsResponse.json(), domainsResponse.json()]);
    if (!settingsResponse.ok || !settings.ok) throw new Error(settings.error || 'Failed to load FoodReady settings.');
    if (!domainsResponse.ok || !domainData.ok) throw new Error(domainData.error || 'Failed to load FoodReady data domains.');
    setStatus(settings.status || 'NOT_CONNECTED');
    setLastSyncAt(settings.lastSyncAt || null);
    setBaseUrl(settings.baseUrl || DEFAULT_BASE_URL);
    setOrganizationId(settings.organizationId || '');
    setSyncFrequency(settings.syncFrequency || 'daily');
    setSyncTime(settings.syncTime || '08:00');
    setInitialSyncStartDate(settings.initialSyncStartDate || '');
    setIncrementalSync(settings.incrementalSync === 'NO' ? 'NO' : 'YES');
    setOverlapDays(String(settings.overlapDays || '7'));
    setDomains(Array.isArray(domainData.dataDomains) ? domainData.dataDomains : []);
  };

  useEffect(() => {
    // The request resolves asynchronously; state represents the saved connection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((loadError: Error) => setError(loadError.message));
  // The loader is intentionally re-created for the selected company.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const save = async (): Promise<boolean> => {
    try {
      setSaving(true); setError('');
      const response = await fetch('/api/operational-system-integrations/foodready/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, baseUrl, organizationId, apiKey, syncFrequency, syncTime, initialSyncStartDate, incrementalSync, overlapDays }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to save FoodReady settings.');
      setApiKey('');
      await load();
      return true;
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to save FoodReady settings.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const runCheck = async (action: 'validate' | 'probe' | 'sync_test') => {
    const response = await fetch('/api/operational-system-integrations/foodready/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, action }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) throw new Error(result?.error || 'FoodReady check failed.');
    return result;
  };

  const connect = async () => {
    if (!(await save())) return;
    try {
      setChecking('validate'); setError('');
      const result = await runCheck('validate');
      alert(`FoodReady connection OK.\n\nTested endpoint: ${result.endpoint}`);
    } catch (checkError: any) {
      setError(checkError?.message || 'FoodReady connection failed.');
    } finally {
      setChecking(null);
    }
  };

  const runSyncTest = async () => {
    if (status !== 'ACTIVE') { setError('Save the FoodReady Organization ID and API Key before testing.'); return; }
    try {
      setChecking('sync_test'); setError('');
      const result = await runCheck('sync_test');
      const lines = (result.datasets as { label: string; rows: number }[]).map((dataset) => `${dataset.label}: ${dataset.rows.toLocaleString('en-US')}`);
      alert(`FoodReady sync test completed (nothing stored).\n\nWindow (EST): ${result.window.startDate} – ${result.window.endDate}\n\n${lines.join('\n') || 'No enabled domains'}`);
    } catch (checkError: any) {
      setError(checkError?.message || 'FoodReady sync test failed.');
    } finally {
      setChecking(null);
    }
  };

  const probeDomains = async () => {
    if (status !== 'ACTIVE') { setError('Save the FoodReady Organization ID and API Key before probing.'); return; }
    try {
      setChecking('probe'); setError('');
      const result = await runCheck('probe');
      const lines = (result.results as { dataDomain: string; endpoint: string; ok: boolean; fieldCount?: number; error?: string }[])
        .map((row) => `${row.ok ? 'OK' : 'FAILED'} · ${row.dataDomain} (${row.endpoint})${row.ok ? ` · ${row.fieldCount} field(s)` : ` · ${row.error}`}`);
      alert(`FoodReady domain probe:\n\n${lines.join('\n')}`);
    } catch (checkError: any) {
      setError(checkError?.message || 'FoodReady domain probe failed.');
    } finally {
      setChecking(null);
    }
  };

  const saveDomains = async () => {
    try {
      setSaving(true); setError('');
      const response = await fetch('/api/operational-system-integrations/source-domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, sourceCode: SOURCE_CODE, dataDomains: domains }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to save FoodReady data domains.');
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to save FoodReady data domains.');
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect FoodReady for this company? This removes the stored API key.')) return;
    try {
      setSaving(true); setError('');
      const response = await fetch('/api/operational-system-integrations/foodready/settings', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to disconnect FoodReady.');
      await load();
    } catch (disconnectError: any) {
      setError(disconnectError?.message || 'Failed to disconnect FoodReady.');
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    if (status !== 'ACTIVE') {
      setError('Save the FoodReady Organization ID and API Key before syncing.');
      return;
    }
    try {
      setSyncing(true); setError(''); setSyncMessage('');
      const response = await fetch('/api/operational-data/store/sources', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, sourceCode: SOURCE_CODE, action: 'run_live' }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || result.skipped || 'FoodReady sync failed.');
      const rows = Array.isArray(result.datasets) ? result.datasets.reduce((total: number, dataset: { written?: number }) => total + Number(dataset.written || 0), 0) : 0;
      setSyncMessage(`Synced ${rows.toLocaleString('en-US')} row(s).`);
      await load();
    } catch (syncError: any) {
      setError(syncError?.message || 'FoodReady sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const update = (index: number, fieldName: keyof Domain, value: string | boolean) =>
    setDomains((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [fieldName]: value } : row));

  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, gridColumn: '1 / -1', order: 6 }}>
    <div style={{ padding: 16, background: '#f8fafc', border: '1px solid #bae6fd', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <h4 style={{ margin: 0, color: '#0c4a6e' }}>FoodReady AI</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={() => void save()} disabled={busy} style={actionButton('#334155', false)}>{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={() => void connect()} disabled={busy} style={actionButton('#0ea5e9', busy)}>{checking === 'validate' ? 'Validating…' : status === 'ACTIVE' ? 'Revalidate' : 'Connect'}</button>
          <button onClick={() => void runSyncTest()} disabled={busy} style={actionButton('#16a34a', busy)}>{checking === 'sync_test' ? 'Testing…' : 'Run Sync Test'}</button>
          <button onClick={() => void syncNow()} disabled={busy} style={actionButton('#0f766e', busy)}>{syncing ? 'Syncing…' : 'Sync FoodReady Now'}</button>
          <button onClick={() => void probeDomains()} disabled={busy} style={actionButton('#7c3aed', busy)}>{checking === 'probe' ? 'Probing…' : 'Probe Domains'}</button>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}><OperationalDateRangeSync companyId={companyId} sourceCode={SOURCE_CODE} compact /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 12, fontWeight: 700, color: status === 'ACTIVE' ? '#166534' : '#92400e' }}>
        <span>{status === 'ACTIVE' ? `Connected${lastSyncAt ? ` · Last synced ${formatEstDateTime(lastSyncAt)}` : ''}` : 'Not connected'}</span>
        {status === 'ACTIVE' && <button onClick={() => void disconnect()} disabled={saving} style={{ ...button('#fff'), color: '#b91c1c', border: '1px solid #fecaca' }}>Disconnect</button>}
      </div>
      <p style={{ margin: '0 0 12px', color: '#475569', fontSize: 12 }}>Create an organization API key in FoodReady (Settings → API Keys). Requests are read-only and send the key in the x-api-key header with the Organization ID.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 12 }}>
        <label style={label}>API Base URL *<input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={DEFAULT_BASE_URL} style={field} /></label>
        <label style={label}>Organization ID *<input value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} placeholder="FoodReady organization ID" style={field} /></label>
        <label style={label}>API Key *<input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={status === 'ACTIVE' ? 'Leave blank to keep current value' : 'API key'} style={field} /></label>
        <label style={label}>Sync Frequency *<select value={syncFrequency} onChange={(event) => setSyncFrequency(event.target.value)} style={field}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label style={label}>Sync Time (EST)<input type="time" value={syncTime} onChange={(event) => setSyncTime(event.target.value)} style={field} /></label>
        <label style={label}>Initial Sync Start Date<input type="date" value={initialSyncStartDate} onChange={(event) => setInitialSyncStartDate(event.target.value)} style={field} /></label>
        <label style={label}>Incremental Sync *<select value={incrementalSync} onChange={(event) => setIncrementalSync(event.target.value as 'YES' | 'NO')} style={field}><option value="YES">Yes</option><option value="NO">No</option></select></label>
        <label style={label}>Overlap Days<input type="number" min={1} max={31} step={1} value={overlapDays} onChange={(event) => setOverlapDays(event.target.value)} title="Calendar days re-pulled on each scheduled sync, ending today. Catches late FoodReady edits." style={field} /></label>
      </div>
    </div>
    <div style={{ padding: 8, background: '#f8fafc', border: '1px solid #bae6fd', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0, color: '#0c4a6e' }}>Data Domains</h4>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setDomains((rows) => [...rows, { dataDomain: '', sourceObject: '', enabled: true }])} disabled={saving} style={{ ...button('#0ea5e9'), padding: '6px 10px' }}>+ Add</button>
          <button onClick={() => void saveDomains()} disabled={saving} style={{ ...button(), padding: '6px 10px' }}>Save</button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>FoodReady API endpoints used for manufacturing operations reporting</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}><th style={{ textAlign: 'left', padding: 6, color: '#475569' }}>Data Domain</th><th style={{ textAlign: 'left', padding: 6, color: '#475569' }}>FoodReady Endpoint</th><th style={{ textAlign: 'left', padding: 6, color: '#475569', width: 80 }}>Enabled</th><th style={{ textAlign: 'left', padding: 6, color: '#475569', width: 70 }}>Action</th></tr></thead>
          <tbody>{domains.map((domain, index) => <tr key={`${domain.dataDomain}-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: 6 }}><input value={domain.dataDomain} onChange={(event) => update(index, 'dataDomain', event.target.value)} placeholder="Data Domain" style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 4, padding: 6, fontSize: 12, background: 'white' }} /></td><td style={{ padding: 6 }}><input value={domain.sourceObject} onChange={(event) => update(index, 'sourceObject', event.target.value)} placeholder="/api/endpoint" style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 4, padding: 6, fontSize: 12, background: 'white', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} /></td><td style={{ padding: 6 }}><input type="checkbox" checked={domain.enabled} onChange={(event) => update(index, 'enabled', event.target.checked)} /></td><td style={{ padding: 6 }}><button onClick={() => setDomains((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} disabled={saving} style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Delete</button></td></tr>)}</tbody>
        </table>
      </div>
    </div>
    {error && <div style={{ color: '#b91c1c', fontSize: 12, gridColumn: '1 / -1' }}>{error}</div>}
    {syncMessage && <div style={{ color: '#166534', fontSize: 12, gridColumn: '1 / -1' }}>{syncMessage}</div>}
  </div>;
}
