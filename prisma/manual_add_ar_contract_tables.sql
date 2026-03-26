CREATE TABLE IF NOT EXISTS "ARInvoiceDetail" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "asOfDate" TIMESTAMP(3) NOT NULL,
  "snapshotFrequency" TEXT NOT NULL DEFAULT 'daily',
  "customerId" TEXT,
  "customerName" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "invoiceDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "invoiceAmount" DOUBLE PRECISION NOT NULL,
  "amountPaid" DOUBLE PRECISION NOT NULL,
  "remainingBalance" DOUBLE PRECISION NOT NULL,
  "daysOutstanding" INTEGER,
  "agingBucket" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ARInvoiceDetail_companyId_asOfDate_snapshotFrequency_invoiceId_customerName_key"
  ON "ARInvoiceDetail"("companyId", "asOfDate", "snapshotFrequency", "invoiceId", "customerName");
CREATE INDEX IF NOT EXISTS "ARInvoiceDetail_companyId_asOfDate_idx"
  ON "ARInvoiceDetail"("companyId", "asOfDate" DESC);
CREATE INDEX IF NOT EXISTS "ARInvoiceDetail_companyId_customerId_asOfDate_idx"
  ON "ARInvoiceDetail"("companyId", "customerId", "asOfDate" DESC);
CREATE INDEX IF NOT EXISTS "ARInvoiceDetail_companyId_invoiceId_idx"
  ON "ARInvoiceDetail"("companyId", "invoiceId");

CREATE TABLE IF NOT EXISTS "CustomerContractStatus" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "asOfDate" TIMESTAMP(3) NOT NULL,
  "customerId" TEXT,
  "customerName" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "contractValue" DOUBLE PRECISION NOT NULL,
  "earnedToDate" DOUBLE PRECISION NOT NULL,
  "invoicedToDate" DOUBLE PRECISION NOT NULL,
  "remainingValue" DOUBLE PRECISION NOT NULL,
  "accruedRevenueUnbilled" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "arOutstanding" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cashCollectedToDate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lastPaymentDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerContractStatus_companyId_asOfDate_customerName_contractId_key"
  ON "CustomerContractStatus"("companyId", "asOfDate", "customerName", "contractId");
CREATE INDEX IF NOT EXISTS "CustomerContractStatus_companyId_asOfDate_idx"
  ON "CustomerContractStatus"("companyId", "asOfDate" DESC);
CREATE INDEX IF NOT EXISTS "CustomerContractStatus_companyId_customerId_asOfDate_idx"
  ON "CustomerContractStatus"("companyId", "customerId", "asOfDate" DESC);

CREATE TABLE IF NOT EXISTS "CustomerCashFlow" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT,
  "customerName" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "cashInflow" DOUBLE PRECISION NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CustomerCashFlow_companyId_date_idx"
  ON "CustomerCashFlow"("companyId", "date" DESC);
CREATE INDEX IF NOT EXISTS "CustomerCashFlow_companyId_customerId_date_idx"
  ON "CustomerCashFlow"("companyId", "customerId", "date" DESC);

CREATE TABLE IF NOT EXISTS "CustomerOrderLineSnapshot" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "snapshotDate" TIMESTAMP(3) NOT NULL,
  "frequency" TEXT NOT NULL DEFAULT 'daily',
  "customerId" TEXT,
  "customerName" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "lineId" TEXT NOT NULL,
  "qtyOrdered" DOUBLE PRECISION NOT NULL,
  "qtyInvoiced" DOUBLE PRECISION NOT NULL,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "contractValue" DOUBLE PRECISION NOT NULL,
  "invoicedAmount" DOUBLE PRECISION NOT NULL,
  "remainingAmount" DOUBLE PRECISION NOT NULL,
  "unbilledAccrual" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sourcePlatform" TEXT DEFAULT 'INFOR_M3',
  "sourceProgram" TEXT,
  "sourceTransaction" TEXT,
  "cono" TEXT,
  "divi" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerOrderLineSnapshot_companyId_frequency_snapshotDate_orderId_lineId_customerName_key"
  ON "CustomerOrderLineSnapshot"("companyId", "frequency", "snapshotDate", "orderId", "lineId", "customerName");
CREATE INDEX IF NOT EXISTS "CustomerOrderLineSnapshot_companyId_snapshotDate_idx"
  ON "CustomerOrderLineSnapshot"("companyId", "snapshotDate" DESC);
CREATE INDEX IF NOT EXISTS "CustomerOrderLineSnapshot_companyId_frequency_snapshotDate_idx"
  ON "CustomerOrderLineSnapshot"("companyId", "frequency", "snapshotDate" DESC);
CREATE INDEX IF NOT EXISTS "CustomerOrderLineSnapshot_companyId_customerId_snapshotDate_idx"
  ON "CustomerOrderLineSnapshot"("companyId", "customerId", "snapshotDate" DESC);
CREATE INDEX IF NOT EXISTS "CustomerOrderLineSnapshot_companyId_orderId_idx"
  ON "CustomerOrderLineSnapshot"("companyId", "orderId");
