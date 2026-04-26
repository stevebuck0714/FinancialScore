-- Add per-account ownership share + SDE adjustment bucket / line-item columns
-- to AccountMapping.
--
-- These columns were previously introduced into the Prisma schema and applied
-- to dev/staging via raw SQL helper scripts (tmp/add-sde-bucket-column.ts,
-- tmp/add-sde-line-item-column.ts), but were never captured as a Prisma
-- migration. Production drifted out of sync with the generated Prisma client,
-- so any select on AccountMapping started failing once the new client was
-- deployed and the data-mapping / QoE pages rendered as empty.
--
-- IF NOT EXISTS keeps this migration safe to run against environments where
-- the columns were already added by the legacy helper scripts.

ALTER TABLE "AccountMapping"
  ADD COLUMN IF NOT EXISTS "ownerPercent" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "sdeAdjustmentBucket" TEXT,
  ADD COLUMN IF NOT EXISTS "sdeAdjustmentLineItem" TEXT;
