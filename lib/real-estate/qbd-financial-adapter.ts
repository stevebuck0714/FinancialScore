import prisma from '@/lib/prisma';
import {
  QBD_ACCOUNT_TYPE_LABEL,
  buildQbdAccountLines,
  buildQbdAccountMap,
  pickLatestQbdBalanceSheet,
} from '@/lib/real-estate/qbd-account-lines';
import { loadQbdAccountRows, loadQbdBalanceSheetRows, loadQbdGeneralLedgerRows } from '@/lib/quickbooks-desktop/account-books';

/**
 * Mirrors QuickBooks Desktop account-level books into the real-estate
 * reporting ledger as sourceEntity 'QBD' (legal entity BGAH). Runs only for
 * companies that already use the real-estate module. QuickBooks data is never
 * modified; the QBD lines are fully replaced on every run.
 */

async function isRealEstateCompany(companyId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
    `SELECT (
       (to_regclass('"RealEstateFinancialLine"') IS NOT NULL AND EXISTS (SELECT 1 FROM "RealEstateFinancialLine" WHERE "companyId"=$1 AND "sourceEntity"<>'QBD'))
       OR (to_regclass('"RealEstateInvestor"') IS NOT NULL AND EXISTS (SELECT 1 FROM "RealEstateInvestor" WHERE "companyId"=$1))
     ) AS found`,
    companyId,
  ).catch(() => [{ found: false }]);
  return Boolean(rows[0]?.found);
}

export async function syncQbdAccountLinesToRealEstate(companyId: string) {
  if (!(await isRealEstateCompany(companyId))) return { mirrored: 0, skipped: 'not_real_estate' };
  const [accountRows, balanceSheetRows, glRows] = await Promise.all([
    loadQbdAccountRows(companyId),
    loadQbdBalanceSheetRows(companyId),
    loadQbdGeneralLedgerRows(companyId),
  ]);
  const accounts = buildQbdAccountMap(accountRows);
  const balanceSheet = pickLatestQbdBalanceSheet(balanceSheetRows);
  if (!balanceSheet || !accounts.size) return { mirrored: 0, skipped: 'no_balance_sheet' };
  const { asOf, firstMonth, lastMonth, lines, unresolvedGlRows } = buildQbdAccountLines(accounts, balanceSheet, glRows);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`DELETE FROM "RealEstateFinancialLine" WHERE "companyId"=$1 AND "sourceEntity"='QBD'`, companyId);
    const chunkSize = 400;
    for (let start = 0; start < lines.length; start += chunkSize) {
      const params: unknown[] = [companyId];
      const values = lines.slice(start, start + chunkSize).map((line) => {
        const base = params.length;
        params.push(line.reportType, line.periodEnd, line.account.code, line.account.fullName, QBD_ACCOUNT_TYPE_LABEL[line.account.type] || line.account.type, line.amount);
        return `(gen_random_uuid()::text,$1,'QBD','BGAH',$${base + 1},$${base + 2}::date,$${base + 3},$${base + 4},$${base + 5},$${base + 3},$${base + 6},'QuickBooks Desktop','account-mirror',NOW())`;
      });
      await tx.$executeRawUnsafe(
        `INSERT INTO "RealEstateFinancialLine"
          ("id","companyId","sourceEntity","legalEntity","reportType","periodEnd","accountCode","accountName","accountType","canonicalAccountCode","amount","sourceFileName","sourceSheetName","updatedAt")
         VALUES ${values.join(',')}
         ON CONFLICT ("companyId","sourceEntity","reportType","periodEnd","accountCode") DO UPDATE SET
           "accountName"=EXCLUDED."accountName","accountType"=EXCLUDED."accountType","amount"=EXCLUDED."amount","updatedAt"=NOW()`,
        ...params,
      );
    }
  }, { timeout: 120000 });
  return { mirrored: lines.length, asOf, firstMonth, lastMonth, unresolvedGlRows: unresolvedGlRows.length };
}
