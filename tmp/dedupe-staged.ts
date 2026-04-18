/**
 * Staged InforRawRecord dedup — built for very large programs (e.g. SLArtrans
 * with ~19M dup rows) where the original `tmp/dedupe-infor-raw.ts` cannot
 * complete the "collect victim ids in JS" step because the result set is too
 * big to stream over a single Neon connection (P1017 connection closed).
 *
 * Strategy:
 *   1. SERVER-SIDE: CREATE TABLE _dedup_victims_<program> AS SELECT id FROM
 *      (window function) WHERE rn > 1. One statement, no streaming back to JS.
 *   2. CREATE INDEX on the staging table for chunked paging.
 *   3. Page through staging table 10k ids at a time and DELETE from
 *      InforRawRecord using id = ANY($1::text[]).
 *   4. DROP staging table.
 *
 * Uses raw `pg` client (not Prisma) so we can set statement_timeout=0 and
 * tcp keepalives to survive multi-minute server-side statements on Neon.
 *
 * Usage:
 *   $env:DATABASE_URL = "<DIRECT prod URL — no -pooler>"
 *   npx tsx tmp/dedupe-staged.ts --program SLArtrans                # dry run
 *   npx tsx tmp/dedupe-staged.ts --program SLArtrans --execute      # do it
 *   npx tsx tmp/dedupe-staged.ts --program SLArtrans --execute --batch 20000
 *   npx tsx tmp/dedupe-staged.ts --program SLArtrans --execute --resume   # reuse existing victim table
 *
 * Safety:
 *   - DRY RUN by default (only counts dups, doesn't materialize or delete).
 *   - Refuses to run against a -pooler endpoint.
 *   - Verifies sourceRecordId / payload->>'_ItemId' shape before deleting.
 */
import { Client } from 'pg';

function getArg(name: string, def?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}
const DRY_RUN = !process.argv.includes('--execute');
const RESUME = process.argv.includes('--resume');
const PROGRAM = (getArg('program', '') || '').trim();
const BATCH = Number(getArg('batch', '10000'));

if (!PROGRAM) {
  console.error('Required: --program <miProgram> (e.g. SLArtrans)');
  process.exit(1);
}

const PROGRAM_UPPER = PROGRAM.toUpperCase();
const PROGRAM_SLUG = PROGRAM_UPPER.toLowerCase().replace(/[^a-z0-9]/g, '_');
const STAGE_TABLE = `_dedup_victims_${PROGRAM_SLUG}`;

