CREATE TABLE IF NOT EXISTS "CustomerOrderLineFilled" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3),
    "filledAsOf" TIMESTAMP(3) NOT NULL,
    "itemId" TEXT,
    "itemName" TEXT,
    "sku" TEXT,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerOrderLineFilled_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerOrderLineFilled_company_order_line_customer_key"
    ON "CustomerOrderLineFilled"("companyId", "orderId", "lineId", "customerName");

CREATE INDEX IF NOT EXISTS "CustomerOrderLineFilled_company_customer_orderDate_idx"
    ON "CustomerOrderLineFilled"("companyId", "customerId", "orderDate");

CREATE INDEX IF NOT EXISTS "CustomerOrderLineFilled_company_filledAsOf_idx"
    ON "CustomerOrderLineFilled"("companyId", "filledAsOf");

CREATE INDEX IF NOT EXISTS "CustomerOrderLineFilled_company_orderDate_idx"
    ON "CustomerOrderLineFilled"("companyId", "orderDate");

CREATE TABLE IF NOT EXISTS "CustomerOrderLineFilledBackfill" (
    "companyId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerOrderLineFilledBackfill_pkey" PRIMARY KEY ("companyId")
);
