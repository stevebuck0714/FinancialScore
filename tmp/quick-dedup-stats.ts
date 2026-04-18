import { PrismaClient } from '@prisma/client';

(async () => {
  const p = new PrismaClient();
  try {
    console.log(`DB: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);
    const rows = await p.$queryRawUnsafe<
      Array<{ companyId: string; total: bigint; groups: bigint; would_delete: bigint }>
    >(
      `
      WITH groups AS (
        SELECT "companyId", "transDate", "accountId", "transNum", COUNT(*) AS n
        FROM "GLTransactionFact"
        GROUP BY "companyId", "transDate", "accountId", "transNum"
      )
      SELECT "companyId",
             SUM(n)::bigint AS total,
             COUNT(*)::bigint AS groups,
             SUM(n - 1)::bigint AS would_delete
      FROM groups
      GROUP BY "companyId"
      ORDER BY total DESC
      `
    );
    for (const r of rows) {
      console.log(
        `  company=${r.companyId}  total=${Number(r.total).toLocaleString().padStart(8)}  unique=${Number(r.groups).toLocaleString().padStart(8)}  would_delete=${Number(r.would_delete).toLocaleString().padStart(8)}`
      );
    }

    console.log(`\n=== NULL audit on dedup key columns ===`);
    const nulls = await p.$queryRawUnsafe<
      Array<{ all_rows: bigint; trans_num_null: bigint; ref_null: bigint; description_null: bigint }>
    >(
      `
      SELECT
        COUNT(*)::bigint AS all_rows,
        COUNT(*) FILTER (WHERE "transNum" IS NULL)::bigint AS trans_num_null,
        COUNT(*) FILTER (WHERE ref IS NULL)::bigint AS ref_null,
        COUNT(*) FILTER (WHERE description IS NULL)::bigint AS description_null
      FROM "GLTransactionFact"
      `
    );
    console.log(JSON.stringify(nulls[0], (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
  } finally {
    await p.$disconnect();
  }
})();
