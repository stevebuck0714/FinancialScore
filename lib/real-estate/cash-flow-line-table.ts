import prisma from '@/lib/prisma';

/** Creates RealEstateCashFlowLine (the SLN Cash Flow Summary lines) when it does not exist yet. */
export async function ensureRealEstateCashFlowLineTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateCashFlowLine" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, "companyId" TEXT NOT NULL,
      "sourceEntity" TEXT NOT NULL, "periodEnd" DATE NOT NULL, "lineKey" TEXT NOT NULL, "lineName" TEXT NOT NULL,
      "lineOrder" INTEGER NOT NULL, "amount" NUMERIC(18,2) NOT NULL, "budgetAmount" NUMERIC(18,2),
      "sourceFileName" TEXT, "sourceSheetName" TEXT, "sourceRowNumber" INTEGER,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("companyId","sourceEntity","periodEnd","lineKey")
    )
  `);
}
