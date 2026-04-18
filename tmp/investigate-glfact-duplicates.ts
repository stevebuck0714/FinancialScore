/**
 * Investigate the SLGLTRANS / SLLedgers duplicate structure in GLTransactionFact
 * for account 30100. READ ONLY.
 *
 * Goal: figure out the minimum uniqueness key that:
 *   - Treats matched SLGLTRANS+SLLedgers pairs as the same logical row.
 *   - Does NOT collapse legitimately distinct rows (e.g. different journal lines
 *     of the same voucher, multi-line distributions, etc.).
 *
 * USAGE (prod):
 *   $env:DATABASE_URL="postgresql://...prod..."
 *   $env:TARGET_COMPANY_ID="cmmcp278j0002kz0439rlixdj"
 *   npx tsx tmp/investigate-glfact-duplicates.ts
 */
import { PrismaClient } from '@prisma/client';

const COMPANY_ID = String(process.env.TARGET_COMPANY_ID || '').trim();
const ACCOUNT_ID = String(process.env.DIAG_ACCOUNT_ID || '30100').trim();

if (!COMPANY_ID) {
  console.error('FATAL: TARGET_COMPANY_ID required');
  process.exit(1);
}

function ts() {
  return new Date().toISOString().replace('T', ' ').replace(/\..+/, '');
}

