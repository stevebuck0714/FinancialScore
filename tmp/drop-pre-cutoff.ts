/**
 * Drop InforRawRecord rows whose business event date is before MIN_BUSINESS_DATE.
 *
 * Run AFTER `tmp/dedupe-infor-raw.ts` has cleaned dupes for each program.
 * This script only deletes rows we can prove are pre-cutoff.
 *
 * Strategy:
 *   - Per program, look at a list of candidate date fields in payload (the
 *     CSI "YYYYMMDD HH:MM:SS.ms" string format). The first one present "wins".
 *   - Delete rows where that date string compares lexicographically less than
 *     the cutoff `YYYYMMDD` prefix. This is correct for fixed-width YYYYMMDD.
 *   - Reference-data programs (Customers/Vendors/Charts/Items/etc.) are NEVER
 *     filtered by date — they represent current state and have no business date.
 *
 * Defaults:
 *   - Cutoff: 2023-01-01
 *   - Mode:   DRY RUN (use --execute to actually delete)
 *
 * Usage:
 *   $env:DATABASE_URL = "<DIRECT prod URL>"
 *   npx tsx tmp/drop-pre-cutoff.ts                          # dry-run, all programs
 *   npx tsx tmp/drop-pre-cutoff.ts --program SLArtrans      # one program
 *   npx tsx tmp/drop-pre-cutoff.ts --execute                # do it
 *   npx tsx tmp/drop-pre-cutoff.ts --cutoff 2023-06-01      # different floor
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function getArg(name: string, def?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return def;
}
const DRY_RUN = !process.argv.includes('--execute');
const CUTOFF = (getArg('cutoff', '2023-01-01') || '2023-01-01').trim(); // YYYY-MM-DD
const PROGRAM_FILTER = (getArg('program', '') || '').toUpperCase().trim() || null;
const COMPANY = getArg('company', '') || null;
const BATCH = Number(getArg('batch', '10000'));

// Compact YYYYMMDD prefix used for lexicographic comparison against CSI date payloads.
const CUTOFF_COMPACT = CUTOFF.replace(/-/g, '');
if (!/^\d{8}$/.test(CUTOFF_COMPACT)) {
  console.error(`Invalid --cutoff '${CUTOFF}'. Expected YYYY-MM-DD.`);
  process.exit(1);
}

/**
 * Per-program date-field configuration.
 *   `dateFields` — list of payload string keys to try in order; first one with
 *                  a value wins. Compared lexicographically against CUTOFF_COMPACT.
 *   Programs not listed here are SKIPPED (treated as reference data).
 */
const PROGRAM_DATE_FIELDS: Record<string, string[]> = {
  // Transactional AR
  SLARTRANS: ['InvDate', 'RecordDate'],
  // Transactional AP
  SLAPTRX:   ['InvDate', 'DistDate', 'RecordDate'],
  SLVCHHDRS: ['InvDate', 'RecordDate', 'DistDate'],
  SLAPTRXPS: ['InvDate', 'DistDate', 'RecordDate'],
  SLAPPMTS:  ['CheckDate', 'DistDate', 'RecordDate'],
  // Sales / customer orders
  SLCOS:     ['OrderDate', 'RecordDate'],
  SLCOITEMS: ['OrderDate', 'DueDate', 'RecordDate'],
  // GL / ledgers
  SLGLTRANS: ['TransDate', 'DistDate', 'RecordDate'],
  SLLEDGERS: ['TransDate', 'RecordDate'],
  GLACCTPERIODBALANCES: ['PeriodEnd', 'PeriodEndDate'],
  // Reference / state — explicitly NOT included (kept regardless of date):
  //   SLCUSTOMERS, SLVENDORS, SLCHARTACCTS, SLCHARTS, SLITEMS, SLITEMLOCS,
  //   SLINVHDRS, SLBANKHDRS
};

function fmt(n: number | bigint): string { return Number(n).toLocaleString(); }
function ts(): string { return new Date().toISOString().slice(11, 19); }

function buildDateExpression(fields: string[]): string {
  // Returns SQL coalescing the first non-null payload->>field across the list.
  // Compares lexicographically, fine because CSI uses fixed-width 'YYYYMMDD ...'.
  if (fields.length === 1) return `payload->>'${fields[0]}'`;
  return `COALESCE(${fields.map((f) => `NULLIF(payload->>'${f}','')`).join(', ')})`;
}

