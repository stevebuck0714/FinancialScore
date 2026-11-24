import prisma from '@/lib/prisma';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';
import { loadQbdAccountRows, loadQbdGeneralLedgerDetailRows, type QbdGlDetailRow } from '@/lib/quickbooks-desktop/account-books';
import { buildQbdAccountMap, qbdAccountKey } from '@/lib/real-estate/qbd-account-lines';
import { QBO_GL_SOURCE_PLATFORM } from '@/lib/quickbooks-online/general-ledger-sync';
import { utcMidnightForEstDate } from '@/lib/time/eastern';
import { REVENUE_ADJUSTMENT_CATEGORIES, type RevenueAdjustmentCategory } from './revenue-reconciliation';

export type BookDepositTransaction = {
  date: string;
  type: string;
  description: string;
  offsetAccount: string;
  amount: number;
};

/** Non-revenue deposits and netted fees for one account-month and category, read from the books. */
export type BookDepositAdjustment = {
  bankAccountId: string;
  month: string;
  category: RevenueAdjustmentCategory;
  amount: number;
  transactions: BookDepositTransaction[];
};

export type BookDepositClassification = {
  /** False when the books do not show the other side of each deposit (QuickBooks Online and Desktop do). */
  supported: boolean;
  adjustments: BookDepositAdjustment[];
  /** `bankAccountId|month` keys with at least one deposit in the books. */
  covered: string[];
};

type Row = {
  bankSourceId: string;
  txn: string;
  bankLineId: string;
  transDate: Date;
  depositAmount: number;
  txnType: string | null;
  description: string | null;
  offsetLineId: string;
  offsetAccountId: string;
  offsetAccountName: string | null;
  offsetAccountType: string | null;
  offsetCategory: string | null;
  offsetAmount: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const CASH_ON_HAND = /cash on hand|cash in safe|\bsafe\b|drawer|register|petty cash|undeposited|\btill\b/i;
const EXPENSE_TYPES = new Set(['expense', 'cost of goods sold', 'other expense']);

/**
 * What the account a deposit was posted against says about the money.
 * Null means a customer receipt (income, receivables, undeposited funds, cash on hand).
 */
function classifyCredit(
  offset: { accountId: string; name: string; type: string; category: string },
  proofSourceIds: Set<string>,
): RevenueAdjustmentCategory | null {
  const { name, type, category } = offset;
  if (CASH_ON_HAND.test(name)) return null;
  if (proofSourceIds.has(offset.accountId)) return 'TRANSFER_IN';
  switch (type) {
    case 'bank':
      return 'TRANSFER_IN';
    case 'income':
    case 'accounts receivable':
      return null;
    case 'other income':
      return 'OTHER_INCOME';
    case 'equity':
      return 'OWNER_CONTRIBUTION';
    case 'long term liability':
      return 'LOAN_PROCEEDS';
    case 'other current liability':
      if (/sales tax|tax payable|\bgst\b|\bhst\b|\bvat\b/i.test(name)) return 'SALES_TAX';
      if (/loan|line of credit|\bloc\b|note payable|eidl|\bppp\b|advance|financ/i.test(name)) return 'LOAN_PROCEEDS';
      if (/payroll|escrow|trust|client funds/i.test(name)) return 'CUSTOMER_FUNDS';
      if (/gift card|customer deposit|deferred|unearned/i.test(name)) return null;
      return 'OTHER_NON_REVENUE';
    case 'fixed asset':
    case 'other asset':
      return 'ASSET_SALE';
    case 'other current asset':
      if (/loan|note receivable|due from|shareholder|officer|owner|employee advance/i.test(name)) return 'OTHER_NON_REVENUE';
      return null;
    case 'credit card':
    case 'accounts payable':
    case 'expense':
    case 'cost of goods sold':
    case 'other expense':
      return 'REFUND_REBATE';
  }
  if (category === 'equity') return 'OWNER_CONTRIBUTION';
  if (category === 'liability') return 'OTHER_NON_REVENUE';
  return null;
}

type Offset = { accountId: string; name: string; type: string; category: string; amount: number };
type Deposit = { bankAccountId: string; date: string; type: string; description: string; amount: number; offsets: Offset[] };

/** Classifies each deposit by its offsetting lines; credits are the money's source, expense debits are netted fees. */
function adjustmentsFromDeposits(deposits: Deposit[], proofIds: Set<string>): BookDepositClassification {
  const byKey = new Map<string, BookDepositAdjustment>();
  const add = (bankAccountId: string, month: string, category: RevenueAdjustmentCategory, amount: number, t: BookDepositTransaction) => {
    if (amount < 0.005) return;
    const key = `${bankAccountId}|${month}|${category}`;
    const a = byKey.get(key) ?? { bankAccountId, month, category, amount: 0, transactions: [] };
    a.amount += amount;
    a.transactions.push(t);
    byKey.set(key, a);
  };

  for (const d of deposits) {
    const month = d.date.slice(0, 7);
    const credits: Array<{ category: RevenueAdjustmentCategory; amount: number; account: string }> = [];
    let fees = 0;
    let feeAccount = '';
    for (const o of d.offsets) {
      if (o.amount < 0) {
        const category = classifyCredit(o, proofIds);
        if (category) credits.push({ category, amount: -o.amount, account: o.name });
      } else if (o.amount > 0 && EXPENSE_TYPES.has(o.type)) {
        fees += o.amount;
        feeAccount = feeAccount || o.name;
      }
    }
    // Non-revenue cannot exceed what reached the bank plus the fees netted from it.
    const cap = d.amount + fees;
    const nonRevenue = credits.reduce((s, c) => s + c.amount, 0);
    const scale = nonRevenue > cap && nonRevenue > 0 ? cap / nonRevenue : 1;
    const base = { date: d.date, type: d.type, description: d.description };
    for (const c of credits) {
      const amount = round2(c.amount * scale);
      add(d.bankAccountId, month, c.category, amount, { ...base, offsetAccount: c.account, amount });
    }
    if (fees > 0) add(d.bankAccountId, month, 'PROCESSOR_FEES', round2(fees), { ...base, offsetAccount: feeAccount, amount: round2(fees) });
  }

  const adjustments = [...byKey.values()]
    .map((a) => ({ ...a, amount: round2(a.amount), transactions: a.transactions.sort((x, y) => x.date.localeCompare(y.date)) }))
    .filter((a) => REVENUE_ADJUSTMENT_CATEGORIES[a.category])
    .sort((a, b) => a.month.localeCompare(b.month) || a.bankAccountId.localeCompare(b.bankAccountId) || a.category.localeCompare(b.category));
  const covered = [...new Set(deposits.map((d) => `${d.bankAccountId}|${d.date.slice(0, 7)}`))];
  return { supported: true, adjustments, covered };
}

type ProofAccount = { id: string; accountName: string; sourceAccountId: string | null };

/**
 * Reads every deposit into the proof's bank accounts from the General Ledger and classifies it by
 * the other side of its transaction: money from another company account, a loan, the owner, sales tax,
 * and so on. Expense lines inside a deposit are fees the processor netted before paying it out.
 */
export async function loadBookDepositAdjustments(
  companyId: string,
  accounts: ProofAccount[],
  startDate: string,
  endDate: string,
): Promise<BookDepositClassification> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { accountingSystem: true } });
  const system = String(company?.accountingSystem || '').toUpperCase();
  if (isQuickBooksDesktopFamily(company?.accountingSystem)) return loadQbdDeposits(companyId, accounts, startDate, endDate);
  if (system !== 'QUICKBOOKS') return { supported: false, adjustments: [], covered: [] };
  return loadQboDeposits(companyId, accounts, startDate, endDate);
}

