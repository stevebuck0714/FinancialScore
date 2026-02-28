-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccountingPlatform" ADD VALUE 'ACUMATICA';
ALTER TYPE "AccountingPlatform" ADD VALUE 'ODOO';
ALTER TYPE "AccountingPlatform" ADD VALUE 'SAGE_INTACCT';

-- DropIndex
DROP INDEX "public"."Company_tier1SupportConsultantId_idx";

-- DropIndex
DROP INDEX "public"."Company_tier1SupportContactEmail_idx";

-- DropIndex
DROP INDEX "public"."Company_tier1SupportOwner_idx";

-- DropIndex
DROP INDEX "public"."Consultant_tier1SupportContactEmail_idx";

-- AlterTable
ALTER TABLE "CompanyDocument" ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "indexedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CompanyDocumentChunk" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Consultant" DROP COLUMN "tier1SupportContactEmail",
DROP COLUMN "tier1SupportContactName";

-- AlterTable
ALTER TABLE "Covenant" DROP COLUMN "breachThreshold",
DROP COLUMN "warningThreshold";

-- AlterTable
ALTER TABLE "OpsSectorLayoutConfig" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Subscription" ALTER COLUMN "setupFeePaidAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "billingAnchorDate" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "firstRecurringBillDate" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserCompanyAccess" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "public"."DashboardPreference";

-- DropTable
DROP TABLE "public"."ExpenseGoal";

-- DropTable
DROP TABLE "public"."OperationalGoal";

-- DropTable
DROP TABLE "public"."OpsDashboardPreference";

-- DropTable
DROP TABLE "public"."PerformanceFinding";

-- CreateTable
CREATE TABLE "LearnedMapping" (
    "id" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountClassification" TEXT,
    "targetField" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnedMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XeroTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "contact" TEXT,
    "reference" TEXT,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT,
    "lineItems" JSONB,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XeroTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AROpenInvoiceSnapshot" (
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
CREATE TABLE "ARPaymentFact" (
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
CREATE TABLE "APOpenBillSnapshot" (
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
CREATE TABLE "APPaymentFact" (
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
CREATE INDEX "LearnedMapping_accountName_idx" ON "LearnedMapping"("accountName");

-- CreateIndex
CREATE INDEX "LearnedMapping_targetField_idx" ON "LearnedMapping"("targetField");

-- CreateIndex
CREATE UNIQUE INDEX "LearnedMapping_accountName_accountClassification_targetFiel_key" ON "LearnedMapping"("accountName", "accountClassification", "targetField");

-- CreateIndex
CREATE INDEX "XeroTransaction_companyId_idx" ON "XeroTransaction"("companyId");

-- CreateIndex
CREATE INDEX "XeroTransaction_date_idx" ON "XeroTransaction"("date");

-- CreateIndex
CREATE INDEX "XeroTransaction_transactionType_idx" ON "XeroTransaction"("transactionType");

-- CreateIndex
CREATE UNIQUE INDEX "XeroTransaction_companyId_transactionId_key" ON "XeroTransaction"("companyId", "transactionId");

-- CreateIndex
CREATE INDEX "AROpenInvoiceSnapshot_companyId_snapshotDate_idx" ON "AROpenInvoiceSnapshot"("companyId", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX "AROpenInvoiceSnapshot_companyId_frequency_snapshotDate_idx" ON "AROpenInvoiceSnapshot"("companyId", "frequency", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX "AROpenInvoiceSnapshot_companyId_customerId_idx" ON "AROpenInvoiceSnapshot"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "AROpenInvoiceSnapshot_companyId_invoiceNo_idx" ON "AROpenInvoiceSnapshot"("companyId", "invoiceNo");

-- CreateIndex
CREATE INDEX "AROpenInvoiceSnapshot_companyId_customerName_idx" ON "AROpenInvoiceSnapshot"("companyId", "customerName");

-- CreateIndex
CREATE UNIQUE INDEX "AROpenInvoiceSnapshot_companyId_frequency_snapshotDate_invo_key" ON "AROpenInvoiceSnapshot"("companyId", "frequency", "snapshotDate", "invoiceNo", "customerName");

-- CreateIndex
CREATE INDEX "ARPaymentFact_companyId_paymentDate_idx" ON "ARPaymentFact"("companyId", "paymentDate" DESC);

-- CreateIndex
CREATE INDEX "ARPaymentFact_companyId_customerId_paymentDate_idx" ON "ARPaymentFact"("companyId", "customerId", "paymentDate" DESC);

-- CreateIndex
CREATE INDEX "ARPaymentFact_companyId_customerName_paymentDate_idx" ON "ARPaymentFact"("companyId", "customerName", "paymentDate" DESC);

-- CreateIndex
CREATE INDEX "ARPaymentFact_companyId_invoiceNo_idx" ON "ARPaymentFact"("companyId", "invoiceNo");

-- CreateIndex
CREATE INDEX "APOpenBillSnapshot_companyId_snapshotDate_idx" ON "APOpenBillSnapshot"("companyId", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX "APOpenBillSnapshot_companyId_frequency_snapshotDate_idx" ON "APOpenBillSnapshot"("companyId", "frequency", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX "APOpenBillSnapshot_companyId_vendorId_idx" ON "APOpenBillSnapshot"("companyId", "vendorId");

-- CreateIndex
CREATE INDEX "APOpenBillSnapshot_companyId_billNo_idx" ON "APOpenBillSnapshot"("companyId", "billNo");

-- CreateIndex
CREATE INDEX "APOpenBillSnapshot_companyId_vendorName_idx" ON "APOpenBillSnapshot"("companyId", "vendorName");

-- CreateIndex
CREATE UNIQUE INDEX "APOpenBillSnapshot_companyId_frequency_snapshotDate_billNo__key" ON "APOpenBillSnapshot"("companyId", "frequency", "snapshotDate", "billNo", "vendorName");

-- CreateIndex
CREATE INDEX "APPaymentFact_companyId_paymentDate_idx" ON "APPaymentFact"("companyId", "paymentDate" DESC);

-- CreateIndex
CREATE INDEX "APPaymentFact_companyId_vendorId_paymentDate_idx" ON "APPaymentFact"("companyId", "vendorId", "paymentDate" DESC);

-- CreateIndex
CREATE INDEX "APPaymentFact_companyId_vendorName_paymentDate_idx" ON "APPaymentFact"("companyId", "vendorName", "paymentDate" DESC);

-- CreateIndex
CREATE INDEX "APPaymentFact_companyId_billNo_idx" ON "APPaymentFact"("companyId", "billNo");

-- AddForeignKey
ALTER TABLE "XeroTransaction" ADD CONSTRAINT "XeroTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "CompanyDocumentChunk_document_chunkIndex_key" RENAME TO "CompanyDocumentChunk_documentId_chunkIndex_key";

