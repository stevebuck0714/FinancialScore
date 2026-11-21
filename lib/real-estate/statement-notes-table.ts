import prisma from '@/lib/prisma';

/**
 * User-written notes to the combined BGAH + SLN statements. `period` is null
 * (always shown), a year (YYYY) or a month (YYYY-MM).
 */
export async function ensureRealEstateStatementNotesTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateStatementNote" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "companyId" TEXT NOT NULL,
      "period" TEXT,
      "body" TEXT NOT NULL,
      "createdBy" TEXT,
      "updatedBy" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RealEstateStatementNote_companyId_idx" ON "RealEstateStatementNote" ("companyId")
  `);
}
