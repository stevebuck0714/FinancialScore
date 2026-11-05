import prisma from '@/lib/prisma';

/**
 * Tax-return facts are intentionally separate from book assets and financial
 * lines. Tax methods must come from a filed return or CPA schedule, never from
 * the straight-line book-depreciation register.
 */
export async function ensureRealEstateTaxReconciliationTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateTaxReturn" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "companyId" TEXT NOT NULL,
      "taxYear" INTEGER NOT NULL,
      "filingStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
      "sourceDocument" TEXT NOT NULL,
      "sourceReference" TEXT,
      "coverageStatus" TEXT NOT NULL DEFAULT 'PARTIAL',
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("companyId", "taxYear")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateTaxDepreciationRecord" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "companyId" TEXT NOT NULL,
      "taxYear" INTEGER NOT NULL,
      "taxReturnId" TEXT,
      "assetReference" TEXT NOT NULL,
      "taxTreatment" TEXT NOT NULL DEFAULT 'DEPRECIATION',
      "taxBasis" NUMERIC(18,2) NOT NULL,
      "placedInServiceDate" DATE,
      "recoveryPeriodYears" NUMERIC(8,2),
      "convention" TEXT,
      "method" TEXT,
      "deduction" NUMERIC(18,2),
      "sourceReference" TEXT NOT NULL,
      "confidence" TEXT NOT NULL DEFAULT 'VERIFIED_RETURN',
      "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("companyId", "taxYear", "assetReference", "taxTreatment")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RealEstateTaxReturn_companyId_taxYear_idx"
      ON "RealEstateTaxReturn" ("companyId", "taxYear")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RealEstateTaxDepreciationRecord_companyId_taxYear_idx"
      ON "RealEstateTaxDepreciationRecord" ("companyId", "taxYear")
  `);
}
