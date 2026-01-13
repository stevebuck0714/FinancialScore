-- Manual schema patch: add income tax fields to MonthlyFinancial
-- NOTE: We are using a manual SQL patch because Prisma schema pushes/migrations
-- currently fail against this database due to legacy enum/type drift.
--
-- Safe to run multiple times? NO. If columns already exist, this will error.
-- If needed, wrap in conditional checks per environment tooling.

ALTER TABLE "MonthlyFinancial"
ADD COLUMN "stateIncomeTaxes" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "MonthlyFinancial"
ADD COLUMN "federalIncomeTaxes" DOUBLE PRECISION NOT NULL DEFAULT 0;





