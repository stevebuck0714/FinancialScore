'use client';

import { useEffect, useState } from 'react';

const SOURCE_CODE = 'FOODREADY_AI';
const field = { display: 'block', width: '100%', boxSizing: 'border-box' as const, border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, fontSize: 12, marginTop: 5 };
const label = { fontSize: 12, fontWeight: 700, color: '#334155' };
const button = (color = '#334155') => ({ padding: '7px 10px', background: color, color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' });

export default function FoodReadyIntegrationCard({ companyId }: { companyId: string }) {
  const [baseUrl, setBaseUrl] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('NOT_CONNECTED');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    const response = await fetch(`/api/operational-system-integrations/foodready/settings?companyId=${encodeURIComponent(companyId)}`);
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to load FoodReady settings.');
    setBaseUrl(result.baseUrl || '');
    setTenantId(result.tenantId || '');
    setStatus(result.status || 'NOT_CONNECTED');
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
      setSaving(true); setError(''); setMessage('');
      const response = await fetch('/api/operational-system-integrations/foodready/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, baseUrl, tenantId, apiKey }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to save FoodReady settings.');
      setApiKey('');
      setMessage('FoodReady credentials saved.');
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to save FoodReady settings.');
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect FoodReady for this company? This removes the stored API credential.')) return;
    try {
      setSaving(true); setError(''); setMessage('');
      const response = await fetch('/api/operational-system-integrations/foodready/settings', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to disconnect FoodReady.');
      setApiKey('');
      setMessage('FoodReady disconnected.');
      await load();
    } catch (disconnectError: any) {
      setError(disconnectError?.message || 'Failed to disconnect FoodReady.');
    } finally {
      setSaving(false);
    }
  };

  return <div style={{ padding: 12, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', gridColumn: '1 / 2', order: 13 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
      <h4 style={{ margin: 0, color: '#1e293b', fontSize: 14 }}>FoodReady AI</h4>
      <button onClick={() => void save()} disabled={saving} style={button()}>{saving ? 'Saving…' : 'Save'}</button>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 12, fontWeight: 700, color: status === 'ACTIVE' ? '#166534' : '#92400e' }}>
      <span>{status === 'ACTIVE' ? 'Credentials configured' : 'Not connected'}</span>
      {status === 'ACTIVE' && <button onClick={() => void disconnect()} disabled={saving} style={{ ...button('#fff'), color: '#b91c1c', border: '1px solid #fecaca' }}>Disconnect</button>}
    </div>
    <p style={{ margin: '0 0 12px', color: '#475569', fontSize: 12 }}>Save the FoodReady API access details supplied for this company. The live FoodReady data connector will be configured after its approved endpoints are confirmed.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: 8 }}>
      <label style={label}>FoodReady API Base URL *<input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com" style={field} /></label>
      <label style={label}>Tenant / Account ID<input value={tenantId} onChange={(event) => setTenantId(event.target.value)} placeholder="Tenant or account ID" style={field} /></label>
      <label style={label}>API Key *<input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={status === 'ACTIVE' ? 'Leave blank to keep current value' : 'API key'} style={field} /></label>
    </div>
    {error && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 10 }}>{error}</div>}
    {message && <div style={{ color: '#166534', fontSize: 12, marginTop: 10 }}>{message}</div>}
  </div>;
}
