import prisma from '@/lib/prisma';
import { rebuildDailyFinancialSnapshotsFromGL } from '@/lib/financial/daily-bs-from-gl';
import { addEstCalendarDays, formatEstDate, utcMidnightForEstDate } from '@/lib/time/eastern';

export const QBO_GL_SOURCE_PLATFORM = 'QUICKBOOKS_ONLINE';
export const QBO_DAILY_FINANCIALS_SOURCE_PLATFORM = 'QUICKBOOKS_ONLINE_GL_REBUILD';
export const QBO_GL_ANCHOR_SOURCE_PREFIX = 'QUICKBOOKS_ONLINE_BS_';

// QBO rejects report responses above ~400k cells; split a window before it gets close.
const QBO_REPORT_CELL_BUDGET = 300_000;
const GL_CHUNK_DAYS = 31;
const GL_INSERT_BATCH = 2_000;
const GL_COLUMNS = ['tx_date', 'txn_type', 'doc_num', 'name', 'memo', 'account_name', 'debt_amt', 'credit_amt'];

export type QboJsonRequest = (endpoint: string) => Promise<unknown>;

type QboAccount = {
  id: string;
  name: string;
  fullyQualifiedName: string;
  accountType: string | null;
  classification: string | null;
};

export type QboGlLine = {
  transDate: string;
  accountId: string;
  accountName: string;
  txnType: string;
  txnId: string;
  docNum: string;
  name: string;
  memo: string;
  debit: number;
  credit: number;
};

