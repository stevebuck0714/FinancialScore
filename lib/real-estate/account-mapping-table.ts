import prisma from '@/lib/prisma';

/** Creates RealEstateAccountMapping when migrations have not been applied yet (dev). */
export async function ensureRealEstateAccountMappingTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateAccountMapping" (
      "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "financialFeed" TEXT NOT NULL,
      "accountCode" TEXT NOT NULL, "accountName" TEXT NOT NULL, "accountType" TEXT NOT NULL,
      "targetField" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("companyId","financialFeed","accountCode")
    )
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE "RealEstateAccountMapping" ADD COLUMN IF NOT EXISTS "bookTreatment" TEXT`);
}
