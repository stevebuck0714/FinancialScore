import { getRateForDate } from '@/lib/fx/convert';
import { formatEstDate } from '@/lib/fx/est-dates';
import type { CompanyCurrencySettings } from '@/lib/currency/company-currency';

/** Individual money fields (P&L, BS, ops snapshots, valuation). */
const MONEY_KEYS = new Set([
  'latestRevenue',
  'latestExpense',
  'latestNet',
  'latestCash',
  'latestAR',
  'latestAP',
  'netChange',
  'revenue',
  'expense',
  'cogsTotal',
  'cogsPayroll',
  'cogsOwnerPay',
  'cogsContractors',
  'cogsMaterials',
  'cogsCommissions',
  'cogsOther',
  'cogs',
  'cash',
  'ar',
  'ap',
  'inventory',
  'netIncome',
  'grossProfit',
  'operatingIncome',
  'ebitda',
  'sde',
  'totalAssets',
  'totalLiab',
  'totalEquity',
  'totalLAndE',
  'tca',
  'tcl',
  'ltd',
  'loc',
  'ownersCapital',
  'ownersDraw',
  'retainedEarnings',
  'currentYearNetIncome',
  'commonStock',
  'preferredStock',
  'additionalPaidInCapital',
  'treasuryStock',
  'payroll',
  'ownerBasePay',
  'benefits',
  'insurance',
  'professionalFees',
  'subcontractors',
  'rent',
  'taxLicense',
  'phoneComm',
  'infrastructure',
  'autoTravel',
  'salesExpense',
  'marketing',
  'trainingCert',
  'mealsEntertainment',
  'depreciation',
  'depreciationAmortization',
  'interestExpense',
  'otherExpense',
  'nonOperatingIncome',
  'nonOperatingExpense',
  'extraordinaryItems',
  'stateIncomeTaxes',
  'federalIncomeTaxes',
  'retainageReceivables',
  'contractAssets',
  'otherCA',
  'fixedAssets',
  'constructionEquipment',
  'officeEquipment',
  'shopEquipment',
  'investments',
  'rightOfUseLeases',
  'otherAssets',
  'contractLiabilities',
  'otherCL',
  'sales',
  'receipts',
  'collections',
  'billings',
  'invoiced',
  'openBalance',
  'current',
  'bucket30',
  'bucket60',
  'bucket90',
  'bucket120',
  'over30',
  'over60',
  'over90',
  'value',
  'values',
  'ltm',
  'ltmTotal',
  'ownerAmount',
  'ownerAmountTotal',
  'totalCash',
  'mtd',
  'ytd',
  'budget',
  'priorYear',
  'principal',
  'balance',
  'amount',
]);

/** Walk these subtrees converting every numeric leaf (except skip keys). */
const MONEY_CONTAINER_KEYS = new Set([
  'monthlyData',
  'records',
  'values',
  'buckets',
  'allAccounts',
  'accounts',
  'lineItems',
  'monthly',
  'operational',
  'loans',
  'startingBalances',
  'historicalAverages',
  'sdeManualInputs',
  'sdeAnalysisTotals',
  'rows',
  'tableRows',
  'summary',
  'data',
  'financials',
  'workingCapital',
  'customers',
  'products',
  'dailyOperations',
  'constructionOperations',
  'cashResult',
  'arAgingResult',
  'apAgingResult',
  'inventoryHistory',
  'productHistory',
  'productMarginHistory',
  'dailyFinancials',
  'revenueBreakdown',
  'cogsBreakdown',
  'expenseBreakdown',
  'lobBreakdowns',
]);

const SKIP_KEYS = new Set([
  'id',
  'companyId',
  'financialRecordId',
  'uploadedByUserId',
  'mappingId',
  'accountId',
  'accountCode',
  'accountName',
  'targetField',
  'fileName',
  'fileUrl',
  'columnMapping',
  'rawData',
  'currency',
  'fx',
  'success',
  'ok',
  'error',
  '_source',
  '_scope',
  'months',
  'count',
  'locale',
  'accountingSystem',
  'sourceUsed',
  'bsSource',
  'resolutionGroup',
  'category',
  'bucket',
  'label',
  'key',
  'name',
  'email',
  'title',
  'description',
  'chartType',
  'dataSource',
  'config',
  'basisMode',
  'frequency',
  'model',
  'period',
  'generatedAt',
  'asOfDate',
  'asOfMonth',
  'asOfYmd',
  'targetMonth',
  'month',
  'date',
  'monthDate',
  'createdAt',
  'updatedAt',
  'ownerPercent',
  'goals',
  'benchmarks',
  'unsupportedTopicRules',
  'dataCoverage',
  'financialForecastInputs',
  'savedSettings',
  'revenueGrowthByRow',
  'cogsPctByRow',
  'opexPctByRow',
  'inputs',
  'weeklyDrivers',
  'sdeMultiplier',
  'ebitdaMultiplier',
  'dcfDiscountRate',
  'dcfTerminalGrowth',
  'fromCurrency',
  'toCurrency',
  'provider',
  'note',
]);

