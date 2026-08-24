ALTER TABLE "ProductRevenueForecastLine"
ADD COLUMN IF NOT EXISTS "adjustedQty" JSONB NOT NULL DEFAULT '{}'::jsonb;
