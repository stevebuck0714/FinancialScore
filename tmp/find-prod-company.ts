import { PrismaClient } from '@prisma/client';
(async () => {
  const p = new PrismaClient();
  try {
    console.log(`DB: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);
    const rows = await p.$queryRawUnsafe<Array<{ companyId: string; name: string | null; n: bigint }>>(
      `SELECT g."companyId", c."name", COUNT(*)::bigint AS n
       FROM "GLTransactionFact" g
       LEFT JOIN "Company" c ON c.id = g."companyId"
       GROUP BY g."companyId", c."name"
       ORDER BY n DESC`
    );
    console.log('GLTransactionFact rows by company:');
    for (const r of rows) {
      console.log(`  ${r.companyId}  ${r.name || '(no name)'}  rows=${Number(r.n).toLocaleString()}`);
    }
  } finally {
    await p.$disconnect();
  }
})();
