-- Add source order header date to persisted order-line snapshots.
-- Required for bookings period logic (MTD/QTD/YTD) by true OrderDate.

ALTER TABLE "CustomerOrderLineSnapshot"
ADD COLUMN IF NOT EXISTS "orderDate" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CustomerOrderLineSnapshot_companyId_orderDate_idx"
ON "CustomerOrderLineSnapshot"("companyId", "orderDate");
