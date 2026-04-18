/**
 * Apply the SQL from migration `20260417000000_dedupe_infor_raw_via_itemid`
 * that was marked APPLIED on prod (white lie to unblock the build) without
 * actually executing. Run AFTER all dedupe-staged.ts and dedupe-infor-raw.ts
 * runs are complete on prod.
 *
 * Performs (idempotent):
 *   1. UPDATE InforRawRecord SET sourceRecordId = LEFT(payload->>'_ItemId',255)
 *      WHERE payload ? '_ItemId' AND sourceRecordId IS DISTINCT FROM that.
 *      Done in chunks driven by createdAt date ranges to avoid locking the
 *      whole table at once.
 *   2. CREATE UNIQUE INDEX IF NOT EXISTS InforRawRecord_dedup_by_itemid_uniq
 *      ON ("companyId","platform","miProgram","sourceRecordId")
 *      WHERE "sourceRecordId" IS NOT NULL.
 *
 * Safety:
 *   - DRY RUN by default. --execute to apply.
 *   - Refuses pooler endpoints.
 *   - Will refuse to create the unique index if there are still duplicate
 *     (companyId, platform, miProgram, sourceRecordId) groups present.
 */
import { Client } from 'pg';

const DRY_RUN = !process.argv.includes('--execute');
function ts() { return new Date().toISOString().slice(11, 19); }
function fmt(n: number | bigint) { return Number(n).toLocaleString(); }

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const dbHost = url.split('@')[1]?.split('/')[0] || '';
  if (dbHost.includes('-pooler')) {
    console.error(`DATABASE_URL is pooler (${dbHost}). Use the DIRECT endpoint.`);
    process.exit(1);
  }
  console.log(`[${ts()}] DB:   ${dbHost}`);
  console.log(`[${ts()}] Mode: ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}`);

  const client = new Client({
    connectionString: url,
    keepAlive: true,
    keepAliveInitialDelayMillis: 30_000,
    statement_timeout: 0,
    query_timeout: 0,
  } as any);
  await client.connect();
  await client.query(`SET statement_timeout TO 0`);
  await client.query(`SET idle_in_transaction_session_timeout TO 0`);
  await client.query(`SET lock_timeout TO '60s'`);

  try {
    // 1. Backfill audit.
    console.log(`\n[${ts()}] === sourceRecordId backfill audit ===`);
    const need = await client.query(`
      SELECT COUNT(*)::bigint AS need_update
        FROM "InforRawRecord"
       WHERE payload ? '_ItemId'
         AND COALESCE("sourceRecordId", '') <> LEFT(payload->>'_ItemId', 255)
    `);
    const needUpdate = BigInt(need.rows[0].need_update);
    console.log(`  rows needing sourceRecordId update: ${fmt(needUpdate)}`);

    if (needUpdate > 0n && !DRY_RUN) {
      console.log(`\n[${ts()}] === Backfilling sourceRecordId in chunks ===`);
      // Chunk by createdAt month to keep each UPDATE bounded.
      const monthsRes = await client.query(`
        SELECT DISTINCT TO_CHAR("createdAt", 'YYYY-MM') AS month
          FROM "InforRawRecord"
         WHERE payload ? '_ItemId'
           AND COALESCE("sourceRecordId", '') <> LEFT(payload->>'_ItemId', 255)
         ORDER BY 1
      `);
      const months = monthsRes.rows.map((r) => r.month as string);
      console.log(`  ${months.length} month-buckets to process: ${months.join(', ')}`);
      let totalUpdated = 0n;
      for (const m of months) {
        const tp = Date.now();
        const result = await client.query(
          `UPDATE "InforRawRecord"
              SET "sourceRecordId" = LEFT(payload->>'_ItemId', 255)
            WHERE payload ? '_ItemId'
              AND COALESCE("sourceRecordId", '') <> LEFT(payload->>'_ItemId', 255)
              AND TO_CHAR("createdAt", 'YYYY-MM') = $1`,
          [m]
        );
        const updated = BigInt(result.rowCount || 0);
        totalUpdated += updated;
        console.log(`  [${ts()}] ${m}: updated ${fmt(updated)} rows in ${Date.now() - tp}ms (total ${fmt(totalUpdated)})`);
      }
      console.log(`  total updated: ${fmt(totalUpdated)}`);
    }

    // 2. Index pre-condition: verify no remaining (companyId, platform, miProgram, sourceRecordId) dups.
    console.log(`\n[${ts()}] === Index precondition: dup check ===`);
    const dupRes = await client.query(`
      SELECT COUNT(*)::bigint AS dup_groups
        FROM (
          SELECT "companyId", "platform", "miProgram", "sourceRecordId"
            FROM "InforRawRecord"
           WHERE "sourceRecordId" IS NOT NULL
           GROUP BY 1,2,3,4
          HAVING COUNT(*) > 1
        ) d
    `);
    const dupGroups = BigInt(dupRes.rows[0].dup_groups);
    console.log(`  duplicate (companyId, platform, miProgram, sourceRecordId) groups: ${fmt(dupGroups)}`);

    if (dupGroups > 0n) {
      console.error(`\n[${ts()}] REFUSING to create unique index — ${fmt(dupGroups)} duplicate groups remain.`);
      console.error(`Run dedupe-staged.ts / dedupe-infor-raw.ts on the affected programs first.`);
      const sampleRes = await client.query(`
        SELECT "miProgram", COUNT(*)::bigint AS dup_groups
          FROM (
            SELECT "companyId", "platform", "miProgram", "sourceRecordId"
              FROM "InforRawRecord"
             WHERE "sourceRecordId" IS NOT NULL
             GROUP BY 1,2,3,4
            HAVING COUNT(*) > 1
          ) d
         GROUP BY "miProgram"
         ORDER BY 2 DESC
         LIMIT 10
      `);
      console.error(`Top offenders:`);
      for (const r of sampleRes.rows) console.error(`  ${r.miProgram}: ${fmt(BigInt(r.dup_groups))} dup groups`);
      process.exit(2);
    }

    // 3. Create unique index (idempotent).
    console.log(`\n[${ts()}] === Creating partial unique index ===`);
    const exists = await client.query(`
      SELECT 1 FROM pg_indexes
       WHERE tablename = 'InforRawRecord'
         AND indexname = 'InforRawRecord_dedup_by_itemid_uniq'
    `);
    if (exists.rows.length > 0) {
      console.log(`  index already exists; nothing to do.`);
    } else if (DRY_RUN) {
      console.log(`  DRY RUN — would create index now.`);
    } else {
      const tp = Date.now();
      await client.query(`
        CREATE UNIQUE INDEX "InforRawRecord_dedup_by_itemid_uniq"
            ON "InforRawRecord" ("companyId", "platform", "miProgram", "sourceRecordId")
         WHERE "sourceRecordId" IS NOT NULL
      `);
      console.log(`  created in ${Date.now() - tp}ms`);
    }

    console.log(`\n[${ts()}] Done.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
