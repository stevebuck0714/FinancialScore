-- Record how each SDE adjustment was entered (percent of the account vs. a
-- fixed dollar amount) and the reason for it, for the Quality of Earnings
-- adjustment summary.

ALTER TABLE "AccountMapping"
  ADD COLUMN IF NOT EXISTS "ownerAdjustmentMode" TEXT,
  ADD COLUMN IF NOT EXISTS "ownerAdjustmentAmount" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "sdeAdjustmentNote" TEXT;
