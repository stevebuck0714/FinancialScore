import type { TargetFieldOption } from '@/lib/constants/sector-target-fields';

/**
 * Property-management income statement layout for real-estate (sector 53)
 * companies. Source accounts map to `line` rows through Data Mapping; `total`
 * and `formula` rows are always calculated and are never mapping targets.
 *
 * Income lines use the `rev_` prefix and expense lines the `opex_` prefix so
 * the shared mapping table groups them under Revenue and Operating Expenses.
 */
export type PropertyStatementRow =
  | { kind: 'heading'; label: string }
  | { kind: 'line'; key: string; label: string; group: string }
  | { kind: 'total'; label: string; group: string }
  | { kind: 'formula'; label: string; key: string; terms: Array<{ ref: string; sign: 1 | -1 }> };

type Section = { group: string; heading?: string; total?: string; prefix: 'rev' | 'opex'; lines: string[] };

const SECTIONS: Section[] = [
  {
    group: 'adjustedGrossPotential',
    heading: 'INCOME',
    total: 'ADJUSTED GROSS POTENTIAL',
    prefix: 'rev',
    lines: ['Gross Potential Rent', 'Gain to Lease', 'Loss to Lease', 'Less: Vacancies', 'Models/Employee Concession'],
  },
  {
    group: 'otherTenantIncome',
    heading: 'PLUS OTHER TENANT INCOME',
    total: 'TOTAL OTHER TENANT INCOME',
    prefix: 'rev',
    lines: [
      'Application Fee', 'Bulk Trash Pick-up', 'Water/Sewer/Storm Water', 'Vacant Unit Electricity', 'Cable Income',
      'Electric Income', 'Exterminating Fees', 'Rent Plus', 'Garage Income', 'Pet Fee Income', 'Pet Rent Income',
      'Month-To-Month Fees', 'Rent Abatement', 'One-Time Rent Concession', 'Rent Adj Write Offs', 'Write-Off Other',
      'Late Rent Charges', 'Legal Fee Charges', 'Non-Comp Renter Ins', 'Return Check Charges', 'Renters Insurance Income',
      'Storage Fees', 'Trash Income', 'Valet Trash Income', 'Penalties-Breaking Lease', 'Carpet Damage', 'Maintenance Fees',
      'Reimbursement-Damages', 'Other Tenant Income - Adjustment to match SLN books',
    ],
  },
  { group: 'netChangeArPrepaid', prefix: 'rev', lines: ['NET CHANGE IN A/R & PREPAID RENT'] },
  {
    group: 'miscellaneousIncome',
    heading: 'MISCELLANEOUS OTHER INCOME',
    total: 'TOTAL MISCELLANEOUS INCOME',
    prefix: 'rev',
    lines: ['Write-Offs Recovered', 'Interest Income', 'Treasury Note Interest Income', 'Utility Billing Income', 'Administrative Fee', 'Refunds from Vendors'],
  },
  {
    group: 'administrative',
    heading: 'ADMINISTRATIVE EXPENSES',
    total: 'TOTAL ADMINISTRATIVE',
    prefix: 'opex',
    lines: [
      'Advertising', 'Employee Training', 'Renting Expense/Software', 'Resident Referrals', 'Resident/Employee Events',
      'Fire Equip Monitor Fees', 'Accounting', 'Administrative Cost', 'Credit Card Svc Fee', 'Non Compl Renter Ins Exp',
      'Warrants', 'Management Fees', 'Office Supplies', 'Postage', 'Computer Expenses', 'Copy Machine', 'Telephone',
      'Cable', 'Utility Billing Expense', 'Asset Management Fee', 'Misc Operating Expense', 'Rent Plus Fees',
    ],
  },
  {
    group: 'payroll',
    heading: 'PAYROLL EXPENSE',
    total: 'TOTAL PAYROLL EXPENSE',
    prefix: 'opex',
    lines: [
      'Payroll Admin', '401K Match', '401K Administrative', 'Community Manager Salary', 'Leasing Office Employees',
      'Service Manager', 'Service Employees', 'Leasing Commission', 'Groundskeeper Payroll', 'Gate Keepers Payroll',
      'Taxes - Social Security', 'Taxes - Unemployment', 'Health Insurance', 'Payroll - Adjustment to match SLN books',
    ],
  },
  {
    group: 'utilities',
    heading: 'UTILITIES',
    total: 'TOTAL UTILITIES',
    prefix: 'opex',
    lines: ['Electricity', 'Common Area Electric', 'Electricity - Vacant Unit', 'Storm Water', 'Water & Sewer', 'Utilities - Adjustment to match SLN books'],
  },
  {
    group: 'suppliesService',
    heading: 'SUPPLIES & SERVICE EXPENSE',
    total: 'TOTAL SUPPLIES & SERVICE EXPENSE',
    prefix: 'opex',
    lines: [
      'Exterminating - Contract', 'Guard Service', 'Janitorial Service', 'Laundry,Cleaning,Uniforms', 'Trash Removal',
      'Bulk Trash Pick-up Expense', 'Valet Trash Expense', 'Supplies & Service - Adjustment to match SLN books',
    ],
  },
  {
    group: 'maintenance',
    heading: 'MAINTENANCE EXPENSES',
    total: 'TOTAL MAINTENANCE EXPENSES',
    prefix: 'opex',
    lines: [
      'R&M-Carpet Damage', 'R&M Fire Equipment', 'R&M-Electrical', 'R&M-HVAC', 'R&M-Supplies/Maint/Grnds',
      'R&M-General Repairs', 'R&M-Common Area Exp', 'R&M-Paint Apts', 'R&M-Plumbing', 'Supplies - Cleaning',
      'Supplies-Doors & Windows', 'Supplies - Hardware', 'Supplies - Drywall', 'Supplies-Appliances',
      'Supplies - Paint & Plastr', 'Supplies - Oil & Gas', 'Supplies - Cooling&Heat', 'Supplies - Swimming Pools',
      'Supplies - Electrical', 'Supplies - Repairs', 'Supplies - Miscellaneous', 'Supplies - Plumbing',
      'Maintenance - Adjustment to match SLN books',
    ],
  },
  {
    group: 'taxesInsurance',
    heading: 'MISCELLANEOUS TAXES & LICENSES',
    total: 'TOTAL TAXES, INSURANCE & ESCROWS',
    prefix: 'opex',
    lines: ['Real Estate Taxes', 'Insurance', 'Taxes-Personal Property', 'Taxes & Insurance - Adjustment to match SLN books'],
  },
  {
    group: 'debtService',
    total: 'LESS DEBT SERVICE',
    prefix: 'opex',
    lines: ['Principal Reduction #1', 'Mortgage Interest #1'],
  },
  {
    group: 'capitalExpenses',
    heading: 'CAPITAL EXPENSES',
    total: 'TOTAL CAPITALIZED EXPENSES',
    prefix: 'opex',
    lines: ['Repl. Res. Held By Lender', 'Ins Improv Resident Exp'],
  },
  {
    group: 'nonrecurring',
    heading: 'NONRECURRING REPAIR & MAINT EXPS',
    total: 'TOTAL NONRECURRING REPAIR & MAINT EXPS',
    prefix: 'opex',
    lines: [
      'Plumbing Fixtures', 'Purch Hot Wtr Htr', 'CarpetNew/Replace', 'Signs', 'Furn & Fixtures', 'Equipment-Appliance',
      'Maintenance -Equip', 'Purchase Ranges', 'Purchase Refridgs', 'Purchase Dishwash', 'Doors & Windows',
      'Office Equipment', 'Rep: Major A/C', 'Microwave Ovens', 'Pet Stations', 'Landscaping',
      'Nonrecurring - Adjustment to match SLN books',
    ],
  },
  { group: 'netCashAdjustment', prefix: 'opex', lines: ['Net Cash - Adjustment to match SLN books'] },
];

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/#/g, ' no ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const lineKey = (section: Section, label: string) => `${section.prefix}_re_${slug(label)}`;
const sectionByGroup = (group: string) => SECTIONS.find((section) => section.group === group)!;

