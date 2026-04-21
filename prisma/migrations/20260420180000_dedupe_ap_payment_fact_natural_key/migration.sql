-- Add a stable natural-key column to APPaymentFact, backfill it, collapse the
-- pre-existing duplicate rows produced by repeated Infor syncs, and enforce
-- uniqueness so future syncs cannot multiply the table again.
--
-- Background: production observed 1.5M+ APPaymentFact rows for a single
-- company over a 12-month window. One FedEx voucher had 25,222 identical
-- copies. Root cause was that saveAPPayments() in lib/infor-m3/operational-sync
-- called createMany() with no unique key to deduplicate against; every
-- re-sync re-inserted every payment event. The natural key chosen here
-- (paymentDate UTC | vendorName | billNo | paidAmountHome) collapses these
-- copies and gives saveAPPayments() something to skipDuplicates() against.

-- 1) Add the column. Idempotent so partial reruns are safe.
ALTER TABLE "APPaymentFact" ADD COLUMN IF NOT EXISTS "sourceItemId" TEXT;

-- 2) Backfill sourceItemId for every existing row using the same natural key
--    that saveAPPayments() will compute going forward. paymentDate is stored
--    as TIMESTAMP without time zone but Prisma writes UTC values, so to_char
--    yields the same calendar date that JS .toISOString().slice(0,10) does.
UPDATE "APPaymentFact"
SET "sourceItemId" = md5(
  COALESCE(to_char("paymentDate", 'YYYY-MM-DD'), '') || '|' ||
  COALESCE("vendorName", '') || '|' ||
  COALESCE("billNo", '') || '|' ||
  to_char(ROUND("paidAmountHome"::numeric, 2), 'FM999999999999990.00')
)
WHERE "sourceItemId" IS NULL;

-- 3) Collapse duplicates. Keep the oldest copy (earliest createdAt, ties
--    broken by id) per (companyId, sourceItemId) and delete the rest.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "companyId", "sourceItemId"
    ORDER BY "createdAt" ASC, id ASC
  ) AS rn
  FROM "APPaymentFact"
  WHERE "sourceItemId" IS NOT NULL
)
DELETE FROM "APPaymentFact"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 4) Enforce uniqueness for future inserts. NULLS NOT DISTINCT means even
--    rows that somehow land with NULL sourceItemId still collapse to one.
CREATE UNIQUE INDEX IF NOT EXISTS "APPaymentFact_companyId_sourceItemId_key"
  ON "APPaymentFact" ("companyId", "sourceItemId")
  NULLS NOT DISTINCT;
