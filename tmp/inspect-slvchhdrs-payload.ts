/**
 * Inspect raw SLVCHHDRS payloads in InforRawRecord to discover what
 * AP-account-bearing field is actually returned by CSI.
 */
import { PrismaClient } from '@prisma/client';

const COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';

(async () => {
  const p = new PrismaClient();
  try {
    console.log(`DB: ${(process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1]}`);

    console.log(`\n=== InforRawRecord miProgram distribution for AP-related programs ===`);
    const programs = await p.$queryRawUnsafe<Array<any>>(
      `SELECT "miProgram", COUNT(*)::bigint AS n
       FROM "InforRawRecord"
       WHERE "companyId" = $1 AND "miProgram" ILIKE '%vch%' OR "miProgram" ILIKE '%aptr%' OR "miProgram" ILIKE '%apt%'
       GROUP BY "miProgram" ORDER BY n DESC`,
      COMPANY_ID
    );
    for (const r of programs) {
      console.log(`  ${r.miProgram}: ${Number(r.n).toLocaleString()}`);
    }

    console.log(`\n=== Sample SLVchHdrs payload (most recent) ===`);
    const sample = await p.$queryRawUnsafe<Array<any>>(
      `SELECT id, "miProgram", payload
       FROM "InforRawRecord"
       WHERE "companyId" = $1
         AND ("miProgram" ILIKE 'SLVchHdrs' OR "miProgram" ILIKE 'SLVCHHDRS')
       ORDER BY "createdAt" DESC LIMIT 3`,
      COMPANY_ID
    );
    if (sample.length === 0) {
      console.log('  (no SLVchHdrs raw records found)');
    } else {
      for (const r of sample) {
        console.log(`\n  --- ${r.miProgram} | id=${r.id} ---`);
        const payload = r.payload as Record<string, any>;
        const keys = Object.keys(payload).sort();
        console.log(`  Keys (${keys.length}): ${keys.join(', ')}`);

        const acctKeys = keys.filter((k) =>
          /acct|account/i.test(k)
        );
        console.log(`  Account-related keys: ${acctKeys.join(', ') || '(none)'}`);
        for (const k of acctKeys) {
          console.log(`    ${k}: ${JSON.stringify(payload[k])}`);
        }
      }
    }

    console.log(`\n=== Sample SLAptrx payload (most recent) ===`);
    const aptrx = await p.$queryRawUnsafe<Array<any>>(
      `SELECT id, "miProgram", payload
       FROM "InforRawRecord"
       WHERE "companyId" = $1
         AND "miProgram" ILIKE 'SLAptrx'
       ORDER BY "createdAt" DESC LIMIT 3`,
      COMPANY_ID
    );
    if (aptrx.length === 0) {
      console.log('  (no SLAptrx raw records found)');
    } else {
      for (const r of aptrx) {
        console.log(`\n  --- ${r.miProgram} | id=${r.id} ---`);
        const payload = r.payload as Record<string, any>;
        const keys = Object.keys(payload).sort();
        console.log(`  Keys (${keys.length}): ${keys.join(', ')}`);

        const acctKeys = keys.filter((k) =>
          /acct|account/i.test(k)
        );
        console.log(`  Account-related keys: ${acctKeys.join(', ') || '(none)'}`);
        for (const k of acctKeys) {
          console.log(`    ${k}: ${JSON.stringify(payload[k])}`);
        }
      }
    }
  } finally {
    await p.$disconnect();
  }
})();
