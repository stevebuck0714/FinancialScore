-- AlterTable
ALTER TABLE "Company" ADD COLUMN "fiscalYearEndMonth" INTEGER;

-- Backfill from the QoE Engagement Tracker, then from the latest Cash Proof engagement when it is not the December default.
UPDATE "Company" c
SET "fiscalYearEndMonth" = t."fiscalYearEndMonth"
FROM "QoeEngagementTracker" t
WHERE t."companyId" = c."id"
  AND t."fiscalYearEndMonth" BETWEEN 1 AND 12
  AND c."fiscalYearEndMonth" IS NULL;

UPDATE "Company" c
SET "fiscalYearEndMonth" = latest."fiscalYearEndMonth"
FROM (
  SELECT DISTINCT ON ("companyId") "companyId", "fiscalYearEndMonth"
  FROM "CashProofEngagement"
  ORDER BY "companyId", "createdAt" DESC
) latest
WHERE latest."companyId" = c."id"
  AND latest."fiscalYearEndMonth" BETWEEN 1 AND 11
  AND c."fiscalYearEndMonth" IS NULL;
