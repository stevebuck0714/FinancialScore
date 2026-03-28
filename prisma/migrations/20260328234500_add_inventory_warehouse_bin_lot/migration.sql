-- Persist inventory location dimensions for drill-down in inventory table.
-- Source fields are provided by CSI payload when available.

ALTER TABLE "InventorySnapshot"
ADD COLUMN IF NOT EXISTS "warehouse" TEXT,
ADD COLUMN IF NOT EXISTS "bin" TEXT,
ADD COLUMN IF NOT EXISTS "lot" TEXT;

CREATE INDEX IF NOT EXISTS "InventorySnapshot_companyId_warehouse_idx"
ON "InventorySnapshot"("companyId", "warehouse");

CREATE INDEX IF NOT EXISTS "InventorySnapshot_companyId_bin_idx"
ON "InventorySnapshot"("companyId", "bin");

CREATE INDEX IF NOT EXISTS "InventorySnapshot_companyId_lot_idx"
ON "InventorySnapshot"("companyId", "lot");

