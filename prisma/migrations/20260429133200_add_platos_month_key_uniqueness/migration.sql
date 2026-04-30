ALTER TABLE "PlatosClosetWorkbookSnapshot"
  ADD COLUMN IF NOT EXISTS "monthKey" TEXT;

UPDATE "PlatosClosetWorkbookSnapshot"
SET "monthKey" = CASE
  WHEN "workbookPeriod" ~ '^\d{1,2}/\d{1,2}-\d{1,2}/\d{1,2}/\d{2,4}$' THEN
    CONCAT(
      CASE
        WHEN length(split_part("workbookPeriod", '/', 4)) = 2 THEN CONCAT('20', split_part("workbookPeriod", '/', 4))
        ELSE split_part("workbookPeriod", '/', 4)
      END,
      '-',
      LPAD(split_part("workbookPeriod", '/', 1), 2, '0')
    )
  ELSE to_char(COALESCE("uploadedAt", "createdAt", NOW()), 'YYYY-MM')
END
WHERE "monthKey" IS NULL
   OR "monthKey" = ''
   OR "monthKey" !~ '^\d{4}-\d{2}$';

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "companyId", "sourceCode", "monthKey"
      ORDER BY COALESCE("uploadedAt", "updatedAt", "createdAt") DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "PlatosClosetWorkbookSnapshot"
)
DELETE FROM "PlatosClosetWorkbookSnapshot" s
USING ranked r
WHERE s."id" = r."id"
  AND r.rn > 1;

ALTER TABLE "PlatosClosetWorkbookSnapshot"
  ALTER COLUMN "monthKey" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "PlatosClosetWorkbookSnapshot_companyId_sourceCode_monthKey_idx"
  ON "PlatosClosetWorkbookSnapshot"("companyId", "sourceCode", "monthKey");

CREATE UNIQUE INDEX IF NOT EXISTS "PlatosClosetWorkbookSnapshot_companyId_sourceCode_monthKey_key"
  ON "PlatosClosetWorkbookSnapshot"("companyId", "sourceCode", "monthKey");
