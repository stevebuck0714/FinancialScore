-- Phase 4: extend APTransactionFact to store per-voucher payment events
-- (Type=P) and adjustments (Type=A) harvested from SLAptrxps/SLAPTRXPS,
-- in addition to voucher creations (Type=V) from SLVchHdrs.
--
-- Background:
--   The AP roll-forward currently has no voucher-level payment data because
--   GL APP/APA refs key on vendor (one payment can settle many vouchers),
--   not on individual vouchers. CSI keeps the voucher↔payment linkage in
--   the SL aptrxp table and exposes it via SLAptrxps Type=P rows. We
--   already ingest those rows into InforRawRecord but never write them
--   to APTransactionFact, so a voucher like 13569 (paid in full on
--   2023-11-17) shows up as still-open in our roll-forward.
--
-- Schema changes:
--   1. Add `sourceItemId` (the CSI _ItemId / aptrxp.ID UUID per payment line).
--      A single voucher can have multiple Type=P rows (partial payments);
--      sourceItemId is the natural unique key per payment line. Type=V rows
--      written from SLVchHdrs continue to use NULL sourceItemId (one row
--      per voucher+vouchSeq).
--   2. Add `sourceProgram` so we can distinguish events that came from
--      SLVchHdrs vs SLAptrxps vs AP_OPEN, useful for diagnostics and to
--      let downstream code prefer one source over another when needed.
--   3. Replace the unique constraint
--          (companyId, voucher, vouchSeq, transType)
--      with
--          (companyId, voucher, vouchSeq, transType, sourceItemId)
--      using NULLS NOT DISTINCT so Type=V rows (sourceItemId=NULL) still
--      collapse to one logical row per voucher, while Type=P/A rows can
--      coexist with their distinct sourceItemId values.
--
-- Safety:
--   - This migration is purely additive for existing rows (no data loss).
--   - Existing Type=V rows have sourceItemId=NULL after the column add.
--     The new unique key on (...sourceItemId) with NULLS NOT DISTINCT
--     treats those NULLs as equal, so the existing
--     (companyId, voucher, vouchSeq, transType) uniqueness is preserved
--     for Type=V rows.
--   - The backfill for Type=P/A rows is run by tmp/backfill-ap-payment-events.ts.

-- 1. Add new columns.
ALTER TABLE "APTransactionFact" ADD COLUMN IF NOT EXISTS "sourceItemId" TEXT;
ALTER TABLE "APTransactionFact" ADD COLUMN IF NOT EXISTS "sourceProgram" TEXT;

-- 2. Drop the old unique constraint/index.
ALTER TABLE "APTransactionFact"
    DROP CONSTRAINT IF EXISTS "APTransactionFact_companyId_voucher_vouchSeq_transType_key";
DROP INDEX IF EXISTS "APTransactionFact_companyId_voucher_vouchSeq_transType_key";

-- 3. Create the new strict unique index. NULLS NOT DISTINCT (Postgres 15+,
--    Neon supports it) ensures Type=V rows with sourceItemId=NULL still
--    obey the original uniqueness contract while Type=P/A rows can have
--    multiple per voucher distinguished by sourceItemId.
--    Index name is mapped to "APTransactionFact_event_uniq" in the
--    Prisma schema (the auto-generated name exceeds Postgres's 63-byte
--    identifier limit and gets truncated unpredictably).
CREATE UNIQUE INDEX IF NOT EXISTS "APTransactionFact_event_uniq"
    ON "APTransactionFact" ("companyId", "voucher", "vouchSeq", "transType", "sourceItemId")
    NULLS NOT DISTINCT;

-- 3a. If a previous build created the index under the auto-truncated name,
--     drop it so only the canonical "APTransactionFact_event_uniq" remains.
DROP INDEX IF EXISTS "APTransactionFact_companyId_voucher_vouchSeq_transType_sourceI_";
DROP INDEX IF EXISTS "APTransactionFact_companyId_voucher_vouchSeq_transType_sourceI_key";

-- 4. Helpful index for read-side queries that filter by program (e.g. for
--    diagnostics or for the "purged-from-CSI" inference path that needs to
--    distinguish SLVchHdrs vouchers from SLAptrxps payments).
CREATE INDEX IF NOT EXISTS "APTransactionFact_companyId_sourceProgram_idx"
    ON "APTransactionFact" ("companyId", "sourceProgram");
