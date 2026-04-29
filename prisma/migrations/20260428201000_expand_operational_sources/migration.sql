-- AlterEnum
ALTER TYPE "OperationalSystemProvider" ADD VALUE 'SPREADSHEET_UPLOAD';

-- AlterTable
ALTER TABLE "OperationalSystemConnection" ADD COLUMN "sourceCode" TEXT NOT NULL DEFAULT 'BAMBOOHR_STANDARD';

-- DropIndex
DROP INDEX "OperationalSystemConnection_companyId_provider_key";

-- CreateIndex
CREATE UNIQUE INDEX "OperationalSystemConnection_companyId_provider_sourceCode_key" ON "OperationalSystemConnection"("companyId", "provider", "sourceCode");
