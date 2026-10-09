import prisma from '@/lib/prisma';
import { buildMockVendorReportsPayload, buildOperationalMockResponse, buildRealEstateOperationalHubMockReports } from '@/lib/operations/sector-mock-data';
import {
  buildBillingCashMock,
  buildCommitmentsForecastMock,
  buildConstructionApMock,
  buildConstructionArMock,
  buildJobCostControlMock,
  buildProjectPortfolioMock,
} from '@/lib/operations/construction-mock-data';
import { buildCustomersSitesMock } from '@/lib/operations/staffing-mock-data';
import { addEstCalendarDays } from '@/lib/time/eastern';
import { payloadToOutput } from '../payload';
import type { OperationalSourceAdapter } from '../types';
import { asRecord, getCompanySectorCategory } from './common';

export const SECTOR_DEMO_SOURCE_CODE = 'SECTOR_DEMO';

const MOCK_TYPES = [
  ['customers', 'customers'],
  ['products', 'products'],
  ['inventory', 'inventory'],
  ['cash', 'cash'],
  ['arAging', 'ar-aging'],
  ['apAging', 'ap-aging'],
  ['apBalances', 'ap'],
] as const;

/** Keys that duplicate data owned by a dedicated source adapter (ICE Encompass, Profit Power, HubSpot). */
const OWNED_BY_OTHER_SOURCES = ['realEstateReports', 'salesPipeline', 'encompassMortgage', 'profitPowerBrokerage'];

function withoutOwnedKeys(value: unknown): Record<string, unknown> {
  const record = { ...asRecord(value) };
  for (const key of OWNED_BY_OTHER_SOURCES) delete record[key];
  return record;
}

/**
 * Company-wide demo data (Site Admin "Force Demo Mode"): the same sector mock data the
 * operational pages show, stored so Ask Corelytics can answer from it. Removed when the
 * company switches to real data.
 */
export const SECTOR_DEMO_ADAPTER: OperationalSourceAdapter = {
  sourceCode: SECTOR_DEMO_SOURCE_CODE,
  provider: 'DEMO',
  label: 'Demo mode sample data',
  datasetPrefix: 'demo',
  history: 'none',
  datasets: [],
  dynamicDatasets: true,
  async mockEligible(companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { forceOperationalMockData: true } });
    return company?.forceOperationalMockData === true;
  },
  async mock({ companyId, window }) {
    const sectorCategory = await getCompanySectorCategory(companyId);
    const endDate = new Date(`${window.endDate}T12:00:00Z`);
    const startDate = new Date(`${addEstCalendarDays(window.endDate, -395)}T12:00:00Z`);
    const payload: Record<string, unknown> = {};
    for (const [key, type] of MOCK_TYPES) {
      const response = buildOperationalMockResponse({ type, companyId, sectorCategory, frequency: 'monthly', startDate, endDate });
      payload[key] = { records: response.records, summary: withoutOwnedKeys(response.summary) };
    }
    payload.vendorReports = buildMockVendorReportsPayload(companyId, sectorCategory);
    if (sectorCategory === '23') {
      payload.jobCostControl = buildJobCostControlMock(companyId);
      payload.projectPortfolio = buildProjectPortfolioMock(companyId);
      payload.commitmentsForecast = buildCommitmentsForecastMock(companyId);
      payload.billingCash = buildBillingCashMock(companyId);
      payload.constructionAr = buildConstructionArMock(companyId);
      payload.constructionAp = buildConstructionApMock(companyId);
    } else if (sectorCategory === '53') {
      payload.realEstate = withoutOwnedKeys(
        buildRealEstateOperationalHubMockReports({ type: 'customers', companyId, sectorCategory, frequency: 'monthly', startDate, endDate }),
      );
    } else if (sectorCategory === '56') {
      payload.customersSites = buildCustomersSitesMock(companyId);
    }
    return payloadToOutput(payload, {
      prefix: 'demo',
      sourceLabel: 'Demo sample data',
      asOf: window.endDate,
      replace: 'all',
    });
  },
};
