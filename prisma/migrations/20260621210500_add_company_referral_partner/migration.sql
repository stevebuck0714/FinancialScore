-- Track manual referral attribution separately from company ownership and affiliate-code pricing.
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "referralPartnerConsultantId" TEXT,
  ADD COLUMN IF NOT EXISTS "referralSetupFeePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "referralRecurringFeePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "ConsultantPayable"
  ADD COLUMN IF NOT EXISTS "payableType" TEXT NOT NULL DEFAULT 'consultant_revenue_share';

CREATE INDEX IF NOT EXISTS "Company_referralPartnerConsultantId_idx"
  ON "Company"("referralPartnerConsultantId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Company_referralPartnerConsultantId_fkey'
  ) THEN
    ALTER TABLE "Company"
      ADD CONSTRAINT "Company_referralPartnerConsultantId_fkey"
      FOREIGN KEY ("referralPartnerConsultantId") REFERENCES "Consultant"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
