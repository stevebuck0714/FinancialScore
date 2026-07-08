import type { AccountingSystemModule } from '../types';
import IntegrationContainer from './IntegrationContainer';
import ProgramsContainer from './ProgramsContainer';

export type SapS4HanaSettings = {
  tenantBaseUrl: string;
  companyCode: string;
  ledger: string;
  chartOfAccounts: string;
  authenticationMethod: 'OAUTH2' | 'BASIC' | 'SAML' | 'CERTIFICATE' | '';
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  username: string;
  password: string;
  certificateAlias: string;
  odataServiceRoot: string;
};

export type SapS4HanaProgram = {
  module: string;
  odataService: string;
  priority: 'High' | 'Medium' | 'Optional';
  enabled?: boolean;
};

export const DEFAULT_SAP_S4HANA_SETTINGS: SapS4HanaSettings = {
  tenantBaseUrl: '',
  companyCode: '',
  ledger: '0L',
  chartOfAccounts: '',
  authenticationMethod: 'OAUTH2',
  clientId: '',
  clientSecret: '',
  tokenUrl: '',
  username: '',
  password: '',
  certificateAlias: '',
  odataServiceRoot: '/sap/opu/odata/sap',
};

export const DEFAULT_SAP_S4HANA_PROGRAMS: SapS4HanaProgram[] = [
  { module: 'General Ledger', odataService: 'API_GLACCOUNTLINEITEM_SRV', priority: 'High', enabled: true },
  { module: 'Journal Entries', odataService: 'API_JOURNALENTRYITEMBASIC_SRV', priority: 'High', enabled: true },
  { module: 'Trial Balance', odataService: 'Trial Balance / Ledger Balance OData service', priority: 'High', enabled: true },
  { module: 'Accounts Receivable', odataService: 'Customer line items, open invoices, aging, payments', priority: 'High', enabled: true },
  { module: 'Accounts Payable', odataService: 'Vendor line items, open bills, aging, payments', priority: 'High', enabled: true },
  { module: 'Cash Management', odataService: 'Cash position, bank accounts, liquidity forecast', priority: 'High', enabled: true },
  { module: 'Customers', odataService: 'Customer master and balances', priority: 'High', enabled: true },
  { module: 'Vendors', odataService: 'Vendor master and balances', priority: 'High', enabled: true },
  { module: 'Cost Centers', odataService: 'Cost center master / controlling dimensions', priority: 'High', enabled: true },
  { module: 'Profit Centers', odataService: 'Profit center master / dimensions', priority: 'High', enabled: true },
  { module: 'Projects', odataService: 'Project System / WBS costs, budgets, actuals', priority: 'Medium', enabled: true },
  { module: 'Inventory', odataService: 'Inventory, warehouses, item master, valuation', priority: 'Medium', enabled: true },
  { module: 'Fixed Assets', odataService: 'Asset master, depreciation, useful life, net book value', priority: 'Medium', enabled: true },
  { module: 'Sales Orders', odataService: 'Sales orders, billing documents, customers, products', priority: 'Medium', enabled: true },
  { module: 'Purchasing', odataService: 'Purchase orders, receipts, vendors, spend', priority: 'Medium', enabled: true },
  { module: 'Manufacturing', odataService: 'Production orders and manufacturing activity where licensed', priority: 'Optional', enabled: false },
  { module: 'Treasury', odataService: 'Treasury, liquidity, and advanced cash management where licensed', priority: 'Optional', enabled: false },
];

const asString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const sanitizeSettings = (value: unknown): SapS4HanaSettings => {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const auth = asString(src.authenticationMethod).toUpperCase();
  return {
    tenantBaseUrl: asString(src.tenantBaseUrl),
    companyCode: asString(src.companyCode),
    ledger: asString(src.ledger) || DEFAULT_SAP_S4HANA_SETTINGS.ledger,
    chartOfAccounts: asString(src.chartOfAccounts),
    authenticationMethod:
      auth === 'BASIC' || auth === 'SAML' || auth === 'CERTIFICATE' || auth === 'OAUTH2'
        ? (auth as SapS4HanaSettings['authenticationMethod'])
        : DEFAULT_SAP_S4HANA_SETTINGS.authenticationMethod,
    clientId: asString(src.clientId),
    clientSecret: asString(src.clientSecret),
    tokenUrl: asString(src.tokenUrl),
    username: asString(src.username),
    password: asString(src.password),
    certificateAlias: asString(src.certificateAlias),
    odataServiceRoot: asString(src.odataServiceRoot) || DEFAULT_SAP_S4HANA_SETTINGS.odataServiceRoot,
  };
};

const sanitizePrograms = (value: unknown): SapS4HanaProgram[] => {
  if (!Array.isArray(value)) return DEFAULT_SAP_S4HANA_PROGRAMS;
  const cleaned = value
    .map((row): SapS4HanaProgram => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      const priority = asString(src.priority);
      return {
        module: asString(src.module),
        odataService: asString(src.odataService),
        priority: priority === 'Medium' || priority === 'Optional' ? priority : 'High',
        enabled: typeof src.enabled === 'boolean' ? src.enabled : true,
      };
    })
    .filter((row) => row.module || row.odataService);
  return cleaned.length > 0 ? cleaned : DEFAULT_SAP_S4HANA_PROGRAMS;
};

const sapS4Hana: AccountingSystemModule<SapS4HanaSettings, SapS4HanaProgram> = {
  key: 'SAP_S4HANA',
  aliases: ['SAP', 'S4HANA', 'SAP_S_4HANA'],
  label: 'SAP S/4HANA',
  tagline: 'SAP Gateway REST/OData APIs for finance and operations',
  platform: 'SAP_S4HANA',
  badge: { initials: 'SAP', bg: '#0f6ab4', fg: '#ffffff' },
  layout: {
    variant: 'side-by-side',
    credentialsWidth: '48%',
    programsWidth: '52%',
    scheduleAbove: true,
  },
  defaultSettings: DEFAULT_SAP_S4HANA_SETTINGS,
  defaultPrograms: DEFAULT_SAP_S4HANA_PROGRAMS,
  sanitizeSettings,
  sanitizePrograms,
  IntegrationContainer,
  ProgramsContainer,
};

export default sapS4Hana;
