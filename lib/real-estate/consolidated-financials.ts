import prisma from '@/lib/prisma';
import { ingestFinancialPayload } from '@/lib/financial-ingestion';
import { publishMonthsFromMonthlyFinancialDirect } from '@/lib/financial/publish-month-service';
import { ensureRealEstateAccountMappingTable } from '@/lib/real-estate/account-mapping-table';
import { ensureRealEstateConstructionTables } from '@/lib/real-estate/construction-tables';
import { buildEntityReportLines } from '@/lib/real-estate/entity-report-lines';
import {
  PROPERTY_INCOME_STATEMENT,
  PROPERTY_PRINCIPAL_REDUCTION_KEY,
  aggregateMappedAmounts,
  propertyLineGroup,
} from '@/lib/real-estate/property-income-statement';
import { classifyFixedAssetAccount } from '@/lib/real-estate/quickbooks-report-lines';
import {
  CONSOLIDATED_FINANCIALS_SOURCE,
  type ContributedLand,
  type DebtIssuanceTerm,
  contributedLand,
  debtIssuanceTerm,
  isConsolidatedReportingCompany,
} from '@/lib/real-estate/consolidated-reporting-companies';

/**
 * Combined SLN + BGAH monthly book-basis (GAAP) financials for Financial Reporting.
 *
 * - SLN (property management) owns property operations: its activity comes
 *   through the property statement mapping and is translated to the standard
 *   fields. Principal reduces the loan; capital expenses and capitalized
 *   nonrecurring repairs are added to fixed assets.
 * - BGAH (QuickBooks Desktop, cash basis) adds owner-level activity through the
 *   company's Data Mapping.
 * - Land contributed by members is carried at its GAAP book value from the
 *   month the deeds transferred, when one is configured, instead of
 *   QuickBooks' tax carryover basis; contributed capital changes by the same
 *   amount.
 * - BGAH's Due to/from SLN account is eliminated and SLN's own equity is not
 *   carried, so the combined retained earnings is the balancing amount;
 *   `unreconciled` is what remains after BGAH's own equity, SLN's cumulative
 *   earnings and the GAAP adjustments.
 * - GAAP adjustments are calculated here, never posted to either source:
 *   book depreciation from the fixed-asset register (replacing any QuickBooks
 *   depreciation), interest capitalized before the property is placed in
 *   service, loan fees netted against the loan and amortized, mortgage interest
 *   accrued one month in arrears, and real estate taxes and insurance spread
 *   evenly over each calendar year. Every adjustment is an `activityLines` /
 *   `balanceLines` entry from CONSOLIDATION and has a matching entry in `notes`.
 */

type Line = {
  sourceEntity: string;
  reportType: string;
  periodEnd: string | Date;
  accountCode: string;
  accountName: string;
  accountType: string;
  amount: unknown;
};
type AccountMappingRow = { accountName: string; accountCode: string | null; targetField: string };
type PropertyMapping = { financialFeed: string; accountCode: string; targetField: string; bookTreatment?: string | null };
export type RegisterAsset = { name: string; assetClass: string; cost: number; inServiceDate: string | null; usefulLifeYears: number | null; basis: string | null };
export type BudgetLine = { name: string; revisedBudget: number; costClass: string };
type Row = Record<string, any> & {
  monthDate: string;
  revenue: number;
  cogsTotal: number;
  expense: number;
  revenueBreakdown: Record<string, number>;
  cogsBreakdown: Record<string, number>;
  expenseBreakdown: Record<string, number>;
};

export type ConsolidatedMonth = {
  month: string;
  entities: Array<'SLN' | 'BGAH'>;
  partial: boolean;
  unreconciled: number | null;
};

/** One balance sheet line of the combination, so its detail ties to the published totals. */
export type ConsolidatedBalanceLine = {
  sourceEntity: 'SLN' | 'BGAH' | 'CONSOLIDATION';
  reportType: 'BALANCE';
  periodEnd: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  amount: number;
};

/** One income statement amount of the combination in source sign (income and expense both positive). */
export type ConsolidatedActivityLine = {
  sourceEntity: 'SLN' | 'BGAH' | 'CONSOLIDATION';
  reportType: 'ACTIVITY';
  periodEnd: string;
  field: string;
  label: string;
  amount: number;
};

export type ConsolidationNote = {
  key: string;
  title: string;
  paragraphs: string[];
  items?: string[];
  byYear?: Array<{ label: string; values: Record<string, number> }>;
};

export type BookDepreciationYear = { year: number; depreciation: number; loanFeeAmortization: number; capitalizedInterest: number; netFixedAssets: number };

const EXPENSE_FIELDS = new Set([
  'payroll', 'ownerBasePay', 'benefits', 'insurance', 'professionalFees', 'subcontractors', 'rent', 'taxLicense',
  'stateIncomeTaxes', 'federalIncomeTaxes', 'phoneComm', 'infrastructure', 'autoTravel', 'salesExpense', 'marketing',
  'trainingCert', 'mealsEntertainment', 'interestExpense', 'depreciationAmortization', 'otherExpense', 'nonOperatingExpense',
]);
const CURRENT_ASSET_FIELDS = ['cash', 'ar', 'retainageReceivables', 'contractAssets', 'inventory', 'otherCA'];
const FIXED_ASSET_FIELDS = ['fixedAssets', 'constructionEquipment', 'officeEquipment', 'shopEquipment'];
const OTHER_ASSET_FIELDS = ['investments', 'rightOfUseLeases', 'otherAssets'];
const CURRENT_LIABILITY_FIELDS = ['ap', 'loc', 'contractLiabilities', 'otherCL'];
const EQUITY_FIELDS_EXCEPT_RETAINED = ['ownersCapital', 'ownersDraw', 'commonStock', 'preferredStock', 'additionalPaidInCapital', 'treasuryStock'];
const SIDE_FIELDS = {
  asset: new Set([...CURRENT_ASSET_FIELDS, ...FIXED_ASSET_FIELDS, ...OTHER_ASSET_FIELDS]),
  liability: new Set([...CURRENT_LIABILITY_FIELDS, 'ltd']),
  equity: new Set([...EQUITY_FIELDS_EXCEPT_RETAINED, 'retainedEarnings']),
};
const TYPE_FIELD: Record<string, string> = {
  bank: 'cash', accountsreceivable: 'ar', othercurrentasset: 'otherCA', fixedasset: 'fixedAssets', otherasset: 'otherAssets',
  accountspayable: 'ap', creditcard: 'otherCL', othercurrentliability: 'otherCL', longtermliability: 'ltd', longtermdebt: 'ltd',
};
const SKIP_TARGETS = new Set(['ignored', 'ignore', 'unmapped', 'skip', 'exclude', 'excluded']);
const INTERCOMPANY_ACCOUNT = /due\s*to\s*\/\s*from\s*sln|due\s+(to|from)\s+sln|nusbaum/i;
const CONTRIBUTED_LAND_ACCOUNT = /land\s+contributions?\b/i;
const ACCUMULATED_ACCOUNT = /accumulated\s+(depreciation|amortization)|accum\.?\s*(depr|amort)/i;
const LOAN_FEE_ACCOUNT = /loan\s+(fees?|costs?)|financing\s+(fees?|costs?)|debt\s+issuance|loan\s+closing\s+costs?/i;
const NON_DEPRECIABLE_PROPERTY = /escrow|reserve|deposit/i;
const PROPERTY_TAX_ACCOUNT = /real\s+estate\s+tax|property\s+tax/i;
// SLN's balance sheet varies month to month and sometimes repeats owner-level
// items BGAH already carries (land, development cash, capital improvements,
// the mortgage, lender escrows). Only property working capital is taken from SLN.
const SLN_WORKING_CAPITAL_TYPES = new Set(['bank', 'accountsreceivable', 'othercurrentasset', 'accountspayable', 'othercurrentliability', 'creditcard']);
const SLN_OWNER_LEVEL_ACCOUNT = /\bland\b|development|\bhbo\b|capital improvement|mortgage payable|mortg co|esc acct|insurance escrow|replacement reserve/i;
const INTEREST_INCOME_KEYS = new Set(['rev_re_interest_income', 'rev_re_treasury_note_interest_income']);
const MORTGAGE_INTEREST_KEY = 'opex_re_mortgage_interest_no_1';
const REPLACEMENT_RESERVE_KEY = 'opex_re_repl_res_held_by_lender';
const REAL_ESTATE_TAX_KEY = 'opex_re_real_estate_taxes';
const INSURANCE_KEY = 'opex_re_insurance';
const DEFAULT_LIFE_YEARS: Record<string, number> = { building: 40, land_improvements: 15, equipment: 7, ffe: 7 };
const SLN_LINE_LABEL = new Map(PROPERTY_INCOME_STATEMENT.flatMap((row) => (row.kind === 'line' ? [[row.key, row.label] as const] : [])));
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ADJUSTMENT = {
  depreciation: 'GAAP adjustment: book depreciation (fixed-asset register)',
  capitalizedInterest: 'GAAP adjustment: interest capitalized to construction in progress',
  loanFeeAmortization: 'GAAP adjustment: amortization of loan fees',
  accruedInterest: 'GAAP adjustment: mortgage interest accrued one month in arrears',
  realEstateTaxes: 'GAAP adjustment: real estate taxes spread evenly over the year',
  insurance: 'GAAP adjustment: insurance spread evenly over the year',
};

