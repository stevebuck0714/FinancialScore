CREATE TABLE IF NOT EXISTS "CompanyItemDutyApplication" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemSku" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enteredValuePerPiece" DOUBLE PRECISION,
    "dutyRatePct" DOUBLE PRECISION,
    "tariffRatePct" DOUBLE PRECISION,
    "dutyAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tariffAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quoteAsOfDate" TIMESTAMP(3),
    "rateSource" TEXT NOT NULL DEFAULT 'hts',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyItemDutyApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyItemDutyApplication_companyId_itemSku_eventDate_key"
  ON "CompanyItemDutyApplication"("companyId", "itemSku", "eventDate");

CREATE INDEX IF NOT EXISTS "CompanyItemDutyApplication_companyId_eventDate_idx"
  ON "CompanyItemDutyApplication"("companyId", "eventDate");
