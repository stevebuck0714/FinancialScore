'use client';

import React from 'react';
import type { IntegrationContainerProps } from '../types';
import FieldGrid, { type FieldDef } from '../shared/FieldGrid';
import type { EpicorP21Settings } from './index';

const FIELDS: ReadonlyArray<FieldDef<EpicorP21Settings>> = [
  {
    key: 'middlewareUrl',
    label: 'P21 Middleware / API URL',
    required: true,
    fullWidth: true,
    monospace: true,
    placeholder: 'https://p21.example.com',
    help: 'Middleware URL supplied by Filtech’s Epicor P21 administrator.',
  },
  { key: 'companyCode', label: 'P21 Company Code', required: true, help: 'P21 company identifier whose records Corelytics should synchronize. This is not the SQL database name.' },
  { key: 'databaseName', label: 'P21 Database Name', help: 'SQL database name, only if Filtech’s P21 administrator requires it for API access. This is distinct from the P21 Company Code.' },
  { key: 'branchCode', label: 'Branch Code', help: 'Optional P21 branch filter. Leave blank to include all authorized branches.' },
  {
    key: 'authenticationMethod',
    label: 'Authentication Method',
    type: 'select',
    required: true,
    fullWidth: true,
    help: 'Select the method configured for Filtech’s P21 middleware.',
    options: [
      { value: '', label: 'Select the configured method' },
      { value: 'USERNAME_PASSWORD', label: 'Middleware username and password' },
      { value: 'CONSUMER_KEY', label: 'Consumer key' },
      { value: 'USERNAME_PASSWORD_AND_CONSUMER_KEY', label: 'Middleware username/password and consumer key' },
      { value: 'CUSTOM', label: 'Custom — confirm with P21 administrator' },
    ],
  },
];

export default function EpicorP21IntegrationContainer({
  settings,
  onChange,
  disabled,
}: IntegrationContainerProps<EpicorP21Settings>) {
  const showUserCredentials = settings.authenticationMethod === 'USERNAME_PASSWORD'
    || settings.authenticationMethod === 'USERNAME_PASSWORD_AND_CONSUMER_KEY'
    || settings.authenticationMethod === 'CUSTOM';
  const showConsumerKey = settings.authenticationMethod === 'CONSUMER_KEY'
    || settings.authenticationMethod === 'USERNAME_PASSWORD_AND_CONSUMER_KEY'
    || settings.authenticationMethod === 'CUSTOM';
  const credentialFields: ReadonlyArray<FieldDef<EpicorP21Settings>> = [
    ...(showUserCredentials
      ? [
          { key: 'username' as const, label: 'P21 Middleware Username', help: 'Integration username, if required by the selected method.' },
          { key: 'password' as const, label: 'P21 Middleware Password', type: 'password' as const, help: 'Password for that user, if required.' },
        ]
      : []),
    ...(showConsumerKey
      ? [
          { key: 'consumerKey' as const, label: 'P21 Consumer Key', type: 'password' as const, fullWidth: true, help: 'Consumer key issued by Filtech’s P21 administrator, if required by the selected method.' },
        ]
      : []),
  ];

  return (
    <>
      <div style={{ marginBottom: '12px', padding: '10px 12px', background: '#eff6ff', color: '#1e3a8a', borderRadius: '6px', fontSize: '12px', lineHeight: 1.45 }}>
        <strong>Connection type:</strong> P21 API (OData/Data Services for reporting)
        <br />
        <strong>Authentication:</strong> P21 middleware credentials and consumer key, as specified for Filtech’s P21 environment
        <br />
        <strong>Access:</strong> Read only
      </div>
      <FieldGrid fields={FIELDS} settings={settings} onChange={onChange} disabled={disabled} />
      {credentialFields.length > 0 && (
        <div style={{ marginTop: '14px' }}>
          <FieldGrid fields={credentialFields} settings={settings} onChange={onChange} disabled={disabled} />
        </div>
      )}
      <details style={{ marginTop: '14px' }}>
        <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#475569' }}>Advanced data-services settings</summary>
        <div style={{ marginTop: '12px' }}>
          <FieldGrid
            fields={[{
              key: 'apiPath',
              label: 'Data Services API Path',
              fullWidth: true,
              monospace: true,
              placeholder: '/api',
              help: 'Path to the enabled OData/Data Services endpoint. Leave the default unless Filtech’s administrator supplies a different path.',
            }]}
            settings={settings}
            onChange={onChange}
            disabled={disabled}
          />
        </div>
      </details>
    </>
  );
}
