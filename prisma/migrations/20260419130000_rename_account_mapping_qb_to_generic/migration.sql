-- Rename QuickBooks-legacy field names on AccountMapping to neutral names.
-- The fields hold generic GL account information across QuickBooks, Infor M3,
-- Xero, etc. Keeping the qb* prefix has caused confusion when working with
-- non-QB accounting systems. Pure column rename, no data movement.

ALTER TABLE "AccountMapping" RENAME COLUMN "qbAccount"               TO "accountName";
ALTER TABLE "AccountMapping" RENAME COLUMN "qbAccountId"             TO "accountId";
ALTER TABLE "AccountMapping" RENAME COLUMN "qbAccountCode"           TO "accountCode";
ALTER TABLE "AccountMapping" RENAME COLUMN "qbAccountClassification" TO "accountClassification";

-- Rename the indexes/constraints that referenced the old column names so they
-- match the conventional Prisma naming and stay readable in pg_indexes.

ALTER INDEX IF EXISTS "AccountMapping_companyId_qbAccountId_key"
  RENAME TO "AccountMapping_companyId_accountId_key";

ALTER INDEX IF EXISTS "AccountMapping_companyId_qbAccount_idx"
  RENAME TO "AccountMapping_companyId_accountName_idx";
