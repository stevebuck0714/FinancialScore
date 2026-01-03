-- Add operational data tables for QuickBooks mock data

CREATE TABLE IF NOT EXISTS "CustomerSalesSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL,
    "invoiceCount" INTEGER NOT NULL,
    "avgInvoiceSize" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSalesSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerSalesSnapshot_companyId_month_idx" ON "CustomerSalesSnapshot"("companyId", "month");
CREATE INDEX IF NOT EXISTS "CustomerSalesSnapshot_companyId_customerId_idx" ON "CustomerSalesSnapshot"("companyId", "customerId");

CREATE TABLE IF NOT EXISTS "ARAgingSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "totalAR" DOUBLE PRECISION NOT NULL,
    "current" DOUBLE PRECISION NOT NULL,
    "days1to30" DOUBLE PRECISION NOT NULL,
    "days31to60" DOUBLE PRECISION NOT NULL,
    "days61to90" DOUBLE PRECISION NOT NULL,
    "days90plus" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ARAgingSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ARAgingSnapshot_companyId_month_idx" ON "ARAgingSnapshot"("companyId", "month");
CREATE UNIQUE INDEX IF NOT EXISTS "ARAgingSnapshot_companyId_month_key" ON "ARAgingSnapshot"("companyId", "month");

CREATE TABLE IF NOT EXISTS "APAgingSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "totalAP" DOUBLE PRECISION NOT NULL,
    "current" DOUBLE PRECISION NOT NULL,
    "days1to30" DOUBLE PRECISION NOT NULL,
    "days31to60" DOUBLE PRECISION NOT NULL,
    "days61to90" DOUBLE PRECISION NOT NULL,
    "days90plus" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "APAgingSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "APAgingSnapshot_companyId_month_idx" ON "APAgingSnapshot"("companyId", "month");
CREATE UNIQUE INDEX IF NOT EXISTS "APAgingSnapshot_companyId_month_key" ON "APAgingSnapshot"("companyId", "month");

CREATE TABLE IF NOT EXISTS "ProductSalesSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "itemId" TEXT,
    "itemName" TEXT NOT NULL,
    "sku" TEXT,
    "quantitySold" DOUBLE PRECISION NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL,
    "cogs" DOUBLE PRECISION,
    "grossMargin" DOUBLE PRECISION,
    "grossMarginPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSalesSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductSalesSnapshot_companyId_month_idx" ON "ProductSalesSnapshot"("companyId", "month");
CREATE INDEX IF NOT EXISTS "ProductSalesSnapshot_companyId_itemId_idx" ON "ProductSalesSnapshot"("companyId", "itemId");

CREATE TABLE IF NOT EXISTS "InventorySnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "itemId" TEXT,
    "itemName" TEXT NOT NULL,
    "sku" TEXT,
    "qtyOnHand" DOUBLE PRECISION NOT NULL,
    "assetValue" DOUBLE PRECISION NOT NULL,
    "avgCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventorySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InventorySnapshot_companyId_month_idx" ON "InventorySnapshot"("companyId", "month");
CREATE INDEX IF NOT EXISTS "InventorySnapshot_companyId_itemId_idx" ON "InventorySnapshot"("companyId", "itemId");

