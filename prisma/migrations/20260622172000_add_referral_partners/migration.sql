CREATE TABLE IF NOT EXISTS "ReferralPartner" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contactName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "defaultSetupFeePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "defaultRecurringFeePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paymentMethod" TEXT,
  "taxId" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralPartner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReferralPartner_active_idx"
  ON "ReferralPartner"("active");

CREATE INDEX IF NOT EXISTS "ReferralPartner_name_idx"
  ON "ReferralPartner"("name");

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "referralPartnerId" TEXT;

ALTER TABLE "Consultant"
  ADD COLUMN IF NOT EXISTS "referralPartnerId" TEXT,
  ADD COLUMN IF NOT EXISTS "referralSetupFeePercentage" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "referralRecurringFeePercentage" DOUBLE PRECISION;

ALTER TABLE "ConsultantPayable"
  ADD COLUMN IF NOT EXISTS "referralPartnerId" TEXT;

ALTER TABLE "ConsultantPayable"
  ALTER COLUMN "consultantId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "Company_referralPartnerId_idx"
  ON "Company"("referralPartnerId");

CREATE INDEX IF NOT EXISTS "Consultant_referralPartnerId_idx"
  ON "Consultant"("referralPartnerId");

CREATE INDEX IF NOT EXISTS "ConsultantPayable_referralPartnerId_idx"
  ON "ConsultantPayable"("referralPartnerId");

INSERT INTO "ReferralPartner" (
  "id",
  "name",
  "contactName",
  "email",
  "phone",
  "defaultSetupFeePercentage",
  "defaultRecurringFeePercentage",
  "paymentMethod",
  "taxId",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  'rp_' || c."id",
  COALESCE(NULLIF(c."companyName", ''), c."fullName"),
  c."fullName",
  u."email",
  c."phone",
  0,
  0,
  c."paymentMethod",
  c."taxId",
  'Backfilled from legacy referral-partner consultant attribution.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Consultant" c
JOIN "User" u ON u."id" = c."userId"
WHERE EXISTS (
  SELECT 1
  FROM "Company" company
  WHERE company."referralPartnerConsultantId" = c."id"
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "Company" company
SET "referralPartnerId" = 'rp_' || company."referralPartnerConsultantId"
WHERE company."referralPartnerId" IS NULL
  AND company."referralPartnerConsultantId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Company_referralPartnerId_fkey'
  ) THEN
    ALTER TABLE "Company"
      ADD CONSTRAINT "Company_referralPartnerId_fkey"
      FOREIGN KEY ("referralPartnerId") REFERENCES "ReferralPartner"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Consultant_referralPartnerId_fkey'
  ) THEN
    ALTER TABLE "Consultant"
      ADD CONSTRAINT "Consultant_referralPartnerId_fkey"
      FOREIGN KEY ("referralPartnerId") REFERENCES "ReferralPartner"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ConsultantPayable_referralPartnerId_fkey'
  ) THEN
    ALTER TABLE "ConsultantPayable"
      ADD CONSTRAINT "ConsultantPayable_referralPartnerId_fkey"
      FOREIGN KEY ("referralPartnerId") REFERENCES "ReferralPartner"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