function sectionRows(group: string): PropertyStatementRow[] {
  const section = sectionByGroup(group);
  const rows: PropertyStatementRow[] = [];
  if (section.heading) rows.push({ kind: 'heading', label: section.heading });
  section.lines.forEach((label) => rows.push({ kind: 'line', key: lineKey(section, label), label, group }));
  if (section.total) rows.push({ kind: 'total', label: section.total, group });
  return rows;
}

/** Display order for the property income statement. Formula refs name section groups. */
export const PROPERTY_INCOME_STATEMENT: PropertyStatementRow[] = [
  ...sectionRows('adjustedGrossPotential'),
  ...sectionRows('otherTenantIncome'),
  ...sectionRows('netChangeArPrepaid'),
  {
    kind: 'formula', key: 'netReceipts', label: 'NET RECEIPTS',
    terms: [{ ref: 'adjustedGrossPotential', sign: 1 }, { ref: 'otherTenantIncome', sign: 1 }, { ref: 'netChangeArPrepaid', sign: 1 }],
  },
  ...sectionRows('miscellaneousIncome'),
  { kind: 'formula', key: 'totalIncome', label: 'TOTAL INCOME', terms: [{ ref: 'netReceipts', sign: 1 }, { ref: 'miscellaneousIncome', sign: 1 }] },
  { kind: 'heading', label: 'OPERATING EXPENSES' },
  ...sectionRows('administrative'),
  ...sectionRows('payroll'),
  ...sectionRows('utilities'),
  ...sectionRows('suppliesService'),
  ...sectionRows('maintenance'),
  { kind: 'heading', label: 'LESS:  TAXES, INSURANCE, ESCROWS' },
  ...sectionRows('taxesInsurance'),
  {
    kind: 'formula', key: 'totalOperatingExpenses', label: 'TOTAL OPERATING EXPENSES',
    terms: ['administrative', 'payroll', 'utilities', 'suppliesService', 'maintenance', 'taxesInsurance'].map((ref) => ({ ref, sign: 1 as const })),
  },
  { kind: 'formula', key: 'netOperatingIncome', label: 'NET OPERATING INCOME', terms: [{ ref: 'totalIncome', sign: 1 }, { ref: 'totalOperatingExpenses', sign: -1 }] },
  ...sectionRows('debtService'),
  ...sectionRows('capitalExpenses'),
  ...sectionRows('nonrecurring'),
  {
    kind: 'formula', key: 'netCashAvailable', label: 'NET CASH AVAILABLE',
    terms: [{ ref: 'netOperatingIncome', sign: 1 }, { ref: 'debtService', sign: -1 }, { ref: 'capitalExpenses', sign: -1 }, { ref: 'nonrecurring', sign: -1 }],
  },
  ...sectionRows('netCashAdjustment'),
  {
    kind: 'formula', key: 'adjustedNetCashAvailable', label: 'ADJUSTED NET CASH AVAILABLE',
    terms: [{ ref: 'netCashAvailable', sign: 1 }, { ref: 'netCashAdjustment', sign: -1 }],
  },
];

