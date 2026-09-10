'use client';

import { useEffect, useState } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';

type DataDomain = { dataDomain: string; sourceObject: string; enabled: boolean };

export default function HubSpotIntegrationCard({ companyId }: { companyId: string }) {
  const [token, setToken] = useState('');
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
      fetch(`/api/operational-system-integrations/hubspot/settings?companyId=${encodeURIComponent(companyId)}`),
      fetch(`/api/operational-system-integrations/source-domains?companyId=${encodeURIComponent(companyId)}&sourceCode=HUBSPOT_STANDARD`),
    ]);
    const [settings, domainData] = await Promise.all([
      settingsResponse.json().catch(() => ({})),
      domainsResponse.json().catch(() => ({})),
    ]);
    if (!settingsResponse.ok || !settings?.ok) throw new Error(settings?.error || 'Failed to load HubSpot settings.');
    if (!domainsResponse.ok || !domainData?.ok) throw new Error(domainData?.error || 'Failed to load HubSpot data domains.');
    setStatus(String(settings.status || 'NOT_CONNECTED'));
    setLastSyncAt(settings.lastSyncAt || null);
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
      setError('Enter the HubSpot service key.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const settingsResponse = await fetch('/api/operational-system-integrations/hubspot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, privateAppToken: token, syncFrequency, syncTime, initialSyncStartDate, incrementalSync }),
      });
      const settings = await settingsResponse.json().catch(() => ({}));
      if (!settingsResponse.ok || !settings?.ok) throw new Error(settings?.error || 'Failed to save HubSpot settings.');
      setToken('');
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to save HubSpot integration.');
    } finally {
      setSaving(false);
    }
  };

  const saveDomains = async () => {
    try {
      setSaving(true);
      setError('');
      const domainsResponse = await fetch('/api/operational-system-integrations/source-domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, sourceCode: 'HUBSPOT_STANDARD', dataDomains: domains }),
      });
      const domainData = await domainsResponse.json().catch(() => ({}));
      if (!domainsResponse.ok || !domainData?.ok) throw new Error(domainData?.error || 'Failed to save HubSpot data domains.');
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to save HubSpot data domains.');
    } finally {
      setSaving(false);
    }
  };

  const validateConnection = async () => {
    try {
      setSaving(true);
      setError('');
      const response = await fetch(`/api/operational-system-integrations/hubspot/sales?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'HubSpot validation failed.');
      const crmCounts = Array.isArray(data?.crmRecordCounts)
        ? data.crmRecordCounts.map((row: any) => `${row.label}: ${row.count == null ? 'access unavailable' : row.count}`).join('\n')
        : '';
      alert(`HubSpot connection OK.\n\nDeals visible: ${data?.summary?.totalDeals ?? 0}\nActivities visible: ${data?.summary?.activityCount ?? 0}${crmCounts ? `\n\nCRM data domains:\n${crmCounts}` : ''}`);
      await load();
    } catch (validationError: any) {
      setError(validationError?.message || 'HubSpot validation failed.');
    } finally {
      setSaving(false);
    }
  };
  const runSalesRead = async (mode: 'test' | 'sync') => {
    try {
      setSaving(true);
      setError('');
      const response = await fetch(`/api/operational-system-integrations/hubspot/sales?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'HubSpot sales read failed.');
      alert(`${mode === 'test' ? 'HubSpot sync test' : 'HubSpot sales sync'} completed.\n\nDeals read: ${data?.summary?.totalDeals ?? 0}\nActivities read: ${data?.summary?.activityCount ?? 0}`);
      await load();
    } catch (syncError: any) {
      setError(syncError?.message || 'HubSpot sales read failed.');
    } finally {
      setSaving(false);
    }
  };
  const probeDomains = () => {
    const enabled = domains.filter((domain) => domain.enabled).map((domain) => domain.dataDomain).filter(Boolean);
    alert(`HubSpot domains configured for this connection:\n\n${enabled.length ? enabled.join('\n') : 'No enabled domains'}`);
  };

  const disconnect = async () => {
    if (!confirm('Disconnect HubSpot for this company? This removes the stored HubSpot token and stops scheduled syncs.')) return;
    try {
      setSaving(true);
      setError('');
      const response = await fetch('/api/operational-system-integrations/hubspot/settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Failed to disconnect HubSpot.');
      setToken('');
      await load();
    } catch (disconnectError: any) {
      setError(disconnectError?.message || 'Failed to disconnect HubSpot.');
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
        <h4 style={{ margin: '0 0 6px', color: '#0c4a6e' }}>HubSpot</h4>
        <div style={{ margin: '0 0 12px', color: '#475569', fontSize: '13px', fontWeight: 600 }}>HubSpot setup for Cogent Scientific</div>
        <p style={{ margin: '0 0 14px', color: '#475569', fontSize: '12px' }}>HubSpot operational connection</p>
        <div style={{ fontSize: '12px', color: status === 'ACTIVE' ? '#166534' : '#92400e', fontWeight: 700, marginBottom: '10px' }}>
          {status === 'ACTIVE' ? `Connected${lastSyncAt ? ` · Last synced ${formatEstDateTime(lastSyncAt)}` : ''}` : 'Not connected'}
        </div>
        <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: '12px' }}>Configure the HubSpot connection and sync schedule here. Revalidate checks access to configured sales domains; Sales reports read the enabled domains directly from HubSpot.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(240px, 1fr))', gap: '12px', maxWidth: '760px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Service Key *<input type="password" autoComplete="new-password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={status === 'ACTIVE' ? 'Leave blank to keep the current key' : 'pat-na1-…'} style={{ display: 'block', width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white', marginTop: '5px' }} /></label>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Base URL<input value="https://api.hubapi.com" disabled style={{ display: 'block', width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: '#f1f5f9', marginTop: '5px' }} /></label>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Auth Type *<input value="Service Key" disabled style={{ display: 'block', width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: '#f1f5f9', marginTop: '5px' }} /></label>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Sync Frequency *<select value={syncFrequency} onChange={(event) => setSyncFrequency(event.target.value)} style={{ display: 'block', width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white', marginTop: '5px' }}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Sync Time (EST)<input type="time" value={syncTime} onChange={(event) => setSyncTime(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white', marginTop: '5px' }} /></label>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Initial Sync Start Date (YYYY-MM-DD)<input type="date" value={initialSyncStartDate} onChange={(event) => setInitialSyncStartDate(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white', marginTop: '5px' }} /></label>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Incremental Sync *<select value={incrementalSync} onChange={(event) => setIncrementalSync(event.target.value as 'YES' | 'NO')} style={{ display: 'block', width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', fontSize: '12px', background: 'white', marginTop: '5px' }}><option value="YES">Yes</option><option value="NO">No</option></select></label>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button onClick={() => void saveConnection()} disabled={saving} style={{ padding: '8px 12px', background: saving ? '#94a3b8' : '#0284c7', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={() => void validateConnection()} disabled={saving || status !== 'ACTIVE'} style={{ padding: '8px 12px', background: 'white', color: '#0369a1', border: '1px solid #7dd3fc', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>Revalidate</button>
          <button onClick={() => void runSalesRead('test')} disabled={saving || status !== 'ACTIVE'} style={{ padding: '8px 12px', background: 'white', color: '#0369a1', border: '1px solid #7dd3fc', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>Run Sync Test</button>
          <button onClick={() => void runSalesRead('sync')} disabled={saving || status !== 'ACTIVE'} style={{ padding: '8px 12px', background: 'white', color: '#0369a1', border: '1px solid #7dd3fc', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>Sync HubSpot Now</button>
          <button onClick={probeDomains} disabled={saving} style={{ padding: '8px 12px', background: 'white', color: '#0369a1', border: '1px solid #7dd3fc', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>Probe Domains</button>
          {status === 'ACTIVE' ? <button onClick={() => void disconnect()} disabled={saving} style={{ padding: '8px 12px', background: 'white', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>Disconnect</button> : null}
        </div>
      </div>
      <div style={{ padding: '16px', background: '#f8fafc', border: '1px solid #bae6fd', borderRadius: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}><h4 style={{ margin: 0, color: '#0c4a6e' }}>Data Domains</h4><button onClick={() => setDomains((current) => [...current, { dataDomain: '', sourceObject: '', enabled: true }])} disabled={saving} style={{ padding: '4px 8px', background: 'white', color: '#0369a1', border: '1px solid #7dd3fc', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>+ Add</button><button onClick={() => void saveDomains()} disabled={saving} style={{ padding: '4px 8px', background: saving ? '#94a3b8' : '#334155', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>Save</button></div>
        <p style={{ margin: '0 0 14px', color: '#475569', fontSize: '12px' }}>HubSpot operational domains available for downstream sales reporting</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}><thead><tr><th style={{ textAlign: 'left', padding: '6px' }}>Data Domain</th><th style={{ textAlign: 'left', padding: '6px' }}>HubSpot Entity</th><th style={{ padding: '6px' }}>Enabled</th><th style={{ padding: '6px' }}>Action</th></tr></thead><tbody>{domains.map((domain, index) => <tr key={`${domain.dataDomain}-${index}`}><td style={{ padding: '6px' }}><input value={domain.dataDomain} onChange={(event) => updateDomain(index, 'dataDomain', event.target.value)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px' }} /></td><td style={{ padding: '6px' }}><input value={domain.sourceObject} onChange={(event) => updateDomain(index, 'sourceObject', event.target.value)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px' }} /></td><td style={{ textAlign: 'center', padding: '6px' }}><input type="checkbox" checked={domain.enabled} onChange={(event) => updateDomain(index, 'enabled', event.target.checked)} /></td><td style={{ padding: '6px' }}><button onClick={() => setDomains((current) => current.filter((_, domainIndex) => domainIndex !== index))} disabled={saving} style={{ padding: '6px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px' }}>Delete</button></td></tr>)}</tbody></table>
      </div>
      {error ? <div style={{ color: '#b91c1c', fontSize: '12px', gridColumn: '1 / -1' }}>{error}</div> : null}
    </div>
  );
}
