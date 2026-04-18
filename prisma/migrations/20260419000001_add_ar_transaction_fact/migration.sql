-- Phase 5 (AR): event-store table mirroring APTransactionFact for AR events
-- (I=invoice, P=payment, C=credit memo, D=debit memo) sourced primarily from
-- the SLArtrans CSI IDO. Drives the daily AR roll-forward via an aging-rule
-- helper in app/api/operational-data/route.ts.

CREATE TABLE "ARTransactionFact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "recordDate" TIMESTAMP(3),
    "arAcct" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "invoiceNum" TEXT NOT NULL,
    "invSeq" TEXT,
    "coNum" TEXT,
    "applyToInvNum" TEXT,
    "transType" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "amount" DOUBLE PRECISION NOT NULL,
    "normalizedAmount" DOUBLE PRECISION NOT NULL,
    "currencyCode" TEXT,
    "termsCode" TEXT,
    "payType" TEXT,
    "sourcePlatform" TEXT DEFAULT 'INFOR_CSI',
    "sourceItemId" TEXT,
    "sourceProgram" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ARTransactionFact_pkey" PRIMARY KEY ("id")
);

-- Use NULLS NOT DISTINCT so rows with NULL sourceItemId still collapse correctly
CREATE UNIQUE INDEX "ARTransactionFact_event_uniq"
  ON "ARTransactionFact" ("companyId", "coNum", "customerId", "invoiceNum", "invSeq", "transType", "sourceItemId")
  NULLS NOT DISTINCT;

CREATE INDEX "ARTransactionFact_companyId_eventDate_idx"
  ON "ARTransactionFact" ("companyId", "eventDate" DESC);

CREATE INDEX "ARTransactionFact_companyId_arAcct_eventDate_idx"
  ON "ARTransactionFact" ("companyId", "arAcct", "eventDate" DESC);

CREATE INDEX "ARTransactionFact_companyId_customerId_idx"
  ON "ARTransactionFact" ("companyId", "customerId");

CREATE INDEX "ARTransactionFact_companyId_invoiceNum_idx"
  ON "ARTransactionFact" ("companyId", "invoiceNum");

CREATE INDEX "ARTransactionFact_companyId_sourceProgram_idx"
  ON "ARTransactionFact" ("companyId", "sourceProgram");