const normalizeType = (type: string) => String(type || '').toLowerCase().replace(/[^a-z]/g, '');
const normalizeKey = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const monthOf = (periodEnd: string | Date) => (periodEnd instanceof Date ? periodEnd.toISOString() : String(periodEnd)).slice(0, 7);
const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
const monthLabel = (month: string) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const round = (value: number) => Math.round(value * 100) / 100;
const usd = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

function sideOf(accountType: string): 'asset' | 'liability' | 'equity' | null {
  const type = normalizeType(accountType);
  if (['bank', 'accountsreceivable', 'othercurrentasset', 'fixedasset', 'otherasset'].includes(type)) return 'asset';
  if (['accountspayable', 'creditcard', 'othercurrentliability', 'longtermliability', 'longtermdebt'].includes(type)) return 'liability';
  if (type === 'equity') return 'equity';
  return null;
}

function equityFieldForName(accountName: string) {
  if (/distribut|draw/i.test(accountName)) return 'ownersDraw';
  if (/contribut|capital/i.test(accountName)) return 'ownersCapital';
  return 'retainedEarnings';
}

function monthRange(first: string, last: string) {
  const months: string[] = [];
  let [year, month] = first.split('-').map(Number);
  const [lastYear, lastMonth] = last.split('-').map(Number);
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return months;
}

function createRow(month: string): Row {
  return { monthDate: `${month}-01`, revenue: 0, cogsTotal: 0, expense: 0, revenueBreakdown: {}, cogsBreakdown: {}, expenseBreakdown: {} };
}

const byYear = (values: Map<string, number>) => {
  const years: Record<string, number> = {};
  values.forEach((amount, month) => { years[month.slice(0, 4)] = round((years[month.slice(0, 4)] || 0) + amount); });
  return years;
};
const hasAmounts = (values: Map<string, number>) => [...values.values()].some((amount) => Math.abs(amount) >= 0.5);

const isIncomeStatementTarget = (target: string) =>
  target === 'revenue' || target.startsWith('rev_') || target === 'nonOperatingIncome' ||
  target === 'cogsTotal' || target.startsWith('cogs') || EXPENSE_FIELDS.has(target) || target === 'extraordinaryItems';

/** Adds an income statement amount and returns its effect on net income. */
function addIncomeStatementAmount(row: Row, target: string, amount: number): number {
  if (!amount) return 0;
  if (target === 'nonOperatingIncome') {
    row.nonOperatingIncome = Number(row.nonOperatingIncome || 0) + amount;
    return amount;
  }
  if (target === 'revenue' || target.startsWith('rev_')) {
    row.revenue += amount;
    if (target.startsWith('rev_')) row.revenueBreakdown[target] = Number(row.revenueBreakdown[target] || 0) + amount;
    return amount;
  }
  if (target === 'cogsTotal' || target.startsWith('cogs')) {
    row.cogsTotal += amount;
    const key = target.startsWith('cogs_') ? target : 'cogs_other';
    row.cogsBreakdown[key] = Number(row.cogsBreakdown[key] || 0) + amount;
    if (target !== 'cogsTotal' && !target.startsWith('cogs_')) row[target] = Number(row[target] || 0) + amount;
    return -amount;
  }
  if (EXPENSE_FIELDS.has(target)) {
    row.expense += amount;
    row[target] = Number(row[target] || 0) + amount;
    row.expenseBreakdown[target] = Number(row.expenseBreakdown[target] || 0) + amount;
    return -amount;
  }
  if (target === 'extraordinaryItems') {
    row.extraordinaryItems = Number(row.extraordinaryItems || 0) + amount;
    return amount;
  }
  return 0;
}

/** Standard Financial Reporting field for an SLN property statement line. */
function propertyField(key: string, group: string): string {
  switch (group) {
    case 'adjustedGrossPotential':
    case 'otherTenantIncome':
    case 'netChangeArPrepaid':
      return 'rev_rental_income';
    case 'miscellaneousIncome':
      return INTEREST_INCOME_KEYS.has(key) ? 'nonOperatingIncome' : 'rev_ancillary_income';
    case 'administrative':
      if (/management_fee|accounting/.test(key)) return 'professionalFees';
      if (key === 'opex_re_advertising') return 'marketing';
      if (key === 'opex_re_employee_training') return 'trainingCert';
      if (key === 'opex_re_telephone' || key === 'opex_re_cable') return 'phoneComm';
      return 'otherExpense';
    case 'payroll':
      return /health_insurance|401k/.test(key) ? 'benefits' : 'payroll';
    case 'utilities':
      return 'infrastructure';
    case 'taxesInsurance':
      if (key === 'opex_re_insurance') return 'insurance';
      return /taxes/.test(key) ? 'taxLicense' : 'otherExpense';
    case 'debtService':
      return 'interestExpense';
    default:
      return 'otherExpense';
  }
}

type DepreciationComponent = { name: string; assetClass: string; cost: number; share: number; lifeYears: number; inServiceMonth: string | null; assumedInService: boolean };

/**
 * Book depreciation components: the register's depreciable assets, or the
 * construction budget's hard, soft and FF&E costs when the register is empty.
 * The components set the split and lives; the depreciable cost itself is the
 * combined books' property cost.
 */
