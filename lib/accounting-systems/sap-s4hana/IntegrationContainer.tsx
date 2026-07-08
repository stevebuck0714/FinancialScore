'use client';

import React from 'react';
import type { IntegrationContainerProps } from '../types';
import FieldGrid, { type FieldDef } from '../shared/FieldGrid';
import type { SapS4HanaSettings } from './index';

const FIELDS: ReadonlyArray<FieldDef<SapS4HanaSettings>> = [
  {
    key: 'tenantBaseUrl',
    label: 'SAP Tenant Base URL',
    type: 'url',
    required: true,
    fullWidth: true,
    monospace: true,
    placeholder: 'https://company.sap.com',
    help: 'SAP Gateway host used for OData APIs, for example /sap/opu/odata/sap/API_GLACCOUNTLINEITEM_SRV.',
  },
  { key: 'companyCode', label: 'Company Code', required: true, monospace: true, placeholder: 'e.g. 1000' },
  { key: 'ledger', label: 'Ledger', required: true, monospace: true, placeholder: '0L' },
  { key: 'chartOfAccounts', label: 'Chart of Accounts', monospace: true, placeholder: 'e.g. YCOA' },
  {
    key: 'authenticationMethod',
    label: 'Authentication Method',
    type: 'select',
    required: true,
    options: [
      { value: 'OAUTH2', label: 'OAuth2 (recommended)' },
      { value: 'BASIC', label: 'Basic Auth' },
      { value: 'SAML', label: 'SAML' },
      { value: 'CERTIFICATE', label: 'Client Certificate' },
    ],
  },
  { key: 'odataServiceRoot', label: 'OData Service Root', required: true, monospace: true, placeholder: '/sap/opu/odata/sap' },
  { key: 'clientId', label: 'OAuth Client ID', monospace: true },
  { key: 'clientSecret', label: 'OAuth Client Secret', type: 'password' },
  { key: 'tokenUrl', label: 'OAuth Token URL', type: 'url', fullWidth: true, monospace: true },
  { key: 'username', label: 'SAP Username', monospace: true },
  { key: 'password', label: 'SAP Password', type: 'password' },
  {
    key: 'certificateAlias',
    label: 'Certificate Alias / Subject',
    fullWidth: true,
    monospace: true,
    help: 'Use when the SAP tenant requires client-certificate authentication.',
  },
];

export default function SapS4HanaIntegrationContainer({
  settings,
  onChange,
  disabled,
}: IntegrationContainerProps<SapS4HanaSettings>) {
  return (
    <div>
      <div style={{ marginBottom: '14px', padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#475569', lineHeight: 1.45 }}>
        <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Accounting Integration Requirements</div>
        <div>
          SAP S/4HANA uses SAP Gateway services, primarily REST/OData endpoints such as
          {' '}<code>/sap/opu/odata/sap/API_GLACCOUNTLINEITEM_SRV</code> and
          {' '}<code>/sap/opu/odata/sap/API_JOURNALENTRYITEMBASIC_SRV</code>. OAuth2 is preferred for cloud deployments;
          SAML, Basic Auth, and client certificates can be captured when required by the tenant.
        </div>
      </div>
      <FieldGrid fields={FIELDS} settings={settings} onChange={onChange} disabled={disabled} />
    </div>
  );
}
