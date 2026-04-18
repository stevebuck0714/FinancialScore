/**
 * Pull GL truth for AR account 11100 around 12/31/2023.
 * If the dev DB matches the user's BS, the running balance at 2023-12-31
 * should equal $1,179,854.70.
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = 'cmmnwyofv000fqhp4z8lebbny';
const TARGET = 1_179_854.70;

function fmt$(n: number): string { return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }); }

async function main() {
  console.log('DB:', (process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0]);
  console.log(`Target (BS account 11100, 12/31/2023): ${fmt$(TARGET)}\n`);

  // 1. Total GLTransactionFact rows we have for account 11100.
  const tot = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n,
            MIN("transDate") AS min_dt,
            MAX("transDate") AS max_dt,
            SUM("signedAmount")::float8 AS net
       FROM "GLTransactionFact"
      WHERE "companyId"=$1 AND "accountId"='11100'`,
    COMPANY
  );
  console.log('Account 11100 — overall:'); console.log(' ', tot[0]);

  // 2. Running balance at 12/31/2023.
  const bal = await prisma.$queryRawUnsafe<any[]>(
    `SELECT SUM("signedAmount")::float8 AS bal_at_eod
       FROM "GLTransactionFact"
      WHERE "companyId"=$1 AND "accountId"='11100'
        AND "transDate" <= '2023-12-31'::date`,
    COMPANY
  );
  console.log(`\nRunning balance for account 11100 at 12/31/2023:`);
  console.log(`  bal = ${fmt$(Number(bal[0].bal_at_eod ?? 0))}`);
  console.log(`  diff vs BS = ${fmt$(Number(bal[0].bal_at_eod ?? 0) - TARGET)}`);

  // 3. Same as #2 but using controlPeriod (some pipelines use period vs date).
  const bal2 = await prisma.$queryRawUnsafe<any[]>(
    `SELECT SUM("signedAmount")::float8 AS bal_at_period_end
       FROM "GLTransactionFact"
      WHERE "companyId"=$1 AND "accountId"='11100'
        AND ("controlYear" < 2024 OR ("controlYear"=2023))`,
    COMPANY
  );
  console.log(`\nBy controlYear<=2023:`);
  console.log(`  bal = ${fmt$(Number(bal2[0].bal_at_period_end ?? 0))}`);

  // 4. Look at year-by-year movement to spot what's there.
  const yr = await prisma.$queryRawUnsafe<any[]>(
    `SELECT EXTRACT(YEAR FROM "transDate")::int AS yr,
            COUNT(*)::int AS n,
            SUM("signedAmount")::float8 AS net,
            SUM(COALESCE("debitAmount",0))::float8 AS dr,
            SUM(COALESCE("creditAmount",0))::float8 AS cr
       FROM "GLTransactionFact"
      WHERE "companyId"=$1 AND "accountId"='11100'
      GROUP BY 1 ORDER BY 1`,
    COMPANY
  );
  console.log(`\nYear-by-year activity on 11100:`);
  for (const r of yr) console.log(' ', r);

  // 5. cono / divi distribution within 11100 — proves multi-company contamination if present.
  const cd = await prisma.$queryRawUnsafe<any[]>(
    `SELECT cono, divi, COUNT(*)::int AS n, SUM("signedAmount")::float8 AS net
       FROM "GLTransactionFact"
      WHERE "companyId"=$1 AND "accountId"='11100'
      GROUP BY 1,2 ORDER BY n DESC LIMIT 30`,
    COMPANY
  );
  console.log(`\nCono/Divi distribution on 11100:`);
  for (const r of cd) console.log(' ', r);

  // 6. Largest single GL postings to 11100 ever — sanity check on order-of-magnitude.
  const big = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "transDate", "signedAmount", "transNum", ref, description, "sourceProgram"
       FROM "GLTransactionFact"
      WHERE "companyId"=$1 AND "accountId"='11100'
      ORDER BY ABS("signedAmount") DESC LIMIT 10`,
    COMPANY
  );
  console.log(`\nTop 10 absolute postings on 11100 (life of data):`);
  for (const r of big) console.log(' ', { date: r.transDate?.toISOString().slice(0,10), amt: fmt$(r.signedAmount), trans: r.transNum, ref: r.ref, prog: r.sourceProgram, desc: String(r.description ?? '').slice(0,50) });

  // 7. Are there other AR-like accounts? 1110*, 112*, etc.
  const rel = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "accountId", "accountName", COUNT(*)::int AS n,
            SUM("signedAmount")::float8 AS net
       FROM "GLTransactionFact"
      WHERE "companyId"=$1 AND "accountId" LIKE '111%'
      GROUP BY 1,2 ORDER BY 1`,
    COMPANY
  );
  console.log(`\nAll '111*' accounts:`);
  for (const r of rel) console.log(' ', r);
}

main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());
