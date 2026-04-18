import { PrismaClient } from '@prisma/client';

(async () => {
  const p = new PrismaClient();
  try {
    const url = process.env.DATABASE_URL || '';
    const host = url.match(/@([^/]+)/)?.[1] || 'unknown';
    console.log(`DATABASE_URL host: ${host}`);

    try {
      const r = await p.$queryRawUnsafe<Array<{ cnt: bigint; cp_set: bigint }>>(
        `SELECT COUNT(*)::bigint AS cnt, COUNT(*) FILTER (WHERE "controlPeriod" IS NOT NULL)::bigint AS cp_set FROM "GLTransactionFact"`
      );
      console.log(`SELECT controlPeriod worked: total=${r[0].cnt} controlPeriod populated=${r[0].cp_set}`);
    } catch (e) {
      console.log(`SELECT controlPeriod FAILED: ${(e as Error).message}`);
    }

    try {
      const r = await p.$queryRawUnsafe<Array<{ schema_name: string }>>(
        `SELECT current_schema() AS schema_name`
      );
      console.log(`current_schema: ${r[0].schema_name}`);
    } catch {}

    try {
      const r = await p.$queryRawUnsafe<Array<{ schema: string; cnt: bigint }>>(
        `SELECT table_schema AS schema, COUNT(*)::bigint AS cnt FROM information_schema.columns WHERE table_name = 'GLTransactionFact' GROUP BY table_schema`
      );
      console.log(`information_schema.columns sees GLTransactionFact in:`);
      for (const row of r) console.log(`  schema=${row.schema} columns=${row.cnt}`);
    } catch {}

    try {
      const r = await p.$queryRawUnsafe<Array<{ relname: string; nspname: string }>>(
        `SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'GLTransactionFact'`
      );
      console.log(`pg_class sees GLTransactionFact in:`);
      for (const row of r) console.log(`  schema=${row.nspname} table=${row.relname}`);
    } catch {}
  } finally {
    await p.$disconnect();
  }
})();