async function processProgram(programUpper: string, dateFields: string[]) {
  const dateExpr = buildDateExpression(dateFields);
  const params: any[] = [programUpper, CUTOFF_COMPACT];
  let companyClause = '';
  if (COMPANY) { params.push(COMPANY); companyClause = ` AND "companyId" = $${params.length}`; }

  // 1. Audit: count + show sample.
  const auditSql = `
    SELECT COUNT(*)::bigint                                                AS rows_pre_cutoff,
           COUNT(*) FILTER (WHERE ${dateExpr} IS NOT NULL)::bigint         AS rows_with_date,
           MIN(${dateExpr})                                                 AS min_date,
           MAX(${dateExpr})                                                 AS max_date_pre_cutoff
      FROM "InforRawRecord"
     WHERE UPPER("miProgram") = $1
       AND ${dateExpr} IS NOT NULL
       AND LEFT(${dateExpr}, 8) < $2${companyClause}`;
  const auditTotal = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::bigint AS total
       FROM "InforRawRecord"
      WHERE UPPER("miProgram") = $1${companyClause ? ` AND "companyId" = $2` : ''}`,
    ...(COMPANY ? [programUpper, COMPANY] : [programUpper])
  );
  const total = BigInt(auditTotal[0]?.total ?? 0n);
  const audit = await prisma.$queryRawUnsafe<any[]>(auditSql, ...params);
  const preCutoff = BigInt(audit[0]?.rows_pre_cutoff ?? 0n);
  const rowsWithDate = BigInt(audit[0]?.rows_with_date ?? 0n);
  const minDate = audit[0]?.min_date;
  const maxDatePre = audit[0]?.max_date_pre_cutoff;

  console.log(`\n[${ts()}] === ${programUpper} ===`);
  console.log(`  date_fields:   ${dateFields.join(' → ')}`);
  console.log(`  total rows:    ${fmt(total)}`);
  console.log(`  pre-cutoff:    ${fmt(preCutoff)} rows`);
  if (preCutoff > 0n) {
    console.log(`  date range:    min=${minDate ?? '(null)'}  max_pre_cutoff=${maxDatePre ?? '(null)'}`);
  }
  if (preCutoff === 0n) {
    console.log(`  NOTHING TO DELETE for ${programUpper}.`);
    return { program: programUpper, deleted: 0n };
  }
  if (DRY_RUN) {
    console.log(`  DRY RUN — would delete ${fmt(preCutoff)} rows.`);
    return { program: programUpper, deleted: 0n };
  }

  // 2. Delete in batches by collecting ids first to avoid long-running DELETE
  //    holding row locks on the whole table.
  const collectStart = Date.now();
  const idRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id FROM "InforRawRecord"
      WHERE UPPER("miProgram") = $1
        AND ${dateExpr} IS NOT NULL
        AND LEFT(${dateExpr}, 8) < $2${companyClause}`,
    ...params
  );
  const ids = idRows.map((r) => r.id as string);
  console.log(`  collected ${fmt(ids.length)} ids in ${Date.now() - collectStart}ms`);

  let deleted = 0n;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const tp = Date.now();
    const result: any = await prisma.$executeRawUnsafe(
      `DELETE FROM "InforRawRecord" WHERE id = ANY($1::text[])`,
      slice
    );
    const d = BigInt(typeof result === 'number' ? result : Number(result));
    deleted += d;
    console.log(`  [${ts()}] batch ${Math.floor(i / BATCH) + 1}: deleted ${fmt(d)} rows in ${Date.now() - tp}ms (total ${fmt(deleted)} / ${fmt(ids.length)})`);
  }
  return { program: programUpper, deleted };
}

async function main() {
  const dbHost = (process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0];
  console.log(`[${ts()}] DB:        ${dbHost}`);
  console.log(`[${ts()}] Mode:      ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`[${ts()}] Cutoff:    < ${CUTOFF} (compact: ${CUTOFF_COMPACT})`);
  console.log(`[${ts()}] Program:   ${PROGRAM_FILTER ?? '(all configured transactional programs)'}`);
  console.log(`[${ts()}] Company:   ${COMPANY ?? '(all)'}`);
  console.log(`[${ts()}] Batch:     ${BATCH}`);

  if (dbHost?.includes('-pooler')) {
    console.error(`\nDATABASE_URL points at a pooler endpoint (${dbHost}). Use the DIRECT endpoint.`);
    process.exit(1);
  }

  const programs = PROGRAM_FILTER
    ? (PROGRAM_DATE_FIELDS[PROGRAM_FILTER] ? [PROGRAM_FILTER] : [])
    : Object.keys(PROGRAM_DATE_FIELDS);

  if (PROGRAM_FILTER && programs.length === 0) {
    console.error(`\nProgram '${PROGRAM_FILTER}' is not in the date-field config (treated as reference data; nothing to delete).`);
    process.exit(0);
  }

  const summaries: Array<{ program: string; deleted: bigint }> = [];
  for (const prog of programs) {
    const res = await processProgram(prog, PROGRAM_DATE_FIELDS[prog]);
    summaries.push(res);
  }

  console.log(`\n[${ts()}] === Summary ===`);
  let total = 0n;
  for (const s of summaries) {
    console.log(`  ${s.program.padEnd(24)} deleted ${fmt(s.deleted)}`);
    total += s.deleted;
  }
  console.log(`  ${'TOTAL'.padEnd(24)} deleted ${fmt(total)}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
