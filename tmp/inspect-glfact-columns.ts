import { PrismaClient } from '@prisma/client';

(async () => {
  const p = new PrismaClient();
  try {
    const cols = await p.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'GLTransactionFact' ORDER BY ordinal_position`
    );
    console.log(`GLTransactionFact has ${cols.length} columns:`);
    for (const c of cols) console.log(`  ${c.column_name.padEnd(24)} ${c.data_type}`);
  } finally {
    await p.$disconnect();
  }
})();