export type QboGeneralLedgerSyncResult = {
  anchorDate: string;
  anchorAccounts: number;
  glLines: number;
  glChunks: number;
  unresolvedAccountLines: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function parseMoney(value: unknown): number {
  const raw = text(value).replace(/[$,\s]/g, '');
  if (!raw) return 0;
  const negative = raw.startsWith('(') && raw.endsWith(')');
  const parsed = Number(negative ? raw.slice(1, -1) : raw);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function columnKeys(report: unknown): string[] {
  return asArray(asRecord(asRecord(report).Columns).Column).map((column) => {
    const record = asRecord(column);
    const colKey = asArray(record.MetaData)
      .map(asRecord)
      .find((meta) => text(meta.Name) === 'ColKey');
    return text(colKey?.Value) || text(record.ColType);
  });
}

async function fetchAccounts(request: QboJsonRequest): Promise<QboAccount[]> {
  const accounts: QboAccount[] = [];
  const pageSize = 1000;
  for (let start = 1; ; start += pageSize) {
    const query = `SELECT * FROM Account WHERE Active IN (true, false) STARTPOSITION ${start} MAXRESULTS ${pageSize}`;
    const response = asRecord(await request(`/query?query=${encodeURIComponent(query)}&minorversion=65`));
    const rows = asArray(asRecord(response.QueryResponse).Account).map(asRecord);
    for (const row of rows) {
      const id = text(row.Id);
      if (!id) continue;
      accounts.push({
        id,
        name: text(row.Name),
        fullyQualifiedName: text(row.FullyQualifiedName) || text(row.Name),
        accountType: text(row.AccountType) || null,
        classification: text(row.Classification) || null,
      });
    }
    if (rows.length < pageSize) break;
  }
  return accounts;
}

function isBalanceSheetClassification(classification: string | null): boolean {
  const value = (classification || '').toLowerCase();
  return value === 'asset' || value === 'liability' || value === 'equity';
}

/**
 * Per-account balances from a single-column QBO Balance Sheet, converted to
 * GL sign (debit positive). QBO reports liabilities and equity as positive
 * natural balances, so everything outside the TotalAssets section is negated.
 */
export function parseBalanceSheetAccountBalances(report: unknown): Map<string, { accountName: string; balance: number }> {
  const balances = new Map<string, { accountName: string; balance: number }>();
  const walk = (rows: unknown[], creditNormal: boolean) => {
    for (const rawRow of rows) {
      const row = asRecord(rawRow);
      const nested = asArray(asRecord(row.Rows).Row);
      if (nested.length) {
        const header = asArray(asRecord(row.Header).ColData).map(asRecord);
        const headerId = text(header[0]?.id);
        const headerValue = parseMoney(header[1]?.value);
        // Parent accounts with their own postings carry the parent balance on the header.
        if (headerId && header.length > 1 && text(header[1]?.value)) {
          balances.set(headerId, {
            accountName: text(header[0]?.value),
            balance: creditNormal ? -headerValue : headerValue,
          });
        }
        walk(nested, creditNormal);
        continue;
      }
      if (text(row.type) !== 'Data') continue;
      const cols = asArray(row.ColData).map(asRecord);
      const id = text(cols[0]?.id);
      if (!id) continue;
      const value = parseMoney(cols[cols.length - 1]?.value);
      balances.set(id, { accountName: text(cols[0]?.value), balance: creditNormal ? -value : value });
    }
  };
  for (const rawSection of asArray(asRecord(asRecord(report).Rows).Row)) {
    const section = asRecord(rawSection);
    const creditNormal = text(section.group) !== 'TotalAssets';
    walk([section], creditNormal);
  }
  return balances;
}

/**
 * Flattens a QBO GeneralLedger report into one line per posting. The report
 * nests postings under account sections (sub-accounts nest inside parents);
 * each posting belongs to its innermost section's account.
 */
export function parseGeneralLedgerReport(
  report: unknown,
  accountsByName: Map<string, QboAccount>
): { lines: QboGlLine[]; unresolved: number; cells: number } {
  const keys = columnKeys(report);
  const idx = (key: string) => keys.indexOf(key);
  const iDate = idx('tx_date');
  const iType = idx('txn_type');
  const iDoc = idx('doc_num');
  const iName = idx('name');
  const iMemo = idx('memo');
  const iAccount = idx('account_name');
  const iDebit = idx('debt_amt');
  const iCredit = idx('credit_amt');
  const lines: QboGlLine[] = [];
  let unresolved = 0;
  let cells = 0;

  const resolveAccount = (id: string, label: string): QboAccount | null => {
    if (id) return { id, name: label, fullyQualifiedName: label, accountType: null, classification: null };
    return accountsByName.get(normalizeName(label)) || null;
  };

  const walk = (rows: unknown[], sectionAccount: QboAccount | null) => {
    for (const rawRow of rows) {
      const row = asRecord(rawRow);
      const nested = asArray(asRecord(row.Rows).Row);
      if (nested.length || row.Header) {
        const header = asArray(asRecord(row.Header).ColData).map(asRecord);
        const label = text(header[0]?.value);
        const account = label ? resolveAccount(text(header[0]?.id), label) : null;
        walk(nested, account || sectionAccount);
        continue;
      }
      if (text(row.type) !== 'Data') continue;
      const cols = asArray(row.ColData).map(asRecord);
      cells += cols.length;
      const transDate = iDate >= 0 ? text(cols[iDate]?.value) : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(transDate)) continue;
      const debit = iDebit >= 0 ? parseMoney(cols[iDebit]?.value) : 0;
      const credit = iCredit >= 0 ? parseMoney(cols[iCredit]?.value) : 0;
      if (debit === 0 && credit === 0) continue;
      const accountLabel = iAccount >= 0 ? text(cols[iAccount]?.value) : '';
      const account =
        sectionAccount ||
        (accountLabel ? accountsByName.get(normalizeName(accountLabel)) || null : null);
      if (!account) {
        unresolved += 1;
        continue;
      }
      lines.push({
        transDate,
        accountId: account.id,
        accountName: account.fullyQualifiedName || accountLabel,
        txnType: iType >= 0 ? text(cols[iType]?.value) : '',
        txnId: iType >= 0 ? text(cols[iType]?.id) : '',
        docNum: iDoc >= 0 ? text(cols[iDoc]?.value) : '',
        name: iName >= 0 ? text(cols[iName]?.value) : '',
        memo: iMemo >= 0 ? text(cols[iMemo]?.value) : '',
        debit,
        credit,
      });
    }
  };
  walk(asArray(asRecord(asRecord(report).Rows).Row), null);
  return { lines, unresolved, cells };
}

async function fetchGeneralLedgerLines(
  request: QboJsonRequest,
  startYmd: string,
  endYmd: string,
  accountsByName: Map<string, QboAccount>
): Promise<{ lines: QboGlLine[]; unresolved: number; chunks: number }> {
  const query =
    `start_date=${startYmd}&end_date=${endYmd}&accounting_method=Accrual` +
    `&columns=${GL_COLUMNS.join(',')}&minorversion=65`;
  const report = await request(`/reports/GeneralLedger?${query}`);
  const parsed = parseGeneralLedgerReport(report, accountsByName);
  if (parsed.cells < QBO_REPORT_CELL_BUDGET || startYmd === endYmd) {
    return { lines: parsed.lines, unresolved: parsed.unresolved, chunks: 1 };
  }
  const spanDays = Math.round(
    (utcMidnightForEstDate(endYmd).getTime() - utcMidnightForEstDate(startYmd).getTime()) / 86_400_000
  );
  const midYmd = addEstCalendarDays(startYmd, Math.floor(spanDays / 2));
  const left = await fetchGeneralLedgerLines(request, startYmd, midYmd, accountsByName);
  const right = await fetchGeneralLedgerLines(request, addEstCalendarDays(midYmd, 1), endYmd, accountsByName);
  return {
    lines: [...left.lines, ...right.lines],
    unresolved: left.unresolved + right.unresolved,
    chunks: left.chunks + right.chunks,
  };
}

/**
 * Replaces QBO GL facts for [startYmd, endYmd] and pins per-account opening
 * balances at the day before the window, so the daily balance-sheet rebuild
 * only needs GL inside the window.
 */
export async function syncQuickBooksGeneralLedger(opts: {
  companyId: string;
  request: QboJsonRequest;
  startYmd: string;
  endYmd: string;
}): Promise<QboGeneralLedgerSyncResult> {
  const { companyId, request, startYmd, endYmd } = opts;
  const accounts = await fetchAccounts(request);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const accountsByName = new Map<string, QboAccount>();
  for (const account of accounts) {
    for (const label of [account.fullyQualifiedName, account.name]) {
      const key = normalizeName(label);
      if (key && !accountsByName.has(key)) accountsByName.set(key, account);
    }
  }

  const anchorYmd = addEstCalendarDays(startYmd, -1);
  const balanceSheet = await request(
    `/reports/BalanceSheet?start_date=${anchorYmd}&end_date=${anchorYmd}&accounting_method=Accrual&summarize_column_by=Total&minorversion=65`
  );
  const anchorBalances = parseBalanceSheetAccountBalances(balanceSheet);
  // Accounts absent from the report (zero balance, or opened later) still need
  // an anchor row, otherwise the rebuild ignores their GL activity in the window.
  for (const account of accounts) {
    if (!isBalanceSheetClassification(account.classification) || anchorBalances.has(account.id)) continue;
    anchorBalances.set(account.id, { accountName: account.fullyQualifiedName, balance: 0 });
  }

  const lineGroups: QboGlLine[] = [];
  let unresolvedAccountLines = 0;
  let glChunks = 0;
  for (let chunkStart = startYmd; chunkStart <= endYmd; chunkStart = addEstCalendarDays(chunkStart, GL_CHUNK_DAYS)) {
    const candidateEnd = addEstCalendarDays(chunkStart, GL_CHUNK_DAYS - 1);
    const chunkEnd = candidateEnd > endYmd ? endYmd : candidateEnd;
    const chunk = await fetchGeneralLedgerLines(request, chunkStart, chunkEnd, accountsByName);
    lineGroups.push(...chunk.lines);
    unresolvedAccountLines += chunk.unresolved;
    glChunks += chunk.chunks;
  }

  const sequenceByKey = new Map<string, number>();
  const glRows = lineGroups.map((line) => {
    const txnKey = `${line.txnType || 'Txn'}:${line.txnId || line.docNum || 'none'}`;
    const seqKey = `${line.transDate}|${line.accountId}|${txnKey}`;
    const seq = (sequenceByKey.get(seqKey) || 0) + 1;
    sequenceByKey.set(seqKey, seq);
    const account = accountsById.get(line.accountId);
    return {
      companyId,
      transDate: utcMidnightForEstDate(line.transDate),
      accountId: line.accountId,
      accountName: account?.fullyQualifiedName || line.accountName || null,
      accountType: account?.accountType || null,
      accountCategory: account?.classification || null,
      signedAmount: line.debit - line.credit,
      debitAmount: line.debit,
      creditAmount: line.credit,
      drCr: line.debit >= line.credit ? 'DR' : 'CR',
      transNum: `${txnKey}:${seq}`,
      ref: txnKey,
      description: [line.name, line.memo].filter(Boolean).join(' - ') || null,
      sourcePlatform: QBO_GL_SOURCE_PLATFORM,
      sourceProgram: 'GeneralLedger',
      sourceTransaction: line.txnType || null,
    };
  });

  const windowStart = utcMidnightForEstDate(startYmd);
  const windowEnd = utcMidnightForEstDate(endYmd);
  const anchorDate = utcMidnightForEstDate(anchorYmd);
  const anchorSource = `${QBO_GL_ANCHOR_SOURCE_PREFIX}${anchorYmd}`;

  await prisma.$transaction(async (tx) => {
    await tx.gLTransactionFact.deleteMany({
      where: {
        companyId,
        sourcePlatform: QBO_GL_SOURCE_PLATFORM,
        transDate: { gte: windowStart, lte: windowEnd },
      },
    });
    for (let offset = 0; offset < glRows.length; offset += GL_INSERT_BATCH) {
      await tx.gLTransactionFact.createMany({
        data: glRows.slice(offset, offset + GL_INSERT_BATCH),
        skipDuplicates: true,
      });
    }
    // Anchors inside the window were built from GL that has just been replaced.
    await tx.balanceSheetAccountAnchor.deleteMany({
      where: {
        companyId,
        source: { startsWith: QBO_GL_ANCHOR_SOURCE_PREFIX },
        anchorDate: { gte: anchorDate, lte: windowEnd },
      },
    });
    await tx.balanceSheetAccountAnchor.createMany({
      data: Array.from(anchorBalances.entries()).map(([accountId, entry]) => ({
        companyId,
        anchorDate,
        accountId,
        accountName: accountsById.get(accountId)?.fullyQualifiedName || entry.accountName || null,
        openingBalance: entry.balance,
        source: anchorSource,
      })),
      skipDuplicates: true,
    });
  }, { timeout: 120_000 });

  return {
    anchorDate: anchorYmd,
    anchorAccounts: anchorBalances.size,
    glLines: glRows.length,
    glChunks,
    unresolvedAccountLines,
  };
}

export type QboDailyFinancialsSyncResult = QboGeneralLedgerSyncResult & {
  startDate: string;
  endDate: string;
  datesProcessed: number;
  snapshotsWritten: number;
  mappedAccountCount: number;
};

/**
 * Pulls the QBO general ledger for an EST calendar window and rebuilds
 * DailyFinancialSnapshot rows (P&L activity + balance sheet) from it.
 * MonthlyFinancial is not touched; the monthly QBO reports stay authoritative.
 */
export async function syncQuickBooksDailyFinancialsFromGL(opts: {
  companyId: string;
  request: QboJsonRequest;
  startYmd: string;
  endYmd: string;
}): Promise<QboDailyFinancialsSyncResult> {
  const today = formatEstDate();
  const endYmd = opts.endYmd > today ? today : opts.endYmd;
  if (opts.startYmd > endYmd) {
    throw new Error(`QBO daily financials window is empty (${opts.startYmd} to ${endYmd}).`);
  }
  const gl = await syncQuickBooksGeneralLedger({ ...opts, endYmd });
  const rebuilt = await rebuildDailyFinancialSnapshotsFromGL({
    companyId: opts.companyId,
    startDate: utcMidnightForEstDate(opts.startYmd),
    endDate: utcMidnightForEstDate(endYmd),
    frequency: 'daily',
    pnlUpdateMode: 'overwrite',
    sourcePlatform: QBO_DAILY_FINANCIALS_SOURCE_PLATFORM,
  });
  return {
    ...gl,
    startDate: opts.startYmd,
    endDate: endYmd,
    datesProcessed: rebuilt.datesProcessed,
    snapshotsWritten: rebuilt.rowsWritten,
    mappedAccountCount: rebuilt.mappedAccountCount,
  };
}
