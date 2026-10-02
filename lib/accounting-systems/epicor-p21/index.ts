import type { AccountingSystemModule } from '../types';
import IntegrationContainer from './IntegrationContainer';
import ProgramsContainer from './ProgramsContainer';

export type EpicorP21Settings = {
  middlewareUrl: string;
  apiPath: string;
  companyCode: string;
  databaseName: string;
  branchCode: string;
  authenticationMethod: '' | 'USERNAME_PASSWORD' | 'CONSUMER_KEY' | 'USERNAME_PASSWORD_AND_CONSUMER_KEY' | 'CUSTOM';
  consumerKey: string;
  username: string;
  password: string;
};

export type EpicorP21Program = {
  dataDomain: string;
  endpointOrEntity: string;
  dateField: string;
  enabled: boolean;
};

export const DEFAULT_EPICOR_P21_SETTINGS: EpicorP21Settings = {
  middlewareUrl: '',
  apiPath: '/api',
  companyCode: '',
  databaseName: '',
  branchCode: '',
  authenticationMethod: '',
  consumerKey: '',
  username: '',
  password: '',
};

export const DEFAULT_EPICOR_P21_PROGRAMS: EpicorP21Program[] = [
  { dataDomain: 'Chart of Accounts', endpointOrEntity: 'GeneralLedger/accounts', dateField: '', enabled: true },
  { dataDomain: 'General Ledger Detail', endpointOrEntity: 'GeneralLedger/transactions', dateField: '', enabled: true },
  { dataDomain: 'Trial Balance', endpointOrEntity: 'Reports/trialBalance', dateField: '', enabled: true },
  { dataDomain: 'Balance Sheet', endpointOrEntity: 'Reports/balanceSheet', dateField: '', enabled: true },
  { dataDomain: 'Income Statement', endpointOrEntity: 'Reports/incomeStatement', dateField: '', enabled: true },
  { dataDomain: 'Cash & Bank Accounts', endpointOrEntity: 'CashManagement/bankAccounts', dateField: '', enabled: true },
  { dataDomain: 'Customers', endpointOrEntity: 'Customers', dateField: '', enabled: true },
  { dataDomain: 'Vendors', endpointOrEntity: 'Vendors', dateField: '', enabled: true },
  { dataDomain: 'AR Open Items', endpointOrEntity: 'AccountsReceivable/invoices', dateField: '', enabled: true },
  { dataDomain: 'AR Aging', endpointOrEntity: 'AccountsReceivable/aging', dateField: '', enabled: true },
  { dataDomain: 'AR Payments', endpointOrEntity: 'AccountsReceivable/payments', dateField: '', enabled: true },
  { dataDomain: 'AP Open Items', endpointOrEntity: 'AccountsPayable/invoices', dateField: '', enabled: true },
  { dataDomain: 'AP Aging', endpointOrEntity: 'AccountsPayable/aging', dateField: '', enabled: true },
  { dataDomain: 'AP Payments', endpointOrEntity: 'AccountsPayable/payments', dateField: '', enabled: true },
  { dataDomain: 'Sales Orders', endpointOrEntity: 'SalesOrders', dateField: '', enabled: true },
  { dataDomain: 'Inventory', endpointOrEntity: 'Inventory', dateField: '', enabled: true },
];

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const asAuthenticationMethod = (value: unknown): EpicorP21Settings['authenticationMethod'] => {
  const method = asString(value);
  return method === 'USERNAME_PASSWORD'
    || method === 'CONSUMER_KEY'
    || method === 'USERNAME_PASSWORD_AND_CONSUMER_KEY'
    || method === 'CUSTOM'
    ? method
    : '';
};

const sanitizeSettings = (value: unknown): EpicorP21Settings => {
  const src = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  return {
    middlewareUrl: asString(src.middlewareUrl) || asString(src.instanceUrl),
    apiPath: asString(src.apiPath) || DEFAULT_EPICOR_P21_SETTINGS.apiPath,
    companyCode: asString(src.companyCode),
    databaseName: asString(src.databaseName),
    branchCode: asString(src.branchCode),
    authenticationMethod: asAuthenticationMethod(src.authenticationMethod),
    consumerKey: asString(src.consumerKey) || asString(src.clientSecret),
    username: asString(src.username),
    password: asString(src.password),
  };
};

const sanitizePrograms = (value: unknown): EpicorP21Program[] => {
  if (!Array.isArray(value)) return DEFAULT_EPICOR_P21_PROGRAMS;
  const programs = value
    .map((row): EpicorP21Program => {
      const src = row && typeof row === 'object' && !Array.isArray(row)
        ? (row as Record<string, unknown>)
        : {};
      return {
        dataDomain: asString(src.dataDomain),
        endpointOrEntity: asString(src.endpointOrEntity),
        dateField: asString(src.dateField),
        enabled: src.enabled !== false,
      };
    })
    .filter((row) => row.dataDomain || row.endpointOrEntity);
  return programs.length > 0 ? programs : DEFAULT_EPICOR_P21_PROGRAMS;
};

const epicorP21: AccountingSystemModule<EpicorP21Settings, EpicorP21Program> = {
  key: 'EPICOR_P21',
  aliases: ['EPICOR'],
  label: 'Epicor Prophet 21 (P21)',
  tagline: 'Epicor P21 distribution ERP — API configuration',
  platform: 'EPICOR_P21',
  badge: { initials: 'P21', bg: '#7c2d12', fg: '#ffffff' },
  capabilities: {
    connect: true,
    disconnect: true,
    syncNow: true,
    backfill: true,
  },
  layout: {
    variant: 'side-by-side',
    credentialsWidth: '40%',
    programsWidth: '60%',
    scheduleAbove: true,
  },
  defaultSettings: DEFAULT_EPICOR_P21_SETTINGS,
  defaultPrograms: DEFAULT_EPICOR_P21_PROGRAMS,
  sanitizeSettings,
  sanitizePrograms,
  IntegrationContainer,
  ProgramsContainer,
};

export default epicorP21;
