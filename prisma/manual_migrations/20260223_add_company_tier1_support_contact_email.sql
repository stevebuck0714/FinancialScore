ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "tier1SupportContactEmail" TEXT;

CREATE INDEX IF NOT EXISTS "Company_tier1SupportContactEmail_idx"
ON "Company"("tier1SupportContactEmail");
