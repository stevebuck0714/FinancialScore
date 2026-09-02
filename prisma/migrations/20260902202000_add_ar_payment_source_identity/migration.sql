-- Give AR cash-collection facts the same stable source identity used for
-- idempotent transaction ingestion. PostgreSQL permits multiple NULLs here,
-- preserving legacy rows until the Atlantic rebuild replaces them.
ALTER TABLE "ARPaymentFact"
ADD COLUMN "sourceItemId" TEXT;

CREATE UNIQUE INDEX "ARPaymentFact_companyId_sourceItemId_key"
ON "ARPaymentFact"("companyId", "sourceItemId");
