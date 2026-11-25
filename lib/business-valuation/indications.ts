import { computeAssetApproach, normalizeAssetApproach, type AssetApproachResult } from './asset-approach';
import { normalizeDealTerms, type Appraisal, type DealTerms } from './deal-terms';
import { computeEarningsBase, normalizeEarningsBase, type EarningsBaseResult } from './earnings-base';
import { computeIncomeApproach, normalizeIncomeApproach, type IncomeApproachResult } from './income-approach';
import { computeMarketApproach, normalizeMarketApproach, type MarketApproachResult } from './market-approach';

export type EngagementInputs = {
  dealTerms?: unknown;
  earningsBase?: unknown;
  incomeApproach?: unknown;
  assetApproach?: unknown;
  marketApproach?: unknown;
  transactionStructure?: string | null;
  valuationDate?: unknown;
  appraisals?: Array<Record<string, unknown>>;
};

export type Indications = {
  deal: DealTerms;
  appraisals: Appraisal[];
  earnings: EarningsBaseResult;
  income: IncomeApproachResult;
  asset: AssetApproachResult;
  market: MarketApproachResult;
};

const dateText = (value: unknown) => (value ? String(value instanceof Date ? value.toISOString() : value).slice(0, 10) : null);

/** The earnings base and the market, income, and asset approaches, computed the same way on every tab and on the server. */
export function computeIndications(engagement: EngagementInputs, snapshot: any): Indications {
  const deal = normalizeDealTerms(engagement.dealTerms);
  const appraisals: Appraisal[] = (engagement.appraisals || []).map((item) => ({
    id: String(item.id),
    assetType: String(item.assetType),
    appraiserFirm: (item.appraiserFirm as string | null) ?? null,
    effectiveDate: dateText(item.effectiveDate),
    value: Number(item.value),
    includedInDeal: item.includedInDeal !== false,
    documentId: (item.documentId as string | null) ?? null,
    notes: (item.notes as string | null) ?? null,
  }));
  const earnings = computeEarningsBase(normalizeEarningsBase(engagement.earningsBase), snapshot);
  const balanceSheet = snapshot?.trailingTwelveMonths?.balanceSheet || null;
  const transactionStructure = engagement.transactionStructure ?? null;
  const income = computeIncomeApproach(normalizeIncomeApproach(engagement.incomeApproach), earnings, {
    transactionStructure,
    balanceSheet,
    purchasePrice: deal.purchasePrice,
  });
  const asset = computeAssetApproach(normalizeAssetApproach(engagement.assetApproach), balanceSheet, appraisals, {
    transactionStructure,
    incomeValue: income.indicatedValue,
  });
  const market = computeMarketApproach(normalizeMarketApproach(engagement.marketApproach), earnings, balanceSheet, {
    transactionStructure,
    valuationDate: dateText(engagement.valuationDate),
  });
  return { deal, appraisals, earnings, income, asset, market };
}
