type JsonRecord = Record<string, unknown>;

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cogs' | 'other';

type ChartAccount = {
  accountKey: string;
  accountName: string;
  accountType: AccountType;
};

const ACCOUNT_KEYS = [
  'Acct',
  'AcctNum',
  'Account',
  'AccountNo',
  'GLAccount',
  'account',
  'accountId',
  'accountCode',
  'ACNO',
  'ACID',
];

const ACCOUNT_NAME_KEYS = [
  'Description',
  'AcctDesc',
  'Name',
  'accountName',
  'description',
  'name',
  'ACNM',
];

const ACCOUNT_TYPE_KEYS = [
  'Type',
  'AcctType',
  'AccountType',
  'classification',
  'type',
  'NormalBalance',
  'Category',
];

const YEAR_KEYS = ['FiscalYear', 'fiscalYear', 'Year', 'year', 'FiscYear'];
const PERIOD_KEYS = ['FiscalPeriod', 'fiscalPeriod', 'Period', 'period', 'Per', 'per'];
const DATE_KEYS = ['PeriodEndDate', 'periodEndDate', 'Date', 'date', 'RecordDate', 'recordDate'];
const BEGIN_BALANCE_KEYS = ['BeginBalance', 'beginBalance', 'BeginningBalance', 'OpenBal', 'openingBalance'];
const DEBIT_KEYS = ['Debit', 'Debits', 'debit', 'debits', 'PeriodDebit', 'periodDebit', 'MtdDebit', 'mtdDebit'];
const CREDIT_KEYS = ['Credit', 'Credits', 'credit', 'credits', 'PeriodCredit', 'periodCredit', 'MtdCredit', 'mtdCredit'];
const ENDING_BALANCE_KEYS = [
  'EndBalance',
  'endBalance',
  'EndingBalance',
  'endingBalance',
  'Balance',
  'balance',
  'PeriodEndBalance',
  'periodEndBalance',
  'YtdBalance',
  'ytdBalance',
  'YTDBalance',
  'ACAM',
  'Amount',
  'amount',
];

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/,/g, '');
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeToken(value: unknown): string {
  return String(value || '').trim();
}

function readAny(record: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  const lowerMap = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    lowerMap.set(key.toLowerCase(), value);
  }
  for (const key of keys) {
    const value = lowerMap.get(key.toLowerCase());
    if (value !== undefined) return value;
  }
  return undefined;
}

function pickString(record: JsonRecord, keys: string[]): string {
  return normalizeToken(readAny(record, keys));
}

function pickNumber(record: JsonRecord, keys: string[]): number {
  return toNumber(readAny(record, keys));
}

function parseCompactDateToken(token: string): Date | null {
  const raw = token.trim();
  if (!raw) return null;
  const yyyymm = raw.match(/^(\d{4})(\d{2})$/);
  if (yyyymm) {
    const year = Number(yyyymm[1]);
    const month = Number(yyyymm[2]);
    if (year >= 1900 && month >= 1 && month <= 12) {
      return new Date(year, month - 1, 1);
    }
  }
  const yyyymmdd = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) {
    const year = Number(yyyymmdd[1]);
    const month = Number(yyyymmdd[2]);
    const day = Number(yyyymmdd[3]);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, 1);
    }
  }
  const yyyymmddhhmmss = raw.match(/^(\d{4})(\d{2})(\d{2})\d{6}$/);
  if (yyyymmddhhmmss) {
    const year = Number(yyyymmddhhmmss[1]);
    const month = Number(yyyymmddhhmmss[2]);
    const day = Number(yyyymmddhhmmss[3]);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, 1);
    }
  }
  return null;
}

function parseRowMonth(record: JsonRecord): Date | null {
  const explicitDate = normalizeToken(readAny(record, DATE_KEYS));
  if (explicitDate) {
    const compactParsed = parseCompactDateToken(explicitDate);
    if (compactParsed) return compactParsed;
    const parsed = new Date(explicitDate);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    }
  }

  const year = toNumber(readAny(record, YEAR_KEYS));
  const period = toNumber(readAny(record, PERIOD_KEYS));
  if (year > 1900 && period >= 1 && period <= 12) {
    return new Date(Math.trunc(year), Math.trunc(period) - 1, 1);
  }
  return null;
}