function depreciationPlan(fixedAssets: RegisterAsset[], budgetLines: BudgetLine[], lastDrawDate: string | null) {
  const assumedMonth = lastDrawDate ? lastDrawDate.slice(0, 7) : null;
  type Part = { name: string; assetClass: string; cost: number; lifeYears: number; inServiceDate: string | null };
  let source: 'register' | 'budget' | null = null;
  let parts: Part[] = fixedAssets
    .filter((asset) => asset.assetClass !== 'land' && Number(asset.cost) > 0)
    .map((asset) => ({
      name: asset.name,
      assetClass: asset.assetClass,
      cost: Number(asset.cost),
      lifeYears: Number(asset.usefulLifeYears) > 0 ? Number(asset.usefulLifeYears) : DEFAULT_LIFE_YEARS[asset.assetClass] || 40,
      inServiceDate: asset.inServiceDate,
    }));
  if (parts.length) source = 'register';
  else {
    const total = (classes: string[]) => budgetLines.filter((line) => classes.includes(line.costClass)).reduce((sum, line) => sum + Number(line.revisedBudget || 0), 0);
    parts = [
      { name: 'Building (hard and capitalized soft construction costs)', assetClass: 'building', cost: total(['hard', 'soft']), lifeYears: 40, inServiceDate: null },
      { name: 'Furniture, fixtures and equipment', assetClass: 'ffe', cost: total(['ffe']), lifeYears: 7, inServiceDate: null },
    ].filter((part) => part.cost > 0);
    if (parts.length) source = 'budget';
  }
  const totalCost = parts.reduce((sum, part) => sum + part.cost, 0);
  const components: DepreciationComponent[] = parts.map((part) => ({
    name: part.name,
    assetClass: part.assetClass,
    cost: part.cost,
    share: totalCost ? part.cost / totalCost : 0,
    lifeYears: part.lifeYears,
    inServiceMonth: part.inServiceDate ? part.inServiceDate.slice(0, 7) : assumedMonth,
    assumedInService: !part.inServiceDate,
  }));
  const inServiceMonths = components.map((component) => component.inServiceMonth).filter((month): month is string => Boolean(month)).sort();
  const shortLived = components.find((component) => component.assetClass === 'ffe' || component.assetClass === 'equipment');
  return {
    source,
    components,
    projectInServiceMonth: inServiceMonths[0] || null,
    inServiceAssumed: components.some((component) => component.assumedInService),
    assumedMonth,
    improvementLifeYears: shortLived?.lifeYears || 7,
  };
}

type Layer = { start: number; end: number; perMonth: number };
const activeAmount = (layers: Layer[], index: number) => layers.reduce((sum, layer) => sum + (index >= layer.start && index < layer.end ? layer.perMonth : 0), 0);

