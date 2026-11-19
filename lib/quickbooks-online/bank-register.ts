import prisma from '@/lib/prisma';
import {
  buildAccountIdToTarget,
  resolveDfsColumnsForTargetField,
  type AccountMappingRow,
} from '@/lib/financial/daily-bs-from-gl';
import { displayAccountName } from '@/lib/financial/daily-account-detail';
import {
  buildBankRegister,
  resolveBankRegisterSelection,
  type BankRegister,
  type BankRegisterAccount,
} from '@/lib/financial/bank-register';
import { QBO_GL_SOURCE_PLATFORM } from '@/lib/quickbooks-online/general-ledger-sync';
import { addEstCalendarDays, utcMidnightForEstDate } from '@/lib/time/eastern';

/**
 * QuickBooks Online bank register from the stored General Ledger postings and
 * per-account opening balances (the same books Daily Financials uses).
 * Bank accounts are the accounts mapped to the Cash line.
 */
export async function loadQboBankRegister(
  companyId: string,
  requestedAccountKey: string | null,
  startDate: string,
  endDate: string,
): Promise<BankRegister | null> {
  const mappings = (await prisma.accountMapping.findMany({
    where: { companyId, targetField: { notIn: ['', 'unmapped', 'UNMAPPED', 'ignored', 'IGNORED'] } },
    select: { accountName: true, accountId: true, accountCode: true, accountClassification: true, targetField: true },
  })) as AccountMappingRow[];
  const accountIdToTarget = buildAccountIdToTarget(mappings);
  if (!accountIdToTarget.size) return null;
  const accountCodeById = new Map<string, string>();
  for (const mapping of mappings) {
    const id = String(mapping.accountId || '').trim();
    const code = String(mapping.accountCode || '').trim();
    if (id && code && code !== id) accountCodeById.set(id, code);
  }

  const anchorAccounts = await prisma.$queryRaw<Array<{ accountId: string; accountName: string | null; accountCode: string | null }>>`
    SELECT DISTINCT ON ("accountId") "accountId", "accountName", "accountCode"
    FROM "BalanceSheetAccountAnchor"
    WHERE "companyId" = ${companyId}
    ORDER BY "accountId", "anchorDate" DESC
  `;
  const isCash = (...candidates: Array<string | null | undefined>) => {
    for (const candidate of candidates) {
      const target = accountIdToTarget.get(String(candidate || '').trim());
      if (target) return resolveDfsColumnsForTargetField(target.targetField).includes('cash');
    }
    return false;
  };
  const accounts: BankRegisterAccount[] = anchorAccounts
    .filter((row) => isCash(row.accountId, row.accountCode, row.accountName))
    .map((row) => ({
      key: row.accountId,
      name: displayAccountName(String(row.accountName || row.accountId), accountCodeById.get(row.accountId) || row.accountCode),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!accounts.length) return null;

  const { accountKey, keys } = resolveBankRegisterSelection(accounts, requestedAccountKey);
  const nameByKey = new Map(accounts.map((account) => [account.key, account.name]));

  const balanceThrough = async (dateKey: string) => {
    const through = utcMidnightForEstDate(dateKey);
    const [row] = await prisma.$queryRaw<Array<{ balance: number | null }>>`
      WITH anchors AS (
        SELECT DISTINCT ON ("accountId") "accountId", "anchorDate", "openingBalance"
        FROM "BalanceSheetAccountAnchor"
        WHERE "companyId" = ${companyId}
          AND "accountId" = ANY(${keys}::text[])
          AND "anchorDate" <= ${through}
        ORDER BY "accountId", "anchorDate" DESC
      )
      SELECT (
        COALESCE((SELECT SUM("openingBalance") FROM anchors), 0) +
        COALESCE((
          SELECT SUM(g."signedAmount")
          FROM "GLTransactionFact" g
          JOIN anchors a ON a."accountId" = g."accountId"
          WHERE g."companyId" = ${companyId}
            AND g."sourcePlatform" = ${QBO_GL_SOURCE_PLATFORM}
            AND g."transDate" > a."anchorDate"
            AND g."transDate" <= ${through}
        ), 0)
      )::float AS balance
    `;
    return Number(row?.balance) || 0;
  };

  const [beginningBalance, ledgerEndingBalance, glRows] = await Promise.all([
    balanceThrough(addEstCalendarDays(startDate, -1)),
    balanceThrough(endDate),
    prisma.gLTransactionFact.findMany({
      where: {
        companyId,
        sourcePlatform: QBO_GL_SOURCE_PLATFORM,
        accountId: { in: keys },
        transDate: { gte: utcMidnightForEstDate(startDate), lte: utcMidnightForEstDate(endDate) },
      },
      select: { transDate: true, accountId: true, signedAmount: true, ref: true, description: true, sourceTransaction: true },
      orderBy: [{ transDate: 'asc' }, { transNum: 'asc' }],
    }),
  ]);

  return buildBankRegister({
    accounts,
    accountKey,
    startDate,
    endDate,
    beginningBalance,
    ledgerEndingBalance,
    lines: glRows.map((row) => {
      const type = String(row.sourceTransaction || '').trim();
      const ref = String(row.ref || '').trim();
      // Older syncs stored the internal "Type:Id" key here instead of the document number.
      const num = ref.startsWith(`${type || 'Txn'}:`) ? '' : ref;
      return {
        date: row.transDate.toISOString().slice(0, 10),
        accountName: nameByKey.get(row.accountId) || row.accountId,
        type,
        num,
        description: String(row.description || '').trim(),
        amount: Number(row.signedAmount) || 0,
      };
    }),
  });
}
