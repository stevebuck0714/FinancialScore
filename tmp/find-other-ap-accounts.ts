import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CID = 'cmmcp278j0002kz0439rlixdj';

async function main() {
  // Find all accounts that have APV, APP, or APA ref entries
  const apAccounts = await prisma.$queryRawUnsafe<Array<{ accountId: string; cnt: bigint; net: number }>>(`
    SELECT "accountId", COUNT(*) as cnt, COALESCE(SUM("signedAmount"), 0) as net
    FROM "GLTransactionFact"
    WHERE "companyId" = $1
      AND ("ref" LIKE 'APP%' OR "ref" LIKE 'APV%' OR "ref" LIKE 'APA%')
    GROUP BY "accountId"
    ORDER BY cnt DESC
  `, CID);

  console.log('=== Accounts with AP-related GL entries (APV/APP/APA ref) ===');
  console.log(`${'Account'.padEnd(12)} ${'Count'.padStart(8)} ${'Net Amount'.padStart(16)}`);
  for (const a of apAccounts) {
    console.log(`${String(a.accountId).padEnd(12)} ${String(a.cnt).padStart(8)} ${Number(a.net).toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)}`);
  }

  // Also look at the APTransactionFact apAcct values
  const apAcctValues = await prisma.$queryRawUnsafe<Array<{ apAcct: string | null; cnt: bigint; total: number }>>(`
    SELECT "apAcct", COUNT(*) as cnt, COALESCE(SUM("normalizedAmount"), 0) as total
    FROM "APTransactionFact"
    WHERE "companyId" = $1
    GROUP BY "apAcct"
    ORDER BY cnt DESC
  `, CID);

  console.log('\n=== APTransactionFact apAcct values ===');
  console.log(`${'apAcct'.padEnd(12)} ${'Count'.padStart(8)} ${'Total'.padStart(16)}`);
  for (const a of apAcctValues) {
    console.log(`${String(a.apAcct || '(null)').padEnd(12)} ${String(a.cnt).padStart(8)} ${Number(a.total).toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)}`);
  }

  // Check: are there 30100-sub accounts like 30100-001, 30150, etc?
  const acctPattern = await prisma.$queryRawUnsafe<Array<{ accountId: string; cnt: bigint }>>(`
    SELECT "accountId", COUNT(*) as cnt
    FROM "GLTransactionFact"
    WHERE "companyId" = $1
      AND "accountId" LIKE '30%'
    GROUP BY "accountId"
    ORDER BY "accountId"
  `, CID);

  console.log('\n=== All accounts starting with 30xxx ===');
  for (const a of acctPattern) {
    console.log(`  ${a.accountId}: ${a.cnt} entries`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
