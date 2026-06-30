import type { AccountingSystemModule } from '../types';
import IntegrationContainer from './IntegrationContainer';
import ProgramsContainer from './ProgramsContainer';

export type OdooSettings = {
  baseUrl: string;
  database: string;
  username: string;
  password: string;
  apiKey: string;
  companyId: string;
  odooVersion: string;
  authMethod: 'PASSWORD' | 'API_KEY' | '';
};

export type OdooProgram = {
  module: string;
  modelOrEndpoint: string;
};

export const DEFAULT_ODOO_SETTINGS: OdooSettings = {
  baseUrl: '',
  database: '',
  username: '',
  password: '',
  apiKey: '',
  companyId: '',
  odooVersion: '17.0',
  authMethod: 'PASSWORD',
};

export const DEFAULT_ODOO_PROGRAMS: OdooProgram[] = [
  { module: 'Chart of Accounts', modelOrEndpoint: 'account.account' },
  { module: 'Customers', modelOrEndpoint: 'res.partner' },
  { module: 'Vendors', modelOrEndpoint: 'res.partner' },
  { module: 'AR', modelOrEndpoint: 'account.move (out_invoice)' },
  { module: 'AP', modelOrEndpoint: 'account.move (in_invoice)' },
  { module: 'Sales', modelOrEndpoint: 'sale.order' },
];

const asString = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

const sanitizeSettings = (value: unknown): OdooSettings => {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const authMethod = asString(src.authMethod).toUpperCase();
  return {
    baseUrl: asString(src.baseUrl),
    database: asString(src.database),
    username: asString(src.username),
    password: asString(src.password),
    apiKey: asString(src.apiKey),
    companyId: asString(src.companyId),
    odooVersion: asString(src.odooVersion) || DEFAULT_ODOO_SETTINGS.odooVersion,
    authMethod: authMethod === 'API_KEY' ? 'API_KEY' : authMethod === 'PASSWORD' ? 'PASSWORD' : '',
  };
};

const sanitizePrograms = (value: unknown): OdooProgram[] => {
  if (!Array.isArray(value)) return DEFAULT_ODOO_PROGRAMS;
  const cleaned = value
    .map((row): OdooProgram => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      return { module: asString(src.module), modelOrEndpoint: asString(src.modelOrEndpoint) };
    })
    .filter((row) => row.module || row.modelOrEndpoint);
  return cleaned.length > 0 ? cleaned : DEFAULT_ODOO_PROGRAMS;
};

const odoo: AccountingSystemModule<OdooSettings, OdooProgram> = {
  key: 'ODOO',
  label: 'Odoo',
  tagline: 'Odoo ERP — XML-RPC / JSON-RPC API',
  platform: 'ODOO',
  badge: { initials: 'OD', bg: '#7c3aed', fg: '#ffffff' },
  capabilities: {
    connect: true,
    disconnect: true,
    syncNow: true,
    backfill: true,
  },
  defaultSettings: DEFAULT_ODOO_SETTINGS,
  defaultPrograms: DEFAULT_ODOO_PROGRAMS,
  sanitizeSettings,
  sanitizePrograms,
  IntegrationContainer,
  ProgramsContainer,
};

export default odoo;
