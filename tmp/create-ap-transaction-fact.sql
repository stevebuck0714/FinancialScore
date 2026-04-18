CREATE TABLE IF NOT EXISTS "APTransactionFact" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId" TEXT NOT NULL,
  "eventDate" TIMESTAMP(3) NOT NULL,
  "apAcct" TEXT,
  "vendorId" TEXT,
  "vendorName" TEXT,
  "voucher" TEXT NOT NULL,
  "vouchSeq" TEXT,
  "invoiceNum" TEXT,
  "invoiceDate" TIMESTAMP(3),
  "distDate" TIMESTAMP(3),
  "transType" TEXT NOT NULL,
  "invoiceAmount" DOUBLE PRECISION NOT NULL,
  "normalizedAmount" DOUBLE PRECISION NOT NULL,
  "exchangeRate" DOUBLE PRECISION,
  "termsCode" TEXT,
  "sourcePlatform" TEXT DEFAULT 'INFOR_CSI',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "APTransactionFact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "APTransactionFact_companyId_voucher_vouchSeq_transType_key" ON "APTransactionFact"("companyId", "voucher", "vouchSeq", "transType");
CREATE INDEX IF NOT EXISTS "APTransactionFact_companyId_eventDate_idx" ON "APTransactionFact"("companyId", "eventDate" DESC);
CREATE INDEX IF NOT EXISTS "APTransactionFact_companyId_apAcct_eventDate_idx" ON "APTransactionFact"("companyId", "apAcct", "eventDate" DESC);
CREATE INDEX IF NOT EXISTS "APTransactionFact_companyId_vendorId_idx" ON "APTransactionFact"("companyId", "vendorId");
