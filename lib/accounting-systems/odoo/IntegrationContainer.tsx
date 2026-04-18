'use client';

import React from 'react';
import type { IntegrationContainerProps } from '../types';
import FieldGrid, { type FieldDef } from '../shared/FieldGrid';
import type { OdooSettings } from './index';

const FIELDS: ReadonlyArray<FieldDef<OdooSettings>> = [
  { key: 'baseUrl', label: 'Server URL', required: true, fullWidth: true, monospace: true, placeholder: 'https://yourcompany.odoo.com' },
  { key: 'database', label: 'Database Name', required: true, help: 'The Odoo database to connect to.' },
  { key: 'companyId', label: 'Company ID', help: 'Numeric Odoo res.company ID. Leave blank for default company.' },
  { key: 'odooVersion', label: 'Odoo Version', placeholder: '17.0' },
  {
    key: 'authMethod', label: 'Auth Method', type: 'select', options: [
      { value: 'PASSWORD', label: 'Username + Password' },
      { value: 'API_KEY', label: 'Username + API Key (Odoo 14+)' },
    ],
  },
  { key: 'username', label: 'Username', required: true },
  { key: 'password', label: 'Password', type: 'password', help: 'Required when Auth Method is Password.' },
  { key: 'apiKey', label: 'API Key', type: 'password', help: 'Required when Auth Method is API Key.' },
];

export default function OdooIntegrationContainer({ settings, onChange, disabled }: IntegrationContainerProps<OdooSettings>) {
  return <FieldGrid fields={FIELDS} settings={settings} onChange={onChange} disabled={disabled} />;
}
