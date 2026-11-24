import prisma from '@/lib/prisma';
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
  /** False when the books do not carry both sides of each transaction (only QuickBooks Online does today). */
  supported: boolean;
  adjustments: BookDepositAdjustment[];
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

/**
 * Reads every deposit into the proof's bank accounts from the General Ledger and classifies it by
 * the other side of its transaction: money from another company account, a loan, the owner, sales tax,
 * and so on. Expense lines inside a deposit are fees the processor netted before paying it out.
 */
export async function loadBookDepositAdjustments(
  companyId: string,
  accounts: Array<{ id: string; sourceAccountId: string | null }>,
  startDate: string,
  endDate: string,
): Promise<BookDepositClassification> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { accountingSystem: true } });
  if (String(company?.accountingSystem || '').toUpperCase() !== 'QUICKBOOKS') return { supported: false, adjustments: [] };

  const accountIdBySource = new Map<string, string>();
  for (const a of accounts) {
    const source = String(a.sourceAccountId || '').trim();
    if (source && !accountIdBySource.has(source)) accountIdBySource.set(source, a.id);
  }
  if (accountIdBySource.size === 0) return { supported: true, adjustments: [] };
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
  const deposits = new Map<string, { bankSourceId: string; date: string; type: string; description: string; bankLines: Map<string, number>; offsets: Map<string, Row> }>();
  for (const r of rows) {
    const key = `${r.bankSourceId}|${r.txn}`;
    const d = deposits.get(key) ?? {
      bankSourceId: r.bankSourceId,
      date: r.transDate.toISOString().slice(0, 10),
      type: String(r.txnType || '').trim(),
      description: String(r.description || '').trim(),
      bankLines: new Map<string, number>(),
      offsets: new Map<string, Row>(),
    };
    d.bankLines.set(r.bankLineId, Number(r.depositAmount) || 0);
    d.offsets.set(r.offsetLineId, r);
    deposits.set(key, d);
  }

  const proofSourceIds = new Set(sourceIds);
  const byKey = new Map<string, BookDepositAdjustment>();
  const add = (bankAccountId: string, month: string, category: RevenueAdjustmentCategory, amount: number, t: BookDepositTransaction) => {
    if (amount < 0.005) return;
    const key = `${bankAccountId}|${month}|${category}`;
    const a = byKey.get(key) ?? { bankAccountId, month, category, amount: 0, transactions: [] };
    a.amount += amount;
    a.transactions.push(t);
    byKey.set(key, a);
  };

  for (const d of deposits.values()) {
    const bankAccountId = accountIdBySource.get(d.bankSourceId)!;
    const month = d.date.slice(0, 7);
    const deposit = [...d.bankLines.values()].reduce((s, v) => s + v, 0);
    const credits: Array<{ category: RevenueAdjustmentCategory; amount: number; account: string }> = [];
    let fees = 0;
    let feeAccount = '';
    for (const o of d.offsets.values()) {
      const amount = Number(o.offsetAmount) || 0;
      const offset = {
        accountId: o.offsetAccountId,
        name: String(o.offsetAccountName || o.offsetAccountId),
        type: String(o.offsetAccountType || '').trim().toLowerCase(),
        category: String(o.offsetCategory || '').trim().toLowerCase(),
      };
      if (amount < 0) {
        const category = classifyCredit(offset, proofSourceIds);
        if (category) credits.push({ category, amount: -amount, account: offset.name });
      } else if (amount > 0 && EXPENSE_TYPES.has(offset.type)) {
        fees += amount;
        feeAccount = feeAccount || offset.name;
      }
    }
    // Non-revenue cannot exceed what reached the bank plus the fees netted from it.
    const cap = deposit + fees;
    const nonRevenue = credits.reduce((s, c) => s + c.amount, 0);
    const scale = nonRevenue > cap && nonRevenue > 0 ? cap / nonRevenue : 1;
    for (const c of credits) {
      const amount = round2(c.amount * scale);
      add(bankAccountId, month, c.category, amount, { date: d.date, type: d.type, description: d.description, offsetAccount: c.account, amount });
    }
    if (fees > 0) {
      add(bankAccountId, month, 'PROCESSOR_FEES', round2(fees), {
        date: d.date,
        type: d.type,
        description: d.description,
        offsetAccount: feeAccount,
        amount: round2(fees),
      });
    }
  }

  const adjustments = [...byKey.values()]
    .map((a) => ({ ...a, amount: round2(a.amount), transactions: a.transactions.sort((x, y) => x.date.localeCompare(y.date)) }))
    .filter((a) => REVENUE_ADJUSTMENT_CATEGORIES[a.category])
    .sort((a, b) => a.month.localeCompare(b.month) || a.bankAccountId.localeCompare(b.bankAccountId) || a.category.localeCompare(b.category));
  return { supported: true, adjustments };
}