function pad(s: string, w: number, right = false) {
  if (s.length >= w) return s;
  return right ? s.padStart(w) : s.padEnd(w);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const url = process.env.DATABASE_URL || '';
    const host = url.match(/@([^/]+)/)?.[1] || 'unknown';
    console.log(`[${ts()}] DB host: ${host}`);
    console.log(`[${ts()}] Company:  ${COMPANY_ID}, Account: ${ACCOUNT_ID}\n`);

    // 1. How many distinct (transDate, transNum) pairs exist for 30100, and how many rows per pair?
    console.log('=== DISTINCT (transDate, accountId, transNum) GROUP SIZES ===');
    const groupSizes = await prisma.$queryRawUnsafe<
      Array<{ rows_per_group: number; groups: bigint }>
    >(
      `
      SELECT rows_per_group, COUNT(*)::bigint AS groups
      FROM (
        SELECT COUNT(*) AS rows_per_group
        FROM "GLTransactionFact"
        WHERE "companyId" = $1 AND "accountId" = $2
        GROUP BY "transDate", "accountId", "transNum"
      ) t
      GROUP BY rows_per_group
      ORDER BY rows_per_group
      `,
      COMPANY_ID,
      ACCOUNT_ID
    );
    let totalGroups = 0;
    let totalRows = 0;
    for (const g of groupSizes) {
      const rpg = Number(g.rows_per_group);
      const groups = Number(g.groups);
      totalGroups += groups;
      totalRows += groups * rpg;
      console.log(`  ${pad(String(rpg) + ' rows/group', 16)} ${pad(String(groups), 10, true)} groups (${(groups * rpg).toLocaleString()} rows)`);
    }
    console.log(`  TOTAL: ${totalGroups.toLocaleString()} distinct (transDate, accountId, transNum) groups, ${totalRows.toLocaleString()} rows total\n`);

    // 2. Within groups of size 2, do they always look like SLGLTRANS+SLLedgers pairs (same signedAmount)?
    console.log('=== GROUP-OF-2 STRUCTURE: source program pairs and signedAmount agreement ===');
    const pairAnalysis = await prisma.$queryRawUnsafe<
      Array<{
        srcs: string;
        same_amount: bigint;
        diff_amount: bigint;
        same_ref: bigint;
        diff_ref: bigint;
        same_desc: bigint;
        diff_desc: bigint;
      }>
    >(
      `
      WITH groups AS (
        SELECT "transDate", "accountId", "transNum", COUNT(*) AS n
        FROM "GLTransactionFact"
        WHERE "companyId" = $1 AND "accountId" = $2
        GROUP BY "transDate", "accountId", "transNum"
        HAVING COUNT(*) = 2
      ),
      pairs AS (
        SELECT
          g."transDate", g."accountId", g."transNum",
          string_agg(DISTINCT COALESCE(f."sourceProgram", '(null)'), ',' ORDER BY COALESCE(f."sourceProgram", '(null)')) AS srcs,
          MAX(f."signedAmount") - MIN(f."signedAmount") AS amt_diff,
          COUNT(DISTINCT COALESCE(f."ref", '')) AS distinct_refs,
          COUNT(DISTINCT COALESCE(f."description", '')) AS distinct_descs
        FROM groups g
        JOIN "GLTransactionFact" f
          ON f."companyId" = $1
         AND f."accountId" = g."accountId"
         AND f."transDate" = g."transDate"
         AND COALESCE(f."transNum", '') = COALESCE(g."transNum", '')
        GROUP BY g."transDate", g."accountId", g."transNum"
      )
      SELECT
        srcs,
        SUM(CASE WHEN amt_diff = 0 THEN 1 ELSE 0 END)::bigint AS same_amount,
        SUM(CASE WHEN amt_diff <> 0 THEN 1 ELSE 0 END)::bigint AS diff_amount,
        SUM(CASE WHEN distinct_refs = 1 THEN 1 ELSE 0 END)::bigint AS same_ref,
        SUM(CASE WHEN distinct_refs > 1 THEN 1 ELSE 0 END)::bigint AS diff_ref,
        SUM(CASE WHEN distinct_descs = 1 THEN 1 ELSE 0 END)::bigint AS same_desc,
        SUM(CASE WHEN distinct_descs > 1 THEN 1 ELSE 0 END)::bigint AS diff_desc
      FROM pairs
      GROUP BY srcs
      ORDER BY srcs
      `,
      COMPANY_ID,
      ACCOUNT_ID
    );
    for (const p of pairAnalysis) {
      console.log(`  Sources: ${p.srcs}`);
      console.log(`    same signedAmount: ${Number(p.same_amount).toLocaleString().padStart(8)}    different: ${Number(p.diff_amount).toLocaleString().padStart(8)}`);
      console.log(`    same ref:          ${Number(p.same_ref).toLocaleString().padStart(8)}    different: ${Number(p.diff_ref).toLocaleString().padStart(8)}`);
      console.log(`    same description:  ${Number(p.same_desc).toLocaleString().padStart(8)}    different: ${Number(p.diff_desc).toLocaleString().padStart(8)}`);
    }
    console.log();

    // 3. Show 5 sample pairs side by side so we can SEE what differs.
    console.log('=== SAMPLE PAIRS (5 examples of group-of-2 rows) ===');
    const samples = await prisma.$queryRawUnsafe<
      Array<{
        transDate: Date;
        transNum: string | null;
        sourceProgram: string | null;
        signedAmount: number;
        ref: string | null;
        description: string | null;
        controlPeriod: number | null;
        controlYear: number | null;
        distDate: Date | null;
        site: string | null;
      }>
    >(
      `
      WITH dup_groups AS (
        SELECT "transDate", "transNum"
        FROM "GLTransactionFact"
        WHERE "companyId" = $1 AND "accountId" = $2
        GROUP BY "transDate", "transNum"
        HAVING COUNT(*) = 2
        ORDER BY "transDate" DESC
        LIMIT 5
      )
      SELECT f."transDate", f."transNum", f."sourceProgram", f."signedAmount",
             f."ref", f."description", f."controlPeriod", f."controlYear", f."distDate", f."site"
      FROM dup_groups d
      JOIN "GLTransactionFact" f
        ON f."companyId" = $1 AND f."accountId" = $2
       AND f."transDate" = d."transDate"
       AND COALESCE(f."transNum", '') = COALESCE(d."transNum", '')
      ORDER BY f."transDate" DESC, f."transNum", f."sourceProgram"
      `,
      COMPANY_ID,
      ACCOUNT_ID
    );
    let lastKey = '';
    for (const r of samples) {
      const key = `${r.transDate.toISOString().slice(0, 10)} ${r.transNum || ''}`;
      if (key !== lastKey) {
        console.log(`\n  --- ${key} ---`);
        lastKey = key;
      }
      console.log(`    [${r.sourceProgram || '?'}]`);
      console.log(`      amount=${r.signedAmount}  ref=${r.ref || '(null)'}  cp=${r.controlPeriod ?? 'null'}/${r.controlYear ?? 'null'}  distDate=${r.distDate?.toISOString().slice(0, 10) || 'null'}  site=${r.site || ''}`);
      console.log(`      desc="${r.description || ''}"`);
    }
    console.log();

    // 4. Check: are there transNum=null rows?  Could collapsing them cause data loss?
    console.log('=== transNum NULL/empty risk check ===');
    const nullCheck = await prisma.$queryRawUnsafe<Array<{ kind: string; cnt: bigint }>>(
      `
      SELECT
        CASE
          WHEN "transNum" IS NULL THEN 'NULL'
          WHEN "transNum" = ''   THEN 'EMPTY'
          ELSE 'SET'
        END AS kind,
        COUNT(*)::bigint AS cnt
      FROM "GLTransactionFact"
      WHERE "companyId" = $1 AND "accountId" = $2
      GROUP BY kind
      ORDER BY kind
      `,
      COMPANY_ID,
      ACCOUNT_ID
    );
    for (const n of nullCheck) console.log(`  transNum=${n.kind}: ${Number(n.cnt).toLocaleString()} rows`);
    console.log();

    // 5. ALL accounts: how many groups, group sizes, pair purity?
    console.log('=== ALL-ACCOUNTS group-size distribution (sample) ===');
    const globalGroups = await prisma.$queryRawUnsafe<
      Array<{ rows_per_group: number; groups: bigint; rows: bigint }>
    >(
      `
      SELECT rows_per_group, COUNT(*)::bigint AS groups, (rows_per_group * COUNT(*))::bigint AS rows
      FROM (
        SELECT COUNT(*) AS rows_per_group
        FROM "GLTransactionFact"
        WHERE "companyId" = $1
        GROUP BY "transDate", "accountId", "transNum"
      ) t
      GROUP BY rows_per_group
      ORDER BY rows_per_group
      `,
      COMPANY_ID
    );
    for (const g of globalGroups.slice(0, 10)) {
      console.log(`  ${pad(String(g.rows_per_group) + ' rows/group', 16)} ${pad(Number(g.groups).toLocaleString(), 10, true)} groups (${Number(g.rows).toLocaleString()} rows)`);
    }
    if (globalGroups.length > 10) console.log(`  ... ${globalGroups.length - 10} more sizes (large groups, likely many-line journals)`);
    console.log();

    console.log(`[${ts()}] DONE.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`[${ts()}] FATAL`, err);
  process.exit(1);
});
