/**
 * Look at GLTransactionFact groups of 3+ rows on the same (transDate, accountId, transNum).
 * Are they legitimately distinct lines, or just SLGLTRANS+SLLedgers pairs that mis-deduped?
 */
import { PrismaClient } from '@prisma/client';

const COMPANY_ID = String(process.env.TARGET_COMPANY_ID || '').trim();
if (!COMPANY_ID) {
  console.error('FATAL: TARGET_COMPANY_ID required');
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const url = process.env.DATABASE_URL || '';
    const host = url.match(/@([^/]+)/)?.[1] || 'unknown';
    console.log(`DB: ${host}\nCompany: ${COMPANY_ID}\n`);

    console.log('=== STRUCTURE OF 3+ GROUPS (by source program composition) ===');
    const composition = await prisma.$queryRawUnsafe<Array<{ size: number; srcs: string; cnt: bigint }>>(
      `
      WITH groups AS (
        SELECT "transDate", "accountId", "transNum",
               COUNT(*) AS n,
               string_agg(COALESCE("sourceProgram", '(null)'), '+' ORDER BY COALESCE("sourceProgram", '(null)')) AS srcs
        FROM "GLTransactionFact"
        WHERE "companyId" = $1
        GROUP BY "transDate", "accountId", "transNum"
        HAVING COUNT(*) >= 3
      )
      SELECT n AS size, srcs, COUNT(*)::bigint AS cnt
      FROM groups
      GROUP BY n, srcs
      ORDER BY n, cnt DESC
      `,
      COMPANY_ID
    );
    for (const c of composition) {
      console.log(`  size=${c.size}  ${String(c.srcs).padEnd(80)} ${Number(c.cnt).toLocaleString().padStart(8)} groups`);
    }
    console.log();

    console.log('=== DO 3+ GROUPS HAVE DISTINCT (ref, description, signedAmount) WITHIN SAME SOURCE? ===');
    // For groups of 3+, check whether DIFFERENT signedAmounts exist within the same source.
    // If same source has multiple distinct signedAmounts, those are legitimately distinct lines.
    const within = await prisma.$queryRawUnsafe<Array<{ pattern: string; cnt: bigint }>>(
      `
      WITH groups AS (
        SELECT "transDate", "accountId", "transNum"
        FROM "GLTransactionFact"
        WHERE "companyId" = $1
        GROUP BY "transDate", "accountId", "transNum"
        HAVING COUNT(*) >= 3
      ),
      src_rows AS (
        SELECT g."transDate", g."accountId", g."transNum",
               f."sourceProgram",
               COUNT(*) AS rows_in_src,
               COUNT(DISTINCT f."signedAmount") AS distinct_amts,
               COUNT(DISTINCT COALESCE(f."ref", '')) AS distinct_refs,
               COUNT(DISTINCT COALESCE(f."description", '')) AS distinct_descs
        FROM groups g
        JOIN "GLTransactionFact" f
          ON f."companyId" = $1
         AND f."accountId" = g."accountId"
         AND f."transDate" = g."transDate"
         AND COALESCE(f."transNum", '') = COALESCE(g."transNum", '')
        GROUP BY g."transDate", g."accountId", g."transNum", f."sourceProgram"
      )
      SELECT
        CASE
          WHEN distinct_amts > 1 THEN 'distinct amounts within same source (LEGIT MULTI-LINE)'
          WHEN distinct_refs > 1 THEN 'same amount, distinct refs within same source (LEGIT MULTI-LINE)'
          WHEN distinct_descs > 1 THEN 'same amount/ref, distinct descs within same source (probably legit)'
          ELSE 'all identical within same source (DUPLICATE WITHIN SOURCE)'
        END AS pattern,
        SUM(rows_in_src)::bigint AS cnt
      FROM src_rows
      WHERE rows_in_src > 1
      GROUP BY pattern
      ORDER BY cnt DESC
      `,
      COMPANY_ID
    );
    for (const w of within) console.log(`  ${w.pattern}: ${Number(w.cnt).toLocaleString()} rows`);
    console.log();

    console.log('=== SAMPLE OF 3+ GROUPS (5 examples) ===');
    const samples = await prisma.$queryRawUnsafe<
      Array<{
        transDate: Date;
        accountId: string;
        transNum: string | null;
        sourceProgram: string | null;
        signedAmount: number;
        ref: string | null;
        description: string | null;
        controlPeriod: number | null;
      }>
    >(
      `
      WITH groups AS (
        SELECT "transDate", "accountId", "transNum"
        FROM "GLTransactionFact"
        WHERE "companyId" = $1
        GROUP BY "transDate", "accountId", "transNum"
        HAVING COUNT(*) >= 3
        ORDER BY "transDate" DESC
        LIMIT 5
      )
      SELECT f."transDate", f."accountId", f."transNum", f."sourceProgram",
             f."signedAmount", f."ref", f."description", f."controlPeriod"
      FROM groups g
      JOIN "GLTransactionFact" f
        ON f."companyId" = $1
       AND f."accountId" = g."accountId"
       AND f."transDate" = g."transDate"
       AND COALESCE(f."transNum", '') = COALESCE(g."transNum", '')
      ORDER BY f."transDate" DESC, f."accountId", f."transNum", f."sourceProgram", f."signedAmount"
      `,
      COMPANY_ID
    );
    let lastKey = '';
    for (const r of samples) {
      const key = `${r.transDate.toISOString().slice(0, 10)} ${r.accountId} ${r.transNum || ''}`;
      if (key !== lastKey) {
        console.log(`\n  --- ${key} ---`);
        lastKey = key;
      }
      console.log(`    [${r.sourceProgram || '?'}] amount=${r.signedAmount}  ref="${r.ref || ''}"  cp=${r.controlPeriod ?? 'null'}  desc="${(r.description || '').slice(0, 60)}"`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
