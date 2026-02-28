-- NOTE:
-- This migration is intentionally scoped to AR/AP operational detail tables only.
-- It avoids unrelated destructive statements to keep production deployment safe.

-- CreateTable
CREATE TABLE IF NOT EXISTS "AROpenInvoiceSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "status" TEXT,
    "currencyCode" TEXT,
    "amountCurrency" DOUBLE PRECISION,
    "amountHome" DOUBLE PRECISION,
    "amountDueHome" DOUBLE PRECISION NOT NULL,
    "current" DOUBLE PRECISION,
    "days1to30" DOUBLE PRECISION,
    "days31to60" DOUBLE PRECISION,
    "days61to90" DOUBLE PRECISION,
    "days90plus" DOUBLE PRECISION,
    "sourcePlatform" TEXT DEFAULT 'INFOR_M3',
    "sourceProgram" TEXT,
    "sourceTransaction" TEXT,
    "cono" TEXT,
    "divi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AROpenInvoiceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ARPaymentFact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "currencyCode" TEXT,
    "paidAmountCurrency" DOUBLE PRECISION,
    "paidAmountHome" DOUBLE PRECISION NOT NULL,
    "sourcePlatform" TEXT DEFAULT 'INFOR_M3',
    "sourceProgram" TEXT,
    "sourceTransaction" TEXT,
    "cono" TEXT,
    "divi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ARPaymentFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "APOpenBillSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "vendorId" TEXT,
    "vendorName" TEXT NOT NULL,
    "billNo" TEXT NOT NULL,
    "billDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "status" TEXT,
    "currencyCode" TEXT,
    "amountCurrency" DOUBLE PRECISION,
    "amountHome" DOUBLE PRECISION,
    "amountDueHome" DOUBLE PRECISION NOT NULL,
    "current" DOUBLE PRECISION,
    "days1to30" DOUBLE PRECISION,
    "days31to60" DOUBLE PRECISION,
    "days61to90" DOUBLE PRECISION,
    "days90plus" DOUBLE PRECISION,
    "sourcePlatform" TEXT DEFAULT 'INFOR_M3',
    "sourceProgram" TEXT,
    "sourceTransaction" TEXT,
    "cono" TEXT,
    "divi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "APOpenBillSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "APPaymentFact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "vendorId" TEXT,
    "vendorName" TEXT NOT NULL,
    "billNo" TEXT,
    "currencyCode" TEXT,
    "paidAmountCurrency" DOUBLE PRECISION,
    "paidAmountHome" DOUBLE PRECISION NOT NULL,
    "sourcePlatform" TEXT DEFAULT 'INFOR_M3',
    "sourceProgram" TEXT,
    "sourceTransaction" TEXT,
    "cono" TEXT,
    "divi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "APPaymentFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AROpenInvoiceSnapshot_companyId_snapshotDate_idx" ON "AROpenInvoiceSnapshot"("companyId", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AROpenInvoiceSnapshot_companyId_frequency_snapshotDate_idx" ON "AROpenInvoiceSnapshot"("companyId", "frequency", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AROpenInvoiceSnapshot_companyId_customerId_idx" ON "AROpenInvoiceSnapshot"("companyId", "customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AROpenInvoiceSnapshot_companyId_invoiceNo_idx" ON "AROpenInvoiceSnapshot"("companyId", "invoiceNo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AROpenInvoiceSnapshot_companyId_customerName_idx" ON "AROpenInvoiceSnapshot"("companyId", "customerName");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AROpenInvoiceSnapshot_companyId_frequency_snapshotDate_invo_key" ON "AROpenInvoiceSnapshot"("companyId", "frequency", "snapshotDate", "invoiceNo", "customerName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ARPaymentFact_companyId_paymentDate_idx" ON "ARPaymentFact"("companyId", "paymentDate" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ARPaymentFact_companyId_customerId_paymentDate_idx" ON "ARPaymentFact"("companyId", "customerId", "paymentDate" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ARPaymentFact_companyId_customerName_paymentDate_idx" ON "ARPaymentFact"("companyId", "customerName", "paymentDate" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ARPaymentFact_companyId_invoiceNo_idx" ON "ARPaymentFact"("companyId", "invoiceNo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "APOpenBillSnapshot_companyId_snapshotDate_idx" ON "APOpenBillSnapshot"("companyId", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "APOpenBillSnapshot_companyId_frequency_snapshotDate_idx" ON "APOpenBillSnapshot"("companyId", "frequency", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "APOpenBillSnapshot_companyId_vendorId_idx" ON "APOpenBillSnapshot"("companyId", "vendorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "APOpenBillSnapshot_companyId_billNo_idx" ON "APOpenBillSnapshot"("companyId", "billNo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "APOpenBillSnapshot_companyId_vendorName_idx" ON "APOpenBillSnapshot"("companyId", "vendorName");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "APOpenBillSnapshot_companyId_frequency_snapshotDate_billNo__key" ON "APOpenBillSnapshot"("companyId", "frequency", "snapshotDate", "billNo", "vendorName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "APPaymentFact_companyId_paymentDate_idx" ON "APPaymentFact"("companyId", "paymentDate" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "APPaymentFact_companyId_vendorId_paymentDate_idx" ON "APPaymentFact"("companyId", "vendorId", "paymentDate" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "APPaymentFact_companyId_vendorName_paymentDate_idx" ON "APPaymentFact"("companyId", "vendorName", "paymentDate" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "APPaymentFact_companyId_billNo_idx" ON "APPaymentFact"("companyId", "billNo");

