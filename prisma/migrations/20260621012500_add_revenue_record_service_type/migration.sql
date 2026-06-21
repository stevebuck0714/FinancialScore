ALTER TABLE "RevenueRecord"
ADD COLUMN "serviceType" TEXT NOT NULL DEFAULT 'core';

UPDATE "RevenueRecord"
SET "serviceType" = 'setup_fee'
WHERE "subscriptionPlan" = 'setup_fee';

CREATE INDEX "RevenueRecord_serviceType_idx" ON "RevenueRecord"("serviceType");
