-- Manual migration: add CompanyDocument + CompanyDocumentCategory
-- This is intentionally narrow (create-only) to avoid schema drift / data loss.

DO $$
BEGIN
  CREATE TYPE "CompanyDocumentCategory" AS ENUM (
    'LOAN_DOCUMENTS',
    'FINANCING_DOCUMENTS',
    'LEGAL_AND_REGULATORY',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CompanyDocument" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "uploadedByUserId" TEXT NOT NULL,
  "category" "CompanyDocumentCategory" NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "blobUrl" TEXT NOT NULL,
  "blobPathname" TEXT,
  "contentType" TEXT,
  "sizeBytes" INTEGER,
  "extractionStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "extractedText" TEXT,
  "extractionError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

-- Uniques
DO $$
BEGIN
  ALTER TABLE "CompanyDocument"
    ADD CONSTRAINT "CompanyDocument_blobUrl_key" UNIQUE ("blobUrl");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CompanyDocument"
    ADD CONSTRAINT "CompanyDocument_blobPathname_key" UNIQUE ("blobPathname");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Foreign keys
DO $$
BEGIN
  ALTER TABLE "CompanyDocument"
    ADD CONSTRAINT "CompanyDocument_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "CompanyDocument"
    ADD CONSTRAINT "CompanyDocument_uploadedByUserId_fkey"
    FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "CompanyDocument_companyId_idx" ON "CompanyDocument" ("companyId");
CREATE INDEX IF NOT EXISTS "CompanyDocument_uploadedByUserId_idx" ON "CompanyDocument" ("uploadedByUserId");
CREATE INDEX IF NOT EXISTS "CompanyDocument_category_idx" ON "CompanyDocument" ("category");
CREATE INDEX IF NOT EXISTS "CompanyDocument_createdAt_idx" ON "CompanyDocument" ("createdAt");

