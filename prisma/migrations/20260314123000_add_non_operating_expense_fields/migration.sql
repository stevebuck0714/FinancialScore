-- Add nonOperatingExpense to monthly and daily financial snapshots.
-- Default 0 keeps historical rows query-safe immediately.
ALTER TABLE "MonthlyFinancial"
ADD COLUMN "nonOperatingExpense" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "DailyFinancialSnapshot"
ADD COLUMN "nonOperatingExpense" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Defensive backfill (should already be zero from NOT NULL DEFAULT).
UPDATE "MonthlyFinancial"
SET "nonOperatingExpense" = 0
WHERE "nonOperatingExpense" IS NULL;

UPDATE "DailyFinancialSnapshot"
SET "nonOperatingExpense" = 0
WHERE "nonOperatingExpense" IS NULL;