async function loadQboDeposits(companyId: string, accounts: ProofAccount[], startDate: string, endDate: string): Promise<BookDepositClassification> {
  const accountIdBySource = new Map<string, string>();
  for (const a of accounts) {
    const source = String(a.sourceAccountId || '').trim();
    if (source && !accountIdBySource.has(source)) accountIdBySource.set(source, a.id);
  }
  if (accountIdBySource.size === 0) return { supported: true, adjustments: [], covered: [] };
  const sourceIds = [...accountIdBySource.keys()];
  const start = utcMidnightForEstDate(startDate);
  const end = utcMidnightForEstDate(endDate);

  const rows = await prisma.$queryRaw<Row[]>`
    WITH bank AS (
      SELECT id, "accountId", "transDate", "signedAmount", "sourceTransaction", description,
             regexp_replace("transNum", ':[0-9]+$', '') AS txn
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND "sourcePlatform" = ${QBO_GL_SOURCE_PLATFORM}
        AND "accountId" = ANY(${sourceIds}::text[])
        AND "transDate" >= ${start} AND "transDate" <= ${end}
        AND "signedAmount" > 0
        AND "transNum" IS NOT NULL
    )
    SELECT b."accountId" AS "bankSourceId", b.txn, b.id AS "bankLineId", b."transDate",
           b."signedAmount" AS "depositAmount", b."sourceTransaction" AS "txnType", b.description,
           o.id AS "offsetLineId", o."accountId" AS "offsetAccountId", o."accountName" AS "offsetAccountName",
           o."accountType" AS "offsetAccountType", o."accountCategory" AS "offsetCategory", o."signedAmount" AS "offsetAmount"
    FROM bank b
    JOIN "GLTransactionFact" o
      ON o."companyId" = ${companyId}
     AND o."sourcePlatform" = ${QBO_GL_SOURCE_PLATFORM}
     AND o."transDate" = b."transDate"
     AND o."accountId" <> b."accountId"
     AND regexp_replace(o."transNum", ':[0-9]+$', '') = b.txn
    WHERE b.txn NOT LIKE '%:none'
  `;

  // One deposit per transaction and account; a deposit can carry several offsetting lines.
  const grouped = new Map<string, { first: Row; bankLines: Map<string, number>; offsets: Map<string, Row> }>();
  for (const r of rows) {
    const key = `${r.bankSourceId}|${r.txn}`;
    const g = grouped.get(key) ?? { first: r, bankLines: new Map<string, number>(), offsets: new Map<string, Row>() };
    g.bankLines.set(r.bankLineId, Number(r.depositAmount) || 0);
    g.offsets.set(r.offsetLineId, r);
    grouped.set(key, g);
  }
  const deposits: Deposit[] = [...grouped.values()].map(({ first, bankLines, offsets }) => ({
    bankAccountId: accountIdBySource.get(first.bankSourceId)!,
    date: first.transDate.toISOString().slice(0, 10),
    type: String(first.txnType || '').trim(),
    description: String(first.description || '').trim(),
    amount: [...bankLines.values()].reduce((s, v) => s + v, 0),
    offsets: [...offsets.values()].map((o) => ({
      accountId: o.offsetAccountId,
      name: String(o.offsetAccountName || o.offsetAccountId),
      type: String(o.offsetAccountType || '').trim().toLowerCase(),
      category: String(o.offsetCategory || '').trim().toLowerCase(),
      amount: Number(o.offsetAmount) || 0,
    })),
  }));
  return adjustmentsFromDeposits(deposits, new Set(sourceIds));
}

