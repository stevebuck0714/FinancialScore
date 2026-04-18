import { PrismaClient } from '@prisma/client';
(async () => {
  const p = new PrismaClient();
  try {
    console.log(`DB: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);
    const r = await p.$queryRawUnsafe<Array<any>>(
      `SELECT
         COUNT(*)::bigint AS total,
         COUNT(*) FILTER (WHERE "transNum" IS NULL)::bigint AS null_cnt,
         COUNT(*) FILTER (WHERE "transNum" = '')::bigint AS empty_cnt,
         COUNT(*) FILTER (WHERE "transNum" IS NOT NULL AND TRIM("transNum") = '')::bigint AS whitespace_cnt
       FROM "GLTransactionFact"`
    );
    console.log(JSON.stringify(r[0], (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
  } finally {
    await p.$disconnect();
  }
})();
