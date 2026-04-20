import type { AccountingSystemModule } from '../types';
import IntegrationContainer from './IntegrationContainer';
import ProgramsContainer from './ProgramsContainer';

export type SageIntacctSettings = {
  senderId: string;
  senderPassword: string;
  companyId: string;
  userId: string;
  userPassword: string;
  entityId: string;
  endpointUrl: string;
  dtdVersion: string;
  locationId: string;
};

export type SageIntacctProgram = {
  module: string;
  objectName: string;
  /**
   * When false, Sync Now / Backfill / cron skip this program even though it
   * remains in the saved configuration. Defaults to true. Per-row "Sync this"
   * still works regardless of this flag (manual override).
   */
  enabled?: boolean;
};

export const DEFAULT_SAGE_INTACCT_SETTINGS: SageIntacctSettings = {
  senderId: '',
  senderPassword: '',
  companyId: '',
  userId: '',
  userPassword: '',
  entityId: '',
  endpointUrl: 'https://api.intacct.com/ia/xml/xmlgw.phtml',
  dtdVersion: '3.0',
  locationId: '',
};

export const DEFAULT_SAGE_INTACCT_PROGRAMS: SageIntacctProgram[] = [
  { module: 'Chart of Accounts', objectName: 'GLACCOUNT', enabled: true },
  { module: 'Customers', objectName: 'CUSTOMER', enabled: true },
  { module: 'Vendors', objectName: 'VENDOR', enabled: true },
  { module: 'AR', objectName: 'ARINVOICE', enabled: true },
  { module: 'AP', objectName: 'APBILL', enabled: true },
  { module: 'Sales', objectName: 'SODOCUMENT', enabled: true },
];

const asString = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

const sanitizeSettings = (value: unknown): SageIntacctSettings => {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    senderId: asString(src.senderId),
    senderPassword: asString(src.senderPassword),
    companyId: asString(src.companyId),
    userId: asString(src.userId),
    userPassword: asString(src.userPassword),
    entityId: asString(src.entityId),
    endpointUrl: asString(src.endpointUrl) || DEFAULT_SAGE_INTACCT_SETTINGS.endpointUrl,
    dtdVersion: asString(src.dtdVersion) || '3.0',
    locationId: asString(src.locationId),
  };
};

const sanitizePrograms = (value: unknown): SageIntacctProgram[] => {
  if (!Array.isArray(value)) return DEFAULT_SAGE_INTACCT_PROGRAMS;
  const cleaned = value
    .map((row): SageIntacctProgram => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      const enabledRaw = src.enabled;
      const enabled = typeof enabledRaw === 'boolean' ? enabledRaw : true;
      return { module: asString(src.module), objectName: asString(src.objectName), enabled };
    })
    .filter((row) => row.module || row.objectName);
  return cleaned.length > 0 ? cleaned : DEFAULT_SAGE_INTACCT_PROGRAMS;
};

const sageIntacct: AccountingSystemModule<SageIntacctSettings, SageIntacctProgram> = {
  key: 'SAGE_INTACCT',
  label: 'Sage Intacct',
  tagline: 'Sage Intacct XML API (Sender + User credentials)',
  platform: 'SAGE_INTACCT',
  badge: { initials: 'SI', bg: '#0f766e', fg: '#ffffff' },
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
  defaultSettings: DEFAULT_SAGE_INTACCT_SETTINGS,
  defaultPrograms: DEFAULT_SAGE_INTACCT_PROGRAMS,
  sanitizeSettings,
  sanitizePrograms,
  IntegrationContainer,
  ProgramsContainer,
};

export default sageIntacct;
