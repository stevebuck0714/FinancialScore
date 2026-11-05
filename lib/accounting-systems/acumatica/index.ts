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
  enabled: boolean;
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
  { module: 'Chart of Accounts', endpointOrEntity: 'GLAccounts', enabled: true },
  { module: 'General Ledger', endpointOrEntity: 'GLTransactions', enabled: true },
  { module: 'Trial Balance', endpointOrEntity: 'TrialBalance', enabled: true },
  { module: 'Customers', endpointOrEntity: 'Customers', enabled: true },
  { module: 'Vendors', endpointOrEntity: 'Vendors', enabled: true },
  { module: 'AR Invoices', endpointOrEntity: 'ARInvoices', enabled: true },
  { module: 'AR Payments', endpointOrEntity: 'ARPayments', enabled: false },
  { module: 'AR Aging', endpointOrEntity: 'ARAging', enabled: false },
  { module: 'AP Bills', endpointOrEntity: 'APBills', enabled: true },
  { module: 'AP Payments', endpointOrEntity: 'APPayments', enabled: false },
  { module: 'AP Aging', endpointOrEntity: 'APAging', enabled: false },
  { module: 'Sales Orders', endpointOrEntity: 'SalesOrders', enabled: true },
  { module: 'Sales Invoices', endpointOrEntity: 'SalesInvoices', enabled: false },
  { module: 'Purchase Orders', endpointOrEntity: 'PurchaseOrders', enabled: false },
  { module: 'Inventory', endpointOrEntity: 'StockItems', enabled: false },
  { module: 'Cash Management', endpointOrEntity: 'CashTransactions', enabled: false },
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
      return {
        module: asString(src.module),
        endpointOrEntity: asString(src.endpointOrEntity),
        enabled: src.enabled !== false,
      };
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
  layout: {
    variant: 'side-by-side',
    credentialsWidth: '60%',
    programsWidth: '40%',
    scheduleAbove: true,
  },
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
