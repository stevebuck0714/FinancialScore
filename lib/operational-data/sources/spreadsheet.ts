import { buildCrewtracksMock, buildHiltiInventoryMock } from '@/lib/operations/construction-mock-data';
import { buildRealEstateOperationalHubMockReports } from '@/lib/operations/sector-mock-data';
import { addEstCalendarDays } from '@/lib/time/eastern';
import { RAMQUEST_TITLE_LABEL } from '@/lib/operational/ramquest-title';
import { RSMEANS_PM_LABEL } from '@/lib/operational/rsmeans-pm';
import { BUILDOUT_CRE_LABEL } from '@/lib/operational/buildout-cre';
import { payloadToOutput } from '../payload';
import type { OperationalSourceAdapter, OperationalSourceContext } from '../types';

/**
 * Spreadsheet sources without a dedicated parser: any uploaded workbook is stored as live
 * data (one dataset per sheet). Sources with an existing mock builder also store mock data
 * until the first upload.
 */
function spreadsheetAdapter(params: {
  sourceCode: string;
  label: string;
  datasetPrefix: string;
  mockPayload?: (context: OperationalSourceContext) => unknown;
  extraSensitiveKeys?: string[];
}): OperationalSourceAdapter {
  const { mockPayload } = params;
  return {
    sourceCode: params.sourceCode,
    provider: 'SPREADSHEET_UPLOAD',
    label: params.label,
    datasetPrefix: params.datasetPrefix,
    history: 'file',
    historyNote: 'History is whatever the uploaded workbook covers; each upload replaces that upload date\'s data.',
    datasets: [],
    dynamicDatasets: true,
    acceptsWorkbookUpload: true,
    mock: mockPayload
      ? async (context) =>
          payloadToOutput(mockPayload(context), {
            prefix: params.datasetPrefix,
            sourceLabel: params.label,
            asOf: context.window.endDate,
            replace: 'all',
            extraSensitiveKeys: params.extraSensitiveKeys,
          })
      : undefined,
  };
}

function realEstateMockReports(context: OperationalSourceContext) {
  const endDate = new Date(`${context.window.endDate}T12:00:00Z`);
  const startDate = new Date(`${addEstCalendarDays(context.window.endDate, -365)}T12:00:00Z`);
  return buildRealEstateOperationalHubMockReports({
    type: 'customers',
    companyId: context.companyId,
    sectorCategory: '53',
    frequency: 'monthly',
    startDate,
    endDate,
  }) as Record<string, unknown>;
}

export const SPREADSHEET_ADAPTERS = {
  CREWTRACKS: spreadsheetAdapter({
    sourceCode: 'CREWTRACKS',
    label: 'Crewtracks',
    datasetPrefix: 'crewtracks',
    mockPayload: ({ companyId, window }) => buildCrewtracksMock(companyId, { asOf: new Date(`${window.endDate}T12:00:00Z`) }),
  }),
  HILTI: spreadsheetAdapter({
    sourceCode: 'HILTI',
    label: 'Hilti',
    datasetPrefix: 'hilti',
    mockPayload: ({ companyId, window }) => buildHiltiInventoryMock(companyId, { asOf: new Date(`${window.endDate}T12:00:00Z`) }),
  }),
  FOODREADY_AI: spreadsheetAdapter({ sourceCode: 'FOODREADY_AI', label: 'FoodReady AI', datasetPrefix: 'foodready' }),
  ICE_ENCOMPASS: spreadsheetAdapter({
    sourceCode: 'ICE_ENCOMPASS',
    label: 'ICE Encompass',
    datasetPrefix: 'ice_encompass',
    mockPayload: (context) => realEstateMockReports(context).encompassMortgage,
  }),
  LANTRAX_PROFIT_POWER: spreadsheetAdapter({
    sourceCode: 'LANTRAX_PROFIT_POWER',
    label: 'Profit Power Enterprise',
    datasetPrefix: 'profit_power',
    mockPayload: (context) => realEstateMockReports(context).profitPowerBrokerage,
  }),
  RAMQUEST_TITLE: spreadsheetAdapter({ sourceCode: 'RAMQUEST_TITLE', label: RAMQUEST_TITLE_LABEL, datasetPrefix: 'ramquest' }),
  RSMEANS_PM: spreadsheetAdapter({ sourceCode: 'RSMEANS_PM', label: RSMEANS_PM_LABEL, datasetPrefix: 'rsmeans' }),
  BUILDOUT_CRE: spreadsheetAdapter({ sourceCode: 'BUILDOUT_CRE', label: BUILDOUT_CRE_LABEL, datasetPrefix: 'buildout' }),
  APPLIED_EPIC_INSURANCE_SERVICES: spreadsheetAdapter({
    sourceCode: 'APPLIED_EPIC_INSURANCE_SERVICES',
    label: 'Applied Epic - Insurance Services',
    datasetPrefix: 'applied_epic',
  }),
} satisfies Record<string, OperationalSourceAdapter>;
