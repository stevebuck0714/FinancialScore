'use client';

import { useEffect, useState } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';
import OperationalDateRangeSync from './OperationalDateRangeSync';

const SOURCE_CODE = 'JOBBOSS2_STANDARD';
type Domain = { dataDomain: string; sourceObject: string; enabled: boolean };
const field = { display: 'block', width: '100%', boxSizing: 'border-box' as const, border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, fontSize: 12, marginTop: 5 };
const label = { fontSize: 12, fontWeight: 700, color: '#334155' };
const button = (color = '#334155') => ({ padding: '7px 10px', background: color, color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' });

export default function JobBossIntegrationCard({ companyId }: { companyId: string }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [status, setStatus] = useState('NOT_CONNECTED');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncFrequency, setSyncFrequency] = useState('daily');
  const [syncTime, setSyncTime] = useState('08:00');
  const [initialSyncStartDate, setInitialSyncStartDate] = useState('');
  const [incrementalSync, setIncrementalSync] = useState<'YES' | 'NO'>('YES');
  const [domains, setDomains] = useState<Domain[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const [settingsResponse, domainsResponse] = await Promise.all([
      fetch(`/api/operational-system-integrations/jobboss/settings?companyId=${encodeURIComponent(companyId)}`),
      fetch(`/api/operational-system-integrations/source-domains?companyId=${encodeURIComponent(companyId)}&sourceCode=${SOURCE_CODE}`),
    ]);
    const [settings, domainData] = await Promise.all([settingsResponse.json(), domainsResponse.json()]);
    if (!settingsResponse.ok || !settings.ok) throw new Error(settings.error || 'Failed to load JobBOSS² settings.');
    if (!domainsResponse.ok || !domainData.ok) throw new Error(domainData.error || 'Failed to load JobBOSS² data domains.');
    setStatus(settings.status || 'NOT_CONNECTED'); setLastSyncAt(settings.lastSyncAt || null); setSyncFrequency(settings.syncFrequency || 'daily');
    setSyncTime(settings.syncTime || '08:00'); setInitialSyncStartDate(settings.initialSyncStartDate || ''); setIncrementalSync(settings.incrementalSync === 'NO' ? 'NO' : 'YES');
    setDomains(Array.isArray(domainData.dataDomains) ? domainData.dataDomains : []);
  };
  useEffect(() => {
    // The request resolves asynchronously; state represents the saved connection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((loadError: Error) => setError(loadError.message));
  // The loader is intentionally re-created for the selected company.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const save = async () => {
    try {
      setSaving(true); setError('');
      const response = await fetch('/api/operational-system-integrations/jobboss/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, clientId, clientSecret, syncFrequency, syncTime, initialSyncStartDate, incrementalSync }) });
      const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to save JobBOSS² settings.');
      setClientId(''); setClientSecret(''); await load();
    } catch (saveError: any) { setError(saveError?.message || 'Failed to save JobBOSS² settings.'); } finally { setSaving(false); }
  };
  const saveDomains = async () => {
    try {
      setSaving(true); setError('');
      const response = await fetch('/api/operational-system-integrations/source-domains', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, sourceCode: SOURCE_CODE, dataDomains: domains }) });
      const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to save JobBOSS² data domains.');
      await load();
    } catch (saveError: any) { setError(saveError?.message || 'Failed to save JobBOSS² data domains.'); } finally { setSaving(false); }
  };
  const disconnect = async () => {
    if (!confirm('Disconnect JobBOSS² for this company? This removes the stored OAuth credentials.')) return;
    try {
      setSaving(true); setError('');
      const response = await fetch('/api/operational-system-integrations/jobboss/settings', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId }) });
      const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to disconnect JobBOSS².');
      await load();
    } catch (disconnectError: any) { setError(disconnectError?.message || 'Failed to disconnect JobBOSS².'); } finally { setSaving(false); }
  };
  const syncNow = async () => {
    if (status !== 'ACTIVE') {
      setError('Save the OAuth Client ID and Client Secret before syncing JobBOSS².');
      return;
    }
    try {
      setSyncing(true); setError(''); setSyncMessage('');
      const response = await fetch('/api/operational-data/store/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, sourceCode: SOURCE_CODE, action: 'run_live' }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || result.skipped || 'JobBOSS² sync failed.');
      const rows = Array.isArray(result.datasets) ? result.datasets.reduce((total: number, dataset: { written?: number }) => total + Number(dataset.written || 0), 0) : 0;
      setSyncMessage(`Synced ${rows.toLocaleString('en-US')} row(s).`);
      await load();
    } catch (syncError: any) { setError(syncError?.message || 'JobBOSS² sync failed.'); } finally { setSyncing(false); }
  };
  const update = (index: number, fieldName: keyof Domain, value: string | boolean) => setDomains((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [fieldName]: value } : row));

  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, gridColumn: '1 / -1', order: 6 }}>
    <div style={{ padding: 16, background: '#f8fafc', border: '1px solid #bae6fd', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}><h4 style={{ margin: 0, color: '#0c4a6e' }}>JobBOSS²</h4><div style={{ display: 'flex', gap: 6 }}><button onClick={() => void save()} disabled={saving || syncing} style={button()}>{saving ? 'Saving…' : 'Save'}</button><button onClick={() => void syncNow()} disabled={saving || syncing} style={button('#0f766e')}>{syncing ? 'Syncing…' : 'Sync Now'}</button></div></div>
      <div style={{ marginBottom: 10 }}><OperationalDateRangeSync companyId={companyId} sourceCode={SOURCE_CODE} compact /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 12, fontWeight: 700, color: status === 'ACTIVE' ? '#166534' : '#92400e' }}><span>{status === 'ACTIVE' ? `Connected${lastSyncAt ? ` · Last synced ${formatEstDateTime(lastSyncAt)}` : ''}` : 'Not connected'}</span>{status === 'ACTIVE' && <button onClick={() => void disconnect()} disabled={saving} style={{ ...button('#fff'), color: '#b91c1c', border: '1px solid #fecaca' }}>Disconnect</button>}</div>
      <p style={{ margin: '0 0 12px', color: '#475569', fontSize: 12 }}>ECI-hosted JobBOSS² uses OAuth client credentials. ECI must activate API access for this customer.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 12 }}>
        <label style={label}>OAuth Client ID *<input type="password" autoComplete="new-password" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder={status === 'ACTIVE' ? 'Leave blank to keep current value' : 'Client ID'} style={field} /></label>
        <label style={label}>OAuth Client Secret *<input type="password" autoComplete="new-password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={status === 'ACTIVE' ? 'Leave blank to keep current value' : 'Client secret'} style={field} /></label>
        <label style={label}>Sync Frequency *<select value={syncFrequency} onChange={(event) => setSyncFrequency(event.target.value)} style={field}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label style={label}>Sync Time (EST)<input type="time" value={syncTime} onChange={(event) => setSyncTime(event.target.value)} style={field} /></label>
        <label style={label}>Initial Sync Start Date<input type="date" value={initialSyncStartDate} onChange={(event) => setInitialSyncStartDate(event.target.value)} style={field} /></label>
        <label style={label}>Incremental Sync *<select value={incrementalSync} onChange={(event) => setIncrementalSync(event.target.value as 'YES' | 'NO')} style={field}><option value="YES">Yes</option><option value="NO">No</option></select></label>
      </div>
    </div>
    <div style={{ padding: 8, background: '#f8fafc', border: '1px solid #bae6fd', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0, color: '#0c4a6e' }}>Data Domains</h4>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setDomains((rows) => [...rows, { dataDomain: '', sourceObject: '', enabled: true }])} disabled={saving} style={{ padding: '6px 10px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
          <button onClick={() => void saveDomains()} disabled={saving} style={{ padding: '6px 10px', background: '#334155', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save</button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Programs called by the JobBOSS² integration</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}><th style={{ textAlign: 'left', padding: 6, color: '#475569' }}>Data Domain</th><th style={{ textAlign: 'left', padding: 6, color: '#475569' }}>JobBOSS² Endpoint</th><th style={{ textAlign: 'left', padding: 6, color: '#475569', width: 80 }}>Enabled</th><th style={{ textAlign: 'left', padding: 6, color: '#475569', width: 70 }}>Action</th></tr></thead>
          <tbody>{domains.map((domain, index) => <tr key={`${domain.dataDomain}-${index}`} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: 6 }}><input value={domain.dataDomain} onChange={(event) => update(index, 'dataDomain', event.target.value)} placeholder="Data Domain" style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 4, padding: 6, fontSize: 12, background: 'white' }} /></td><td style={{ padding: 6 }}><input value={domain.sourceObject} onChange={(event) => update(index, 'sourceObject', event.target.value)} placeholder="/api/v1/endpoint" style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 4, padding: 6, fontSize: 12, background: 'white', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} /></td><td style={{ padding: 6 }}><input type="checkbox" checked={domain.enabled} onChange={(event) => update(index, 'enabled', event.target.checked)} /></td><td style={{ padding: 6 }}><button onClick={() => setDomains((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} disabled={saving} style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Delete</button></td></tr>)}</tbody>
        </table>
      </div>
    </div>
    {error && <div style={{ color: '#b91c1c', fontSize: 12, gridColumn: '1 / -1' }}>{error}</div>}
    {syncMessage && <div style={{ color: '#166534', fontSize: 12, gridColumn: '1 / -1' }}>{syncMessage}</div>}
  </div>;
}
