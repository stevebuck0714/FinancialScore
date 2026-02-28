-- Manual migration: setup fee + delayed recurring start
-- This repo uses manual migrations to avoid Prisma migrate issues on some environments.
--
-- Safe to run multiple times.

-- 1) Company: add one-time setup fee pricing
ALTER TABLE IF EXISTS "Company"
  ADD COLUMN IF NOT EXISTS "subscriptionSetupFee" DOUBLE PRECISION NULL DEFAULT 0;

-- 2) SystemSettings: add default setup fee fields (business/consultant)
ALTER TABLE IF EXISTS "SystemSettings"
  ADD COLUMN IF NOT EXISTS "businessSetupFee" DOUBLE PRECISION NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "consultantSetupFee" DOUBLE PRECISION NULL DEFAULT 0;

-- 3) Subscription: persist setup-fee status + anchor dates for recurring schedule
ALTER TABLE IF EXISTS "Subscription"
  ADD COLUMN IF NOT EXISTS "setupFeeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "setupFeeStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "setupFeePaidAt" TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS "setupFeeTransactionId" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "billingAnchorDate" TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS "firstRecurringBillDate" TIMESTAMPTZ NULL;

-- 4) PaymentType enum: add SETUP_FEE (if your DB uses enums)
DO $$
BEGIN
  ALTER TYPE "PaymentType" ADD VALUE 'SETUP_FEE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