function looksLikeFinancialRow(record: JsonRecord): boolean {
  const signalKeys = [
    ...ACCOUNT_KEYS,
    ...ACCOUNT_NAME_KEYS,
    ...ACCOUNT_TYPE_KEYS,
    ...YEAR_KEYS,
    ...PERIOD_KEYS,
    ...DATE_KEYS,
    ...BEGIN_BALANCE_KEYS,
    ...DEBIT_KEYS,
    ...CREDIT_KEYS,
    ...ENDING_BALANCE_KEYS,
  ];
  const lowerSet = new Set(Object.keys(record).map((key) => key.toLowerCase()));
  return signalKeys.some((key) => lowerSet.has(key.toLowerCase()));
}

function normalizeAccountType(rawType: string, accountName: string): AccountType {
  const typeToken = rawType.trim().toUpperCase();
  const name = accountName.toLowerCase();
  if (name.includes('cost of sales') || name.includes('cost of goods') || name.includes('cogs')) return 'cogs';
  if (typeToken === 'A' || typeToken.includes('ASSET')) return 'asset';
  if (typeToken === 'L' || typeToken.includes('LIAB')) return 'liability';
  if (typeToken === 'Q' || typeToken.includes('EQUITY') || typeToken === 'B') return 'equity';
  if (typeToken === 'R' || typeToken.includes('REV') || typeToken.includes('INCOME') || typeToken === 'P') return 'revenue';
  if (typeToken === 'E' || typeToken.includes('EXP')) return 'expense';
  if (typeToken === 'O' || typeToken.includes('OTHER')) return 'other';
  return 'other';
}

function buildAccountKey(rawAccount: string): string {
  const value = rawAccount.trim();
  if (!value) return '';
  const numeric = value.match(/(\d{3,})/);
  return numeric ? numeric[1] : value.toLowerCase();
}

function extractRows(payloadLike: unknown): JsonRecord[] {
  const queue: unknown[] = [payloadLike];
  const rows: JsonRecord[] = [];
  const dedupe = new Set<string>();
  let guard = 0;
  while (queue.length > 0 && guard < 200000) {
    guard += 1;
    const node = queue.shift();
    if (!node) continue;
    if (Array.isArray(node)) {
      for (const item of node) queue.push(item);
      continue;
    }
    const record = asRecord(node);
    if (!record) continue;

    if (looksLikeFinancialRow(record)) {
      const signature = JSON.stringify(record);
      if (!dedupe.has(signature)) {
        dedupe.add(signature);
        rows.push(record);
      }
    }

    const directArrayKeys = ['results', 'records', 'items', 'Items', 'MIRecord', 'Item', 'item', 'IDOItems', 'Data', 'data'];
    for (const key of directArrayKeys) {
      const value = record[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          const row = asRecord(item);
          if (row) rows.push(row);
        }
      }
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return rows;
}

function inferRowsBySource(glResponses: unknown[]): { chartRows: JsonRecord[]; ledgerRows: JsonRecord[] } {
  const chartRows: JsonRecord[] = [];
  const ledgerRows: JsonRecord[] = [];

  for (const entry of glResponses) {
    const wrapper = asRecord(entry);
    const sourceProgram = wrapper ? normalizeToken(wrapper.miProgram || wrapper.program) : '';
    const responseBody = wrapper && wrapper.response ? wrapper.response : entry;
    const rows = extractRows(responseBody);
    if (rows.length === 0) continue;

    const programHint = sourceProgram.toUpperCase();
    if (programHint === 'SLCHARTS') {
      chartRows.push(...rows);
      continue;
    }
    if (programHint === 'SLLEDGERS') {
      ledgerRows.push(...rows);
      continue;
    }

    for (const row of rows) {
      const hasPeriod = parseRowMonth(row) !== null;
      const hasBalanceSignal =
        pickNumber(row, ENDING_BALANCE_KEYS) !== 0 ||
        pickNumber(row, DEBIT_KEYS) !== 0 ||
        pickNumber(row, CREDIT_KEYS) !== 0;
      if (hasPeriod && hasBalanceSignal) {
        ledgerRows.push(row);
      } else {
        chartRows.push(row);
      }
    }
  }
  return { chartRows, ledgerRows };
}

function buildChartIndex(chartRows: JsonRecord[]): Map<string, ChartAccount> {
  const byAccount = new Map<string, ChartAccount>();
  for (const row of chartRows) {
    const rawAccount = pickString(row, ACCOUNT_KEYS);
    if (!rawAccount) continue;
    const accountKey = buildAccountKey(rawAccount);
    if (!accountKey) continue;
    const accountName = pickString(row, ACCOUNT_NAME_KEYS) || rawAccount;
    const rawType = pickString(row, ACCOUNT_TYPE_KEYS);
    const accountType = normalizeAccountType(rawType, accountName);
    if (!byAccount.has(accountKey)) {
      byAccount.set(accountKey, { accountKey, accountName, accountType });
    }
  }
  return byAccount;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function endOfMonthIso(month: string): string {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 7, 0, 0, 0));
  return end.toISOString();
}

