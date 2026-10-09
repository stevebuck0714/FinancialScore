import { BAKERS_COGS_LABEL, BAKERS_COGS_SOURCE_CODE } from '@/lib/operational/bakers-cogs';
import { COGENT_RATE_CARD_LABEL, COGENT_RATE_CARD_SOURCE_CODE } from '@/lib/operational/cogent-rate-card';
import { APR_SGP_GMPA_LABEL, APR_SGP_GMPA_SOURCE_CODE } from '@/lib/operational/apr-sgp-gmpa';
import { RAMQUEST_TITLE_LABEL, RAMQUEST_TITLE_SOURCE_CODE } from '@/lib/operational/ramquest-title';
import { RSMEANS_PM_LABEL, RSMEANS_PM_SOURCE_CODE } from '@/lib/operational/rsmeans-pm';
import { BUILDOUT_CRE_LABEL, BUILDOUT_CRE_SOURCE_CODE } from '@/lib/operational/buildout-cre';
import { ISOLVED_PEOPLE_CLOUD_LABEL, ISOLVED_PEOPLE_CLOUD_SOURCE_CODE } from '@/lib/operational/isolved-people-cloud';

export type OperationalSourceProvider = 'BAMBOOHR' | 'HUBSPOT' | 'SPREADSHEET_UPLOAD' | 'ISOLVED';

export type OperationalSourceDefinition = {
  provider: OperationalSourceProvider;
  sourceCode: string;
  label: string;
  sectorCategories: readonly string[];
};

/**
 * Every operational source a company can add. Each entry must have a store adapter in
 * lib/operational-data/registry.ts (enforced at compile time and by the contract test),
 * so its data is saved to tables and visible to Ask Corelytics.
 */
export const OPERATIONAL_SOURCE_DEFINITIONS = [
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: 'CREWTRACKS', label: 'Crewtracks', sectorCategories: ['23'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: 'HILTI', label: 'Hilti', sectorCategories: ['23'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: BAKERS_COGS_SOURCE_CODE, label: BAKERS_COGS_LABEL, sectorCategories: ['32'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: 'FOODREADY_AI', label: 'FoodReady AI', sectorCategories: ['32'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: APR_SGP_GMPA_SOURCE_CODE, label: APR_SGP_GMPA_LABEL, sectorCategories: ['32', '33', '42'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: 'ICE_ENCOMPASS', label: 'ICE Encompass', sectorCategories: ['53'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: 'LANTRAX_PROFIT_POWER', label: 'Profit Power Enterprise', sectorCategories: ['53'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: RAMQUEST_TITLE_SOURCE_CODE, label: RAMQUEST_TITLE_LABEL, sectorCategories: ['53'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: RSMEANS_PM_SOURCE_CODE, label: RSMEANS_PM_LABEL, sectorCategories: ['53'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: BUILDOUT_CRE_SOURCE_CODE, label: BUILDOUT_CRE_LABEL, sectorCategories: ['53'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: 'APPLIED_EPIC_INSURANCE_SERVICES', label: 'Applied Epic - Insurance Services', sectorCategories: ['53'] },
  { provider: 'ISOLVED', sourceCode: ISOLVED_PEOPLE_CLOUD_SOURCE_CODE, label: ISOLVED_PEOPLE_CLOUD_LABEL, sectorCategories: ['54'] },
  { provider: 'BAMBOOHR', sourceCode: 'BAMBOOHR_STANDARD', label: 'BambooHR', sectorCategories: ['56'] },
  { provider: 'HUBSPOT', sourceCode: 'HUBSPOT_STANDARD', label: 'HubSpot', sectorCategories: ['54', '56'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: COGENT_RATE_CARD_SOURCE_CODE, label: COGENT_RATE_CARD_LABEL, sectorCategories: ['56'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: 'PLATOS_CLOSET_STORE_VISIT', label: 'MONTHLY STORE VISIT REPORT', sectorCategories: ['45'] },
  { provider: 'SPREADSHEET_UPLOAD', sourceCode: 'PLATOS_INVENTORY', label: 'Monthly Inventory Report', sectorCategories: ['45'] },
] as const satisfies readonly OperationalSourceDefinition[];

export type OperationalSourceCode = (typeof OPERATIONAL_SOURCE_DEFINITIONS)[number]['sourceCode'];

export function getOperationalSourceDefinition(sourceCode: string): OperationalSourceDefinition | null {
  return OPERATIONAL_SOURCE_DEFINITIONS.find((source) => source.sourceCode === sourceCode) || null;
}
