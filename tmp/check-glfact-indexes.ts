import { PrismaClient } from '@prisma/client';

(async () => {
  const p = new PrismaClient();
  try {
    const url = process.env.DATABASE_URL || '';
    console.log(`DB host: ${url.match(/@([^/]+)/)?.[1] || 'unknown'}`);
    const idx = await p.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'GLTransactionFact' ORDER BY indexname`
    );
    console.log(`\nIndexes/constraints on GLTransactionFact:`);
    for (const i of idx) {
      console.log(`  ${i.indexname}`);
      console.log(`    ${i.indexdef}`);
    }
  } finally {
    await p.$disconnect();
  }
})();