const optionsFor = (prefix: 'rev' | 'opex'): TargetFieldOption[] =>
  SECTIONS.filter((section) => section.prefix === prefix).flatMap((section) =>
    section.lines.map((label) => ({ value: lineKey(section, label), label: `${section.heading || section.total || label} · ${label}` })),
  );

export const PROPERTY_REVENUE_TARGET_OPTIONS = optionsFor('rev');
export const PROPERTY_EXPENSE_TARGET_OPTIONS = optionsFor('opex');

const compact = (label: string) => label.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Suggests a statement line for each source account by name. Accounts are
 * matched in account-code order against the template order, so a name that
 * appears in more than one section (e.g. "Bulk Trash Pick-up", the
 * "Adjustment to match SLN books" lines) resolves to the section that
 * follows the previously matched account.
 */
export function suggestPropertyTargets(
  accounts: Array<{ accountCode: string; accountName: string; accountType: string }>,
): Map<string, { targetField: string; confidence: 'high' | 'medium' }> {
  const suggestions = new Map<string, { targetField: string; confidence: 'high' | 'medium' }>();
  (['rev', 'opex'] as const).forEach((prefix) => {
    const family = prefix === 'rev' ? 'income' : 'expense';
    const lines = SECTIONS.filter((section) => section.prefix === prefix)
      .flatMap((section) => section.lines.map((label) => ({ key: lineKey(section, label), name: compact(label) })));
    let cursor = 0;
    accounts
      .filter((account) => String(account.accountType).toLowerCase() === family)
      .sort((a, b) => String(a.accountCode).localeCompare(String(b.accountCode), undefined, { numeric: true }))
      .forEach((account) => {
        const name = compact(account.accountName);
        if (!name) return;
        const ahead = lines.slice(cursor);
        const exactAhead = ahead.findIndex((line) => line.name === name);
        const partialAhead = exactAhead >= 0 ? -1 : ahead.findIndex((line) => line.name.startsWith(name) || line.name.endsWith(name));
        const aheadIndex = exactAhead >= 0 ? exactAhead : partialAhead;
        if (aheadIndex >= 0) {
          cursor += aheadIndex + 1;
          suggestions.set(account.accountCode, { targetField: ahead[aheadIndex].key, confidence: exactAhead >= 0 ? 'high' : 'medium' });
          return;
        }
        const exactAnywhere = lines.find((line) => line.name === name);
        if (exactAnywhere) suggestions.set(account.accountCode, { targetField: exactAnywhere.key, confidence: 'medium' });
      });
  });
  return suggestions;
}

