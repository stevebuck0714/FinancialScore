-- Migration: Add Affiliate and AffiliateCode tables to production
-- Run this SQL in your production PostgreSQL database

-- Create Affiliate table
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "website" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create unique index on Affiliate name
CREATE UNIQUE INDEX "Affiliate_name_key" ON "Affiliate"("name");

-- Create index on Affiliate name
CREATE INDEX "Affiliate_name_idx" ON "Affiliate"("name");

-- Create AffiliateCode table
CREATE TABLE "AffiliateCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "annualPrice" REAL NOT NULL DEFAULT 0,
    "monthlyPrice" REAL NOT NULL DEFAULT 0,
    "quarterlyPrice" REAL NOT NULL DEFAULT 0
);

-- Create unique index on AffiliateCode code
CREATE UNIQUE INDEX "AffiliateCode_code_key" ON "AffiliateCode"("code");

-- Create indexes on AffiliateCode
CREATE INDEX "AffiliateCode_affiliateId_idx" ON "AffiliateCode"("affiliateId");
CREATE INDEX "AffiliateCode_code_idx" ON "AffiliateCode"("code");

-- Add foreign key constraint from AffiliateCode to Affiliate
ALTER TABLE "AffiliateCode" ADD CONSTRAINT "AffiliateCode_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add affiliateId column to Company table (if it doesn't exist)
-- This column was commented out, so it might not exist in production
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Company' AND column_name = 'affiliateId') THEN
        ALTER TABLE "Company" ADD COLUMN "affiliateId" TEXT;
    END IF;
END $$;

-- Add affiliateCode column to Company table (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Company' AND column_name = 'affiliateCode') THEN
        ALTER TABLE "Company" ADD COLUMN "affiliateCode" TEXT;
    END IF;
END $$;

-- Add index on Company affiliateId (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'Company' AND indexname = 'Company_affiliateId_idx') THEN
        CREATE INDEX "Company_affiliateId_idx" ON "Company"("affiliateId");
    END IF;
END $$;

-- Add foreign key from Company to Affiliate (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'Company' AND constraint_name = 'Company_affiliateId_fkey') THEN
        ALTER TABLE "Company" ADD CONSTRAINT "Company_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