function initMonthRow(month: string) {
  return {
    monthDate: endOfMonthIso(month),
    date: endOfMonthIso(month),
    month,
    revenue: 0,
    cogsPayroll: 0,
    cogsOwnerPay: 0,
    cogsContractors: 0,
    cogsMaterials: 0,
    cogsCommissions: 0,
    cogsOther: 0,
    cogsTotal: 0,
    payroll: 0,
    ownerBasePay: 0,
    benefits: 0,
    insurance: 0,
    professionalFees: 0,
    subcontractors: 0,
    rent: 0,
    taxLicense: 0,
    stateIncomeTaxes: 0,
    federalIncomeTaxes: 0,
    phoneComm: 0,
    infrastructure: 0,
    autoTravel: 0,
    salesExpense: 0,
    marketing: 0,
    trainingCert: 0,
    mealsEntertainment: 0,
    interestExpense: 0,
    depreciationAmortization: 0,
    otherExpense: 0,
    expense: 0,
    nonOperatingIncome: 0,
    nonOperatingExpense: 0,
    extraordinaryItems: 0,
    cash: 0,
    ar: 0,
    inventory: 0,
    otherCA: 0,
    tca: 0,
    fixedAssets: 0,
    otherAssets: 0,
    totalAssets: 0,
    ap: 0,
    loc: 0,
    otherCL: 0,
    tcl: 0,
    ltd: 0,
    totalLiab: 0,
    ownersCapital: 0,
    ownersDraw: 0,
    commonStock: 0,
    preferredStock: 0,
    retainedEarnings: 0,
    additionalPaidInCapital: 0,
    treasuryStock: 0,
    totalEquity: 0,
    totalLAndE: 0,
    revenueBreakdown: {},
    expenseBreakdown: {},
    cogsBreakdown: {},
    lobBreakdowns: {},
  };
}

function addToBreakdown(target: Record<string, unknown>, key: string, amount: number) {
  const prior = toNumber(target[key]);
  target[key] = prior + amount;
}

