/**
 * Inspect the state of `_prisma_migrations` for the dedup migration,
 * plus baseline row counts and duplicate counts on InforRawRecord, so we
 * know whether to:
 *   (a) `prisma migrate resolve --rolled-back <name>` then dedupe-then-migrate
 *   (b) just rerun migrate (if it actually completed)
 *   (c) something else
 *
 * Usage:
 *   $env:DATABASE_URL = "<DIRECT (non-pooler) prod URL>"
 *   npx tsx tmp/check-migration-state.ts
 */
import { Client } from 'pg';

const MIGRATION_NAME = '20260417000000_dedupe_infor_raw_via_itemid';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  console.log('Connecting to:', url.replace(/:([^:@]+)@/, ':***@'));

  const client = new Client({ connectionString: url });
  await client.connect();

  // 1. Migration row state
  const mig = await client.query(
    `SELECT migration_name, started_at, finished_at, applied_steps_count,
            rolled_back_at, logs IS NOT NULL AS has_logs, left(logs, 400) AS log_preview
       FROM _prisma_migrations
      WHERE migration_name = $1`,
    [MIGRATION_NAME]
  );
  console.log('\n--- _prisma_migrations row for', MIGRATION_NAME, '---');
  if (mig.rows.length === 0) {
    console.log('  (no row — migration was never recorded; safe to re-run)');
  } else {
    console.table(mig.rows);
  }

  // 2. Does the partial unique index exist?
  const idx = await client.query(
    `SELECT indexname, indexdef
       FROM pg_indexes
      WHERE tablename = 'InforRawRecord'
        AND indexname = 'InforRawRecord_dedup_by_itemid_uniq'`
  );
  console.log('\n--- partial unique index ---');
  console.log(idx.rows.length ? idx.rows[0] : '  (does NOT exist yet)');

  // 3. Total InforRawRecord rows
  const total = await client.query(`SELECT COUNT(*)::bigint AS total FROM "InforRawRecord"`);
  console.log('\n--- InforRawRecord total rows:', total.rows[0].total);

  // 4. How many rows have _ItemId in payload?
  const withItemId = await client.query(
    `SELECT COUNT(*)::bigint AS with_item_id FROM "InforRawRecord" WHERE payload ? '_ItemId'`
  );
  console.log('rows with payload._ItemId:', withItemId.rows[0].with_item_id);

  // 5. How many rows still need sourceRecordId backfill from _ItemId?
  const needBackfill = await client.query(
    `SELECT COUNT(*)::bigint AS need_backfill
       FROM "InforRawRecord"
      WHERE payload ? '_ItemId'
        AND COALESCE("sourceRecordId", '') <> LEFT(payload->>'_ItemId', 255)`
  );
  console.log('rows still needing sourceRecordId backfill:', needBackfill.rows[0].need_backfill);

  // 6. Duplicate count by program (would block the unique index)
  const dups = await client.query(`
    SELECT "miProgram",
           COUNT(*)::bigint AS rows,
           COUNT(*)::bigint - COUNT(DISTINCT ("companyId", "platform", "miProgram", "sourceRecordId")) AS dup_excess
      FROM "InforRawRecord"
     WHERE "sourceRecordId" IS NOT NULL
     GROUP BY "miProgram"
     HAVING COUNT(*) - COUNT(DISTINCT ("companyId", "platform", "miProgram", "sourceRecordId")) > 0
     ORDER BY dup_excess DESC
     LIMIT 25;
  `);
  console.log('\n--- duplicate-excess by miProgram (rows that block the unique index) ---');
  if (dups.rows.length === 0) {
    console.log('  (no duplicates — the unique index can be created right now)');
  } else {
    console.table(dups.rows);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
