-- Company home/base + optional reporting currency
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "baseCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "reportingCurrency" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'en-US';

-- Shared daily EOD FX rate cache
CREATE TABLE IF NOT EXISTS "FxRate" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "rateType" TEXT NOT NULL DEFAULT 'daily_eod',
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "fallbackFromDate" TIMESTAMP(3),
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceTimestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FxRate_provider_fromCurrency_toCurrency_rateDate_rateType_key"
  ON "FxRate"("provider", "fromCurrency", "toCurrency", "rateDate", "rateType");

CREATE INDEX IF NOT EXISTS "FxRate_fromCurrency_toCurrency_rateDate_idx"
  ON "FxRate"("fromCurrency", "toCurrency", "rateDate");
