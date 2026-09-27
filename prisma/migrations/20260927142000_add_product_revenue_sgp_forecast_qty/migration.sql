ALTER TABLE "ProductRevenueForecastLine"
ADD COLUMN IF NOT EXISTS "sgpForecastQty" JSONB NOT NULL DEFAULT '{}'::jsonb;
