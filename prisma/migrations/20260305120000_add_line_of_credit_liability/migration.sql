-- Add dedicated Line of Credit liability account fields.
ALTER TABLE "MonthlyFinancial" ADD COLUMN "loc" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "DailyFinancialSnapshot" ADD COLUMN "loc" DOUBLE PRECISION NOT NULL DEFAULT 0;
