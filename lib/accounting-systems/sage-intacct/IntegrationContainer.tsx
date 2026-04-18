'use client';

import React from 'react';
import type { IntegrationContainerProps } from '../types';
import FieldGrid, { type FieldDef } from '../shared/FieldGrid';
import type { SageIntacctSettings } from './index';

const FIELDS: ReadonlyArray<FieldDef<SageIntacctSettings>> = [
  { key: 'senderId', label: 'Sender ID', required: true, help: 'Issued by Sage Intacct for your XML API integration.' },
  { key: 'senderPassword', label: 'Sender Password', type: 'password', required: true },
  { key: 'companyId', label: 'Intacct Company ID', required: true, help: 'The CompanyID of the Intacct account you are connecting to.' },
  { key: 'entityId', label: 'Entity ID', help: 'Optional — leave blank for top-level company.' },
  { key: 'userId', label: 'User ID', required: true, help: 'A web-services user (not a regular user account).' },
  { key: 'userPassword', label: 'User Password', type: 'password', required: true },
  { key: 'locationId', label: 'Location ID', help: 'Optional — for multi-location companies.' },
  { key: 'dtdVersion', label: 'DTD Version', placeholder: '3.0' },
  { key: 'endpointUrl', label: 'Endpoint URL', fullWidth: true, monospace: true, help: 'Default: https://api.intacct.com/ia/xml/xmlgw.phtml' },
];

export default function SageIntacctIntegrationContainer({ settings, onChange, disabled }: IntegrationContainerProps<SageIntacctSettings>) {
  return <FieldGrid fields={FIELDS} settings={settings} onChange={onChange} disabled={disabled} />;
}