export function buildCsiMonthlyDataFromGlResponses(params: {
  glResponses: unknown[];
  throughMonth: string;
  maxMonths?: number;
}) {
  const throughMonth = String(params.throughMonth || '').trim();
  if (!/^\d{4}-\d{2}$/.test(throughMonth)) {
    return { monthlyData: [] as Record<string, unknown>[], stats: { chartRows: 0, ledgerRows: 0 } };
  }
  const maxMonths = Math.max(1, Math.min(60, Math.floor(Number(params.maxMonths || 36))));
  const throughDate = new Date(`${throughMonth}-01T00:00:00Z`);
  const earliestDate = new Date(throughDate.getUTCFullYear(), throughDate.getUTCMonth() - (maxMonths - 1), 1);

  const { chartRows, ledgerRows } = inferRowsBySource(params.glResponses || []);
  const chartByAccount = buildChartIndex(chartRows);
  const monthly = new Map<string, ReturnType<typeof initMonthRow>>();

  for (const row of ledgerRows) {
    const rowMonth = parseRowMonth(row);
    if (!rowMonth) continue;
    const monthStart = new Date(rowMonth.getFullYear(), rowMonth.getMonth(), 1);
    if (monthStart < earliestDate || monthStart > throughDate) continue;

    const key = monthKey(monthStart);
    if (!monthly.has(key)) monthly.set(key, initMonthRow(key));
    const bucket = monthly.get(key)!;

    const rawAccount = pickString(row, ACCOUNT_KEYS);
    const accountKey = buildAccountKey(rawAccount);
    const chart = accountKey ? chartByAccount.get(accountKey) : undefined;
    const accountName = chart?.accountName || pickString(row, ACCOUNT_NAME_KEYS) || rawAccount || 'unmapped_account';
    const accountType = chart?.accountType || normalizeAccountType(pickString(row, ACCOUNT_TYPE_KEYS), accountName);

    const debit = pickNumber(row, DEBIT_KEYS);
    const credit = pickNumber(row, CREDIT_KEYS);
    const begin = pickNumber(row, BEGIN_BALANCE_KEYS);
    const explicitEnding = pickNumber(row, ENDING_BALANCE_KEYS);
    const endingBalance = explicitEnding !== 0 ? explicitEnding : begin + debit - credit;

    const expenseMovement = debit - credit;
    const revenueMovement = credit - debit;
    const cogsMovement = debit - credit;

    if (accountType === 'revenue') {
      const amount = revenueMovement;
      bucket.revenue += amount;
      addToBreakdown(bucket.revenueBreakdown as Record<string, unknown>, 'rev_other_revenue', amount);
    } else if (accountType === 'cogs') {
      const amount = cogsMovement;
      bucket.cogsTotal += amount;
      bucket.cogsOther += amount;
      addToBreakdown(bucket.cogsBreakdown as Record<string, unknown>, 'cogs_other_cogs', amount);
    } else if (accountType === 'expense' || accountType === 'other') {
      const amount = expenseMovement;
      const name = accountName.toLowerCase();
      bucket.expense += amount;
      if (name.includes('state income tax')) {
        bucket.stateIncomeTaxes += amount;
      } else if (name.includes('federal income tax')) {
        bucket.federalIncomeTaxes += amount;
      } else if (name.includes('tax') || name.includes('license')) {
        bucket.taxLicense += amount;
      } else if (name.includes('payroll') || name.includes('salary') || name.includes('wage')) {
        bucket.payroll += amount;
      } else if (name.includes('insurance')) {
        bucket.insurance += amount;
      } else if (name.includes('rent') || name.includes('lease')) {
        bucket.rent += amount;
      } else if (name.includes('travel') || name.includes('auto') || name.includes('vehicle')) {
        bucket.autoTravel += amount;
      } else {
        bucket.otherExpense += amount;
      }
      addToBreakdown(bucket.expenseBreakdown as Record<string, unknown>, 'Unallocated', amount);
    } else if (accountType === 'asset') {
      const amount = endingBalance;
      bucket.totalAssets += amount;
      if (accountName.toLowerCase().includes('cash') || accountName.toLowerCase().includes('bank')) bucket.cash += amount;
      else if (accountName.toLowerCase().includes('receivable') || accountName.toLowerCase().includes('a/r')) bucket.ar += amount;
      else if (accountName.toLowerCase().includes('inventory')) bucket.inventory += amount;
      else if (accountName.toLowerCase().includes('fixed')) bucket.fixedAssets += amount;
      else bucket.otherCA += amount;
    } else if (accountType === 'liability') {
      const amount = endingBalance;
      bucket.totalLiab += amount;
      if (accountName.toLowerCase().includes('payable') || accountName.toLowerCase().includes('a/p')) bucket.ap += amount;
      else if (accountName.toLowerCase().includes('line of credit') || accountName.toLowerCase().includes('loc')) bucket.loc += amount;
      else if (accountName.toLowerCase().includes('long') || accountName.toLowerCase().includes('loan') || accountName.toLowerCase().includes('debt')) bucket.ltd += amount;
      else bucket.otherCL += amount;
    } else if (accountType === 'equity') {
      const amount = endingBalance;
      bucket.totalEquity += amount;
      if (accountName.toLowerCase().includes('retained')) bucket.retainedEarnings += amount;
      else if (accountName.toLowerCase().includes('draw')) bucket.ownersDraw += amount;
      else if (accountName.toLowerCase().includes('capital')) bucket.ownersCapital += amount;
      else bucket.additionalPaidInCapital += amount;
    }
  }

  const monthlyData = Array.from(monthly.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, row]) => {
      row.tca = row.cash + row.ar + row.inventory + row.otherCA;
      row.tcl = row.ap + row.loc + row.otherCL;
      row.totalLAndE = row.totalLiab + row.totalEquity;

      // Guardrail: avoid validation failure if only expense/cogs were detectable.
      if (row.revenue === 0 && (Math.abs(row.cogsTotal) > 0 || Math.abs(row.expense) > 0)) {
        row.revenue = Math.abs(row.cogsTotal) + Math.abs(row.expense);
      }
      return row;
    });

  return {
    monthlyData,
    stats: {
      chartRows: chartRows.length,
      ledgerRows: ledgerRows.length,
      monthsBuilt: monthlyData.length,
    },
  };
}

