ALTER TABLE "ProductRevenuePrice"
ADD COLUMN IF NOT EXISTS "contractPriceSource" TEXT,
ADD COLUMN IF NOT EXISTS "contractPriceAsOf" TIMESTAMP(3);
