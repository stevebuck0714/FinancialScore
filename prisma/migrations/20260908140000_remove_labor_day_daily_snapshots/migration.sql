DELETE FROM "DailyFinancialSnapshot"
WHERE "frequency" = 'daily'
  AND "snapshotDate" >= TIMESTAMP '2026-09-07 00:00:00'
  AND "snapshotDate" < TIMESTAMP '2026-09-08 00:00:00';

DELETE FROM "CashSnapshot"
WHERE "frequency" = 'daily'
  AND "snapshotDate" >= TIMESTAMP '2026-09-07 00:00:00'
  AND "snapshotDate" < TIMESTAMP '2026-09-08 00:00:00';

DELETE FROM "BalanceSheetAccountAnchor"
WHERE "anchorDate" >= TIMESTAMP '2026-09-07 00:00:00'
  AND "anchorDate" < TIMESTAMP '2026-09-08 00:00:00';