/** QuickBooks Desktop account types, in the wording the QuickBooks Online rules use. */
const QBD_TYPES: Record<string, string> = {
  bank: 'bank',
  accountsreceivable: 'accounts receivable',
  othercurrentasset: 'other current asset',
  fixedasset: 'fixed asset',
  otherasset: 'other asset',
  accountspayable: 'accounts payable',
  creditcard: 'credit card',
  othercurrentliability: 'other current liability',
  longtermliability: 'long term liability',
  equity: 'equity',
  income: 'income',
  costofgoodssold: 'cost of goods sold',
  expense: 'expense',
  otherincome: 'other income',
  otherexpense: 'other expense',
};

/**
 * QuickBooks Desktop report rows carry no transaction id. A two-line deposit names its other account in
 * the Split column; a "-SPLIT-" deposit is joined to the other rows with the same date, type, number, and
 * name, and only used when exactly one deposit has that signature and its lines balance.
 */
async function loadQbdDeposits(companyId: string, accounts: ProofAccount[], startDate: string, endDate: string): Promise<BookDepositClassification> {
  const [accountRows, detailRows] = await Promise.all([
    loadQbdAccountRows(companyId),
    loadQbdGeneralLedgerDetailRows(companyId, startDate, endDate),
  ]);
  const qbdAccounts = buildQbdAccountMap(accountRows);
  const list = [...qbdAccounts.values()];
  const proofIdByKey = new Map<string, string>();
  for (const a of accounts) {
    const source = String(a.sourceAccountId || '').trim();
    const match =
      (source && list.find((q) => q.listId === source || q.accountNumber === source)) || qbdAccounts.get(qbdAccountKey(a.accountName));
    if (match && !proofIdByKey.has(match.key)) proofIdByKey.set(match.key, a.id);
  }
  if (proofIdByKey.size === 0) return { supported: true, adjustments: [], covered: [] };

  const offsetFor = (accountName: string, amount: number): Offset => {
    const key = qbdAccountKey(accountName);
    const account = qbdAccounts.get(key);
    const type = account ? QBD_TYPES[account.type] ?? account.type : '';
    return { accountId: key, name: account?.fullName || accountName, type, category: '', amount };
  };
  const signature = (r: QbdGlDetailRow) => `${r.txnDate}|${r.txnType}|${r.num}|${r.name}`;
  const rowsBySignature = new Map<string, QbdGlDetailRow[]>();
  for (const r of detailRows) rowsBySignature.set(signature(r), [...(rowsBySignature.get(signature(r)) ?? []), r]);

  const deposits: Deposit[] = [];
  for (const r of detailRows) {
    const bankAccountId = proofIdByKey.get(qbdAccountKey(r.account));
    if (!bankAccountId || r.amount <= 0) continue;
    const base = { bankAccountId, date: r.txnDate, type: r.txnType, description: [r.name, r.memo].filter(Boolean).join(' - '), amount: r.amount };
    if (r.split && r.split !== '-SPLIT-') {
      deposits.push({ ...base, offsets: [offsetFor(r.split, -r.amount)] });
      continue;
    }
    const group = rowsBySignature.get(signature(r)) ?? [];
    const sameAccount = group.filter((g) => qbdAccountKey(g.account) === qbdAccountKey(r.account));
    const others = group.filter((g) => qbdAccountKey(g.account) !== qbdAccountKey(r.account));
    const balances = Math.abs(others.reduce((s, g) => s + g.amount, 0) + r.amount) <= 0.01;
    deposits.push({ ...base, offsets: sameAccount.length === 1 && balances ? others.map((g) => offsetFor(g.account, g.amount)) : [] });
  }
  return adjustmentsFromDeposits(deposits, new Set(proofIdByKey.keys()));
}
