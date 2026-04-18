/**
 * Check dev DB AP/GL data state to see if backfill is meaningful here.
 */
import { PrismaClient } from '@prisma/client';

(async () => {
  const p = new PrismaClient();
  try {
    console.log(`DB: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);

    const ap = await p.$queryRawUnsafe<Array<any>>(
      `SELECT "companyId", COUNT(*)::bigint AS rows,
              COUNT(*) FILTER (WHERE "apAcct" IS NULL)::bigint AS null_acct,
              COUNT(DISTINCT "voucher")::bigint AS distinct_vouchers
       FROM "APTransactionFact" GROUP BY "companyId" ORDER BY rows DESC`
    );
    console.log(`\n=== APTransactionFact rows by company ===`);
    for (const r of ap) {
      console.log(
        `  companyId=${r.companyId}  rows=${Number(r.rows).toLocaleString()}  null_acct=${Number(r.null_acct).toLocaleString()}  vouchers=${Number(r.distinct_vouchers).toLocaleString()}`
      );
    }

    const gl = await p.$queryRawUnsafe<Array<any>>(
      `SELECT "companyId", COUNT(*)::bigint AS rows,
              COUNT(*) FILTER (WHERE "ref" LIKE 'APV%')::bigint AS apv_rows
       FROM "GLTransactionFact" GROUP BY "companyId" ORDER BY rows DESC`
    );
    console.log(`\n=== GLTransactionFact rows by company ===`);
    for (const r of gl) {
      console.log(
        `  companyId=${r.companyId}  rows=${Number(r.rows).toLocaleString()}  apv_rows=${Number(r.apv_rows).toLocaleString()}`
      );
    }
  } finally {
    await p.$disconnect();
  }
})();
