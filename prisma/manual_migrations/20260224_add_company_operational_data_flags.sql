-- Manual migration: operational data activation + mock override flags on Company.
-- Safe to run multiple times.

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "hasRealOperationalData" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "realDataActivatedAt" TIMESTAMP(3);

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "forceOperationalMockData" BOOLEAN NOT NULL DEFAULT false;

-- Backfill activation flag for companies that already have real operational snapshots.
UPDATE "Company" c
SET
  "hasRealOperationalData" = true,
  "realDataActivatedAt" = COALESCE(c."realDataActivatedAt", NOW())
WHERE EXISTS (SELECT 1 FROM "CustomerSalesSnapshot" s WHERE s."companyId" = c."id")
   OR EXISTS (SELECT 1 FROM "ARagingSnapshot" s WHERE s."companyId" = c."id")
   OR EXISTS (SELECT 1 FROM "APagingSnapshot" s WHERE s."companyId" = c."id")
   OR EXISTS (SELECT 1 FROM "ProductSalesSnapshot" s WHERE s."companyId" = c."id")
   OR EXISTS (SELECT 1 FROM "InventorySnapshot" s WHERE s."companyId" = c."id")
   OR EXISTS (SELECT 1 FROM "CashSnapshot" s WHERE s."companyId" = c."id");
