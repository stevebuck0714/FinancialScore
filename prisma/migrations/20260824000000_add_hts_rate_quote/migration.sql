CREATE TABLE IF NOT EXISTS "HtsRateQuote" (
    "id" TEXT NOT NULL,
    "htsCode" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL DEFAULT '',
    "tradeProgram" TEXT NOT NULL DEFAULT 'none',
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "releaseName" TEXT,
    "dutyRatePct" DOUBLE PRECISION,
    "specialRatePct" DOUBLE PRECISION,
    "section301RatePct" DOUBLE PRECISION,
    "section232RatePct" DOUBLE PRECISION,
    "ieepaRatePct" DOUBLE PRECISION,
    "additionalRatePct" DOUBLE PRECISION,
    "tariffRatePct" DOUBLE PRECISION,
    "dutyRateText" TEXT,
    "specialRateText" TEXT,
    "additionalDutiesText" TEXT,
    "unit1" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HtsRateQuote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HtsRateQuote_hts_origin_program_date_key"
  ON "HtsRateQuote"("htsCode", "originCountry", "tradeProgram", "asOfDate");

CREATE INDEX IF NOT EXISTS "HtsRateQuote_asOfDate_idx"
  ON "HtsRateQuote"("asOfDate");

ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "lastRateAsOfDate" TIMESTAMP(3);
ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "lastRateReleaseName" TEXT;
