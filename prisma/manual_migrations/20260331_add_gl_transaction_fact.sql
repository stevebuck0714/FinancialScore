-- Manual migration: add raw GL transaction fact table for Infor GL-first pipeline
CREATE TABLE IF NOT EXISTS "GLTransactionFact" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "transDate" TIMESTAMP(3) NOT NULL,
  "accountId" TEXT NOT NULL,
  "accountName" TEXT,
  "accountType" TEXT,
  "accountCategory" TEXT,
  "signedAmount" DOUBLE PRECISION NOT NULL,
  "debitAmount" DOUBLE PRECISION,
  "creditAmount" DOUBLE PRECISION,
  "drCr" TEXT,
  "transNum" TEXT,
  "ref" TEXT,
  "description" TEXT,
  "site" TEXT,
  "sourcePlatform" TEXT DEFAULT 'INFOR_M3',
  "sourceProgram" TEXT,
  "sourceTransaction" TEXT,
  "cono" TEXT,
  "divi" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GLTransactionFact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GLTransactionFact_companyId_transDate_idx"
  ON "GLTransactionFact"("companyId", "transDate" DESC);

CREATE INDEX IF NOT EXISTS "GLTransactionFact_companyId_accountId_transDate_idx"
  ON "GLTransactionFact"("companyId", "accountId", "transDate" DESC);

CREATE INDEX IF NOT EXISTS "GLTransactionFact_companyId_transNum_idx"
  ON "GLTransactionFact"("companyId", "transNum");

CREATE INDEX IF NOT EXISTS "GLTransactionFact_companyId_ref_idx"
  ON "GLTransactionFact"("companyId", "ref");

CREATE UNIQUE INDEX IF NOT EXISTS "GLTransactionFact_companyId_transDate_accountId_transNum_ref_description_key"
  ON "GLTransactionFact"("companyId", "transDate", "accountId", "transNum", "ref", "description");
