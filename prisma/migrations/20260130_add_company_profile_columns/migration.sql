-- Add company profile columns for industry sector reporting and settings
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "accountingSystem" TEXT,
  ADD COLUMN IF NOT EXISTS "companySizeCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "industrySectorCategory" TEXT;
