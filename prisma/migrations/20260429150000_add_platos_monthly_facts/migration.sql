DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'PlatosClosetMonthlyFact'
  ) THEN
    CREATE TABLE "PlatosClosetMonthlyFact" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "sourceCode" TEXT NOT NULL DEFAULT 'PLATOS_CLOSET_STORE_VISIT',
      "monthKey" TEXT NOT NULL,
      "monthStart" TIMESTAMP(3) NOT NULL,
      "factType" TEXT NOT NULL,
      "metricName" TEXT NOT NULL,
      "dimensionType" TEXT NOT NULL DEFAULT '',
      "dimensionKey" TEXT NOT NULL DEFAULT '',
      "dimensionLabel" TEXT,
      "valueNumber" DOUBLE PRECISION,
      "compareNumber" DOUBLE PRECISION,
      "sharePct" DOUBLE PRECISION,
      "auxNumber" DOUBLE PRECISION,
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlatosClosetMonthlyFact_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "PlatosClosetMonthlyFact_companyId_fkey"
        FOREIGN KEY ("companyId")
        REFERENCES "Company"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
    );
  END IF;
END $$;

ALTER TABLE "PlatosClosetMonthlyFact"
  ADD COLUMN IF NOT EXISTS "sourceCode" TEXT NOT NULL DEFAULT 'PLATOS_CLOSET_STORE_VISIT',
  ADD COLUMN IF NOT EXISTS "monthKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "monthStart" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "factType" TEXT NOT NULL DEFAULT 'summary_metric',
  ADD COLUMN IF NOT EXISTS "metricName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "dimensionType" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "dimensionKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "dimensionLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "valueNumber" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "compareNumber" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "sharePct" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "auxNumber" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "PlatosClosetMonthlyFact"
SET "monthStart" = to_date("monthKey" || '-01', 'YYYY-MM-DD')::timestamp
WHERE "monthStart" IS NULL
  AND "monthKey" ~ '^\d{4}-\d{2}$';

UPDATE "PlatosClosetMonthlyFact"
SET "dimensionType" = COALESCE("dimensionType", ''),
    "dimensionKey" = COALESCE("dimensionKey", '')
WHERE "dimensionType" IS NULL
   OR "dimensionKey" IS NULL;

ALTER TABLE "PlatosClosetMonthlyFact"
  ALTER COLUMN "monthStart" SET NOT NULL,
  ALTER COLUMN "dimensionType" SET NOT NULL,
  ALTER COLUMN "dimensionKey" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "PlatosClosetMonthlyFact_companyId_sourceCode_monthKey_factType_metricName_dimensionType_dimensionKey_key"
  ON "PlatosClosetMonthlyFact" (
    "companyId",
    "sourceCode",
    "monthKey",
    "factType",
    "metricName",
    "dimensionType",
    "dimensionKey"
  );

CREATE INDEX IF NOT EXISTS "PlatosClosetMonthlyFact_companyId_sourceCode_monthStart_idx"
  ON "PlatosClosetMonthlyFact" ("companyId", "sourceCode", "monthStart");

CREATE INDEX IF NOT EXISTS "PlatosClosetMonthlyFact_companyId_sourceCode_factType_monthStart_idx"
  ON "PlatosClosetMonthlyFact" ("companyId", "sourceCode", "factType", "monthStart");

CREATE INDEX IF NOT EXISTS "PlatosClosetMonthlyFact_companyId_sourceCode_monthKey_idx"
  ON "PlatosClosetMonthlyFact" ("companyId", "sourceCode", "monthKey");
