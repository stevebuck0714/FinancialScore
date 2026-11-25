import { optionalNumber, optionalText } from './deal-terms';
import type { EarningsBaseResult } from './earnings-base';

export const EARNINGS_MEASURES = [
  { value: 'EBITDA_LESS_CAPEX', label: 'Normalized EBITDA less capital spending' },
  { value: 'NORMALIZED_EBITDA', label: 'Normalized EBITDA' },
] as const;
export type EarningsMeasure = (typeof EARNINGS_MEASURES)[number]['value'];

export const QOE_BUCKETS = [
  { value: 'OWNER_COMP', label: 'Owner compensation adjustment' },
  { value: 'PERSONAL', label: 'Personal / discretionary expenses' },
  { value: 'NON_RECURRING', label: 'Non-recurring expenses' },
  { value: 'ONE_TIME_REVENUE', label: 'One-time revenue' },
] as const;

export type RiskFactor = { id: string; label: string; premiumPct: number; rationale: string | null; qoeBucket: string | null };

export type IncomeApproach = {
  earningsMeasure: EarningsMeasure;
  /** Null means the earnings are capitalized before tax. */
  taxRatePct: number | null;
  riskFreeRatePct: number | null;
  riskFreeAsOf: string | null;
  riskFreeSource: string | null;
  equityRiskPremiumPct: number | null;
  equityRiskPremiumSource: string | null;
  sizePremiumPct: number | null;
  sizePremiumSource: string | null;
  industryPremiumPct: number | null;
  industryPremiumSource: string | null;
  riskFactors: RiskFactor[];
  longTermGrowthPct: number | null;
  growthSource: string | null;
  addExcessWorkingCapital: boolean;
};

const STANDARD_RISK_FACTORS = [
  'Dependence on the owner or key people',
  'Customer concentration',
  'Supplier or franchisor dependence',
  'Earnings volatility and trend',
  'Depth of management and staff',
  'Quality of financial records',
  'Competition and market position',
  'Lease term and location',
];