export function buildConsolidatedMonthlyRows(input: {
  slnLines: Line[];
  slnMappings: PropertyMapping[];
  bgahLines: Line[];
  accountMappings: AccountMappingRow[];
  contributedLand?: ContributedLand | null;
  fixedAssets?: RegisterAsset[];
  budgetLines?: BudgetLine[];
  lastDrawDate?: string | null;
  debtIssuance?: DebtIssuanceTerm | null;
}) {
  const allLines = [...input.slnLines, ...input.bgahLines];
  if (!allLines.length) {
    return {
      rows: [] as Row[], months: [] as ConsolidatedMonth[], balanceLines: [] as ConsolidatedBalanceLine[], activityLines: [] as ConsolidatedActivityLine[],
      notes: [] as ConsolidationNote[], bookDepreciation: [] as BookDepreciationYear[], unmappedSlnAccounts: 0, unmappedBgahAccounts: [] as string[], remappedBgahAccounts: [] as string[],
    };
  }
  const lineMonths = allLines.map((line) => monthOf(line.periodEnd)).sort();
  const months = monthRange(lineMonths[0], lineMonths[lineMonths.length - 1]);
  const rows = new Map(months.map((month) => [month, createRow(month)]));
  const coverage = new Map(months.map((month) => [month, { bgah: false, slnActivity: false, slnBalance: false }]));

  const plan = depreciationPlan(input.fixedAssets || [], input.budgetLines || [], input.lastDrawDate || null);
  const bookDepreciationActive = plan.components.length > 0;
  const inServiceIndex = plan.projectInServiceMonth ? monthIndex(plan.projectInServiceMonth) : Number.POSITIVE_INFINITY;
  const preService = (month: string) => monthIndex(month) < inServiceIndex;

  const activityLines: ConsolidatedActivityLine[] = [];
  const post = (sourceEntity: ConsolidatedActivityLine['sourceEntity'], month: string, target: string, amount: number, label: string) => {
    const effect = addIncomeStatementAmount(rows.get(month)!, target, amount);
    if (Math.abs(amount) >= 0.005 && isIncomeStatementTarget(target)) {
      activityLines.push({ sourceEntity, reportType: 'ACTIVITY', periodEnd: `${month}-01`, field: target, label, amount: round(amount) });
    }
    return effect;
  };

  // BGAH accounts resolve through the company's Data Mapping by full name, then by unique account number.
  const targetByName = new Map<string, string>();
  const codeCounts = new Map<string, number>();
  input.accountMappings.forEach((mapping) => {
    const code = normalizeKey(mapping.accountCode);
    if (code) codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
  });
  const targetByCode = new Map<string, string>();
  input.accountMappings.forEach((mapping) => {
    if (mapping.accountName) targetByName.set(normalizeKey(mapping.accountName), mapping.targetField);
    const code = normalizeKey(mapping.accountCode);
    if (code && codeCounts.get(code) === 1) targetByCode.set(code, mapping.targetField);
  });
  const bgahTarget = (line: Line) => targetByName.get(normalizeKey(line.accountName)) || targetByCode.get(normalizeKey(line.accountCode)) || '';

  const unmappedBgah = new Set<string>();
  const remappedBgah = new Set<string>();
  const depreciationBooked = new Map<string, number>();
  const quickBooksDepreciationIgnored = new Map<string, number>();
  const bgahEquityResidual = new Map<string, number>();
  const slnEquity = new Map<string, number>();
  const slnNet = new Map<string, number>();
  const principal = new Map<string, number>();
  const capitalized = new Map<string, number>();
  const slnDepreciable = new Map<string, number>();
  const bgahInterest = new Map<string, number>();
  const realEstateTaxCash = new Map<string, number>();
  const insuranceCash = new Map<string, number>();
  const contributedLandBasis = new Map<string, { field: string; accountType: string; amount: number }>();
  const loanFeeBasis = new Map<string, { field: string; accountType: string; amount: number }>();
  const quickBooksAccumulated = new Map<string, Map<string, { accountType: string; amount: number }>>();
  const depreciableBase = new Map<string, number>();
  const loanFeeAccounts = new Set<string>();
  const excludedPropertyAccounts = new Set<string>();
  const addTo = (map: Map<string, number>, month: string, amount: number) => map.set(month, (map.get(month) || 0) + amount);
  const balanceLines: ConsolidatedBalanceLine[] = [];
  const addBalanceLine = (sourceEntity: ConsolidatedBalanceLine['sourceEntity'], month: string, line: Pick<Line, 'accountCode' | 'accountName' | 'accountType'>, amount: number) => {
    if (Math.abs(amount) >= 0.005) balanceLines.push({ sourceEntity, reportType: 'BALANCE', periodEnd: `${month}-01`, accountCode: String(line.accountCode || ''), accountName: line.accountName, accountType: line.accountType, amount: round(amount) });
  };
  const consolidationLine = (accountName: string, accountType: string) => ({ accountCode: '', accountName, accountType });

  for (const line of input.bgahLines) {
    const month = monthOf(line.periodEnd);
    const amount = Number(line.amount || 0);
    coverage.get(month)!.bgah = true;
    if (String(line.reportType).toUpperCase() === 'ACTIVITY') {
      let target = bgahTarget(line);
      if (!target) {
        unmappedBgah.add(line.accountName);
        const type = normalizeType(line.accountType);
        target = type === 'income' ? 'revenue' : type === 'otherincome' ? 'nonOperatingIncome' : type === 'costofgoodssold' ? 'cogsOther' : 'otherExpense';
      }
      if (SKIP_TARGETS.has(target) || !isIncomeStatementTarget(target)) continue;
      if (target === 'depreciationAmortization') {
        addTo(bookDepreciationActive ? quickBooksDepreciationIgnored : depreciationBooked, month, amount);
        continue;
      }
      if (target === 'interestExpense') addTo(bgahInterest, month, amount);
      if (target === 'insurance') addTo(insuranceCash, month, amount);
      if (target === 'taxLicense' && PROPERTY_TAX_ACCOUNT.test(line.accountName)) addTo(realEstateTaxCash, month, amount);
      post('BGAH', month, target, amount, line.accountName);
      continue;
    }
    if (String(line.reportType).toUpperCase() !== 'BALANCE') continue;
    if (line.accountCode === 'qbd_net_income') {
      addTo(bgahEquityResidual, month, amount);
      continue;
    }
    if (INTERCOMPANY_ACCOUNT.test(line.accountName)) continue;
    const side = sideOf(line.accountType);
    if (!side) continue;
    const mapped = bgahTarget(line);
    let field = mapped && SIDE_FIELDS[side].has(mapped) ? mapped : '';
    if (!field) {
      if (mapped && !SKIP_TARGETS.has(mapped)) remappedBgah.add(line.accountName);
      field = side === 'equity' ? equityFieldForName(line.accountName) : TYPE_FIELD[normalizeType(line.accountType)];
    }
    if (field === 'retainedEarnings') {
      addTo(bgahEquityResidual, month, amount);
      continue;
    }
    if (side === 'asset' && CONTRIBUTED_LAND_ACCOUNT.test(line.accountName)) {
      const basis = contributedLandBasis.get(month);
      contributedLandBasis.set(month, { field, accountType: line.accountType, amount: (basis?.amount || 0) + amount });
    }
    if (side === 'asset') {
      if (ACCUMULATED_ACCOUNT.test(line.accountName)) {
        if (bookDepreciationActive) {
          const byField = quickBooksAccumulated.get(month) || new Map();
          const current = byField.get(field) || { accountType: line.accountType, amount: 0 };
          byField.set(field, { accountType: line.accountType, amount: current.amount + amount });
          quickBooksAccumulated.set(month, byField);
        }
      } else if (LOAN_FEE_ACCOUNT.test(line.accountName)) {
        loanFeeAccounts.add(line.accountName);
        const basis = loanFeeBasis.get(month);
        loanFeeBasis.set(month, { field, accountType: line.accountType, amount: (basis?.amount || 0) + amount });
      } else if (normalizeType(line.accountType) === 'fixedasset') {
        const isLand = CONTRIBUTED_LAND_ACCOUNT.test(line.accountName) || classifyFixedAssetAccount(line.accountName) === 'land';
        if (!isLand && NON_DEPRECIABLE_PROPERTY.test(line.accountName)) excludedPropertyAccounts.add(line.accountName);
        else if (!isLand) addTo(depreciableBase, month, amount);
      }
    }
    rows.get(month)![field] = Number(rows.get(month)![field] || 0) + amount;
    addBalanceLine('BGAH', month, line, amount);
  }

  // Without a book depreciation plan, each year's QuickBooks depreciation is spread evenly over its twelve months.
  const depreciationByYear = new Map<string, number>();
  depreciationBooked.forEach((amount, month) => depreciationByYear.set(month.slice(0, 4), (depreciationByYear.get(month.slice(0, 4)) || 0) + amount));
  const depreciationTiming = new Map<string, number>();
  let bookedThisYear = 0;
  let year = '';
  for (const month of months) {
    if (month.slice(0, 4) !== year) { year = month.slice(0, 4); bookedThisYear = 0; }
    const monthly = (depreciationByYear.get(year) || 0) / 12;
    post('BGAH', month, 'depreciationAmortization', monthly, 'Depreciation and amortization (QuickBooks, spread evenly over the year)');
    bookedThisYear += depreciationBooked.get(month) || 0;
    depreciationTiming.set(month, bookedThisYear - monthly * Number(month.slice(5, 7)));
  }

  const slnActivity = input.slnLines.filter((line) => String(line.reportType).toUpperCase() === 'ACTIVITY');
  slnActivity.forEach((line) => { coverage.get(monthOf(line.periodEnd))!.slnActivity = true; });
  const mapped = aggregateMappedAmounts(slnActivity, input.slnMappings, 'SLN', (month) => month);
  const nonrecurring = new Map<string, number>();
  const slnInterest = new Map<string, number>();
  mapped.amounts.forEach((values, key) => {
    const group = propertyLineGroup(key);
    const label = SLN_LINE_LABEL.get(key) || key;
    Object.entries(values).forEach(([month, amount]) => {
      if (!rows.has(month)) return;
      if (!group) {
        if (isIncomeStatementTarget(key)) addTo(slnNet, month, post('SLN', month, key, amount, label));
        return;
      }
      if (key === PROPERTY_PRINCIPAL_REDUCTION_KEY) return addTo(principal, month, amount);
      if (group === 'capitalExpenses') {
        if (key !== REPLACEMENT_RESERVE_KEY) addTo(slnDepreciable, month, amount);
        return addTo(capitalized, month, amount);
      }
      if (group === 'nonrecurring') return addTo(nonrecurring, month, amount);
      if (group === 'debtService' && key !== MORTGAGE_INTEREST_KEY) return addTo(principal, month, amount);
      if (key === MORTGAGE_INTEREST_KEY) addTo(slnInterest, month, amount);
      if (key === REAL_ESTATE_TAX_KEY) addTo(realEstateTaxCash, month, amount);
      if (key === INSURANCE_KEY) addTo(insuranceCash, month, amount);
      addTo(slnNet, month, post('SLN', month, propertyField(key, group), amount, label));
    });
  });
  nonrecurring.forEach((amount, month) => {
    const capital = mapped.capitalizedNonrecurring[month] || 0;
    addTo(capitalized, month, capital);
    addTo(slnDepreciable, month, capital);
    addTo(slnNet, month, post('SLN', month, 'otherExpense', amount - capital, 'Nonrecurring repairs (expensed)'));
  });

  for (const line of input.slnLines) {
    if (String(line.reportType).toUpperCase() !== 'BALANCE') continue;
    const month = monthOf(line.periodEnd);
    coverage.get(month)!.slnBalance = true;
    if (!SLN_WORKING_CAPITAL_TYPES.has(normalizeType(line.accountType)) || SLN_OWNER_LEVEL_ACCOUNT.test(line.accountName)) continue;
    const amount = Number(line.amount || 0);
    const field = TYPE_FIELD[normalizeType(line.accountType)];
    const row = rows.get(month)!;
    row[field] = Number(row[field] || 0) + amount;
    addBalanceLine('SLN', month, line, amount);
  }

  // Mortgage interest is paid one month in arrears, so each month's interest is the next month's payment.
  const slnActivityMonths = months.filter((month) => coverage.get(month)!.slnActivity);
  const lastSlnActivityMonth = slnActivityMonths.at(-1) || null;
  const interestAccrual = new Map<string, number>();
  months.forEach((month, index) => {
    if (!lastSlnActivityMonth || month > lastSlnActivityMonth) return;
    const paid = slnInterest.get(month) || 0;
    const next = months[index + 1];
    const accrued = next && next <= lastSlnActivityMonth ? slnInterest.get(next) || 0 : paid;
    if (Math.abs(accrued - paid) >= 0.005) interestAccrual.set(month, accrued - paid);
  });

  // Real estate taxes and insurance: each calendar year's payments spread evenly over that year's months.
  const spreadAdjustments = (cash: Map<string, number>) => {
    const adjustment = new Map<string, number>();
    const balance = new Map<string, number>();
    if (!hasAmounts(cash)) return { adjustment, balance };
    const yearMonths = new Map<string, string[]>();
    months.forEach((month) => yearMonths.set(month.slice(0, 4), [...(yearMonths.get(month.slice(0, 4)) || []), month]));
    yearMonths.forEach((yearList) => {
      const average = yearList.reduce((sum, month) => sum + (cash.get(month) || 0), 0) / yearList.length;
      let running = 0;
      yearList.forEach((month) => {
        const paid = cash.get(month) || 0;
        if (Math.abs(average - paid) >= 0.005) adjustment.set(month, average - paid);
        running += paid - average;
        balance.set(month, running);
      });
    });
    return { adjustment, balance };
  };
  const taxSpread = spreadAdjustments(realEstateTaxCash);
  const insuranceSpread = spreadAdjustments(insuranceCash);

  const termEndIndex = input.debtIssuance ? monthIndex(input.debtIssuance.termEndMonth) : null;
  const projectLayers = plan.components.map(() => [] as Layer[]);
  const improvementLayers: Layer[] = [];
  const loanFeeLayers: Layer[] = [];
  const improvementLifeMonths = Math.round(plan.improvementLifeYears * 12);
  const bookDepreciationByMonth = new Map<string, number>();
  const capitalizedInterestByMonth = new Map<string, number>();
  const loanFeeAmortizationByMonth = new Map<string, number>();
  const loanFeeExpensedByMonth = new Map<string, number>();
  const bookDepreciationYears = new Map<number, BookDepreciationYear>();

  const firstSlnMonth = input.slnLines.map((line) => monthOf(line.periodEnd)).sort()[0] || null;
  let cumulativePrincipal = 0;
  let cumulativeCapital = 0;
  let cumulativeSlnNet = 0;
  let cumulativeCapitalizedInterest = 0;
  let cumulativeDepreciation = 0;
  let cumulativeLoanFeeAmortization = 0;
  let cumulativeInterestAccrual = 0;
  let previousBase = 0;
  let lastQuickBooksBase = 0;
  let previousLoanFee = 0;
  let lastLoanFee = 0;
  const monthInfo: ConsolidatedMonth[] = [];
  for (const month of months) {
    const row = rows.get(month)!;
    const index = monthIndex(month);
    const cover = coverage.get(month)!;
    const sum = (fields: string[]) => fields.reduce((total, field) => total + Number(row[field] || 0), 0);
    cumulativePrincipal += principal.get(month) || 0;
    cumulativeCapital += capitalized.get(month) || 0;
    cumulativeSlnNet += slnNet.get(month) || 0;
    const timing = depreciationTiming.get(month) || 0;
    row.ltd = Number(row.ltd || 0) - cumulativePrincipal;
    row.fixedAssets = Number(row.fixedAssets || 0) + cumulativeCapital + timing;
    addBalanceLine('CONSOLIDATION', month, consolidationLine('Loan principal paid through SLN', 'LongTermDebt'), -cumulativePrincipal);
    addBalanceLine('CONSOLIDATION', month, consolidationLine('Capital improvements paid through SLN', 'FixedAsset'), cumulativeCapital);
    addBalanceLine('CONSOLIDATION', month, consolidationLine('Depreciation spread evenly over the year', 'FixedAsset'), timing);
    if (input.contributedLand && month >= input.contributedLand.fromMonth) {
      const landBasis = contributedLandBasis.get(month) || { field: 'fixedAssets', accountType: 'FixedAsset', amount: 0 };
      const stepUp = input.contributedLand.bookValue - landBasis.amount;
      row[landBasis.field] = Number(row[landBasis.field] || 0) + stepUp;
      row.ownersCapital = Number(row.ownersCapital || 0) + stepUp;
      addBalanceLine('CONSOLIDATION', month, consolidationLine('Land Contributions - GAAP book value adjustment', landBasis.accountType), stepUp);
      addBalanceLine('CONSOLIDATION', month, consolidationLine('Land Contributions - GAAP book value adjustment', 'Equity'), stepUp);
    }

    // Loan fees: netted against the loan, amortized straight-line through the end of the loan term.
    const loanFee = loanFeeBasis.get(month);
    if (loanFee) lastLoanFee = loanFee.amount;
    else if (cover.bgah) lastLoanFee = 0;
    if (termEndIndex !== null && index <= termEndIndex && Math.abs(lastLoanFee - previousLoanFee) >= 0.005) {
      loanFeeLayers.push({ start: index, end: termEndIndex + 1, perMonth: (lastLoanFee - previousLoanFee) / (termEndIndex - index + 1) });
    }
    previousLoanFee = lastLoanFee;
    const amortization = activeAmount(loanFeeLayers, index);
    if (amortization) addTo(loanFeeAmortizationByMonth, month, amortization);
    cumulativeLoanFeeAmortization += amortization;

    // Mortgage interest accrued one month in arrears.
    const accrual = interestAccrual.get(month) || 0;
    if (accrual) post('CONSOLIDATION', month, 'interestExpense', accrual, ADJUSTMENT.accruedInterest);
    cumulativeInterestAccrual += accrual;

    // Interest before the property is placed in service is part of its cost.
    let capitalizedInterest = 0;
    if (preService(month)) {
      const expensedInterest = (bgahInterest.get(month) || 0) + (slnInterest.get(month) || 0) + accrual;
      if (expensedInterest) post('CONSOLIDATION', month, 'interestExpense', -expensedInterest, ADJUSTMENT.capitalizedInterest);
      capitalizedInterest = expensedInterest + amortization;
    } else if (amortization) {
      post('CONSOLIDATION', month, 'interestExpense', amortization, ADJUSTMENT.loanFeeAmortization);
      addTo(loanFeeExpensedByMonth, month, amortization);
    }
    if (capitalizedInterest) addTo(capitalizedInterestByMonth, month, capitalizedInterest);
    cumulativeCapitalizedInterest += capitalizedInterest;

    // Book depreciation: each month's addition to property cost is a layer depreciated from the month it is in service.
    let depreciation = 0;
    if (bookDepreciationActive) {
      if (depreciableBase.has(month)) lastQuickBooksBase = depreciableBase.get(month)!;
      else if (cover.bgah) lastQuickBooksBase = 0;
      const base = lastQuickBooksBase + cumulativeCapitalizedInterest;
      const addition = base - previousBase;
      previousBase = base;
      plan.components.forEach((component, componentIndex) => {
        if (!component.inServiceMonth || Math.abs(addition) < 0.005) return;
        const lifeMonths = Math.round(component.lifeYears * 12);
        const start = Math.max(index, monthIndex(component.inServiceMonth));
        projectLayers[componentIndex].push({ start, end: start + lifeMonths, perMonth: (addition * component.share) / lifeMonths });
      });
      const improvement = slnDepreciable.get(month) || 0;
      if (Math.abs(improvement) >= 0.005 && plan.projectInServiceMonth) {
        const start = Math.max(index, inServiceIndex);
        improvementLayers.push({ start, end: start + improvementLifeMonths, perMonth: improvement / improvementLifeMonths });
      }
      depreciation = projectLayers.reduce((total, layers) => total + activeAmount(layers, index), 0) + activeAmount(improvementLayers, index);
      if (depreciation) {
        post('CONSOLIDATION', month, 'depreciationAmortization', depreciation, ADJUSTMENT.depreciation);
        addTo(bookDepreciationByMonth, month, depreciation);
      }
    }
    cumulativeDepreciation += depreciation;

    let quickBooksAccumulatedRemoved = 0;
    quickBooksAccumulated.get(month)?.forEach((value, field) => {
      row[field] = Number(row[field] || 0) - value.amount;
      quickBooksAccumulatedRemoved -= value.amount;
      addBalanceLine('CONSOLIDATION', month, consolidationLine('QuickBooks accumulated depreciation replaced by book depreciation', value.accountType), -value.amount);
    });
    row.fixedAssets = Number(row.fixedAssets || 0) + cumulativeCapitalizedInterest - cumulativeDepreciation;
    addBalanceLine('CONSOLIDATION', month, consolidationLine('Interest capitalized to construction in progress', 'FixedAsset'), cumulativeCapitalizedInterest);
    addBalanceLine('CONSOLIDATION', month, consolidationLine('Accumulated depreciation (book)', 'FixedAsset'), -cumulativeDepreciation);

    let loanFeeRetained = 0;
    if (loanFee && termEndIndex !== null) {
      const unamortized = loanFee.amount - cumulativeLoanFeeAmortization;
      row[loanFee.field] = Number(row[loanFee.field] || 0) - loanFee.amount;
      row.ltd = Number(row.ltd || 0) - unamortized;
      addBalanceLine('CONSOLIDATION', month, consolidationLine('Loan fees reclassified as a reduction of the loan', loanFee.accountType), -loanFee.amount);
      addBalanceLine('CONSOLIDATION', month, consolidationLine('Unamortized loan fees (reduces the loan)', 'LongTermDebt'), -unamortized);
      loanFeeRetained = -cumulativeLoanFeeAmortization;
    }

    row.otherCL = Number(row.otherCL || 0) + cumulativeInterestAccrual;
    addBalanceLine('CONSOLIDATION', month, consolidationLine('Accrued mortgage interest', 'OtherCurrentLiability'), cumulativeInterestAccrual);

    let spreadRetained = 0;
    ([[taxSpread, 'real estate taxes', ADJUSTMENT.realEstateTaxes], [insuranceSpread, 'insurance', ADJUSTMENT.insurance]] as const).forEach(([spread, name, label]) => {
      const adjustment = spread.adjustment.get(month) || 0;
      if (adjustment) post('CONSOLIDATION', month, name === 'insurance' ? 'insurance' : 'taxLicense', adjustment, label);
      const balance = spread.balance.get(month) || 0;
      if (balance > 0) {
        row.otherCA = Number(row.otherCA || 0) + balance;
        addBalanceLine('CONSOLIDATION', month, consolidationLine(`Prepaid ${name}`, 'OtherCurrentAsset'), balance);
      } else if (balance < 0) {
        row.otherCL = Number(row.otherCL || 0) - balance;
        addBalanceLine('CONSOLIDATION', month, consolidationLine(`Accrued ${name}`, 'OtherCurrentLiability'), -balance);
      }
      spreadRetained += balance;
    });

    row.tca = sum(CURRENT_ASSET_FIELDS);
    row.totalAssets = row.tca + sum(FIXED_ASSET_FIELDS) + sum(OTHER_ASSET_FIELDS);
    row.tcl = sum(CURRENT_LIABILITY_FIELDS);
    row.totalLiab = row.tcl + Number(row.ltd || 0);
    const contributedEquity = sum(EQUITY_FIELDS_EXCEPT_RETAINED);
    row.retainedEarnings = row.totalAssets - row.totalLiab - contributedEquity;
    row.totalEquity = contributedEquity + row.retainedEarnings;
    row.totalLAndE = row.totalLiab + row.totalEquity;

    const yearNumber = Number(month.slice(0, 4));
    const yearRow = bookDepreciationYears.get(yearNumber) || { year: yearNumber, depreciation: 0, loanFeeAmortization: 0, capitalizedInterest: 0, netFixedAssets: 0 };
    yearRow.depreciation = round(yearRow.depreciation + depreciation);
    yearRow.loanFeeAmortization = round(yearRow.loanFeeAmortization + amortization);
    yearRow.capitalizedInterest = round(yearRow.capitalizedInterest + capitalizedInterest);
    yearRow.netFixedAssets = round(sum(FIXED_ASSET_FIELDS));
    bookDepreciationYears.set(yearNumber, yearRow);

    const slnExpected = Boolean(firstSlnMonth && month >= firstSlnMonth);
    const entities: Array<'SLN' | 'BGAH'> = [];
    if (cover.slnActivity || cover.slnBalance) entities.push('SLN');
    if (cover.bgah) entities.push('BGAH');
    const adjustmentRetained = quickBooksAccumulatedRemoved + cumulativeCapitalizedInterest - cumulativeDepreciation + loanFeeRetained - cumulativeInterestAccrual + spreadRetained;
    const expectedRetained = (bgahEquityResidual.get(month) || 0) + cumulativeSlnNet + timing + adjustmentRetained + (slnEquity.get(month) || 0);
    const retainedLine = consolidationLine('Cumulative Earnings (Deficit)', 'Equity');
    if (cover.bgah) {
      addBalanceLine('CONSOLIDATION', month, retainedLine, expectedRetained);
      addBalanceLine('CONSOLIDATION', month, consolidationLine('Intercompany difference not yet explained', 'Equity'), row.retainedEarnings - expectedRetained);
    } else {
      addBalanceLine('CONSOLIDATION', month, retainedLine, row.retainedEarnings);
    }
    monthInfo.push({
      month,
      entities,
      partial: !cover.bgah || (slnExpected && !(cover.slnActivity && cover.slnBalance)),
      unreconciled: cover.bgah ? round(row.retainedEarnings - expectedRetained) : null,
    });
  }

  const notes = buildNotes({
    months,
    monthInfo,
    plan,
    contributedLand: input.contributedLand || null,
    contributedLandBasis,
    debtIssuance: input.debtIssuance || null,
    loanFeeAccounts: [...loanFeeAccounts].sort(),
    lastLoanFee,
    excludedPropertyAccounts: [...excludedPropertyAccounts].sort(),
    quickBooksDepreciationIgnored,
    bookDepreciationByMonth,
    cumulativeDepreciation,
    depreciableCost: previousBase,
    improvementsCapitalized: [...slnDepreciable.values()].reduce((total, amount) => total + amount, 0),
    capitalizedInterestByMonth,
    loanFeeAmortizationByMonth,
    loanFeeExpensedByMonth,
    interestAccrual,
    accruedInterest: cumulativeInterestAccrual,
    taxSpread: taxSpread.adjustment,
    insuranceSpread: insuranceSpread.adjustment,
    replacementReserveDeposits: Object.values(mapped.amounts.get(REPLACEMENT_RESERVE_KEY) || {}).reduce((total, amount) => total + amount, 0),
  });

  return {
    rows: months.map((month) => rows.get(month)!),
    months: monthInfo,
    balanceLines,
    activityLines,
    notes,
    bookDepreciation: [...bookDepreciationYears.values()].sort((a, b) => a.year - b.year),
    unmappedSlnAccounts: mapped.unmapped.length,
    unmappedBgahAccounts: [...unmappedBgah].sort(),
    remappedBgahAccounts: [...remappedBgah].sort(),
  };
}

