'use client';

import React from 'react';
import type { IntegrationContainerProps } from '../types';
import FieldGrid, { type FieldDef } from '../shared/FieldGrid';
import type { AcumaticaSettings } from './index';

const FIELDS: ReadonlyArray<FieldDef<AcumaticaSettings>> = [
  { key: 'instanceUrl', label: 'Instance URL', required: true, fullWidth: true, monospace: true, placeholder: 'https://yourcompany.acumatica.com', help: 'Base URL of your Acumatica tenant.' },
  { key: 'tenantId', label: 'Tenant ID', help: 'Acumatica tenant identifier (multi-tenant deployments only).' },
  { key: 'companyCode', label: 'Company Code', required: true, help: 'The Acumatica company you want to sync.' },
  { key: 'branch', label: 'Branch', help: 'Optional — for multi-branch companies.' },
  { key: 'clientId', label: 'OAuth Client ID', required: true },
  { key: 'clientSecret', label: 'OAuth Client Secret', type: 'password', required: true },
  { key: 'username', label: 'API Username', required: true, help: 'A dedicated integration user.' },
  { key: 'password', label: 'API Password', type: 'password', required: true },
  { key: 'endpointName', label: 'Endpoint Name', placeholder: 'Default' },
  { key: 'endpointVersion', label: 'Endpoint Version', placeholder: '20.200.001' },
  { key: 'contractBasedApiPath', label: 'Contract-Based API Path', fullWidth: true, monospace: true, placeholder: '/entity/Default/20.200.001' },
];

export default function AcumaticaIntegrationContainer({ settings, onChange, disabled }: IntegrationContainerProps<AcumaticaSettings>) {
  return <FieldGrid fields={FIELDS} settings={settings} onChange={onChange} disabled={disabled} />;
}
