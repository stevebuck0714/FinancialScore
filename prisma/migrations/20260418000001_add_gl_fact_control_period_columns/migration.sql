-- Add `controlPeriod`, `controlYear`, and `distDate` columns to GLTransactionFact.
--
-- Background:
--   These three columns are declared in `prisma/schema.prisma` (see model
--   `GLTransactionFact`) and the `saveGLTransactionFacts` writer in
--   `lib/infor-m3/operational-sync.ts` already references them in its INSERT
--   statement. Production already has these columns (added directly via Neon
--   SQL when the SLLedgers ControlPeriod work landed) and ~47% of GL rows
--   carry a populated `controlPeriod`. Dev/staging databases never received
--   the equivalent change, so writes to GLTransactionFact fail there with
--   `column "controlPeriod" does not exist`.
--
--   This migration brings the schema-vs-DB state into alignment by formally
--   recording the column adds.
--
-- Idempotency:
--   `ADD COLUMN IF NOT EXISTS` makes this migration safe to apply on databases
--   that already have the columns (production) and on databases that don't
--   (dev/staging/fresh provisions). Both end up in the same state and the
--   `_prisma_migrations` table records the migration as applied either way.
--
-- Scope:
--   Intentionally narrow. Other schema drift (e.g. APTransactionFact.recordDate,
--   CustomerSalesSnapshot.cogs/grossMargin/grossMarginPct, dropped tables) is
--   tracked separately and not touched here.

ALTER TABLE "GLTransactionFact" ADD COLUMN IF NOT EXISTS "distDate"      TIMESTAMP(3);
ALTER TABLE "GLTransactionFact" ADD COLUMN IF NOT EXISTS "controlPeriod" INTEGER;
ALTER TABLE "GLTransactionFact" ADD COLUMN IF NOT EXISTS "controlYear"   INTEGER;