/** Notes to the combined statements, written from the same inputs that produce each adjustment. */
function buildNotes(facts: {
  months: string[];
  monthInfo: ConsolidatedMonth[];
  plan: ReturnType<typeof depreciationPlan>;
  contributedLand: ContributedLand | null;
  contributedLandBasis: Map<string, { amount: number }>;
  debtIssuance: DebtIssuanceTerm | null;
  loanFeeAccounts: string[];
  lastLoanFee: number;
  excludedPropertyAccounts: string[];
  quickBooksDepreciationIgnored: Map<string, number>;
  bookDepreciationByMonth: Map<string, number>;
  cumulativeDepreciation: number;
  depreciableCost: number;
  improvementsCapitalized: number;
  capitalizedInterestByMonth: Map<string, number>;
  loanFeeAmortizationByMonth: Map<string, number>;
  loanFeeExpensedByMonth: Map<string, number>;
  interestAccrual: Map<string, number>;
  accruedInterest: number;
  taxSpread: Map<string, number>;
  insuranceSpread: Map<string, number>;
  replacementReserveDeposits: number;
}): ConsolidationNote[] {
  const lastMonth = facts.months.at(-1)!;
  const { plan } = facts;
  const notes: ConsolidationNote[] = [];
  const partialMonths = facts.monthInfo.filter((month) => month.partial).map((month) => monthLabel(month.month));

  notes.push({
    key: 'basis',
    title: 'Basis of presentation',
    paragraphs: [
      'These are combined book-basis statements of BGAH and the property operations reported by its property manager, SLN, prepared on the accrual basis in accordance with U.S. GAAP. They are combined statements of one property, not consolidated statements of separate companies.',
      "BGAH's QuickBooks Desktop books are kept on the cash basis for tax purposes and are not changed. SLN's monthly statements are used as delivered. Every GAAP adjustment is calculated in Corelytics, shown on the statements as its own line labelled \"GAAP adjustment\", and explained in these notes.",
    ],
  });

  notes.push({
    key: 'combination',
    title: 'Combination of BGAH and SLN',
    paragraphs: [
      "SLN supplies property revenue, operating expenses and property working capital (cash, receivables, payables). BGAH supplies owner-level assets, the loan, member capital and non-property activity. BGAH's Due to/from SLN balance is eliminated, and SLN's own equity accounts are not carried.",
      'Loan principal and capital improvements paid by SLN reduce the loan and increase property cost instead of appearing as expenses. Retained earnings is the balancing amount; any difference from BGAH equity, SLN earnings and the GAAP adjustments is shown as "Intercompany difference not yet explained".',
    ],
    items: partialMonths.length ? [`Months with only one entity reported: ${partialMonths.join(', ')}.`] : undefined,
  });

  if (facts.contributedLand) {
    const quickBooksBasis = facts.contributedLandBasis.get(lastMonth)?.amount || 0;
    notes.push({
      key: 'land',
      title: 'Contributed land',
      paragraphs: [
        `Land contributed by members is carried at the Operating Agreement's agreed value of ${usd(facts.contributedLand.bookValue)} from ${monthLabel(facts.contributedLand.fromMonth)}, when the deeds transferred. QuickBooks carries it at the contributors' tax carryover basis (${usd(quickBooksBasis)} at ${monthLabel(lastMonth)}); the difference is added to land and to member capital. Land is not depreciated.`,
      ],
    });
  }

  if (plan.components.length) {
    const sourceText = plan.source === 'register'
      ? 'the fixed-asset register on Construction → Fixed Assets'
      : 'the construction budget (hard and capitalized soft costs as building, FF&E as furniture and equipment) because the fixed-asset register has no depreciable assets';
    const inServiceText = plan.projectInServiceMonth
      ? `The property is treated as placed in service in ${monthLabel(plan.projectInServiceMonth)}${plan.inServiceAssumed ? `, the month of the last construction draw, because no in-service date is entered in the register. Enter the certificate of occupancy date on Construction → Fixed Assets to change it` : ''}.`
      : 'No in-service date is entered in the register and no construction draws are loaded, so no depreciation is recorded and no interest is capitalized.';
    const ignored = [...facts.quickBooksDepreciationIgnored.values()].reduce((total, amount) => total + amount, 0);
    notes.push({
      key: 'depreciation',
      title: 'Property and depreciation',
      paragraphs: [
        `Property is carried at cost: BGAH's QuickBooks property accounts, plus capital improvements paid through SLN and interest capitalized during construction. Construction in progress is not depreciated until the property is placed in service. ${inServiceText}`,
        `Depreciation is straight-line from the month each cost is placed in service. The split of property cost between asset classes and their useful lives come from ${sourceText}. Depreciable property cost at ${monthLabel(lastMonth)} is ${usd(facts.depreciableCost)}; accumulated book depreciation is ${usd(facts.cumulativeDepreciation)}.`,
        `Capital improvements paid through SLN (${usd(facts.improvementsCapitalized)} to date) are depreciated over ${plan.improvementLifeYears} years from the later of the month paid and the in-service date.`,
        ...(Math.abs(ignored) >= 0.5 ? [`QuickBooks recorded ${usd(ignored)} of depreciation and amortization; it is replaced by book depreciation and its accumulated balance is removed.`] : []),
      ],
      items: [
        ...plan.components.map((component) => `${component.name}: ${percent(component.share)} of depreciable cost, ${component.lifeYears} years${component.inServiceMonth ? `, in service ${monthLabel(component.inServiceMonth)}${component.assumedInService ? ' (assumed)' : ''}` : ', no in-service date'}.`),
        ...(facts.excludedPropertyAccounts.length ? [`Not depreciated (escrows and deposits recorded as property in QuickBooks): ${facts.excludedPropertyAccounts.join('; ')}.`] : []),
      ],
      byYear: hasAmounts(facts.bookDepreciationByMonth) ? [{ label: 'Book depreciation', values: byYear(facts.bookDepreciationByMonth) }] : undefined,
    });
    notes.push({
      key: 'capitalized-interest',
      title: 'Capitalized construction interest',
      paragraphs: [
        plan.projectInServiceMonth
          ? `Interest on the project loan before the property is placed in service (${monthLabel(plan.projectInServiceMonth)}) is part of the property's cost (ASC 835-20). That interest, including mortgage interest paid by SLN and loan-fee amortization for the same months, is moved from interest expense to construction in progress and depreciated with the property.`
          : 'No interest is capitalized because the in-service date is not known.',
      ],
      byYear: hasAmounts(facts.capitalizedInterestByMonth) ? [{ label: 'Interest capitalized', values: byYear(facts.capitalizedInterestByMonth) }] : undefined,
    });
  } else {
    notes.push({
      key: 'depreciation',
      title: 'Property and depreciation',
      paragraphs: ['No book depreciation is recorded: the fixed-asset register on Construction → Fixed Assets has no depreciable assets and no construction budget is loaded. Interest is not capitalized.'],
    });
  }

  if (facts.loanFeeAccounts.length && facts.debtIssuance) {
    notes.push({
      key: 'loan-fees',
      title: 'Loan fees (debt issuance costs)',
      paragraphs: [
        `Loan fees recorded as an asset in QuickBooks (${facts.loanFeeAccounts.join('; ')}: ${usd(facts.lastLoanFee)} at ${monthLabel(lastMonth)}) are presented as a reduction of the loan (ASC 835-30) and amortized straight-line over the ${facts.debtIssuance.source}. Amortization before the in-service date is capitalized with construction interest; afterwards it is interest expense.`,
      ],
      byYear: hasAmounts(facts.loanFeeAmortizationByMonth)
        ? [
            { label: 'Loan fee amortization', values: byYear(facts.loanFeeAmortizationByMonth) },
            { label: 'Of which in interest expense', values: byYear(facts.loanFeeExpensedByMonth) },
          ]
        : undefined,
    });
  } else {
    notes.push({
      key: 'loan-fees',
      title: 'Loan fees (debt issuance costs)',
      paragraphs: [facts.loanFeeAccounts.length
        ? 'Loan fees were found in QuickBooks but no loan term is configured, so they are not adjusted.'
        : "No loan-fee account was found on BGAH's QuickBooks balance sheet, so loan fees are not adjusted. If QuickBooks expensed or capitalized them under another account name, they need to be identified before they can be netted against the loan."],
    });
  }

  notes.push({
    key: 'accrued-interest',
    title: 'Accrued mortgage interest',
    paragraphs: [
      hasAmounts(facts.interestAccrual)
        ? `Mortgage payments made by SLN cover the prior month's interest. Each month's interest expense is the following month's interest payment, and the unpaid month is a liability (${usd(facts.accruedInterest)} at ${monthLabel(lastMonth)}). For the latest month the current payment is used as the estimate.`
        : 'No mortgage interest payments are reported by SLN, so no interest is accrued.',
    ],
    byYear: hasAmounts(facts.interestAccrual) ? [{ label: 'Change in accrued interest', values: byYear(facts.interestAccrual) }] : undefined,
  });

  const spread = [hasAmounts(facts.taxSpread) ? 'real estate taxes' : '', hasAmounts(facts.insuranceSpread) ? 'insurance' : ''].filter(Boolean);
  notes.push({
    key: 'taxes-insurance',
    title: 'Real estate taxes and insurance',
    paragraphs: [
      spread.length
        ? `Payments of ${spread.join(' and ')} are made in installments. Each calendar year's payments are spread evenly over the months of that year (the months loaded, for the current year), with the difference carried as a prepaid asset or an accrued liability during the year. Annual totals are unchanged; a payment covering the following year is not deferred past December.`
        : 'No real estate tax or insurance payments are reported, so nothing is spread.',
    ],
  });

  const openItems = [
    'Real estate taxes and insurance during construction are expensed; under ASC 970 they may be capitalized as property cost until the property is ready for use.',
    ...(Math.abs(facts.replacementReserveDeposits) >= 0.5 ? [`Replacement reserve deposits held by the lender (${usd(facts.replacementReserveDeposits)} to date) are included in property cost but not depreciated; under GAAP they are restricted escrow funds.`] : []),
  ];
  notes.push({ key: 'open-items', title: 'Items not adjusted', paragraphs: ['The following are known differences from GAAP that are not adjusted in these statements:'], items: openItems });
  return notes;
}

