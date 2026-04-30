-- AlterEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'OperationalSystemProvider'
      AND e.enumlabel = 'SPREADSHEET_UPLOAD'
  ) THEN
    ALTER TYPE "OperationalSystemProvider" ADD VALUE 'SPREADSHEET_UPLOAD';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "OperationalSystemConnection" ADD COLUMN IF NOT EXISTS "sourceCode" TEXT NOT NULL DEFAULT 'BAMBOOHR_STANDARD';

-- DropIndex
DROP INDEX IF EXISTS "OperationalSystemConnection_companyId_provider_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OperationalSystemConnection_companyId_provider_sourceCode_key" ON "OperationalSystemConnection"("companyId", "provider", "sourceCode");
