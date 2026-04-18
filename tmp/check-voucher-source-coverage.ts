import { PrismaClient } from '@prisma/client';
const COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';
(async () => {
  const p = new PrismaClient();
  try {
    console.log(`DB: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);

    console.log(`\n=== APTransactionFact date range and count ===`);
    const a = await p.$queryRawUnsafe<Array<any>>(
      `SELECT MIN("eventDate") AS min_d, MAX("eventDate") AS max_d, COUNT(*)::bigint AS n,
              SUM("normalizedAmount")::float8 AS sum_amt
       FROM "APTransactionFact" WHERE "companyId" = $1`,
      COMPANY_ID
    );
    console.log(JSON.stringify(a[0], (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));

    console.log(`\n=== APTransactionFact yearly sums ===`);
    const yrs = await p.$queryRawUnsafe<Array<any>>(
      `SELECT EXTRACT(YEAR FROM "eventDate")::int AS yr,
              "transType" AS tt,
              COUNT(*)::bigint AS n,
              SUM("normalizedAmount")::float8 AS s
       FROM "APTransactionFact" WHERE "companyId" = $1
       GROUP BY yr, tt ORDER BY yr, tt`,
      COMPANY_ID
    );
    for (const y of yrs) {
      console.log(`  yr=${y.yr}  type=${y.tt}  rows=${Number(y.n).toString().padStart(5)}  sum=${Number(y.s).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    }

    console.log(`\n=== GLTransactionFact 30100 yearly sums (DEDUP'd) by ref prefix ===`);
    const ref = await p.$queryRawUnsafe<Array<any>>(
      `
      WITH dedup AS (
        SELECT "transDate", "ref", "signedAmount",
               ROW_NUMBER() OVER (PARTITION BY "companyId", "transDate", "accountId", "transNum"
                 ORDER BY CASE WHEN "controlPeriod" IS NOT NULL THEN 0 ELSE 1 END,
                          CASE WHEN "sourceProgram" = 'SLLedgers' THEN 0 ELSE 1 END,
                          "createdAt" ASC) AS rn
        FROM "GLTransactionFact" WHERE "companyId" = $1 AND "accountId" = '30100'
      )
      SELECT EXTRACT(YEAR FROM "transDate")::int AS yr,
             COALESCE(SUBSTRING("ref" FROM '^[A-Za-z]+'), '(none)') AS prefix,
             COUNT(*)::bigint AS n,
             SUM("signedAmount")::float8 AS s
      FROM dedup WHERE rn = 1
      GROUP BY yr, prefix
      HAVING COUNT(*) > 5
      ORDER BY yr, prefix
      `,
      COMPANY_ID
    );
    for (const r of ref) {
      console.log(`  yr=${r.yr}  prefix=${(r.prefix || '').padEnd(8)}  rows=${Number(r.n).toString().padStart(5)}  sum=${Number(r.s).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    }
  } finally {
    await p.$disconnect();
  }
})();
