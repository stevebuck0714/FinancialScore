import { computeAssetApproach, normalizeAssetApproach, type AssetApproachResult } from './asset-approach';
import { normalizeDealTerms, type Appraisal, type DealTerms } from './deal-terms';
import { computeEarningsBase, normalizeEarningsBase, type EarningsBaseResult } from './earnings-base';
import { computeIncomeApproach, normalizeIncomeApproach, type IncomeApproachResult } from './income-approach';

export type EngagementInputs = {
  dealTerms?: unknown;
  earningsBase?: unknown;
  incomeApproach?: unknown;
  assetApproach?: unknown;
  transactionStructure?: string | null;
  appraisals?: Array<Record<string, unknown>>;
};

export type Indications = {
  deal: DealTerms;
  appraisals: Appraisal[];
  earnings: EarningsBaseResult;
  income: IncomeApproachResult;
  asset: AssetApproachResult;
};

/** The earnings base and the income and asset approaches, computed the same way on every tab and on the server. */
export function computeIndications(engagement: EngagementInputs, snapshot: any): Indications {
  const deal = normalizeDealTerms(engagement.dealTerms);
  const appraisals: Appraisal[] = (engagement.appraisals || []).map((item) => ({
    id: String(item.id),
    assetType: String(item.assetType),
    appraiserFirm: (item.appraiserFirm as string | null) ?? null,
    effectiveDate: item.effectiveDate ? String(item.effectiveDate instanceof Date ? item.effectiveDate.toISOString() : item.effectiveDate).slice(0, 10) : null,
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
  return { deal, appraisals, earnings, income, asset };
}
