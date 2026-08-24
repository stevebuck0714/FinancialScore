CREATE TABLE IF NOT EXISTS "CompanyItemDuty" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemSku" TEXT NOT NULL,
    "itemDescription" TEXT,
    "htsCode" TEXT,
    "countryOfOrigin" TEXT,
    "tradeProgram" TEXT DEFAULT 'none',
    "qtyUnit" TEXT DEFAULT 'piece',
    "enteredValuePerPiece" DOUBLE PRECISION,
    "enteredValueSource" TEXT,
    "spreadsheetDutyPerPiece" DOUBLE PRECISION,
    "spreadsheetTariffPerPiece" DOUBLE PRECISION,
    "dutyPerPiece" DOUBLE PRECISION,
    "tariffPerPiece" DOUBLE PRECISION,
    "dutyRatePct" DOUBLE PRECISION,
    "specialRatePct" DOUBLE PRECISION,
    "section301RatePct" DOUBLE PRECISION,
    "section232RatePct" DOUBLE PRECISION,
    "ieepaRatePct" DOUBLE PRECISION,
    "additionalRatePct" DOUBLE PRECISION,
    "tariffRatePct" DOUBLE PRECISION,
    "rateSource" TEXT NOT NULL DEFAULT 'spreadsheet',
    "identitySource" TEXT NOT NULL DEFAULT 'spreadsheet',
    "htsInputSource" TEXT,
    "lastSpreadsheetSeedAt" TIMESTAMP(3),
    "lastRateFetchedAt" TIMESTAMP(3),
    "userEditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyItemDuty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyItemDuty_companyId_itemSku_key"
  ON "CompanyItemDuty"("companyId", "itemSku");

CREATE INDEX IF NOT EXISTS "CompanyItemDuty_companyId_htsCode_idx"
  ON "CompanyItemDuty"("companyId", "htsCode");

CREATE INDEX IF NOT EXISTS "CompanyItemDuty_companyId_identitySource_idx"
  ON "CompanyItemDuty"("companyId", "identitySource");