export type PropertyStatementValue = { label: string; kind: PropertyStatementRow['kind']; values: Record<string, number | null> };

/**
 * Builds the statement for a set of period columns. `amountsByTarget` maps a
 * line key to { column: amount } in source sign (income and expense accounts
 * both carry positive normal balances in the QuickBooks-style source feeds).
 */
export function buildPropertyIncomeStatement(
  columns: string[],
  amountsByTarget: Map<string, Record<string, number>>,
): PropertyStatementValue[] {
  const groupTotals = new Map<string, Record<string, number>>();
  const add = (ref: string, column: string, amount: number) => {
    const totals = groupTotals.get(ref) || {};
    totals[column] = (totals[column] || 0) + amount;
    groupTotals.set(ref, totals);
  };
  return PROPERTY_INCOME_STATEMENT.map((row) => {
    if (row.kind === 'heading') return { label: row.label, kind: row.kind, values: {} };
    if (row.kind === 'line') {
      const source = amountsByTarget.get(row.key) || {};
      const values: Record<string, number | null> = {};
      columns.forEach((column) => {
        const raw = source[column];
        if (raw === undefined) { values[column] = null; return; }
        values[column] = raw;
        add(row.group, column, raw);
      });
      return { label: row.label, kind: row.kind, values };
    }
    if (row.kind === 'total') {
      const totals = groupTotals.get(row.group) || {};
      return { label: row.label, kind: row.kind, values: Object.fromEntries(columns.map((column) => [column, totals[column] || 0])) };
    }
    const values: Record<string, number | null> = {};
    columns.forEach((column) => {
      const amount = row.terms.reduce((sum, term) => sum + term.sign * ((groupTotals.get(term.ref) || {})[column] || 0), 0);
      values[column] = amount;
      add(row.key, column, amount);
    });
    return { label: row.label, kind: row.kind, values };
  });
}

export type BookTreatment = 'expense' | 'capitalize';

const GROUP_BY_LINE_KEY = new Map(
  SECTIONS.flatMap((section) => section.lines.map((label) => [lineKey(section, label), section.group] as const)),
);
const PRINCIPAL_REDUCTION_KEY = lineKey(sectionByGroup('debtService'), 'Principal Reduction #1');

/** Nonrecurring repair lines are the only lines whose book treatment is chosen per account. */
export const isNonrecurringRepairLine = (targetField: string) => GROUP_BY_LINE_KEY.get(targetField) === 'nonrecurring';

export type MappedAmounts = {
  /** line key -> { column: amount } */
  amounts: Map<string, Record<string, number>>;
  /** column -> nonrecurring repair amounts whose accounts are set to capitalize */
  capitalizedNonrecurring: Record<string, number>;
  unmapped: Array<{ feed: string; accountCode: string; accountName: string }>;
};

/**
 * Rolls source activity lines into statement line keys using the feed
 * mappings. `scope` is a single feed (e.g. "SLN") or "COMBINED" for all feeds.
 */
export function aggregateMappedAmounts(
  lines: Array<{ reportType: string; sourceEntity: string; accountCode: string; accountName: string; periodEnd: string | Date; amount: unknown }>,
  mappings: Array<{ financialFeed: string; accountCode: string; targetField: string; bookTreatment?: string | null }>,
  scope: string,
  monthToColumn: (month: string) => string | null,
): MappedAmounts {
  const mappingByAccount = new Map(mappings.map((mapping) => [`${mapping.financialFeed}|${mapping.accountCode}`, mapping]));
  const amounts = new Map<string, Record<string, number>>();
  const capitalizedNonrecurring: Record<string, number> = {};
  const unmapped = new Map<string, { feed: string; accountCode: string; accountName: string }>();
  lines.forEach((line) => {
    if (String(line.reportType).toUpperCase() !== 'ACTIVITY') return;
    if (scope !== 'COMBINED' && line.sourceEntity !== scope) return;
    const periodEnd = line.periodEnd instanceof Date ? line.periodEnd.toISOString() : String(line.periodEnd);
    const column = monthToColumn(periodEnd.slice(0, 7));
    if (!column) return;
    const mapping = mappingByAccount.get(`${line.sourceEntity}|${line.accountCode}`);
    if (!mapping) {
      unmapped.set(`${line.sourceEntity}|${line.accountCode}`, { feed: line.sourceEntity, accountCode: line.accountCode, accountName: line.accountName });
      return;
    }
    if (mapping.targetField === 'ignored') return;
    const amount = Number(line.amount || 0);
    const values = amounts.get(mapping.targetField) || {};
    values[column] = (values[column] || 0) + amount;
    amounts.set(mapping.targetField, values);
    if (isNonrecurringRepairLine(mapping.targetField) && mapping.bookTreatment === 'capitalize') {
      capitalizedNonrecurring[column] = (capitalizedNonrecurring[column] || 0) + amount;
    }
  });
  return { amounts, capitalizedNonrecurring, unmapped: [...unmapped.values()] };
}

