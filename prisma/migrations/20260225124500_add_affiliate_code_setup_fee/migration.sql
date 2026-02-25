-- Add one-time setup fee pricing to affiliate codes.
ALTER TABLE "AffiliateCode"
ADD COLUMN IF NOT EXISTS "setupFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
