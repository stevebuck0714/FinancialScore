-- Persist item-level identifiers for bookings audit/drilldown.
-- Source: SLCoitems payload (Item/ITNO, Description/ITDS, SKU aliases).

ALTER TABLE "CustomerOrderLineSnapshot"
ADD COLUMN IF NOT EXISTS "itemId" TEXT,
ADD COLUMN IF NOT EXISTS "itemName" TEXT,
ADD COLUMN IF NOT EXISTS "sku" TEXT;

CREATE INDEX IF NOT EXISTS "CustomerOrderLineSnapshot_companyId_itemId_idx"
ON "CustomerOrderLineSnapshot"("companyId", "itemId");

CREATE INDEX IF NOT EXISTS "CustomerOrderLineSnapshot_companyId_sku_idx"
ON "CustomerOrderLineSnapshot"("companyId", "sku");