/**
 * Summarized book income statement for Financial Statements: one line per
 * expense category, loan principal and capitalized costs excluded from net
 * income and shown as balance-sheet activity.
 */
export function buildPropertyBookSummary(columns: string[], mapped: MappedAmounts): PropertyStatementValue[] {
  const groupTotal = (group: string, column: string) => {
    let total = 0;
    mapped.amounts.forEach((values, key) => {
      if (GROUP_BY_LINE_KEY.get(key) === group) total += values[column] || 0;
    });
    return total;
  };
  const principal = (column: string) => mapped.amounts.get(PRINCIPAL_REDUCTION_KEY)?.[column] || 0;
  const capitalized = (column: string) => mapped.capitalizedNonrecurring[column] || 0;
  const per = (fn: (column: string) => number) => Object.fromEntries(columns.map((column) => [column, fn(column)]));

  const rentalIncome = (c: string) => groupTotal('adjustedGrossPotential', c) + groupTotal('otherTenantIncome', c) + groupTotal('netChangeArPrepaid', c);
  const otherIncome = (c: string) => groupTotal('miscellaneousIncome', c);
  const totalRevenue = (c: string) => rentalIncome(c) + otherIncome(c);
  const expenseLines: Array<[string, (c: string) => number]> = [
    ['Administrative', (c) => groupTotal('administrative', c)],
    ['Payroll & Benefits', (c) => groupTotal('payroll', c)],
    ['Utilities', (c) => groupTotal('utilities', c)],
    ['Supplies & Service', (c) => groupTotal('suppliesService', c)],
    ['Repairs & Maintenance', (c) => groupTotal('maintenance', c)],
    ['Nonrecurring Repairs (expensed)', (c) => groupTotal('nonrecurring', c) - capitalized(c)],
    ['Taxes & Insurance', (c) => groupTotal('taxesInsurance', c)],
    ['Adjustment to match SLN books', (c) => groupTotal('netCashAdjustment', c)],
  ];
  const totalOperatingExpenses = (c: string) => expenseLines.reduce((sum, [, fn]) => sum + fn(c), 0);
  const noi = (c: string) => totalRevenue(c) - totalOperatingExpenses(c);
  const interest = (c: string) => groupTotal('debtService', c) - principal(c);

  return [
    { label: 'REVENUE', kind: 'heading', values: {} },
    { label: 'Rental Income', kind: 'line', values: per(rentalIncome) },
    { label: 'Other Income', kind: 'line', values: per(otherIncome) },
    { label: 'TOTAL REVENUE', kind: 'total', values: per(totalRevenue) },
    { label: 'OPERATING EXPENSES', kind: 'heading', values: {} },
    ...expenseLines.map(([label, fn]) => ({ label, kind: 'line' as const, values: per(fn) })),
    { label: 'TOTAL OPERATING EXPENSES', kind: 'total', values: per(totalOperatingExpenses) },
    { label: 'NET OPERATING INCOME', kind: 'formula', values: per(noi) },
    { label: 'Mortgage Interest', kind: 'line', values: per(interest) },
    { label: 'NET INCOME BEFORE DEPRECIATION', kind: 'formula', values: per((c) => noi(c) - interest(c)) },
    { label: 'BALANCE SHEET ACTIVITY (NOT IN NET INCOME)', kind: 'heading', values: {} },
    { label: 'Principal Reduction (reduces Long Term Debt)', kind: 'line', values: per(principal) },
    { label: 'Capital Expenses (added to Fixed Assets)', kind: 'line', values: per((c) => groupTotal('capitalExpenses', c)) },
    { label: 'Capitalized Nonrecurring Repairs (added to Fixed Assets)', kind: 'line', values: per(capitalized) },
  ];
}
