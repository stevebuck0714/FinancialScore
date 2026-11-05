import prisma from '@/lib/prisma';

const FINANCIAL_FIELDS = [
  { key: 'revenue', reportType: 'ACTIVITY', accountType: 'Income', accountName: 'QuickBooks revenue' },
  { key: 'expense', reportType: 'ACTIVITY', accountType: 'Expense', accountName: 'QuickBooks operating expense' },
  { key: 'depreciationAmortization', reportType: 'ACTIVITY', accountType: 'Expense', accountName: 'QuickBooks depreciation and amortization' },
  { key: 'fixedAssets', reportType: 'BALANCE', accountType: 'Fixed Asset', accountName: 'QuickBooks fixed assets' },
  { key: 'totalAssets', reportType: 'BALANCE', accountType: 'Other Asset', accountName: 'QuickBooks total assets' },
  { key: 'totalEquity', reportType: 'BALANCE', accountType: 'Equity', accountName: 'QuickBooks total equity' },
] as const;

async function ensureFinancialLineTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateFinancialLine" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, "companyId" TEXT NOT NULL,
      "sourceEntity" TEXT NOT NULL, "legalEntity" TEXT, "reportType" TEXT NOT NULL, "periodEnd" DATE NOT NULL,
      "accountCode" TEXT NOT NULL, "accountName" TEXT NOT NULL, "accountType" TEXT NOT NULL,
      "canonicalAccountCode" TEXT, "amount" NUMERIC(18,2) NOT NULL, "sourceFileName" TEXT,
      "sourceSheetName" TEXT, "sourceRowNumber" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("companyId","sourceEntity","reportType","periodEnd","accountCode")
    )
  `);
}

/**
 * Mirrors canonical QBD monthly values into the real-estate reporting ledger.
 * This does not create fixed assets or modify QBD/accounting data; it only
 * provides company-scoped book evidence with QBD provenance.
 */
export async function syncQbdMonthlyFinancialsToRealEstateLines(companyId: string, months: string[]) {
  if (!months.length) return { mirrored: 0 };
  await ensureFinancialLineTable();
  const requestedDates = months.map((month) => new Date(`${month}-01T00:00:00.000Z`));
  const rows = await prisma.monthlyFinancial.findMany({
    where: { companyId, monthDate: { in: requestedDates } },
    select: {
      monthDate: true,
      revenue: true,
      expense: true,
      depreciationAmortization: true,
      fixedAssets: true,
      totalAssets: true,
      totalEquity: true,
    },
  });
  let mirrored = 0;
  for (const row of rows) {
    const periodEnd = new Date(Date.UTC(row.monthDate.getUTCFullYear(), row.monthDate.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    for (const field of FINANCIAL_FIELDS) {
      const amount = Number(row[field.key] || 0);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "RealEstateFinancialLine"
          ("id","companyId","sourceEntity","legalEntity","reportType","periodEnd","accountCode","accountName","accountType","canonicalAccountCode","amount","sourceFileName","sourceSheetName","updatedAt")
         VALUES (gen_random_uuid()::text,$1,'QBD','BGAH',$2,$3::date,$4,$5,$6,$4,$7,'QuickBooks Desktop','financial-push',NOW())
         ON CONFLICT ("companyId","sourceEntity","reportType","periodEnd","accountCode") DO UPDATE SET
           "accountName"=EXCLUDED."accountName","accountType"=EXCLUDED."accountType","amount"=EXCLUDED."amount",
           "sourceFileName"=EXCLUDED."sourceFileName","sourceSheetName"=EXCLUDED."sourceSheetName","updatedAt"=NOW()`,
        companyId, field.reportType, periodEnd, `qbd_${field.key}`, field.accountName, field.accountType, amount,
      );
      mirrored += 1;
    }
  }
  return { mirrored };
}
