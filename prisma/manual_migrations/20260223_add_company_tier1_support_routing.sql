ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "tier1SupportOwner" TEXT DEFAULT 'CORELYTICS',
ADD COLUMN IF NOT EXISTS "tier1SupportConsultantId" TEXT;

UPDATE "Company"
SET
  "tier1SupportOwner" = CASE
    WHEN "consultantId" IS NULL THEN 'CORELYTICS'
    ELSE 'CONSULTANT'
  END,
  "tier1SupportConsultantId" = CASE
    WHEN "consultantId" IS NULL THEN NULL
    ELSE "consultantId"
  END
WHERE "tier1SupportOwner" IS NULL;

UPDATE "Company"
SET
  "tier1SupportOwner" = 'CORELYTICS',
  "tier1SupportConsultantId" = NULL
WHERE "tier1SupportOwner" = 'CONSULTANT'
  AND "tier1SupportConsultantId" IS NULL;

CREATE INDEX IF NOT EXISTS "Company_tier1SupportOwner_idx" ON "Company"("tier1SupportOwner");
CREATE INDEX IF NOT EXISTS "Company_tier1SupportConsultantId_idx" ON "Company"("tier1SupportConsultantId");
