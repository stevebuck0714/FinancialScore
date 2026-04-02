-- Stop treating account name as identity.
-- Preserve separate accounts that share the same label by enforcing uniqueness on account ID per company.

DROP INDEX IF EXISTS "AccountMapping_companyId_qbAccount_key";

CREATE UNIQUE INDEX IF NOT EXISTS "AccountMapping_companyId_qbAccountId_key"
ON "AccountMapping"("companyId", "qbAccountId");

CREATE INDEX IF NOT EXISTS "AccountMapping_companyId_qbAccount_idx"
ON "AccountMapping"("companyId", "qbAccount");
