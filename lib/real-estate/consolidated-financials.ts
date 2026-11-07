import prisma from '@/lib/prisma';
import { ingestFinancialPayload } from '@/lib/financial-ingestion';
import { publishMonthsFromMonthlyFinancialDirect } from '@/lib/financial/publish-month-service';
import { ensureRealEstateAccountMappingTable } from '@/lib/real-estate/account-mapping-table';
import { buildEntityReportLines } from '@/lib/real-estate/entity-report-lines';
import {
  PROPERTY_PRINCIPAL_REDUCTION_KEY,
  aggregateMappedAmounts,
  propertyLineGroup,
} from '@/lib/real-estate/property-income-statement';
import { CONSOLIDATED_FINANCIALS_SOURCE, isConsolidatedReportingCompany } from '@/lib/real-estate/consolidated-reporting-companies';

/**
 * Consolidated SLN + BGAH monthly financials for Financial Reporting.
 *
 * - SLN (property management) owns property operations: its activity comes
 *   through the property statement mapping and is translated to the standard
 *   fields. Principal reduces the loan; capital expenses and capitalized
 *   nonrecurring repairs are added to fixed assets.
 * - BGAH (QuickBooks Desktop) adds owner-level activity through the company's
 *   Data Mapping. Each year's depreciation and amortization is spread evenly
 *   over that year's months; fixed assets carry the same timing difference.
 * - BGAH's Due to/from SLN account is eliminated. SLN keeps no equity, so the
 *   consolidated retained earnings is the balancing amount; `unreconciled` is
 *   what remains after BGAH's own equity and SLN's cumulative earnings.
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
// SLN's balance sheet varies month to month and sometimes repeats owner-level
// items BGAH already carries (land, development cash, capital improvements,
// the mortgage, lender escrows). Only property working capital is taken from SLN.
const SLN_WORKING_CAPITAL_TYPES = new Set(['bank', 'accountsreceivable', 'othercurrentasset', 'accountspayable', 'othercurrentliability', 'creditcard']);
const SLN_OWNER_LEVEL_ACCOUNT = /\bland\b|development|\bhbo\b|capital improvement|mortgage payable|mortg co|esc acct|insurance escrow|replacement reserve/i;
const INTEREST_INCOME_KEYS = new Set(['rev_re_interest_income', 'rev_re_treasury_note_interest_income']);
const MORTGAGE_INTEREST_KEY = 'opex_re_mortgage_interest_no_1';

const normalizeType = (type: string) => String(type || '').toLowerCase().replace(/[^a-z]/g, '');
const normalizeKey = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const monthOf = (periodEnd: string | Date) => (periodEnd instanceof Date ? periodEnd.toISOString() : String(periodEnd)).slice(0, 7);
const round = (value: number) => Math.round(value * 100) / 100;

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

export function buildConsolidatedMonthlyRows(input: {
  slnLines: Line[];
  slnMappings: PropertyMapping[];
  bgahLines: Line[];
  accountMappings: AccountMappingRow[];
}) {
  const allLines = [...input.slnLines, ...input.bgahLines];
  if (!allLines.length) return { rows: [] as Row[], months: [] as ConsolidatedMonth[], unmappedSlnAccounts: 0, unmappedBgahAccounts: [] as string[], remappedBgahAccounts: [] as string[] };
  const lineMonths = allLines.map((line) => monthOf(line.periodEnd)).sort();
  const months = monthRange(lineMonths[0], lineMonths[lineMonths.length - 1]);
  const rows = new Map(months.map((month) => [month, createRow(month)]));
  const coverage = new Map(months.map((month) => [month, { bgah: false, slnActivity: false, slnBalance: false }]));

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
  const bgahEquityResidual = new Map<string, number>();
  const slnEquity = new Map<string, number>();
  const slnNet = new Map<string, number>();
  const principal = new Map<string, number>();
  const capitalized = new Map<string, number>();
  const addTo = (map: Map<string, number>, month: string, amount: number) => map.set(month, (map.get(month) || 0) + amount);

  for (const line of input.bgahLines) {
    const month = monthOf(line.periodEnd);
    const row = rows.get(month)!;
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
        addTo(depreciationBooked, month, amount);
        continue;
      }
      addIncomeStatementAmount(row, target, amount);
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
    row[field] = Number(row[field] || 0) + amount;
  }

  // Each year's booked depreciation and amortization, spread evenly over its twelve months.
  const depreciationByYear = new Map<string, number>();
  depreciationBooked.forEach((amount, month) => depreciationByYear.set(month.slice(0, 4), (depreciationByYear.get(month.slice(0, 4)) || 0) + amount));
  const depreciationTiming = new Map<string, number>();
  let bookedThisYear = 0;
  let year = '';
  for (const month of months) {
    if (month.slice(0, 4) !== year) { year = month.slice(0, 4); bookedThisYear = 0; }
    const monthly = (depreciationByYear.get(year) || 0) / 12;
    addIncomeStatementAmount(rows.get(month)!, 'depreciationAmortization', monthly);
    bookedThisYear += depreciationBooked.get(month) || 0;
    depreciationTiming.set(month, bookedThisYear - monthly * Number(month.slice(5, 7)));
  }

  const slnActivity = input.slnLines.filter((line) => String(line.reportType).toUpperCase() === 'ACTIVITY');
  slnActivity.forEach((line) => { coverage.get(monthOf(line.periodEnd))!.slnActivity = true; });
  const mapped = aggregateMappedAmounts(slnActivity, input.slnMappings, 'SLN', (month) => month);
  const nonrecurring = new Map<string, number>();
  mapped.amounts.forEach((values, key) => {
    const group = propertyLineGroup(key);
    Object.entries(values).forEach(([month, amount]) => {
      const row = rows.get(month);
      if (!row) return;
      if (!group) {
        if (isIncomeStatementTarget(key)) addTo(slnNet, month, addIncomeStatementAmount(row, key, amount));
        return;
      }
      if (key === PROPERTY_PRINCIPAL_REDUCTION_KEY) return addTo(principal, month, amount);
      if (group === 'capitalExpenses') return addTo(capitalized, month, amount);
      if (group === 'nonrecurring') return addTo(nonrecurring, month, amount);
      if (group === 'debtService' && key !== MORTGAGE_INTEREST_KEY) return addTo(principal, month, amount);
      addTo(slnNet, month, addIncomeStatementAmount(row, propertyField(key, group), amount));
    });
  });
  nonrecurring.forEach((amount, month) => {
    const capital = mapped.capitalizedNonrecurring[month] || 0;
    addTo(capitalized, month, capital);
    addTo(slnNet, month, addIncomeStatementAmount(rows.get(month)!, 'otherExpense', amount - capital));
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
  }

  const firstSlnMonth = input.slnLines.map((line) => monthOf(line.periodEnd)).sort()[0] || null;
  let cumulativePrincipal = 0;
  let cumulativeCapital = 0;
  let cumulativeSlnNet = 0;
  const monthInfo: ConsolidatedMonth[] = [];
  for (const month of months) {
    const row = rows.get(month)!;
    const sum = (fields: string[]) => fields.reduce((total, field) => total + Number(row[field] || 0), 0);
    cumulativePrincipal += principal.get(month) || 0;
    cumulativeCapital += capitalized.get(month) || 0;
    cumulativeSlnNet += slnNet.get(month) || 0;
    const timing = depreciationTiming.get(month) || 0;
    row.ltd = Number(row.ltd || 0) - cumulativePrincipal;
    row.fixedAssets = Number(row.fixedAssets || 0) + cumulativeCapital + timing;
    row.tca = sum(CURRENT_ASSET_FIELDS);
    row.totalAssets = row.tca + sum(FIXED_ASSET_FIELDS) + sum(OTHER_ASSET_FIELDS);
    row.tcl = sum(CURRENT_LIABILITY_FIELDS);
    row.totalLiab = row.tcl + Number(row.ltd || 0);
    const contributedEquity = sum(EQUITY_FIELDS_EXCEPT_RETAINED);
    row.retainedEarnings = row.totalAssets - row.totalLiab - contributedEquity;
    row.totalEquity = contributedEquity + row.retainedEarnings;
    row.totalLAndE = row.totalLiab + row.totalEquity;

    const cover = coverage.get(month)!;
    const slnExpected = Boolean(firstSlnMonth && month >= firstSlnMonth);
    const entities: Array<'SLN' | 'BGAH'> = [];
    if (cover.slnActivity || cover.slnBalance) entities.push('SLN');
    if (cover.bgah) entities.push('BGAH');
    const expectedRetained = (bgahEquityResidual.get(month) || 0) + cumulativeSlnNet + timing + (slnEquity.get(month) || 0);
    monthInfo.push({
      month,
      entities,
      partial: !cover.bgah || (slnExpected && !(cover.slnActivity && cover.slnBalance)),
      unreconciled: cover.bgah ? round(row.retainedEarnings - expectedRetained) : null,
    });
  }

  return {
    rows: months.map((month) => rows.get(month)!),
    months: monthInfo,
    unmappedSlnAccounts: mapped.unmapped.length,
    unmappedBgahAccounts: [...unmappedBgah].sort(),
    remappedBgahAccounts: [...remappedBgah].sort(),
  };
}

export async function loadConsolidationInput(companyId: string) {
  await ensureRealEstateAccountMappingTable();
  const [allLines, propertyMappings, accountMappings] = await Promise.all([
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
  ]);
  const { lines } = buildEntityReportLines(allLines, propertyMappings);
  return {
    slnLines: lines.filter((line) => line.sourceEntity === 'SLN') as Line[],
    slnMappings: propertyMappings.filter((mapping) => mapping.financialFeed === 'SLN') as PropertyMapping[],
    bgahLines: allLines.filter((line) => line.sourceEntity === 'QBD') as Line[],
    accountMappings,
  };
}

/** Rebuilds and publishes the consolidated monthly financials. No-op for other companies. */
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
