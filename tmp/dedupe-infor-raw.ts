/**
 * INFOR RAW DEDUP — purge duplicate InforRawRecord rows.
 *
 * Background:
 *   InforRawRecord has @@unique([companyId, platform, syncRunId, businessDate,
 *   miProgram, transaction, sourceRecordHash]). syncRunId is in the key, so
 *   every full sync re-inserts every artran/aptrx row instead of upserting.
 *   We confirmed up to 21x duplication on SLArtrans in dev, which silently
 *   inflated AR analytics by ~25x.
 *
 * Strategy:
 *   For each (companyId, miProgram, payload->>'_ItemId') group, KEEP the row
 *   with the highest createdAt (most recent) and DELETE the rest.
 *
 *   Rows without _ItemId are LEFT ALONE — those programs use a different
 *   stable key (RowPointer for some IDOs) and need separate handling.
 *
 * Safety:
 *   - DRY RUN by default. Pass --execute to actually delete.
 *   - --program <NAME>  scope to one miProgram (default: SLARTRANS first).
 *   - --company <ID>    scope to one company (default: all).
 *   - --batch <N>       delete batch size (default 5000).
 *   - Always shows pre/post counts before doing anything destructive.
 *
 * Usage:
 *   tsx tmp/dedupe-infor-raw.ts                                 # dry run, all programs
 *   tsx tmp/dedupe-infor-raw.ts --program SLARTRANS             # dry run, SLArtrans only
 *   tsx tmp/dedupe-infor-raw.ts --program SLARTRANS --execute   # actually delete
 *   tsx tmp/dedupe-infor-raw.ts --execute                       # delete dups for all programs
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
// IMPORTANT: do NOT override an explicit shell DATABASE_URL.
// We need to be able to point this script at prod from the shell without
// .env.local silently swapping the connection back to dev.
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function getArg(name: string, def?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}
const DRY_RUN = !process.argv.includes('--execute');
const PROGRAM = (getArg('program', '') || '').toUpperCase().trim() || null;
const COMPANY = getArg('company', '') || null;
const BATCH = Number(getArg('batch', '5000'));

function fmt(n: number | bigint): string { return Number(n).toLocaleString(); }
function ts(): string { return new Date().toISOString().slice(11,19); }

async function main() {
  console.log(`[${ts()}] DB: ${(process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0]}`);
  console.log(`[${ts()}] Mode: ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`[${ts()}] Program filter: ${PROGRAM ?? '(all)'}`);
  console.log(`[${ts()}] Company filter: ${COMPANY ?? '(all)'}`);
  console.log(`[${ts()}] Batch size: ${BATCH}\n`);

  const filterClauses: string[] = [`payload ? '_ItemId'`];
  const params: any[] = [];
  if (PROGRAM) { params.push(PROGRAM); filterClauses.push(`UPPER("miProgram") = $${params.length}`); }
  if (COMPANY) { params.push(COMPANY); filterClauses.push(`"companyId" = $${params.length}`); }
  const whereSql = `WHERE ${filterClauses.join(' AND ')}`;

  // 1. Pre-cleanup audit per program.
  console.log(`[${ts()}] === Pre-cleanup audit ===`);
  const auditSql = `
    SELECT "companyId", "miProgram",
           COUNT(*)::bigint                                            AS rows,
           COUNT(DISTINCT payload->>'_ItemId')::bigint                 AS distinct_items,
           (COUNT(*)::numeric / NULLIF(COUNT(DISTINCT payload->>'_ItemId'),0))::numeric(10,2) AS avg_dup,
           MIN("createdAt")                                            AS first_ingest,
           MAX("createdAt")                                            AS last_ingest
      FROM "InforRawRecord"
      ${whereSql}
      GROUP BY 1,2
      ORDER BY 3 DESC`;
  const audit = await prisma.$queryRawUnsafe<any[]>(auditSql, ...params);
  if (audit.length === 0) { console.log('  (no rows match filter)'); return; }
  console.log(`  ${'companyId'.padEnd(28)}  ${'miProgram'.padEnd(16)}  ${'rows'.padStart(10)}  ${'distinct'.padStart(10)}  ${'avg_dup'.padStart(8)}  first → last`);
  let totalRows = 0n, totalDistinct = 0n;
  for (const a of audit) {
    totalRows += BigInt(a.rows);
    totalDistinct += BigInt(a.distinct_items);
    console.log(
      `  ${String(a.companyId).padEnd(28)}  ${String(a.miProgram).padEnd(16)}  ${fmt(a.rows).padStart(10)}  ${fmt(a.distinct_items).padStart(10)}  ${String(a.avg_dup).padStart(8)}  ${a.first_ingest?.toISOString().slice(0,10)} → ${a.last_ingest?.toISOString().slice(0,10)}`
    );
  }
  const projectedDeletes = totalRows - totalDistinct;
  const pctDelete = totalRows > 0n ? Number((projectedDeletes * 10000n) / totalRows) / 100 : 0;
  console.log(`\n  TOTALS: rows=${fmt(totalRows)}  distinct=${fmt(totalDistinct)}  → projected to delete ${fmt(projectedDeletes)} rows (${pctDelete.toFixed(1)}%)`);

  if (DRY_RUN) {
    console.log(`\n[${ts()}] DRY RUN — no rows deleted. Re-run with --execute to apply.`);
    return;
  }

  // 2. Execute. Strategy:
  //    a) Stream all victim ids into the JS process via a single window-fn scan
  //       (one full scan instead of N).
  //    b) Delete in batches with `id = ANY($1::text[])`.
  console.log(`\n[${ts()}] === Executing dedup ===`);

  console.log(`  [${ts()}] Collecting victim ids (one full scan)...`);
  const t0 = Date.now();
  const victimRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id FROM (
       SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY "companyId", "miProgram", payload->>'_ItemId'
                ORDER BY "createdAt" DESC, id DESC
              ) AS rn
         FROM "InforRawRecord"
         ${whereSql}
     ) r WHERE rn > 1`,
    ...params
  );
  const victimIds: string[] = victimRows.map(r => r.id as string);
  console.log(`  [${ts()}] collected ${fmt(victimIds.length)} victim ids in ${Date.now() - t0}ms`);

  let totalDeleted = 0n;
  let pass = 0;
  for (let i = 0; i < victimIds.length; i += BATCH) {
    pass++;
    const slice = victimIds.slice(i, i + BATCH);
    const tp = Date.now();
    const result: any = await prisma.$executeRawUnsafe(
      `DELETE FROM "InforRawRecord" WHERE id = ANY($1::text[])`,
      slice
    );
    const deleted = BigInt(typeof result === 'number' ? result : Number(result));
    totalDeleted += deleted;
    const ms = Date.now() - tp;
    console.log(`  [${ts()}] pass #${pass}: deleted ${fmt(deleted)} rows in ${ms}ms (running total ${fmt(totalDeleted)} / ${fmt(victimIds.length)})`);
  }

  // 3. Post-cleanup verification.
  console.log(`\n[${ts()}] === Post-cleanup audit ===`);
  const post = await prisma.$queryRawUnsafe<any[]>(auditSql, ...params);
  let postRows = 0n;
  for (const a of post) {
    postRows += BigInt(a.rows);
    console.log(
      `  ${String(a.companyId).padEnd(28)}  ${String(a.miProgram).padEnd(16)}  ${fmt(a.rows).padStart(10)}  ${fmt(a.distinct_items).padStart(10)}  ${String(a.avg_dup).padStart(8)}`
    );
  }
  console.log(`\n  Deleted ${fmt(totalDeleted)} rows. ${fmt(totalRows)} → ${fmt(postRows)}.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