function ts(): string { return new Date().toISOString().slice(11, 19); }
function fmt(n: number | bigint): string { return Number(n).toLocaleString(); }

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const dbHost = url.split('@')[1]?.split('/')[0] || '';
  if (dbHost.includes('-pooler')) {
    console.error(`DATABASE_URL points at pooler endpoint (${dbHost}). Use the DIRECT endpoint.`);
    process.exit(1);
  }

  console.log(`[${ts()}] DB:        ${dbHost}`);
  console.log(`[${ts()}] Mode:      ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`[${ts()}] Program:   ${PROGRAM_UPPER}`);
  console.log(`[${ts()}] Resume:    ${RESUME}`);
  console.log(`[${ts()}] Batch:     ${BATCH}`);
  console.log(`[${ts()}] Staging:   public."${STAGE_TABLE}"`);

  const client = new Client({
    connectionString: url,
    keepAlive: true,
    keepAliveInitialDelayMillis: 30_000,
    statement_timeout: 0,
    query_timeout: 0,
  } as any);
  await client.connect();
  // Postgres-side: don't kill long statements; lock_timeout small so we never
  // wait forever on a row lock; enable verbose for autovacuum activity log.
  await client.query(`SET statement_timeout TO 0`);
  await client.query(`SET idle_in_transaction_session_timeout TO 0`);
  await client.query(`SET lock_timeout TO '60s'`);

  try {
    // 1. Pre-cleanup audit (cheap).
    console.log(`\n[${ts()}] === Pre-cleanup audit ===`);
    const auditStart = Date.now();
    const audit = await client.query(
      `SELECT
         COUNT(*)::bigint                                                     AS rows,
         COUNT(DISTINCT payload->>'_ItemId')::bigint                          AS distinct_items,
         COUNT(*) FILTER (WHERE payload ? '_ItemId')::bigint                  AS rows_with_item_id
       FROM "InforRawRecord"
       WHERE UPPER("miProgram") = $1`,
      [PROGRAM_UPPER]
    );
    const a = audit.rows[0];
    const rows = BigInt(a.rows);
    const distinctItems = BigInt(a.distinct_items);
    const rowsWithItemId = BigInt(a.rows_with_item_id);
    const projectedDeletes = rowsWithItemId - distinctItems;
    console.log(`  rows:               ${fmt(rows)}`);
    console.log(`  rows w/ _ItemId:    ${fmt(rowsWithItemId)}`);
    console.log(`  distinct _ItemIds:  ${fmt(distinctItems)}`);
    console.log(`  projected deletes:  ${fmt(projectedDeletes)} (~${rows > 0n ? Number((projectedDeletes * 1000n) / rows) / 10 : 0}%)`);
    console.log(`  audit took ${Date.now() - auditStart}ms`);

    if (projectedDeletes <= 0n) {
      console.log(`\n[${ts()}] Nothing to delete. Done.`);
      return;
    }
    if (DRY_RUN) {
      console.log(`\n[${ts()}] DRY RUN — re-run with --execute to materialize victims and delete.`);
      return;
    }

    // 2. Materialize victim ids on the server (no streaming back to JS).
    if (!RESUME) {
      console.log(`\n[${ts()}] === Materializing victim ids into ${STAGE_TABLE} ===`);
      await client.query(`DROP TABLE IF EXISTS "${STAGE_TABLE}"`);
      const matStart = Date.now();
      await client.query(
        `CREATE TABLE "${STAGE_TABLE}" AS
           SELECT id FROM (
             SELECT id,
                    ROW_NUMBER() OVER (
                      PARTITION BY "companyId", "miProgram", payload->>'_ItemId'
                      ORDER BY "createdAt" DESC, id DESC
                    ) AS rn
               FROM "InforRawRecord"
              WHERE UPPER("miProgram") = $1
                AND payload ? '_ItemId'
           ) r
         WHERE rn > 1`,
        [PROGRAM_UPPER]
      );
      const matMs = Date.now() - matStart;
      const cnt = await client.query(`SELECT COUNT(*)::bigint AS c FROM "${STAGE_TABLE}"`);
      const victimCount = BigInt(cnt.rows[0].c);
      console.log(`  materialized ${fmt(victimCount)} victim ids in ${matMs}ms (${(matMs / 1000 / 60).toFixed(1)} min)`);

      console.log(`  creating index on "${STAGE_TABLE}"(id)...`);
      const idxStart = Date.now();
      await client.query(`CREATE INDEX "${STAGE_TABLE}_id_idx" ON "${STAGE_TABLE}"(id)`);
      console.log(`  index created in ${Date.now() - idxStart}ms`);
    } else {
      console.log(`\n[${ts()}] Resume mode: reusing existing ${STAGE_TABLE}.`);
      const cnt = await client.query(`SELECT COUNT(*)::bigint AS c FROM "${STAGE_TABLE}"`);
      console.log(`  staging has ${fmt(BigInt(cnt.rows[0].c))} ids remaining`);
    }

    // 3. Page through staging table in chunks; DELETE then DELETE from staging.
    console.log(`\n[${ts()}] === Deleting in batches of ${BATCH} ===`);
    let totalDeleted = 0n;
    let pass = 0;
    while (true) {
      const page = await client.query(
        `SELECT id FROM "${STAGE_TABLE}" ORDER BY id LIMIT $1`,
        [BATCH]
      );
      if (page.rows.length === 0) break;
      const ids = page.rows.map((r) => r.id as string);
      pass++;
      const tp = Date.now();
      const delResult = await client.query(
        `DELETE FROM "InforRawRecord" WHERE id = ANY($1::text[])`,
        [ids]
      );
      const deleted = BigInt(delResult.rowCount || 0);
      totalDeleted += deleted;
      // Remove the processed ids from staging so the next page is fresh.
      await client.query(
        `DELETE FROM "${STAGE_TABLE}" WHERE id = ANY($1::text[])`,
        [ids]
      );
      const ms = Date.now() - tp;
      if (pass % 10 === 1 || pass <= 5) {
        console.log(
          `  [${ts()}] pass #${pass}: deleted ${fmt(deleted)} rows in ${ms}ms (running total ${fmt(totalDeleted)})`
        );
      }
    }
    console.log(`  [${ts()}] DONE. Deleted ${fmt(totalDeleted)} rows across ${pass} passes.`);

    // 4. Drop staging table.
    await client.query(`DROP TABLE IF EXISTS "${STAGE_TABLE}"`);
    console.log(`  Dropped ${STAGE_TABLE}.`);

    // 5. Post-cleanup verification.
    console.log(`\n[${ts()}] === Post-cleanup audit ===`);
    const post = await client.query(
      `SELECT
         COUNT(*)::bigint                                                     AS rows,
         COUNT(DISTINCT payload->>'_ItemId')::bigint                          AS distinct_items,
         COUNT(*) FILTER (WHERE payload ? '_ItemId')::bigint                  AS rows_with_item_id
       FROM "InforRawRecord"
       WHERE UPPER("miProgram") = $1`,
      [PROGRAM_UPPER]
    );
    const p = post.rows[0];
    console.log(`  rows:               ${fmt(BigInt(p.rows))}`);
    console.log(`  distinct _ItemIds:  ${fmt(BigInt(p.distinct_items))}`);
    console.log(`  rows w/ _ItemId:    ${fmt(BigInt(p.rows_with_item_id))}`);
    if (BigInt(p.rows_with_item_id) === BigInt(p.distinct_items)) {
      console.log(`  ✓ rows_with_item_id == distinct_items — fully deduped.`);
    } else {
      console.warn(`  ⚠ residual dups: ${fmt(BigInt(p.rows_with_item_id) - BigInt(p.distinct_items))}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