export async function loadConsolidationInput(companyId: string) {
  await Promise.all([ensureRealEstateAccountMappingTable(), ensureRealEstateConstructionTables()]);
  const [allLines, propertyMappings, accountMappings, fixedAssets, budgetLines, lastDraw] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(
      `SELECT "sourceEntity", "reportType", "periodEnd", "accountCode", "accountName", "accountType", "amount"::float AS "amount"
       FROM "RealEstateFinancialLine" WHERE "companyId"=$1`,
      companyId,
    ),
    prisma.$queryRawUnsafe<any[]>(
      `SELECT "financialFeed", "accountCode", "targetField", "bookTreatment" FROM "RealEstateAccountMapping" WHERE "companyId"=$1`,
      companyId,
    ),
    prisma.accountMapping.findMany({ where: { companyId }, select: { accountName: true, accountCode: true, targetField: true } }),
    prisma.$queryRawUnsafe<RegisterAsset[]>(
      `SELECT "name", "assetClass", "cost"::float AS "cost", to_char("inServiceDate", 'YYYY-MM-DD') AS "inServiceDate",
        "usefulLifeYears"::float AS "usefulLifeYears", "basis"
       FROM "RealEstateFixedAsset" WHERE "companyId"=$1 ORDER BY "sortOrder", "name"`,
      companyId,
    ),
    prisma.$queryRawUnsafe<BudgetLine[]>(
      `SELECT "name", "revisedBudget"::float AS "revisedBudget", "costClass" FROM "RealEstateConstructionBudgetLine" WHERE "companyId"=$1`,
      companyId,
    ),
    prisma.$queryRawUnsafe<Array<{ drawDate: string | null }>>(
      `SELECT to_char(MAX("drawDate"), 'YYYY-MM-DD') AS "drawDate" FROM "RealEstateConstructionDraw" WHERE "companyId"=$1`,
      companyId,
    ),
  ]);
  const { lines } = buildEntityReportLines(allLines, propertyMappings);
  return {
    slnLines: lines.filter((line) => line.sourceEntity === 'SLN') as Line[],
    slnMappings: propertyMappings.filter((mapping) => mapping.financialFeed === 'SLN') as PropertyMapping[],
    bgahLines: allLines.filter((line) => line.sourceEntity === 'QBD') as Line[],
    accountMappings,
    contributedLand: contributedLand(companyId),
    fixedAssets,
    budgetLines,
    lastDrawDate: lastDraw[0]?.drawDate || null,
    debtIssuance: debtIssuanceTerm(companyId),
  };
}

