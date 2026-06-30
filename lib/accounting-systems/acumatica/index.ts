import type { AccountingSystemModule } from '../types';
import IntegrationContainer from './IntegrationContainer';
import ProgramsContainer from './ProgramsContainer';

export type AcumaticaSettings = {
  tenantId: string;
  instanceUrl: string;
  companyCode: string;
  branch: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  endpointName: string;
  endpointVersion: string;
  contractBasedApiPath: string;
};

export type AcumaticaProgram = {
  module: string;
  endpointOrEntity: string;
};

export const DEFAULT_ACUMATICA_SETTINGS: AcumaticaSettings = {
  tenantId: '',
  instanceUrl: '',
  companyCode: '',
  branch: '',
  clientId: '',
  clientSecret: '',
  username: '',
  password: '',
  endpointName: 'Default',
  endpointVersion: '20.200.001',
  contractBasedApiPath: '/entity/Default/20.200.001',
};

export const DEFAULT_ACUMATICA_PROGRAMS: AcumaticaProgram[] = [
  { module: 'Chart of Accounts', endpointOrEntity: 'GLAccounts' },
  { module: 'Customers', endpointOrEntity: 'Customers' },
  { module: 'Vendors', endpointOrEntity: 'Vendors' },
  { module: 'AR', endpointOrEntity: 'ARInvoices' },
  { module: 'AP', endpointOrEntity: 'APBills' },
  { module: 'Sales', endpointOrEntity: 'SalesOrders' },
];

const asString = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

const sanitizeSettings = (value: unknown): AcumaticaSettings => {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    tenantId: asString(src.tenantId),
    instanceUrl: asString(src.instanceUrl),
    companyCode: asString(src.companyCode),
    branch: asString(src.branch),
    clientId: asString(src.clientId),
    clientSecret: asString(src.clientSecret),
    username: asString(src.username),
    password: asString(src.password),
    endpointName: asString(src.endpointName) || DEFAULT_ACUMATICA_SETTINGS.endpointName,
    endpointVersion: asString(src.endpointVersion) || DEFAULT_ACUMATICA_SETTINGS.endpointVersion,
    contractBasedApiPath: asString(src.contractBasedApiPath) || DEFAULT_ACUMATICA_SETTINGS.contractBasedApiPath,
  };
};

const sanitizePrograms = (value: unknown): AcumaticaProgram[] => {
  if (!Array.isArray(value)) return DEFAULT_ACUMATICA_PROGRAMS;
  const cleaned = value
    .map((row): AcumaticaProgram => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      return { module: asString(src.module), endpointOrEntity: asString(src.endpointOrEntity) };
    })
    .filter((row) => row.module || row.endpointOrEntity);
  return cleaned.length > 0 ? cleaned : DEFAULT_ACUMATICA_PROGRAMS;
};

const acumatica: AccountingSystemModule<AcumaticaSettings, AcumaticaProgram> = {
  key: 'ACUMATICA',
  label: 'Acumatica',
  tagline: 'Acumatica Cloud ERP — Contract-Based REST API',
  platform: 'ACUMATICA',
  badge: { initials: 'AC', bg: '#0369a1', fg: '#ffffff' },
  capabilities: {
    connect: true,
    disconnect: true,
    syncNow: true,
    backfill: true,
  },
  defaultSettings: DEFAULT_ACUMATICA_SETTINGS,
  defaultPrograms: DEFAULT_ACUMATICA_PROGRAMS,
  sanitizeSettings,
  sanitizePrograms,
  IntegrationContainer,
  ProgramsContainer,
};

export default acumatica;