const SKIP_KEY_RE =
  /(percent|pct|ratio|score|multiplier|growthRate|discountRate|terminalGrowth|ownerPercent|coveragePct|daysOutstanding|\bdso\b|\bdio\b|\bdpo\b)$/i;

const MONEY_KEY_RE =
  /amount|revenue|expense|income|cogs|payroll|cash|balance|total|ebitda|\bsde\b|assets|liab|equity|inventory|receivable|payable|debt|draw|capital|depreciation|amortization|interest|marketing|subcontract|principal|ltm|billings|collections|receipts|invoiced/i;

const MONEY_PREFIX_RE = /^(rev_|cogs_|exp_)/i;
const BREAKDOWN_KEY_RE = /breakdown$/i;

function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function shouldSkipKey(key: string): boolean {
  if (SKIP_KEYS.has(key)) return true;
  if (SKIP_KEY_RE.test(key)) return true;
  return false;
}

function isMoneyKey(key: string): boolean {
  if (MONEY_KEYS.has(key)) return true;
  if (MONEY_CONTAINER_KEYS.has(key)) return true;
  if (MONEY_PREFIX_RE.test(key)) return true;
  if (BREAKDOWN_KEY_RE.test(key)) return true;
  if (MONEY_KEY_RE.test(key)) return true;
  return false;
}

function isMoneyContainerKey(key: string): boolean {
  return MONEY_CONTAINER_KEYS.has(key) || BREAKDOWN_KEY_RE.test(key) || MONEY_PREFIX_RE.test(key);
}

function convertNumber(amount: number, rate: number): number {
  if (!Number.isFinite(amount) || amount === 0) return amount;
  return amount * rate;
}

function walk(
  value: unknown,
  rate: number,
  mode: 'selective' | 'all-numbers'
): unknown {
  if (value == null) return value;
  if (isDate(value)) return value;
  if (typeof value === 'number') {
    return mode === 'all-numbers' && Number.isFinite(value) ? convertNumber(value, rate) : value;
  }
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'number' && mode === 'all-numbers') return convertNumber(item, rate);
      return walk(item, rate, mode);
    });
  }

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(obj)) {
    if (shouldSkipKey(key)) {
      out[key] = child;
      continue;
    }
    if (isDate(child)) {
      out[key] = child;
      continue;
    }
    if (mode === 'all-numbers') {
      out[key] = walk(child, rate, 'all-numbers');
      continue;
    }
    if (typeof child === 'number' && isMoneyKey(key)) {
      out[key] = convertNumber(child, rate);
      continue;
    }
    if (child && typeof child === 'object') {
      const nextMode = isMoneyContainerKey(key) || isMoneyKey(key) ? 'all-numbers' : 'selective';
      out[key] = walk(child, rate, nextMode);
      continue;
    }
    out[key] = child;
  }
  return out;
}

/**
 * Convert numeric money fields from base → target using cached EOD FX.
 * Looks up one rate for the as-of date, then multiplies in-memory.
 */
export async function convertMoneyTree(
  value: unknown,
  opts: {
    from: string;
    to: string;
    asOfYmd: string;
  }
): Promise<unknown> {
  if (opts.from.toUpperCase() === opts.to.toUpperCase()) return value;

  const cached = await getRateForDate(opts.from, opts.to, opts.asOfYmd);
  if (!cached) {
    throw new Error(`No FX rate for ${opts.from}->${opts.to} on or before ${opts.asOfYmd}`);
  }

  return walk(value, cached.rate, 'selective');
}

export async function applyReportingCurrencyIfNeeded<T extends Record<string, unknown>>(
  payload: T,
  opts: {
    companyCurrency: CompanyCurrencySettings;
    requestedCurrency: string;
    asOf?: Date;
  }
): Promise<T & { fx?: Record<string, unknown> }> {
  const from = opts.companyCurrency.baseCurrency;
  const to = opts.requestedCurrency.toUpperCase();
  if (!to || to === from) {
    return payload;
  }

  const asOfYmd = formatEstDate(opts.asOf || new Date());
  try {
    const converted = (await convertMoneyTree(payload, { from, to, asOfYmd })) as T;
    return {
      ...converted,
      fx: {
        fromCurrency: from,
        toCurrency: to,
        asOfYmd,
      },
    };
  } catch (error) {
    console.error(`FX conversion failed for ${from}->${to} on ${asOfYmd}:`, error);
    return payload;
  }
}
