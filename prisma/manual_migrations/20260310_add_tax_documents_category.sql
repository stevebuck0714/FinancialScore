-- Manual migration: extend CompanyDocumentCategory enum with TAX_DOCUMENTS
DO $$
BEGIN
  ALTER TYPE "CompanyDocumentCategory" ADD VALUE IF NOT EXISTS 'TAX_DOCUMENTS';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
