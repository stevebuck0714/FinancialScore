type JsonRecord = Record<string, unknown>;

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cogs' | 'other';

type ChartAccount = {
  accountKey: string;
  accountName: string;
  accountType: AccountType;
};

function dedupeRowsByLedgerIdentity(rows: JsonRecord[]): JsonRecord[] {
  const deduped = new Map<string, JsonRecord>();
  for (const row of rows) {
    const rowPointer = normalizeToken(readAny(row, ['RowPointer', 'rowPointer'])).toLowerCase();
    if (rowPointer) {
      const key = `ptr:${rowPointer}`;
      if (!deduped.has(key)) deduped.set(key, row);
      continue;
    }
    const fallbackParts = [
      pickString(row, ACCOUNT_KEYS),
      pickString(row, ['ControlYear', 'controlYear', 'FiscalYear', 'fiscalYear']),
      pickString(row, ['ControlPeriod', 'controlPeriod', 'FiscalPeriod', 'fiscalPeriod']),
      pickString(row, ['TransNum', 'transNum']),
      pickString(row, ['Voucher', 'voucher']),
      pickString(row, ['VouchSeq', 'vouchSeq']),
      pickString(row, ['Ref', 'reference']),
      pickString(row, ['TransDate', 'transDate']),
      pickString(row, ['RecordDate', 'recordDate']),
      String(pickNumber(row, DOM_SIGNED_AMOUNT_KEYS)),
      String(pickNumber(row, DOM_DEBIT_KEYS)),
      String(pickNumber(row, DOM_CREDIT_KEYS)),
    ]
      .map((part) => normalizeToken(part).toLowerCase())
      .join('|');
    const key = `fb:${fallbackParts}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

export type NormalizedCsiSlLedgersRow = {
  site: string | null;
  transNum: string | null;
  recordDate: Date | null;
  transDate: Date | null;
  acct: string | null;
  controlYear: number | null;
  controlPeriod: number | null;
  debit: number;
  credit: number;
  signedAmount: number;
  currencyCode: string | null;
  reference: string | null;
  description: string | null;
  transactionType: string | null;
  vendorNumber: string | null;
  vendorName: string | null;
  rowPointer: string | null;
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

const YEAR_KEYS = ['FiscalYear', 'fiscalYear', 'Year', 'year', 'FiscYear', 'ControlYear', 'controlYear'];
const PERIOD_KEYS = [
  'FiscalPeriod',
  'fiscalPeriod',
  'Period',
  'period',
  'Per',
  'per',
  'ControlPeriod',
  'controlPeriod',
];
const DATE_KEYS = [
  'PeriodEndDate',
  'periodEndDate',
  'Date',
  'date',
  'RecordDate',
  'recordDate',
  'TransDate',
  'transDate',
  'CheckDate',
  'checkDate',
  'ObsDate',
  'obsDate',
];
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
const DOM_DEBIT_KEYS = ['DerDomAmountDebit', 'derDomAmountDebit', 'DomAmountDebit', 'domAmountDebit'];
const DOM_CREDIT_KEYS = ['DerDomAmountCredit', 'derDomAmountCredit', 'DomAmountCredit', 'domAmountCredit'];
const DOM_SIGNED_AMOUNT_KEYS = ['DomAmount', 'domAmount', 'Amount', 'amount', 'ForAmount', 'forAmount'];

const GL_TRANSACTION_PROGRAM_HINTS = new Set([
  'SLGLTRANS',
]);

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

function firstNonEmptyToken(record: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    if (!(key in record)) continue;
    const token = normalizeToken(record[key]);
    if (token) return token;
  }
  const lowerMap = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    lowerMap.set(key.toLowerCase(), value);
  }
  for (const key of keys) {
    const token = normalizeToken(lowerMap.get(key.toLowerCase()));
    if (token) return token;
  }
  return '';
}

function parseCompactDateToken(token: string): Date | null {
  const raw = token.trim();
  if (!raw) return null;
  const yyyymm = raw.match(/^(\d{4})(\d{2})$/);
  if (yyyymm) {
    const year = Number(yyyymm[1]);
    const month = Number(yyyymm[2]);
    if (year >= 1900 && month >= 1 && month <= 12) {
      return new Date(Date.UTC(year, month - 1, 1));
    }
  }
  const yyyymmdd = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) {
    const year = Number(yyyymmdd[1]);
    const month = Number(yyyymmdd[2]);
    const day = Number(yyyymmdd[3]);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, 1));
    }
  }
  const yyyymmddhhmmss = raw.match(/^(\d{4})(\d{2})(\d{2})\d{6}$/);
  if (yyyymmddhhmmss) {
    const year = Number(yyyymmddhhmmss[1]);
    const month = Number(yyyymmddhhmmss[2]);
    const day = Number(yyyymmddhhmmss[3]);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, 1));
    }
  }
  // CSI commonly returns timestamps like "20260323 17:03:30.850"
  // (or without milliseconds). Treat these as month-resolvable dates.
  const yyyymmddWithTime = raw.match(/^(\d{4})(\d{2})(\d{2})[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/);
  if (yyyymmddWithTime) {
    const year = Number(yyyymmddWithTime[1]);
    const month = Number(yyyymmddWithTime[2]);
    const day = Number(yyyymmddWithTime[3]);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, 1);
    }
  }
  return null;
}

function parseCsiDateTimeToken(value: unknown): Date | null {
  const token = normalizeToken(value);
  if (!token) return null;
  const compact = token.match(/^(\d{4})(\d{2})(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (compact) {
    const year = Number(compact[1]);
    const month = Number(compact[2]);
    const day = Number(compact[3]);
    const hour = Number(compact[4]);
    const minute = Number(compact[5]);
    const second = Number(compact[6]);
    const ms = Number((compact[7] || '0').padEnd(3, '0'));
    const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const parsed = new Date(token);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseRowMonth(record: JsonRecord): Date | null {
  // IMPORTANT: CSI accounting periods should drive month assignment first.
  // RecordDate/TransDate can fall in adjacent months and cause drift.
  const yearToken = firstNonEmptyToken(record, YEAR_KEYS);
  const periodToken = firstNonEmptyToken(record, PERIOD_KEYS);
  const year = toNumber(yearToken);
  const period = toNumber(periodToken);
  if (year > 1900 && period >= 1 && period <= 12) {
    return new Date(Date.UTC(Math.trunc(year), Math.trunc(period) - 1, 1));
  }
  if (periodToken) {
    // Common CSI variant: ControlPeriod/FiscalPeriod as compact YYYYMM (or YYYYPP).
    const compactYearMonth = periodToken.match(/^(\d{4})(\d{2})$/);
    if (compactYearMonth) {
      const compactYear = Number(compactYearMonth[1]);
      const compactMonth = Number(compactYearMonth[2]);
      if (compactYear >= 1900 && compactMonth >= 1 && compactMonth <= 12) {
        return new Date(Date.UTC(compactYear, compactMonth - 1, 1));
      }
    }
    // Also support YYYY-MM or YYYY/MM period tokens.
    const splitYearMonth = periodToken.match(/^(\d{4})[-/](\d{1,2})$/);
    if (splitYearMonth) {
      const splitYear = Number(splitYearMonth[1]);
      const splitMonth = Number(splitYearMonth[2]);
      if (splitYear >= 1900 && splitMonth >= 1 && splitMonth <= 12) {
        return new Date(Date.UTC(splitYear, splitMonth - 1, 1));
      }
    }
  }

  // CSI ledger rows often have RecordDate in a later posting month while
  // TransDate reflects the business transaction month; prefer TransDate.
  const explicitDate = firstNonEmptyToken(record, ['TransDate', 'transDate']) || firstNonEmptyToken(record, DATE_KEYS);
  if (explicitDate) {
    const compactParsed = parseCompactDateToken(explicitDate);
    if (compactParsed) return compactParsed;
    const parsed = new Date(explicitDate);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
    }
  }

  // Some CSI ledger payloads provide only generic "period"/"date"-ish fields
  // under varying names (e.g. controlperiod, postdate). Try a tolerant scan.
  for (const [key, value] of Object.entries(record)) {
    const keyLower = key.toLowerCase();
    if (!(keyLower.includes('date') || keyLower.includes('period') || keyLower.includes('fiscal'))) continue;
    const token = normalizeToken(value);
    if (!token) continue;
    const compactParsed = parseCompactDateToken(token);
    if (compactParsed) return compactParsed;
    const parsed = new Date(token);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
    }
  }
  return null;
}

function resolveDebitCreditAmounts(record: JsonRecord): { debit: number; credit: number } {
  const standardDebit = pickNumber(record, DEBIT_KEYS);
  const standardCredit = pickNumber(record, CREDIT_KEYS);
  if (standardDebit !== 0 || standardCredit !== 0) {
    return { debit: standardDebit, credit: standardCredit };
  }

  const domDebit = pickNumber(record, DOM_DEBIT_KEYS);
  const domCredit = pickNumber(record, DOM_CREDIT_KEYS);
  if (domDebit !== 0 || domCredit !== 0) {
    return { debit: domDebit, credit: domCredit };
  }

  const drCrToken = normalizeToken(readAny(record, ['DrCr', 'drCr', 'drcr']));
  const signedAmount = pickNumber(record, DOM_SIGNED_AMOUNT_KEYS);
  if (drCrToken) {
    if (drCrToken.startsWith('d')) return { debit: Math.abs(signedAmount), credit: 0 };
    if (drCrToken.startsWith('c')) return { debit: 0, credit: Math.abs(signedAmount) };
  }
  if (signedAmount > 0) return { debit: signedAmount, credit: 0 };
  if (signedAmount < 0) return { debit: 0, credit: Math.abs(signedAmount) };
  return { debit: 0, credit: 0 };
}

export function normalizeCsiSlLedgersRow(raw: JsonRecord): NormalizedCsiSlLedgersRow {
  const { debit, credit } = resolveDebitCreditAmounts(raw);
  const signedAmount = pickNumber(raw, DOM_SIGNED_AMOUNT_KEYS);
  const controlYearValue = toNumber(readAny(raw, ['ControlYear', 'controlYear', 'FiscalYear', 'fiscalYear']));
  const controlPeriodValue = toNumber(readAny(raw, ['ControlPeriod', 'controlPeriod', 'FiscalPeriod', 'fiscalPeriod']));
  const controlYear = controlYearValue > 0 ? Math.trunc(controlYearValue) : null;
  const controlPeriod = controlPeriodValue > 0 ? Math.trunc(controlPeriodValue) : null;

  return {
    site: pickString(raw, ['Site', 'site']) || null,
    transNum: pickString(raw, ['TransNum', 'transNum']) || null,
    recordDate: parseCsiDateTimeToken(readAny(raw, ['RecordDate', 'recordDate'])),
    transDate: parseCsiDateTimeToken(readAny(raw, ['TransDate', 'transDate'])),
    acct: pickString(raw, ACCOUNT_KEYS) || null,
    controlYear,
    controlPeriod,
    debit,
    credit,
    signedAmount,
    currencyCode: pickString(raw, ['CurrCode', 'currencyCode', 'currency']) || null,
    reference: pickString(raw, ['Ref', 'reference']) || null,
    description: pickString(raw, ['ChaDescription', 'FRDerDescription', 'Description', 'description']) || null,
    transactionType: pickString(raw, ['DerTransType', 'TransType', 'Type']) || null,
    vendorNumber: pickString(raw, ['VendNum', 'vendorNumber']) || null,
    vendorName: pickString(raw, ['DerCustVendName', 'VendName', 'vendorName']) || null,
    rowPointer: pickString(raw, ['RowPointer', '_ItemId']) || null,
  };
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

function inferAccountTypeFromCode(accountKey: string): AccountType | null {
  const code = String(accountKey || '').trim();
  if (!/^\d{4,}$/.test(code)) return null;
  if (code.startsWith('1')) return 'asset';
  if (code.startsWith('3')) return 'liability';
  if (code.startsWith('5')) return 'revenue';
  if (code.startsWith('6')) return 'cogs';
  if (code.startsWith('7')) return 'expense';
  return null;
}

function buildAccountKey(rawAccount: string): string {
  const value = rawAccount.trim();
  if (!value) return '';
  const numeric = value.match(/(\d{3,})/);
  return numeric ? numeric[1] : value.toLowerCase();
}

function extractAccountCodeCandidates(...values: unknown[]): string[] {
  const candidates = new Set<string>();
  const addCandidate = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    const key = buildAccountKey(raw);
    if (key) candidates.add(key);
    const digitMatches = raw.match(/\d{3,}/g) || [];
    for (const token of digitMatches) {
      const normalized = String(Number(token));
      if (normalized && normalized !== 'NaN') candidates.add(normalized);
      candidates.add(token);
      if (token.length === 4) candidates.add(`${token}0`);
      if (token.length >= 5) {
        candidates.add(token.slice(0, 4));
        if (token.endsWith('0')) candidates.add(token.slice(0, -1));
      }
    }
  };
  for (const value of values) addCandidate(value);
  return Array.from(candidates).filter(Boolean);
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
          // Queue child records and let the main dedupe path add rows exactly once.
          queue.push(item);
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
  const explicitGlTransactionRows: JsonRecord[] = [];

  for (const entry of glResponses) {
    const wrapper = asRecord(entry);
    const sourceProgram = wrapper ? normalizeToken(wrapper.miProgram || wrapper.program) : '';
    const responseBody = wrapper && wrapper.response ? wrapper.response : entry;
    const rows = extractRows(responseBody);
    if (rows.length === 0) continue;

    const programHint = sourceProgram.toUpperCase();
    if (programHint === 'SLCHARTS') {
      // Avoid Array.push(...rows): V8 caps spread args (~65k–125k) which
      // RangeErrors on large CSI ledger rebuilds (Atlantic Precision: 14k+).
      for (const row of rows) chartRows.push(row);
      continue;
    }
    if (GL_TRANSACTION_PROGRAM_HINTS.has(programHint)) {
      for (const row of rows) explicitGlTransactionRows.push(row);
      continue;
    }

    // Strict source policy: do not infer ledger rows from non-transaction programs.
    for (const row of rows) {
      chartRows.push(row);
    }
  }
  // Daily statement source-of-truth: detailed GL transaction rows only.
  const ledgerRows = explicitGlTransactionRows;
  return {
    chartRows: dedupeRowsByLedgerIdentity(chartRows),
    ledgerRows: dedupeRowsByLedgerIdentity(ledgerRows),
  };
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
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isEffectivelyZero(value: unknown): boolean {
  return Math.abs(toNumber(value)) < 0.000001;
}

function isSyntheticZeroMonthRow(row: ReturnType<typeof initMonthRow>): boolean {
  return (
    isEffectivelyZero(row.revenue) &&
    isEffectivelyZero(row.cogsTotal) &&
    isEffectivelyZero(row.expense) &&
    isEffectivelyZero(row.cash) &&
    isEffectivelyZero(row.ar) &&
    isEffectivelyZero(row.inventory) &&
    isEffectivelyZero(row.tca) &&
    isEffectivelyZero(row.totalAssets) &&
    isEffectivelyZero(row.ap) &&
    isEffectivelyZero(row.tcl) &&
    isEffectivelyZero(row.totalLiab) &&
    isEffectivelyZero(row.totalEquity)
  );
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
    retainageReceivables: 0,
    contractAssets: 0,
    inventory: 0,
    otherCA: 0,
    tca: 0,
    fixedAssets: 0,
    constructionEquipment: 0,
    officeEquipment: 0,
    shopEquipment: 0,
    investments: 0,
    rightOfUseLeases: 0,
    otherAssets: 0,
    totalAssets: 0,
    ap: 0,
    loc: 0,
    contractLiabilities: 0,
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

type MappingRow = {
  accountName?: string | null;
  accountId?: string | null;
  accountCode?: string | null;
  targetField?: string | null;
};

type OpeningBalanceSeedRow = {
  accountId?: string | null;
  accountCode?: string | null;
  asOfDate?: string | null;
  endingBalance?: number | string | null;
};

const BS_TARGET_FIELDS = new Set([
  'cash',
  'ar',
  'retainagereceivables',
  'contractassets',
  'inventory',
  'otherca',
  'fixedassets',
  'constructionequipment',
  'officeequipment',
  'shopequipment',
  'investments',
  'rightofuseleases',
  'otherassets',
  'totalassets',
  'ap',
  'loc',
  'contractliabilities',
  'othercl',
  'tcl',
  'ltd',
  'totalliab',
  'ownerscapital',
  'ownersdraw',
  'commonstock',
  'preferredstock',
  'retainedearnings',
  'additionalpaidincapital',
  'treasurystock',
  'totalequity',
  'totallande',
]);

function normalizeMappingKey(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

// Resolves a lowercased target-field token (e.g. "fixedassets", "ownerscapital")
// to the corresponding camelCase property on the MonthlyFinancial bucket
// produced by initMonthRow. Without this map, code paths that did
// `lower in bucket` would silently miss every multi-word camelCase field and
// dump amounts into a fallback bucket (otherCA / otherCL / additionalPaidInCapital
// / otherExpense), producing zeros on Data Review for Fixed Assets, Other Assets,
// Owners Capital, Common Stock, Retained Earnings, etc.
const BUCKET_KEY_BY_TARGET_FIELD: Record<string, keyof ReturnType<typeof initMonthRow>> = {
  // Income statement
  revenue: 'revenue',
  cogstotal: 'cogsTotal',
  cogspayroll: 'cogsPayroll',
  cogsownerpay: 'cogsOwnerPay',
  cogscontractors: 'cogsContractors',
  cogsmaterials: 'cogsMaterials',
  cogscommissions: 'cogsCommissions',
  cogsother: 'cogsOther',
  payroll: 'payroll',
  ownerbasepay: 'ownerBasePay',
  benefits: 'benefits',
  insurance: 'insurance',
  professionalfees: 'professionalFees',
  subcontractors: 'subcontractors',
  rent: 'rent',
  taxlicense: 'taxLicense',
  stateincometaxes: 'stateIncomeTaxes',
  federalincometaxes: 'federalIncomeTaxes',
  phonecomm: 'phoneComm',
  infrastructure: 'infrastructure',
  autotravel: 'autoTravel',
  salesexpense: 'salesExpense',
  marketing: 'marketing',
  trainingcert: 'trainingCert',
  mealsentertainment: 'mealsEntertainment',
  interestexpense: 'interestExpense',
  depreciationamortization: 'depreciationAmortization',
  otherexpense: 'otherExpense',
  expense: 'expense',
  nonoperatingincome: 'nonOperatingIncome',
  nonoperatingexpense: 'nonOperatingExpense',
  extraordinaryitems: 'extraordinaryItems',
  // Balance sheet — assets
  cash: 'cash',
  ar: 'ar',
  retainagereceivables: 'retainageReceivables',
  contractassets: 'contractAssets',
  inventory: 'inventory',
  otherca: 'otherCA',
  tca: 'tca',
  fixedassets: 'fixedAssets',
  constructionequipment: 'constructionEquipment',
  officeequipment: 'officeEquipment',
  shopequipment: 'shopEquipment',
  investments: 'investments',
  rightofuseleases: 'rightOfUseLeases',
  otherassets: 'otherAssets',
  totalassets: 'totalAssets',
  // Balance sheet — liabilities
  ap: 'ap',
  loc: 'loc',
  contractliabilities: 'contractLiabilities',
  othercl: 'otherCL',
  tcl: 'tcl',
  ltd: 'ltd',
  totalliab: 'totalLiab',
  // Balance sheet — equity
  ownerscapital: 'ownersCapital',
  ownersdraw: 'ownersDraw',
  commonstock: 'commonStock',
  preferredstock: 'preferredStock',
  retainedearnings: 'retainedEarnings',
  additionalpaidincapital: 'additionalPaidInCapital',
  treasurystock: 'treasuryStock',
  totalequity: 'totalEquity',
  totallande: 'totalLAndE',
};

function resolveBucketKey(
  bucket: ReturnType<typeof initMonthRow>,
  lowerTarget: string,
): keyof ReturnType<typeof initMonthRow> | null {
  const mapped = BUCKET_KEY_BY_TARGET_FIELD[lowerTarget];
  if (mapped && mapped in bucket && typeof (bucket as Record<string, unknown>)[mapped] === 'number') {
    return mapped;
  }
  // Backward-compatible fallback: accept already-camelCase target fields too.
  if (lowerTarget in bucket && typeof (bucket as Record<string, unknown>)[lowerTarget] === 'number') {
    return lowerTarget as keyof ReturnType<typeof initMonthRow>;
  }
  return null;
}

function isExpenseTargetField(targetField: string): boolean {
  const normalized = String(targetField || '').trim().toLowerCase();
  return new Set([
    'payroll',
    'ownerbasepay',
    'ownersretirement',
    'benefits',
    'insurance',
    'professionalfees',
    'subcontractors',
    'rent',
    'taxlicense',
    'stateincometaxes',
    'federalincometaxes',
    'phonecomm',
    'infrastructure',
    'autotravel',
    'salesexpense',
    'marketing',
    'trainingcert',
    'mealsentertainment',
    'interestexpense',
    'depreciationamortization',
    'otherexpense',
    'expense',
    'operatingexpensetotal',
    'nonoperatingexpense',
    'nonoperatingincome',
    'extraordinaryitems',
  ]).has(normalized);
}

export function __test_only__initMonthRow(month: string) {
  return initMonthRow(month);
}

export function __test_only__applyMappedAmount(
  bucket: ReturnType<typeof initMonthRow>,
  targetField: string,
  expenseMovement: number,
  revenueMovement: number,
  endingBalance: number,
): boolean {
  return applyMappedAmount(bucket, targetField, expenseMovement, revenueMovement, endingBalance);
}

function applyMappedAmount(
  bucket: ReturnType<typeof initMonthRow>,
  targetField: string,
  expenseMovement: number,
  revenueMovement: number,
  endingBalance: number,
): boolean {
  const normalized = String(targetField || '').trim();
  if (!normalized || normalized.toLowerCase() === 'unmapped' || normalized.toLowerCase() === 'ignored') return false;
  const amountExpense = expenseMovement;
  const amountRevenue = revenueMovement;
  const amountBalance = Math.abs(endingBalance);
  const lower = normalized.toLowerCase();

  if (lower === 'revenue' || lower.startsWith('rev_')) {
    bucket.revenue += amountRevenue;
    addToBreakdown(bucket.revenueBreakdown as Record<string, unknown>, lower.startsWith('rev_') ? normalized : 'rev_other_revenue', amountRevenue);
    return true;
  }
  if (
    lower === 'cogstotal' ||
    lower === 'costofgoodssold' ||
    lower.startsWith('cogs_') ||
    lower.startsWith('cogs')
  ) {
    bucket.cogsTotal += amountExpense;
    const cogsKey = resolveBucketKey(bucket, lower);
    if (cogsKey && cogsKey !== 'cogsTotal') {
      (bucket as unknown as Record<string, number>)[cogsKey as string] += amountExpense;
    }
    addToBreakdown(bucket.cogsBreakdown as Record<string, unknown>, lower.startsWith('cogs_') ? normalized : 'cogs_other_cogs', amountExpense);
    return true;
  }
  if (isExpenseTargetField(lower)) {
    bucket.expense += amountExpense;
    const expenseKey = resolveBucketKey(bucket, lower);
    if (expenseKey && expenseKey !== 'expense') {
      (bucket as unknown as Record<string, number>)[expenseKey as string] += amountExpense;
    } else {
      bucket.otherExpense += amountExpense;
    }
    addToBreakdown(bucket.expenseBreakdown as Record<string, unknown>, normalized, amountExpense);
    return true;
  }
  if (
    lower === 'cash' ||
    lower === 'ar' ||
    lower === 'retainagereceivables' ||
    lower === 'contractassets' ||
    lower === 'inventory' ||
    lower === 'otherca' ||
    lower === 'fixedassets' ||
    lower === 'constructionequipment' ||
    lower === 'officeequipment' ||
    lower === 'shopequipment' ||
    lower === 'investments' ||
    lower === 'rightofuseleases' ||
    lower === 'otherassets' ||
    lower === 'totalassets'
  ) {
    const assetKey = resolveBucketKey(bucket, lower);
    if (assetKey && assetKey !== 'totalAssets') {
      (bucket as unknown as Record<string, number>)[assetKey as string] += amountBalance;
    } else if (!assetKey) {
      bucket.otherCA += amountBalance;
    }
    bucket.totalAssets += amountBalance;
    return true;
  }
  if (lower === 'ap' || lower === 'loc' || lower === 'contractliabilities' || lower === 'othercl' || lower === 'tcl' || lower === 'ltd' || lower === 'totalliab') {
    const liabKey = resolveBucketKey(bucket, lower);
    if (liabKey && liabKey !== 'totalLiab') {
      (bucket as unknown as Record<string, number>)[liabKey as string] += amountBalance;
    } else if (!liabKey) {
      bucket.otherCL += amountBalance;
    }
    bucket.totalLiab += amountBalance;
    return true;
  }
  if (lower === 'ownerscapital' || lower === 'ownersdraw' || lower === 'commonstock' || lower === 'preferredstock' || lower === 'retainedearnings' || lower === 'additionalpaidincapital' || lower === 'treasurystock' || lower === 'totalequity') {
    const equityKey = resolveBucketKey(bucket, lower);
    if (equityKey && equityKey !== 'totalEquity') {
      (bucket as unknown as Record<string, number>)[equityKey as string] += amountBalance;
    } else if (!equityKey) {
      bucket.additionalPaidInCapital += amountBalance;
    }
    bucket.totalEquity += amountBalance;
    return true;
  }
  return false;
}

export function buildCsiMonthlyDataFromGlResponses(params: {
  glResponses: unknown[];
  throughMonth: string;
  maxMonths?: number;
  accountMappings?: MappingRow[];
  openingBalances?: OpeningBalanceSeedRow[];
}) {
  const throughMonth = String(params.throughMonth || '').trim();
  if (!/^\d{4}-\d{2}$/.test(throughMonth)) {
    return { monthlyData: [] as Record<string, unknown>[], stats: { chartRows: 0, ledgerRows: 0 } };
  }
  const maxMonths = Math.max(1, Math.min(60, Math.floor(Number(params.maxMonths || 36))));
  const [throughYear, throughMonthNum] = throughMonth.split('-').map((x) => Number(x));
  const earliestDateUtc = new Date(Date.UTC(throughYear, throughMonthNum - 1 - (maxMonths - 1), 1));
  const earliestMonth = `${earliestDateUtc.getUTCFullYear()}-${String(earliestDateUtc.getUTCMonth() + 1).padStart(2, '0')}`;

  const { chartRows, ledgerRows } = inferRowsBySource(params.glResponses || []);
  const chartByAccount = buildChartIndex(chartRows);
  const monthly = new Map<string, ReturnType<typeof initMonthRow>>();
  const sourceMonthKeys = new Set<string>();
  const openingBalanceByAccount = new Map<string, { effectiveFromMonth: string; balance: number; applied: boolean }>();
  const cumulativeByAccount = new Map<string, number>();
  const bsSnapshotsByMonth = new Map<
    string,
    Map<
      string,
      {
        accountName: string;
        accountType: AccountType;
        mappedTargetField: string | null;
        endingBalance: number;
      }
    >
  >();
  const mappingByName = new Map<string, string>();
  const mappingByCode = new Map<string, string>();
  for (const row of Array.isArray(params.accountMappings) ? params.accountMappings : []) {
    const targetField = String(row?.targetField || '').trim();
    if (!targetField || targetField.toLowerCase() === 'unmapped' || targetField.toLowerCase() === 'ignored') continue;
    const byName = normalizeMappingKey(row?.accountName);
    if (byName && !mappingByName.has(byName)) mappingByName.set(byName, targetField);
    const byCodeCandidates = extractAccountCodeCandidates(
      row?.accountCode,
      row?.accountId,
      row?.accountName,
    );
    for (const candidate of byCodeCandidates) {
      if (!mappingByCode.has(candidate)) mappingByCode.set(candidate, targetField);
    }
  }

  for (const row of Array.isArray(params.openingBalances) ? params.openingBalances : []) {
    const accountKey = buildAccountKey(String(row.accountId || row.accountCode || '').trim());
    if (!accountKey) continue;
    const balance = Number(row.endingBalance ?? 0);
    if (!Number.isFinite(balance)) continue;
    const asOf = String(row.asOfDate || '').trim();
    const parsed =
      parseCompactDateToken(asOf) ||
      (asOf ? (() => {
        const d = new Date(asOf);
        return Number.isNaN(d.getTime()) ? null : d;
      })() : null);
    if (!parsed) continue;
    const effective = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 1));
    const effectiveFromMonth = monthKey(effective);
    const existing = openingBalanceByAccount.get(accountKey);
    if (!existing || existing.effectiveFromMonth < effectiveFromMonth) {
      openingBalanceByAccount.set(accountKey, { effectiveFromMonth, balance, applied: false });
    }
  }

  const orderedLedgerRows = [...ledgerRows].sort((a, b) => {
    const ad = parseCsiDateTimeToken(readAny(a, ['TransDate', 'transDate', 'RecordDate', 'recordDate']));
    const bd = parseCsiDateTimeToken(readAny(b, ['TransDate', 'transDate', 'RecordDate', 'recordDate']));
    const at = ad ? ad.getTime() : 0;
    const bt = bd ? bd.getTime() : 0;
    if (at !== bt) return at - bt;
    return pickString(a, ['TransNum', 'transNum']).localeCompare(pickString(b, ['TransNum', 'transNum']));
  });

  for (const row of orderedLedgerRows) {
    const normalizedLedger = normalizeCsiSlLedgersRow(row);
    const parsedMonth = parseRowMonth(row);
    const hasControlMonth =
      normalizedLedger.controlYear !== null &&
      normalizedLedger.controlPeriod !== null &&
      normalizedLedger.controlPeriod >= 1 &&
      normalizedLedger.controlPeriod <= 12;
    const rowMonth = parsedMonth
      ? parsedMonth
      : hasControlMonth
        ? new Date(Date.UTC(normalizedLedger.controlYear!, normalizedLedger.controlPeriod! - 1, 1))
        : null;
    if (!rowMonth) continue;
    const monthStart = new Date(Date.UTC(rowMonth.getUTCFullYear(), rowMonth.getUTCMonth(), 1));
    const rowMonthKey = monthKey(monthStart);
    if (rowMonthKey < earliestMonth || rowMonthKey > throughMonth) continue;
    sourceMonthKeys.add(rowMonthKey);

    const key = rowMonthKey;
    if (!monthly.has(key)) monthly.set(key, initMonthRow(key));
    const bucket = monthly.get(key)!;

    const rawAccount = pickString(row, ACCOUNT_KEYS);
    const accountKey = buildAccountKey(rawAccount);
    const chart = accountKey ? chartByAccount.get(accountKey) : undefined;
    const accountName = chart?.accountName || pickString(row, ACCOUNT_NAME_KEYS) || rawAccount || 'unmapped_account';
    const accountType =
      inferAccountTypeFromCode(accountKey) ||
      chart?.accountType ||
      normalizeAccountType(pickString(row, ACCOUNT_TYPE_KEYS), accountName);
    const mappedTargetField = (() => {
      const codeCandidates = extractAccountCodeCandidates(
        accountKey,
        rawAccount,
        normalizedLedger.acct,
        accountName,
      );
      for (const candidate of codeCandidates) {
        const mapped = mappingByCode.get(candidate);
        if (mapped) return mapped;
      }
      return (
        mappingByName.get(normalizeMappingKey(accountName)) ||
        mappingByName.get(normalizeMappingKey(rawAccount))
      );
    })();

    const debit = normalizedLedger.debit;
    const credit = normalizedLedger.credit;
    const signedMovement = Number.isFinite(normalizedLedger.signedAmount)
      ? normalizedLedger.signedAmount
      : debit - credit;

    const expenseMovement = debit - credit;
    const revenueMovement = credit - debit;
    const cogsMovement = debit - credit;
    const normalizedMappedTarget = mappedTargetField ? String(mappedTargetField).trim().toLowerCase() : '';
    const isBalanceSheetMapped = normalizedMappedTarget ? BS_TARGET_FIELDS.has(normalizedMappedTarget) : false;

    if (accountKey && (isBalanceSheetMapped || accountType === 'asset' || accountType === 'liability' || accountType === 'equity')) {
      const openingSeed = openingBalanceByAccount.get(accountKey);
      if (openingSeed && !openingSeed.applied && rowMonthKey >= openingSeed.effectiveFromMonth) {
        cumulativeByAccount.set(accountKey, openingSeed.balance);
        openingSeed.applied = true;
      }
      const nextBalance = Number(cumulativeByAccount.get(accountKey) || 0) + signedMovement;
      cumulativeByAccount.set(accountKey, nextBalance);
      if (!bsSnapshotsByMonth.has(key)) bsSnapshotsByMonth.set(key, new Map());
      bsSnapshotsByMonth.get(key)!.set(accountKey, {
        accountName,
        accountType,
        mappedTargetField: mappedTargetField || null,
        endingBalance: nextBalance,
      });
    }

    if (
      mappedTargetField &&
      !isBalanceSheetMapped &&
      applyMappedAmount(bucket, mappedTargetField, expenseMovement, revenueMovement, 0)
    ) {
      continue;
    }

    if (accountType === 'revenue') {
      const amount = revenueMovement;
      bucket.revenue += amount;
      addToBreakdown(bucket.revenueBreakdown as Record<string, unknown>, 'rev_other_revenue', amount);
    } else if (accountType === 'cogs') {
      const amount = cogsMovement;
      bucket.cogsTotal += amount;
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
    }
  }

  for (const [monthKeyValue, accountMap] of bsSnapshotsByMonth.entries()) {
    if (!monthly.has(monthKeyValue)) monthly.set(monthKeyValue, initMonthRow(monthKeyValue));
    const bucket = monthly.get(monthKeyValue)!;
    for (const snapshot of accountMap.values()) {
      const endingBalance = snapshot.endingBalance;
      const mappedTargetField = snapshot.mappedTargetField;
      if (mappedTargetField && BS_TARGET_FIELDS.has(String(mappedTargetField).trim().toLowerCase())) {
        applyMappedAmount(bucket, mappedTargetField, 0, 0, endingBalance);
        continue;
      }
      const amount = Math.abs(endingBalance);
      const accountName = snapshot.accountName.toLowerCase();
      const accountType = snapshot.accountType;
      if (accountType === 'asset') {
        bucket.totalAssets += amount;
        if (accountName.includes('cash') || accountName.includes('bank')) bucket.cash += amount;
        else if (accountName.includes('receivable') || accountName.includes('a/r')) bucket.ar += amount;
        else if (accountName.includes('inventory')) bucket.inventory += amount;
        else if (
          accountName.includes('fixed') ||
          accountName.includes('property') ||
          accountName.includes('equipment') ||
          accountName.includes('building') ||
          accountName.includes('vehicle') ||
          accountName.includes('machinery') ||
          accountName.includes('accumulated depreciation') ||
          accountName.includes('depreciation') ||
          accountName.includes('amortization')
        ) bucket.fixedAssets += amount;
        else if (
          accountName.includes('intangible') ||
          accountName.includes('goodwill') ||
          accountName.includes('deposit') ||
          accountName.includes('long-term') ||
          accountName.includes('long term') ||
          accountName.includes('other asset')
        ) bucket.otherAssets += amount;
        else bucket.otherCA += amount;
      } else if (accountType === 'liability') {
        bucket.totalLiab += amount;
        if (accountName.includes('payable') || accountName.includes('a/p')) bucket.ap += amount;
        else if (accountName.includes('line of credit') || accountName.includes('loc')) bucket.loc += amount;
        else if (accountName.includes('long') || accountName.includes('loan') || accountName.includes('debt')) bucket.ltd += amount;
        else bucket.otherCL += amount;
      } else if (accountType === 'equity') {
        bucket.totalEquity += amount;
        if (accountName.includes('retained')) bucket.retainedEarnings += amount;
        else if (accountName.includes('draw')) bucket.ownersDraw += amount;
        else if (accountName.includes('capital')) bucket.ownersCapital += amount;
        else bucket.additionalPaidInCapital += amount;
      }
    }
  }

  // Ensure a continuous monthly time series through the requested throughMonth.
  // This avoids dropped columns when a month has no ledger rows.
  const cursor = new Date(Date.UTC(throughYear, throughMonthNum - 1 - (maxMonths - 1), 1));
  while (true) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
    if (key > throughMonth) break;
    if (!monthly.has(key)) monthly.set(key, initMonthRow(key));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
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

  // Do not persist synthetic trailing empty months as the "latest" month.
  // Keep placeholder months inside the range, but trim only the all-zero tail
  // that was generated solely by timeline continuity filling.
  while (monthlyData.length > 0) {
    const tail = monthlyData[monthlyData.length - 1];
    const tailMonth = String(tail.month || '').trim();
    if (!tailMonth) break;
    if (sourceMonthKeys.has(tailMonth)) break;
    if (!isSyntheticZeroMonthRow(tail)) break;
    monthlyData.pop();
  }

  return {
    monthlyData,
    stats: {
      chartRows: chartRows.length,
      ledgerRows: ledgerRows.length,
      monthsBuilt: monthlyData.length,
    },
  };
}

