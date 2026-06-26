CREATE TABLE IF NOT EXISTS "BakersCogsFact" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "sourceCode" TEXT NOT NULL DEFAULT 'BAKERS_COGS',
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "formulaDate" TIMESTAMP(3) NOT NULL,
  "formulaDateKey" TEXT NOT NULL,
  "sheetName" TEXT NOT NULL,
  "lineType" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL DEFAULT 0,
  "metricName" TEXT NOT NULL DEFAULT '',
  "categoryNo" TEXT NOT NULL DEFAULT '',
  "description" TEXT,
  "quantity" DOUBLE PRECISION,
  "unitCost" DOUBLE PRECISION,
  "lineCost" DOUBLE PRECISION,
  "valueNumber" DOUBLE PRECISION,
  "notes" TEXT,
  "metadata" JSONB,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BakersCogsFact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BakersCogsFact_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "BakersCogsFact_companyId_sourceCode_productId_formulaDateKey_lineType_lineNumber_metricName_key"
  ON "BakersCogsFact" (
    "companyId",
    "sourceCode",
    "productId",
    "formulaDateKey",
    "lineType",
    "lineNumber",
    "metricName"
  );

CREATE INDEX IF NOT EXISTS "BakersCogsFact_companyId_sourceCode_formulaDate_idx"
  ON "BakersCogsFact" ("companyId", "sourceCode", "formulaDate");

CREATE INDEX IF NOT EXISTS "BakersCogsFact_companyId_sourceCode_productId_idx"
  ON "BakersCogsFact" ("companyId", "sourceCode", "productId");

CREATE INDEX IF NOT EXISTS "BakersCogsFact_companyId_sourceCode_lineType_idx"
  ON "BakersCogsFact" ("companyId", "sourceCode", "lineType");
