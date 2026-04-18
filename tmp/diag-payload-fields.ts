/**
 * Inspect actual payload fields for SLGLTRANS, SLLedgers, GLAcctPeriodBalances.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CID = 'cmmcp278j0002kz0439rlixdj';

async function showSample(program: string, filter = '') {
  const rows = await prisma.$queryRawUnsafe<Array<{ payload: any }>>(
    `SELECT payload FROM "InforRawRecord"
     WHERE "companyId" = $1 AND "miProgram" = $2 ${filter}
     LIMIT 1`, CID, program,
  );
  if (rows.length === 0) {
    console.log(`\n=== ${program}: no rows ===`);
    return;
  }
  console.log(`\n=== ${program}: keys (${Object.keys(rows[0].payload).length}) ===`);
  console.log('  ' + Object.keys(rows[0].payload).sort().join(', '));
  console.log(`\n  Sample payload (first row):`);
  for (const [k, v] of Object.entries(rows[0].payload)) {
    const valStr = String(v).length > 60 ? String(v).slice(0, 60) + '...' : String(v);
    console.log(`    ${k.padEnd(25)} = ${valStr}`);
  }
}

async function main() {
  await showSample('SLGLTRANS', `AND payload->>'Acct' = '30100' AND payload->>'TransDate' >= '20260201'`);
  await showSample('SLLedgers',  `AND payload->>'Acct' = '30100' AND payload->>'TransDate' >= '20260201'`);
  await showSample('GLAcctPeriodBalances');

  // Also show 5 GLAcctPeriodBalances for 30100 specifically (search by various account-key candidates)
  console.log('\n=== GLAcctPeriodBalances rows where any value contains "30100" ===');
  const r = await prisma.$queryRawUnsafe<Array<{ payload: any }>>(
    `SELECT payload FROM "InforRawRecord"
     WHERE "companyId" = $1 AND "miProgram" = 'GLAcctPeriodBalances'
       AND payload::text LIKE '%30100%'
     LIMIT 5`, CID,
  );
  for (const [i, row] of r.entries()) {
    console.log(`  -- row ${i+1} --`);
    for (const [k, v] of Object.entries(row.payload)) {
      const valStr = String(v).length > 80 ? String(v).slice(0, 80) + '...' : String(v);
      console.log(`    ${k.padEnd(25)} = ${valStr}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
