import prisma from '@/lib/prisma';

/** Creates the construction draw, budget, invoice, funding, and fixed-asset tables when migrations have not been applied yet (dev). */
export async function ensureRealEstateConstructionTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateConstructionDraw" (
      "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "sequence" INTEGER NOT NULL, "label" TEXT NOT NULL,
      "drawDate" DATE, "equityFunded" NUMERIC(18,2) NOT NULL DEFAULT 0, "loanFunded" NUMERIC(18,2) NOT NULL DEFAULT 0,
      "retainageHeld" NUMERIC(18,2) NOT NULL DEFAULT 0, "liquidatedDamages" NUMERIC(18,2) NOT NULL DEFAULT 0,
      "sourceDocument" TEXT, "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("companyId","sequence")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateConstructionBudgetLine" (
      "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "lineNumber" INTEGER NOT NULL, "name" TEXT NOT NULL,
      "revisedBudget" NUMERIC(18,2) NOT NULL, "remainingAfter" NUMERIC(18,2) NOT NULL, "asOfSequence" INTEGER NOT NULL,
      "costClass" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("companyId","lineNumber")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateConstructionInvoice" (
      "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "drawSequence" INTEGER NOT NULL, "budgetLine" TEXT NOT NULL,
      "vendor" TEXT NOT NULL, "invoiceDate" DATE, "invoiceNumber" TEXT,
      "debtAmount" NUMERIC(18,2) NOT NULL DEFAULT 0, "equityAmount" NUMERIC(18,2) NOT NULL DEFAULT 0, "sourceFileName" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateFundingSource" (
      "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "stage" TEXT NOT NULL, "effectiveSequence" INTEGER NOT NULL,
      "sourceName" TEXT NOT NULL, "amount" NUMERIC(18,2) NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("companyId","effectiveSequence","sourceName")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateFixedAsset" (
      "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "name" TEXT NOT NULL, "assetClass" TEXT NOT NULL,
      "cost" NUMERIC(18,2) NOT NULL, "inServiceDate" DATE, "usefulLifeYears" NUMERIC(6,2), "basis" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
