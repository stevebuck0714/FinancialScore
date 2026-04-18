-- Deduplicate GLTransactionFact and tighten its uniqueness constraint to a key
-- that actually catches CSI duplicates: (companyId, transDate, accountId, transNum).
--
-- Background:
--   The original unique constraint
--       (companyId, transDate, accountId, transNum, ref, description)
--   is bypassed by NULL values because Postgres treats NULL as DISTINCT in unique
--   indexes by default. Both the SLGLTRANS and SLLedgers IDOs emit rows for the
--   same logical posting; one of them often writes NULL for `description` while
--   the other writes "" (or both write NULL with subtle whitespace differences),
--   so duplicate rows survived the constraint.
--
--   Investigation on prod (account 30100) showed exactly 1:1 SLGLTRANS+SLLedgers
--   pairs in the size-2 groups, plus a tail of 1 SLGLTRANS + N SLLedgers groups
--   from re-syncs that all contain identical signedAmount / ref / description.
--   The only column that differs within a duplicate group is `controlPeriod`
--   (set on SLLedgers, NULL on SLGLTRANS). Cleanup is therefore non-destructive.
--
--   The aggregated payment delta on the AP roll-forward was inflated by exactly
--   ~2x, catastrophically corrupting the AP balance derivation.
--
-- Strategy:
--   1. DELETE duplicates within (companyId, transDate, accountId, transNum)
--      groups, keeping a canonical row chosen by:
--        a. controlPeriod IS NOT NULL first (SLLedgers w/ fiscal-period stamp)
--        b. then sourceProgram = 'SLLedgers'
--        c. then the earliest createdAt
--   2. DROP the old permissive unique index.
--   3. CREATE a new strict unique index on (companyId, transDate, accountId,
--      transNum) using NULLS NOT DISTINCT (Postgres 15+) so NULL transNum rows
--      can also no longer create duplicates if they ever appear.
--
-- Safety:
--   transNum is verified non-NULL in 100% of rows on dev (12,474/12,474) and
--   prod (256,041/256,041). The new key is achievable on both DBs.
--   On dev there are zero duplicates, so the DELETE is a no-op.
--   On prod ~121,833 duplicate rows will be removed (out of 254,767), leaving
--   132,934 distinct logical transactions.
--
-- Recovery:
--   Snapshot the table to "GLTransactionFact_snapshot_20260418" before
--   running this migration on prod (see tmp/snapshot-gl-fact.ts).

-- 1. Delete duplicates, keep canonical row per (companyId, transDate, accountId, transNum) group.
WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "companyId", "transDate", "accountId", "transNum"
            ORDER BY
                CASE WHEN "controlPeriod" IS NOT NULL THEN 0 ELSE 1 END,
                CASE WHEN "sourceProgram" = 'SLLedgers' THEN 0 ELSE 1 END,
                "createdAt" ASC,
                "id" ASC
        ) AS rn
    FROM "GLTransactionFact"
)
DELETE FROM "GLTransactionFact" g
 USING ranked r
 WHERE g."id" = r."id"
   AND r.rn > 1;

-- 2. Drop the old permissive unique index (auto-named by Prisma).
DROP INDEX IF EXISTS "GLTransactionFact_companyId_transDate_accountId_transNum_ref_de";

-- 3. Create the new strict unique index. The name matches what Prisma generates
--    for `@@unique([companyId, transDate, accountId, transNum])` so the schema
--    and the database stay in sync. transNum is non-NULL in 100% of current
--    rows on both dev and prod (verified pre-migration), so default Postgres
--    NULL handling (NULLs treated as distinct) is acceptable for now. The
--    application-level dedup in saveGLTransactionFacts already skips rows
--    without a transNum.
CREATE UNIQUE INDEX "GLTransactionFact_companyId_transDate_accountId_transNum_key"
    ON "GLTransactionFact" ("companyId", "transDate", "accountId", "transNum");
