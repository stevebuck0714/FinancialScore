'use client';

import React from 'react';
import type { IntegrationContainerProps } from '../types';
import FieldGrid, { type FieldDef } from '../shared/FieldGrid';
import type { Dynamics365Settings } from './index';

const FIELDS: ReadonlyArray<FieldDef<Dynamics365Settings>> = [
  { key: 'environmentUrl', label: 'Environment URL', required: true, fullWidth: true, monospace: true, placeholder: 'https://api.businesscentral.dynamics.com/v2.0/{tenant}/Production' },
  { key: 'tenantId', label: 'Azure Tenant ID', required: true, monospace: true },
  { key: 'legalEntity', label: 'Company / Legal Entity', required: true, help: 'D365 Company name or Legal Entity code.' },
  { key: 'region', label: 'Region', placeholder: 'e.g. NA, EU' },
  { key: 'clientId', label: 'Azure App Client ID', required: true, monospace: true },
  { key: 'clientSecret', label: 'Azure App Client Secret', type: 'password', required: true },
  { key: 'authorityUrl', label: 'Authority URL', monospace: true, placeholder: 'https://login.microsoftonline.com' },
  { key: 'scope', label: 'OAuth Scope', monospace: true, placeholder: '.default' },
  { key: 'redirectUri', label: 'Redirect URI', fullWidth: true, monospace: true, help: 'Optional — only required for delegated user flows.' },
];

export default function Dynamics365IntegrationContainer({ settings, onChange, disabled }: IntegrationContainerProps<Dynamics365Settings>) {
  return <FieldGrid fields={FIELDS} settings={settings} onChange={onChange} disabled={disabled} />;
}
