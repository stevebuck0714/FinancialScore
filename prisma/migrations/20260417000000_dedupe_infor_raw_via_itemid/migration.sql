-- Make InforRawRecord ingest idempotent across sync runs by deduping on the
-- CSI-stable per-row identifier (`_ItemId`) instead of `syncRunId + sourceRecordHash`.
--
-- Background:
--   The original unique constraint included `syncRunId`, so every full sync
--   inserted a fresh copy of every artran/aptrx/vchhdr row. We measured 19x
--   to 207x duplication in dev. The application code tries to dedupe at read
--   time but every new query is a foot-gun. This migration:
--
--     1. Backfills `sourceRecordId` from `payload->>'_ItemId'` so existing
--        rows carry the same identifier the writer will set going forward
--        (operational-sync.ts `resolveRawSourceRecordId` was updated to
--        prefer `_ItemId`).
--     2. Adds a PARTIAL UNIQUE INDEX on
--        (companyId, platform, miProgram, sourceRecordId)
--        WHERE sourceRecordId IS NOT NULL
--        — so the existing `createMany({ skipDuplicates: true })` becomes
--        truly idempotent across sync runs for rows that have a stable id.
--        Rows without `_ItemId` (legacy / non-CSI programs) are left as-is.
--
--   The ORIGINAL unique constraint (with syncRunId) is left in place. It does
--   no harm: any row that satisfies the new partial unique key is also unique
--   under the old key. The new key is the one that catches cross-sync dups.
--
-- Apply this AFTER running tmp/dedupe-infor-raw.ts --execute on the target DB,
-- otherwise this migration will fail with a unique-violation on existing dups.

-- 1. Backfill sourceRecordId from _ItemId where the JSON field exists.
--    Only updates rows whose current value differs to avoid no-op writes.
UPDATE "InforRawRecord"
   SET "sourceRecordId" = LEFT(payload->>'_ItemId', 255)
 WHERE payload ? '_ItemId'
   AND COALESCE("sourceRecordId", '') <> LEFT(payload->>'_ItemId', 255);

-- 2. Partial unique index. CONCURRENTLY would be ideal in production but
--    Prisma migrations run inside a transaction so we use a normal CREATE
--    INDEX. For a one-shot prod migration consider running this manually
--    out-of-band with CREATE UNIQUE INDEX CONCURRENTLY.
CREATE UNIQUE INDEX "InforRawRecord_dedup_by_itemid_uniq"
    ON "InforRawRecord" ("companyId", "platform", "miProgram", "sourceRecordId")
 WHERE "sourceRecordId" IS NOT NULL;
