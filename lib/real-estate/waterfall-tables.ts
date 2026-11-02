import prisma from '@/lib/prisma';

/** Creates the waterfall settings and payee-alias tables when migrations have not been applied yet (dev). */
export async function ensureRealEstateWaterfallTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateWaterfallSettings" (
      "companyId" TEXT PRIMARY KEY, "stabilizationDate" DATE,
      "preferredReturnRate" NUMERIC(9,6) NOT NULL DEFAULT 6,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateInvestorAlias" (
      "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "investorId" TEXT NOT NULL,
      "alias" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("companyId","alias")
    )
  `);
}
