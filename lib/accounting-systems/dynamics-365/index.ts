import type { AccountingSystemModule } from '../types';
import IntegrationContainer from './IntegrationContainer';
import ProgramsContainer from './ProgramsContainer';

export type Dynamics365Settings = {
  tenantId: string;
  environmentUrl: string;
  legalEntity: string;
  region: string;
  clientId: string;
  clientSecret: string;
  authorityUrl: string;
  scope: string;
  redirectUri: string;
};

export type Dynamics365Program = {
  module: string;
  entityOrEndpoint: string;
};

export const DEFAULT_DYNAMICS_365_SETTINGS: Dynamics365Settings = {
  tenantId: '',
  environmentUrl: '',
  legalEntity: '',
  region: '',
  clientId: '',
  clientSecret: '',
  authorityUrl: 'https://login.microsoftonline.com',
  scope: '.default',
  redirectUri: '',
};

export const DEFAULT_DYNAMICS_365_PROGRAMS: Dynamics365Program[] = [
  { module: 'Accounts', entityOrEndpoint: 'accounts' },
  { module: 'Customers', entityOrEndpoint: 'customers' },
  { module: 'Vendors', entityOrEndpoint: 'vendors' },
  { module: 'AR', entityOrEndpoint: 'customerLedgerEntries' },
  { module: 'AP', entityOrEndpoint: 'vendorLedgerEntries' },
  { module: 'Sales', entityOrEndpoint: 'salesInvoices' },
];

const asString = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

const sanitizeSettings = (value: unknown): Dynamics365Settings => {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    tenantId: asString(src.tenantId),
    environmentUrl: asString(src.environmentUrl),
    legalEntity: asString(src.legalEntity),
    region: asString(src.region),
    clientId: asString(src.clientId),
    clientSecret: asString(src.clientSecret),
    authorityUrl: asString(src.authorityUrl) || DEFAULT_DYNAMICS_365_SETTINGS.authorityUrl,
    scope: asString(src.scope) || DEFAULT_DYNAMICS_365_SETTINGS.scope,
    redirectUri: asString(src.redirectUri),
  };
};

const sanitizePrograms = (value: unknown): Dynamics365Program[] => {
  if (!Array.isArray(value)) return DEFAULT_DYNAMICS_365_PROGRAMS;
  const cleaned = value
    .map((row): Dynamics365Program => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      return { module: asString(src.module), entityOrEndpoint: asString(src.entityOrEndpoint) };
    })
    .filter((row) => row.module || row.entityOrEndpoint);
  return cleaned.length > 0 ? cleaned : DEFAULT_DYNAMICS_365_PROGRAMS;
};

const dynamics365: AccountingSystemModule<Dynamics365Settings, Dynamics365Program> = {
  key: 'DYNAMICS',
  aliases: ['DYNAMICS365', 'DYNAMICS_365'],
  label: 'Microsoft Dynamics 365',
  tagline: 'Dynamics 365 Business Central / Finance & Operations — OAuth 2.0',
  platform: 'DYNAMICS365',
  badge: { initials: 'D365', bg: '#1d4ed8', fg: '#ffffff' },
  defaultSettings: DEFAULT_DYNAMICS_365_SETTINGS,
  defaultPrograms: DEFAULT_DYNAMICS_365_PROGRAMS,
  sanitizeSettings,
  sanitizePrograms,
  IntegrationContainer,
  ProgramsContainer,
};

export default dynamics365;
