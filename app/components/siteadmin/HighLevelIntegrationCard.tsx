'use client';

import { useEffect, useState } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';
import OperationalDateRangeSync from './OperationalDateRangeSync';
type DataDomain = { dataDomain: string; sourceObject: string; enabled: boolean };

const SOURCE_CODE = 'HIGHLEVEL_STANDARD';
const fieldStyle = { display: 'block', width: '100%', boxSizing: 'border-box' as const, border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white', marginTop: '5px' };
const labelStyle = { fontSize: '12px', fontWeight: 700, color: '#334155' };
/** Same button look as the BambooHR operational container. */
const actionButton = (background: string, disabled: boolean) => ({
  padding: '8px 12px',
  background: disabled ? '#cbd5e1' : background,
  color: disabled ? '#334155' : 'white',
  border: 'none',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
});
const disconnectButton = (disabled: boolean) => ({
  padding: '5px 9px',
  background: disabled ? '#cbd5e1' : 'white',
  color: disabled ? '#334155' : '#b91c1c',
  border: `1px solid ${disabled ? '#cbd5e1' : '#fecaca'}`,
  borderRadius: '6px',
  fontSize: '11px',
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

export default function HighLevelIntegrationCard({ companyId }: { companyId: string }) {
  const [token, setToken] = useState('');
  const [locationId, setLocationId] = useState('');
  const [status, setStatus] = useState('NOT_CONNECTED');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncFrequency, setSyncFrequency] = useState('daily');
  const [syncTime, setSyncTime] = useState('08:00');
  const [initialSyncStartDate, setInitialSyncStartDate] = useState('');
  const [incrementalSync, setIncrementalSync] = useState<'YES' | 'NO'>('YES');
  const [domains, setDomains] = useState<DataDomain[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const [settingsResponse, domainsResponse] = await Promise.all([
      fetch(`/api/operational-system-integrations/highlevel/settings?companyId=${encodeURIComponent(companyId)}`),
      fetch(`/api/operational-system-integrations/source-domains?companyId=${encodeURIComponent(companyId)}&sourceCode=${SOURCE_CODE}`),
    ]);
    const [settings, domainData] = await Promise.all([
      settingsResponse.json().catch(() => ({})),
      domainsResponse.json().catch(() => ({})),
    ]);
    if (!settingsResponse.ok || !settings?.ok) throw new Error(settings?.error || 'Failed to load HighLevel settings.');
    if (!domainsResponse.ok || !domainData?.ok) throw new Error(domainData?.error || 'Failed to load HighLevel data domains.');
    setStatus(String(settings.status || 'NOT_CONNECTED'));
    setLastSyncAt(settings.lastSyncAt || null);
    setLocationId(String(settings.locationId || ''));
    setSyncFrequency(String(settings.syncFrequency || 'daily'));
    setSyncTime(String(settings.syncTime || '08:00'));
    setInitialSyncStartDate(String(settings.initialSyncStartDate || ''));
    setIncrementalSync(settings.incrementalSync === 'NO' ? 'NO' : 'YES');
    setDomains(Array.isArray(domainData.dataDomains) ? domainData.dataDomains : []);
  };

  useEffect(() => {
    // The request completes asynchronously; state reflects the loaded connection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((loadError: Error) => setError(loadError.message));
  // The loader is intentionally re-created with the current company ID.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const saveConnection = async () => {
    if (!token.trim() && status !== 'ACTIVE') {
      setError('Enter the HighLevel Private Integration Token.');
      return;
    }
    if (!locationId.trim()) {
      setError('Enter the HighLevel Location ID.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const response = await fetch('/api/operational-system-integrations/highlevel/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, privateIntegrationToken: token, locationId, syncFrequency, syncTime, initialSyncStartDate, incrementalSync }),
      });
      const settings = await response.json().catch(() => ({}));
      if (!response.ok || !settings?.ok) throw new Error(settings?.error || 'Failed to save HighLevel settings.');
      setToken('');
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to save HighLevel integration.');
    } finally {
      setSaving(false);
    }
  };

  const saveDomains = async () => {
    try {
      setSaving(true);
      setError('');
      const response = await fetch('/api/operational-system-integrations/source-domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, sourceCode: SOURCE_CODE, dataDomains: domains }),
      });
      const domainData = await response.json().catch(() => ({}));
      if (!response.ok || !domainData?.ok) throw new Error(domainData?.error || 'Failed to save HighLevel data domains.');
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to save HighLevel data domains.');
    } finally {
      setSaving(false);
    }
  };

  const readSales = async (title: string) => {
    if (status !== 'ACTIVE') {
      setError('Connect HighLevel first: enter the Private Integration Token and Location ID, then click Save.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const response = await fetch(`/api/operational-system-integrations/highlevel/sales?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'HighLevel read failed.');
      const activityCounts = Array.isArray(data?.activities)
        ? data.activities.map((row: any) => `${String(row.type).replace(/^./, (letter: string) => letter.toUpperCase())}s: ${row.count}`).join('\n')
        : '';
      const warnings = Array.isArray(data?.warnings) && data.warnings.length ? `\n\nUnavailable domains:\n${data.warnings.join('\n')}` : '';
      alert(`${title}\n\nOpportunities: ${data?.summary?.totalDeals ?? 0}\nContacts: ${data?.contacts?.records?.length ?? 0}\nCompanies: ${data?.companies?.records?.length ?? 0}${activityCounts ? `\n${activityCounts}` : ''}${warnings}`);
      await load();
    } catch (readError: any) {
      setError(readError?.message || 'HighLevel read failed.');
    } finally {
      setSaving(false);
    }
  };

  const probeDomains = () => {
    const enabled = domains.filter((domain) => domain.enabled).map((domain) => domain.dataDomain).filter(Boolean);
    alert(`HighLevel domains configured for this connection:\n\n${enabled.length ? enabled.join('\n') : 'No enabled domains'}`);
  };

  const disconnect = async () => {
    if (!confirm('Disconnect HighLevel for this company? This removes the stored HighLevel token and stops scheduled syncs.')) return;
    try {
      setSaving(true);
      setError('');
      const response = await fetch('/api/operational-system-integrations/highlevel/settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Failed to disconnect HighLevel.');
      setToken('');
      await load();
    } catch (disconnectError: any) {
      setError(disconnectError?.message || 'Failed to disconnect HighLevel.');
    } finally {
      setSaving(false);
    }
  };

  const updateDomain = (index: number, field: keyof DataDomain, value: string | boolean) => {
    setDomains((current) => current.map((domain, domainIndex) => (
      domainIndex === index ? { ...domain, [field]: value } : domain
    )));
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', gridColumn: '1 / -1', order: 6 }}>
      <div style={{ padding: '16px', background: '#f8fafc', border: '1px solid #bae6fd', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
          <h4 style={{ margin: 0, color: '#0c4a6e' }}>HighLevel</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
            <button onClick={() => void saveConnection()} disabled={saving} style={actionButton('#334155', false)}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={() => void readSales('HighLevel connection OK.')} disabled={saving} style={actionButton('#0ea5e9', saving)}>Revalidate</button>
            <button onClick={() => void readSales('HighLevel sync test completed.')} disabled={saving} style={actionButton('#16a34a', saving)}>Run Sync Test</button>
            <button onClick={() => void readSales('HighLevel sales sync completed.')} disabled={saving} style={actionButton('#0f766e', saving)}>Sync HighLevel Now</button>
            <button onClick={probeDomains} disabled={saving} style={actionButton('#7c3aed', saving)}>Probe Domains</button>
          </div>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <OperationalDateRangeSync companyId={companyId} sourceCode={SOURCE_CODE} compact />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div style={{ fontSize: '12px', color: status === 'ACTIVE' ? '#166534' : '#92400e', fontWeight: 700 }}>
            {status === 'ACTIVE' ? `Connected${lastSyncAt ? ` · Last synced ${formatEstDateTime(lastSyncAt)}` : ''}` : 'Not connected'}
          </div>
          {status === 'ACTIVE' ? <button onClick={() => void disconnect()} disabled={saving} style={disconnectButton(saving)}>Disconnect</button> : null}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(240px, 1fr))', gap: '12px', maxWidth: '760px' }}>
          <label style={labelStyle}>Private Integration Token *<input type="password" autoComplete="new-password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={status === 'ACTIVE' ? 'Leave blank to keep the current token' : 'pit-…'} style={fieldStyle} /></label>
          <label style={labelStyle}>Location ID *<input value={locationId} onChange={(event) => setLocationId(event.target.value)} placeholder="Sub-account Location ID" style={fieldStyle} /></label>
          <label style={labelStyle}>Base URL<input value="https://services.leadconnectorhq.com" disabled style={{ ...fieldStyle, background: '#f1f5f9' }} /></label>
          <label style={labelStyle}>Auth Type *<input value="Private Integration Token" disabled style={{ ...fieldStyle, background: '#f1f5f9' }} /></label>
          <label style={labelStyle}>Sync Frequency *<select value={syncFrequency} onChange={(event) => setSyncFrequency(event.target.value)} style={fieldStyle}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
          <label style={labelStyle}>Sync Time (EST)<input type="time" value={syncTime} onChange={(event) => setSyncTime(event.target.value)} style={fieldStyle} /></label>
          <label style={labelStyle}>Initial Sync Start Date (YYYY-MM-DD)<input type="date" value={initialSyncStartDate} onChange={(event) => setInitialSyncStartDate(event.target.value)} style={fieldStyle} /></label>
          <label style={labelStyle}>Incremental Sync *<select value={incrementalSync} onChange={(event) => setIncrementalSync(event.target.value as 'YES' | 'NO')} style={fieldStyle}><option value="YES">Yes</option><option value="NO">No</option></select></label>
        </div>
      </div>
      <div style={{ padding: '16px', background: '#f8fafc', border: '1px solid #bae6fd', borderRadius: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}><h4 style={{ margin: 0, color: '#0c4a6e' }}>Data Domains</h4><button onClick={() => setDomains((current) => [...current, { dataDomain: '', sourceObject: '', enabled: true }])} disabled={saving} style={{ padding: '4px 8px', background: 'white', color: '#0369a1', border: '1px solid #7dd3fc', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>+ Add</button><button onClick={() => void saveDomains()} disabled={saving} style={{ padding: '4px 8px', background: saving ? '#94a3b8' : '#334155', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>Save</button></div>
        <p style={{ margin: '0 0 14px', color: '#475569', fontSize: '12px' }}>HighLevel CRM domains available for downstream sales reporting</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}><thead><tr><th style={{ textAlign: 'left', padding: '6px' }}>Data Domain</th><th style={{ textAlign: 'left', padding: '6px' }}>HighLevel Entity</th><th style={{ padding: '6px' }}>Enabled</th><th style={{ padding: '6px' }}>Action</th></tr></thead><tbody>{domains.map((domain, index) => <tr key={`${domain.dataDomain}-${index}`}><td style={{ padding: '6px' }}><input value={domain.dataDomain} onChange={(event) => updateDomain(index, 'dataDomain', event.target.value)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px' }} /></td><td style={{ padding: '6px' }}><input value={domain.sourceObject} onChange={(event) => updateDomain(index, 'sourceObject', event.target.value)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px' }} /></td><td style={{ textAlign: 'center', padding: '6px' }}><input type="checkbox" checked={domain.enabled} onChange={(event) => updateDomain(index, 'enabled', event.target.checked)} /></td><td style={{ padding: '6px' }}><button onClick={() => setDomains((current) => current.filter((_, domainIndex) => domainIndex !== index))} disabled={saving} style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px' }}>Delete</button></td></tr>)}</tbody></table>
      </div>
      {error ? <div style={{ color: '#b91c1c', fontSize: '12px', gridColumn: '1 / -1' }}>{error}</div> : null}
    </div>
  );
}