/** Rebuilds and publishes the combined monthly financials. No-op for other companies. */
export async function publishConsolidatedFinancials(companyId: string, reason: string) {
  if (!isConsolidatedReportingCompany(companyId)) return { ok: false as const, skipped: 'not_enabled' };
  const input = await loadConsolidationInput(companyId);
  if (!input.bgahLines.length) {
    return { ok: false as const, error: 'No QuickBooks Desktop account lines are loaded for BGAH. Run the QuickBooks Desktop sync first.' };
  }
  const built = buildConsolidatedMonthlyRows(input);
  const partialMonths = built.months.filter((month) => month.partial).map((month) => month.month);
  const latest = [...built.months].reverse().find((month) => month.entities.length === 2) || null;
  const metadata = {
    reason,
    months: built.months,
    partialMonths,
    unmappedSlnAccounts: built.unmappedSlnAccounts,
    unmappedBgahAccounts: built.unmappedBgahAccounts,
    remappedBgahAccounts: built.remappedBgahAccounts,
  };
  const ingest = await ingestFinancialPayload({
    companyId,
    platform: 'QUICKBOOKS',
    source: CONSOLIDATED_FINANCIALS_SOURCE,
    payload: { monthlyData: built.rows, metadata },
    syncType: 'consolidated_entity_financials',
    touchConnection: false,
  });
  if (!ingest.ok) return { ok: false as const, error: ingest.error, details: (ingest as any).details };
  const publish = await publishMonthsFromMonthlyFinancialDirect({ companyId, force: true });
  return {
    ok: true as const,
    months: built.rows.length,
    firstMonth: built.months[0]?.month || null,
    lastMonth: built.months.at(-1)?.month || null,
    publishedMonths: publish.publishedMonths.length,
    partialMonths,
    latestCombinedMonth: latest?.month || null,
    latestUnreconciled: latest?.unreconciled ?? null,
    unmappedSlnAccounts: built.unmappedSlnAccounts,
    unmappedBgahAccounts: built.unmappedBgahAccounts.length,
  };
}

/** Re-publishes after a source or mapping change; failures are logged, never thrown. */
export async function republishConsolidatedFinancials(companyId: string, reason: string) {
  if (!isConsolidatedReportingCompany(companyId)) return null;
  try {
    return await publishConsolidatedFinancials(companyId, reason);
  } catch (error) {
    console.error('Consolidated financials publish failed:', { companyId, reason, error });
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}
