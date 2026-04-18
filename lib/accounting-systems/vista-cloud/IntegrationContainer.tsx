'use client';

import React from 'react';
import type { IntegrationContainerProps } from '../types';
import type { VistaCloudSettings } from './settings';

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#475569',
  marginBottom: '4px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '13px',
  background: '#fff',
  color: '#0f172a',
};

const helpStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#64748b',
  marginTop: '4px',
};

export default function VistaCloudIntegrationContainer({
  settings,
  onChange,
  disabled,
}: IntegrationContainerProps<VistaCloudSettings>) {
  const set = <K extends keyof VistaCloudSettings>(key: K, value: VistaCloudSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>Subscriber Code *</label>
        <input
          type="text"
          value={settings.subscriberCode}
          onChange={(e) => set('subscriberCode', e.target.value)}
          placeholder="e.g. ACME-PROD"
          style={inputStyle}
          disabled={disabled}
        />
        <div style={helpStyle}>Tenant identifier issued by Trimble during Vista API onboarding.</div>
      </div>

      <div>
        <label style={labelStyle}>X-Application-Key (Production) *</label>
        <input
          type="password"
          value={settings.applicationKeyProd}
          onChange={(e) => set('applicationKeyProd', e.target.value)}
          placeholder="Production API key"
          style={inputStyle}
          disabled={disabled}
          autoComplete="off"
        />
        <div style={helpStyle}>Sent in the <code>X-Application-Key</code> header on every request.</div>
      </div>

      <div>
        <label style={labelStyle}>X-Application-Key (Test)</label>
        <input
          type="password"
          value={settings.applicationKeyTest}
          onChange={(e) => set('applicationKeyTest', e.target.value)}
          placeholder="Test API key (optional)"
          style={inputStyle}
          disabled={disabled}
          autoComplete="off"
        />
        <div style={helpStyle}>Optional — only if Trimble issued a separate sandbox key.</div>
      </div>

      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>API Base URL</label>
        <input
          type="text"
          value={settings.baseUrl}
          onChange={(e) => set('baseUrl', e.target.value)}
          placeholder="https://api.xchange.trimble.com/connect/v1/direct"
          style={inputStyle}
          disabled={disabled}
        />
        <div style={helpStyle}>
          Default Trimble Direct API endpoint. Resource calls become{' '}
          <code>{`{baseUrl}/subscribers/{subscriberCode}/vista/{module}/{version}/data/{resource}/cache/search`}</code>.
        </div>
      </div>

      <div>
        <label style={labelStyle}>API Version</label>
        <input
          type="text"
          value={settings.apiVersion}
          onChange={(e) => set('apiVersion', e.target.value)}
          placeholder="v1"
          style={inputStyle}
          disabled={disabled}
        />
      </div>

      <div>
        <label style={labelStyle}>Default Environment</label>
        <select
          value={settings.defaultEnvironment}
          onChange={(e) => set('defaultEnvironment', e.target.value as VistaCloudSettings['defaultEnvironment'])}
          style={inputStyle}
          disabled={disabled}
        >
          <option value="PROD">Production</option>
          <option value="TEST">Test / Sandbox</option>
        </select>
        <div style={helpStyle}>Selects which X-Application-Key the sync engine will use.</div>
      </div>
    </div>
  );
}
