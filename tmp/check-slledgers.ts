import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CID = 'cmmcp278j0002kz0439rlixdj';

async function main() {
  // Sample SLLedgers payloads for account 30100
  const ledgers = await prisma.$queryRawUnsafe<Array<{ payload: any; createdAt: Date }>>(`
    SELECT payload, "createdAt" FROM "InforRawRecord"
    WHERE "companyId" = $1
      AND "miProgram" = 'SLLedgers'
      AND payload->>'Acct' = '30100'
    ORDER BY "createdAt" DESC
    LIMIT 10
  `, CID);

  console.log(`=== SLLedgers entries for account 30100 (${ledgers.length} found) ===\n`);
  for (const l of ledgers) {
    const p = l.payload;
    console.log(`  synced: ${l.createdAt.toISOString().slice(0,10)}`);
    console.log(`  payload keys: ${Object.keys(p).join(', ')}`);
    console.log(`  Acct=${p.Acct} FiscalYear=${p.FiscalYear} Period=${p.FiscalPeriod || p.Period}`);
    console.log(`  BegBal=${p.BegBalance || p.BegBal} Debit=${p.Debit} Credit=${p.Credit} EndBal=${p.EndBalance || p.EndBal}`);
    console.log(`  Full: ${JSON.stringify(p).slice(0, 300)}`);
    console.log();
  }

  // Also: what does a generic SLLedgers record look like?
  if (ledgers.length === 0) {
    console.log('No 30100 entries. Showing generic sample...\n');
    const sample = await prisma.$queryRawUnsafe<Array<{ payload: any }>>(`
      SELECT payload FROM "InforRawRecord"
      WHERE "companyId" = $1
        AND "miProgram" = 'SLLedgers'
      ORDER BY "createdAt" DESC
      LIMIT 5
    `, CID);
    for (const s of sample) {
      console.log(`  Keys: ${Object.keys(s.payload).join(', ')}`);
      console.log(`  ${JSON.stringify(s.payload).slice(0, 400)}`);
      console.log();
    }
  }

  // Count SLLedgers by account to see scope
  console.log('=== SLLedgers — top accounts by count ===');
  const byAcct = await prisma.$queryRawUnsafe<Array<{ acct: string; cnt: bigint }>>(`
    SELECT payload->>'Acct' as acct, COUNT(*) as cnt
    FROM "InforRawRecord"
    WHERE "companyId" = $1 AND "miProgram" = 'SLLedgers'
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 20
  `, CID);
  for (const a of byAcct) {
    console.log(`  ${String(a.acct).padEnd(12)} ${String(a.cnt).padStart(8)} records`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
