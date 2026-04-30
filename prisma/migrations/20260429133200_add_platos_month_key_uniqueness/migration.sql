ALTER TABLE "PlatosClosetWorkbookSnapshot"
  ADD COLUMN IF NOT EXISTS "monthKey" TEXT;

UPDATE "PlatosClosetWorkbookSnapshot"
SET "monthKey" = COALESCE(
  "monthKey",
  CASE
    WHEN "workbookPeriod" ~ '^\d{1,2}/\d{1,2}-\d{1,2}/\d{1,2}/\d{2,4}$' THEN
      CONCAT(
        CASE
          WHEN length(split_part("workbookPeriod", '/', 3)) = 2 THEN CONCAT('20', split_part("workbookPeriod", '/', 3))
          ELSE split_part("workbookPeriod", '/', 3)
        END,
        '-',
        LPAD(split_part("workbookPeriod", '/', 1), 2, '0')
      )
    ELSE to_char(COALESCE("uploadedAt", "createdAt", NOW()), 'YYYY-MM')
  END
)
WHERE "monthKey" IS NULL OR "monthKey" = '';

ALTER TABLE "PlatosClosetWorkbookSnapshot"
  ALTER COLUMN "monthKey" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "PlatosClosetWorkbookSnapshot_companyId_sourceCode_monthKey_idx"
  ON "PlatosClosetWorkbookSnapshot"("companyId", "sourceCode", "monthKey");

CREATE UNIQUE INDEX IF NOT EXISTS "PlatosClosetWorkbookSnapshot_companyId_sourceCode_monthKey_key"
  ON "PlatosClosetWorkbookSnapshot"("companyId", "sourceCode", "monthKey");