const newId = () => globalThis.crypto?.randomUUID?.() ?? `r${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

export const DEFAULT_INCOME_APPROACH: IncomeApproach = {
  earningsMeasure: 'EBITDA_LESS_CAPEX',
  taxRatePct: null,
  riskFreeRatePct: null,
  riskFreeAsOf: null,
  riskFreeSource: null,
  equityRiskPremiumPct: null,
  equityRiskPremiumSource: null,
  sizePremiumPct: null,
  sizePremiumSource: null,
  industryPremiumPct: null,
  industryPremiumSource: null,
  riskFactors: [],
  longTermGrowthPct: null,
  growthSource: null,
  addExcessWorkingCapital: true,
};

const MAX_RISK_FACTORS = 20;
/** Below this, a single-period capitalization of a small private company is almost certainly an input error. */
export const MIN_REASONABLE_CAP_RATE_PCT = 10;
const CARRIED_EARNINGS_WARNINGS = ['Normal capital spending is zero', 'The financials end'];

export function normalizeIncomeApproach(raw: unknown): IncomeApproach {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const measure = String(source.earningsMeasure ?? '');
  const factors = Array.isArray(source.riskFactors)
    ? source.riskFactors
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => {
          const bucket = optionalText(item.qoeBucket);
          return {
            id: optionalText(item.id) || newId(),
            label: optionalText(item.label) || '',
            premiumPct: optionalNumber(item.premiumPct) ?? 0,
            rationale: optionalText(item.rationale),
            qoeBucket: QOE_BUCKETS.some((b) => b.value === bucket) ? bucket : null,
          };
        })
    : STANDARD_RISK_FACTORS.map((label, index) => ({ id: `std-${index}`, label, premiumPct: 0, rationale: null, qoeBucket: null }));
  const riskFreeAsOf = optionalText(source.riskFreeAsOf);
  return {
    earningsMeasure: EARNINGS_MEASURES.some((item) => item.value === measure) ? (measure as EarningsMeasure) : 'EBITDA_LESS_CAPEX',
    taxRatePct: optionalNumber(source.taxRatePct),
    riskFreeRatePct: optionalNumber(source.riskFreeRatePct),
    riskFreeAsOf: riskFreeAsOf && /^\d{4}-\d{2}-\d{2}$/.test(riskFreeAsOf) ? riskFreeAsOf : null,
    riskFreeSource: optionalText(source.riskFreeSource),
    equityRiskPremiumPct: optionalNumber(source.equityRiskPremiumPct),
    equityRiskPremiumSource: optionalText(source.equityRiskPremiumSource),
    sizePremiumPct: optionalNumber(source.sizePremiumPct),
    sizePremiumSource: optionalText(source.sizePremiumSource),
    industryPremiumPct: optionalNumber(source.industryPremiumPct),
    industryPremiumSource: optionalText(source.industryPremiumSource),
    riskFactors: factors,
    longTermGrowthPct: optionalNumber(source.longTermGrowthPct),
    growthSource: optionalText(source.growthSource),
    addExcessWorkingCapital: source.addExcessWorkingCapital !== false,
  };
}

/** Returns an error message, or null when the inputs are acceptable to save. */
export function validateIncomeApproach(income: IncomeApproach): string | null {
  if (income.riskFactors.length > MAX_RISK_FACTORS) return `No more than ${MAX_RISK_FACTORS} risk factors.`;
  if (income.riskFactors.some((factor) => !factor.label)) return 'Every risk factor needs a description.';
  if (income.riskFactors.some((factor) => factor.premiumPct < -10 || factor.premiumPct > 25)) return 'Each risk factor premium must be between -10% and 25%.';
  if (income.taxRatePct !== null && (income.taxRatePct < 0 || income.taxRatePct > 60)) return 'Tax rate must be between 0% and 60%.';
  for (const field of ['riskFreeRatePct', 'equityRiskPremiumPct', 'sizePremiumPct'] as const) {
    const value = income[field];
    if (value !== null && (value < 0 || value > 30)) return 'Rates and premiums must be between 0% and 30%.';
  }
  if (income.industryPremiumPct !== null && (income.industryPremiumPct < -15 || income.industryPremiumPct > 15)) return 'Industry premium must be between -15% and 15%.';
  if (income.longTermGrowthPct !== null && (income.longTermGrowthPct < -5 || income.longTermGrowthPct > 10)) return 'Long-term growth must be between -5% and 10%.';
  return null;
}

export type IncomeBalanceSheet = Partial<Record<'cash' | 'loc' | 'ltd', number>> | null;

export type IncomeApproachResult = {
  earnings: number | null;
  earningsLabel: string;
  taxes: number;
  netCashFlow: number | null;
  growthPct: number;
  workingCapitalInvestment: number;
  nextYearCashFlow: number | null;
  companySpecificPct: number;
  discountRatePct: number | null;
  capRatePct: number | null;
  capRateOutOfRange: boolean;
  operatingValue: number | null;
  excessWorkingCapital: number | null;
  debt: number | null;
  cash: number | null;
  indicatedValue: number | null;
  impliedEbitdaMultiple: number | null;
  impliedSdeMultiple: number | null;
  purchasePrice: number | null;
  priceDifference: number | null;
  warnings: string[];
};

export function computeIncomeApproach(
  income: IncomeApproach,
  earnings: EarningsBaseResult,
  options: { transactionStructure: string | null; balanceSheet: IncomeBalanceSheet; purchasePrice: number | null },
): IncomeApproachResult {
  const warnings: string[] = [];
  const measureLabel = EARNINGS_MEASURES.find((item) => item.value === income.earningsMeasure)?.label || '';
  const base = income.earningsMeasure === 'NORMALIZED_EBITDA' ? earnings.normalizedEbitda : earnings.ebitdaLessCapex;
  const taxes = base !== null && income.taxRatePct !== null ? Math.max(base, 0) * (income.taxRatePct / 100) : 0;
  const netCashFlow = base === null ? null : base - taxes;
  const growthPct = income.longTermGrowthPct ?? 0;
  const workingCapitalInvestment = earnings.workingCapital.normal !== null ? earnings.workingCapital.normal * (growthPct / 100) : 0;
  const nextYearCashFlow = netCashFlow === null ? null : netCashFlow * (1 + growthPct / 100) - workingCapitalInvestment;

  const companySpecificPct = income.riskFactors.reduce((total, factor) => total + factor.premiumPct, 0);
  const components = [income.riskFreeRatePct, income.equityRiskPremiumPct, income.sizePremiumPct];
  const discountRatePct = components.every((value) => value !== null)
    ? (components as number[]).reduce((total, value) => total + value, 0) + (income.industryPremiumPct ?? 0) + companySpecificPct
    : null;
  const capRatePct = discountRatePct === null ? null : discountRatePct - growthPct;
  const operatingValue = nextYearCashFlow !== null && capRatePct !== null && capRatePct > 0 ? nextYearCashFlow / (capRatePct / 100) : null;

  const excessWorkingCapital = income.addExcessWorkingCapital ? earnings.workingCapital.excess : null;
  const isStock = options.transactionStructure === 'STOCK';
  const bs = options.balanceSheet || {};
  const debt = isStock ? Number(bs.loc || 0) + Number(bs.ltd || 0) : null;
  const cash = isStock ? Number(bs.cash || 0) : null;
  const indicatedValue = operatingValue === null ? null : operatingValue + (excessWorkingCapital ?? 0) - (debt ?? 0) + (cash ?? 0);

  if (base === null) warnings.push('Complete the Earnings Base tab first.');
  warnings.push(...earnings.warnings.filter((warning) => CARRIED_EARNINGS_WARNINGS.some((prefix) => warning.startsWith(prefix))));
  if (income.riskFreeRatePct === null) warnings.push('Look up the risk-free rate from FRED or enter it.');
  if (income.equityRiskPremiumPct === null || income.sizePremiumPct === null) warnings.push('Enter the equity risk premium and size premium (for example, from the Kroll Cost of Capital Navigator).');
  if (income.taxRatePct === null) warnings.push('Earnings are capitalized before tax while build-up rates are after-tax rates. Enter a tax rate, or support a pre-tax capitalization rate.');
  if (capRatePct !== null && capRatePct <= 0) warnings.push('The capitalization rate is zero or negative; growth cannot exceed the discount rate.');
  const capRateOutOfRange = capRatePct !== null && capRatePct > 0 && capRatePct < MIN_REASONABLE_CAP_RATE_PCT;
  if (capRateOutOfRange) {
    warnings.push(
      `A ${capRatePct.toFixed(2)}% capitalization rate is far below the range typical for small private companies (about 15%–35%) and implies ${(100 / capRatePct).toFixed(0)} times next-year cash flow. Check the discount rate build-up and long-term growth.`,
    );
  }
  if (income.longTermGrowthPct !== null && income.riskFreeRatePct !== null && income.longTermGrowthPct > income.riskFreeRatePct) {
    warnings.push('Long-term growth exceeds the risk-free rate, which is rarely supportable in perpetuity.');
  }
  for (const factor of income.riskFactors) {
    if (factor.premiumPct !== 0 && !factor.rationale) warnings.push(`Explain the premium for "${factor.label}".`);
  }
  if (income.addExcessWorkingCapital && earnings.workingCapital.excess === null) warnings.push('Working capital could not be measured, so no excess or deficit is added.');

  return {
    earnings: base,
    earningsLabel: measureLabel,
    taxes,
    netCashFlow,
    growthPct,
    workingCapitalInvestment,
    nextYearCashFlow,
    companySpecificPct,
    discountRatePct,
    capRatePct,
    capRateOutOfRange,
    operatingValue,
    excessWorkingCapital,
    debt,
    cash,
    indicatedValue,
    impliedEbitdaMultiple: indicatedValue !== null && earnings.normalizedEbitda ? indicatedValue / earnings.normalizedEbitda : null,
    impliedSdeMultiple: indicatedValue !== null && earnings.sde ? indicatedValue / earnings.sde : null,
    purchasePrice: options.purchasePrice,
    priceDifference: indicatedValue !== null && options.purchasePrice !== null ? options.purchasePrice - indicatedValue : null,
    warnings,
  };
}
