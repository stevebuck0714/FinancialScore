import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CID = 'cmmcp278j0002kz0439rlixdj';

async function main() {
  // Check what GL-related miPrograms exist in InforRawRecord
  const programs = await prisma.$queryRawUnsafe<Array<{ miProgram: string; cnt: bigint; earliest: Date; latest: Date }>>(`
    SELECT "miProgram", COUNT(*) as cnt,
           MIN("createdAt") as earliest, MAX("createdAt") as latest
    FROM "InforRawRecord"
    WHERE "companyId" = $1
      AND ("miProgram" ILIKE '%gl%' OR "miProgram" ILIKE '%trans%' OR "miProgram" ILIKE '%journal%'
           OR "miProgram" ILIKE '%dist%' OR "miProgram" ILIKE '%ledger%')
    GROUP BY "miProgram"
    ORDER BY cnt DESC
  `, CID);

  console.log('=== GL-related miPrograms in InforRawRecord ===');
  if (programs.length === 0) {
    console.log('  (none found)');
  }
  for (const p of programs) {
    console.log(`  ${String(p.miProgram).padEnd(25)} ${String(p.cnt).padStart(8)} records  ${p.earliest?.toISOString().slice(0,10)} - ${p.latest?.toISOString().slice(0,10)}`);
  }

  // Check ALL distinct miPrograms to see what's available
  console.log('\n=== ALL distinct miPrograms in InforRawRecord ===');
  const allPrograms = await prisma.$queryRawUnsafe<Array<{ miProgram: string; cnt: bigint }>>(`
    SELECT "miProgram", COUNT(*) as cnt
    FROM "InforRawRecord"
    WHERE "companyId" = $1
    GROUP BY "miProgram"
    ORDER BY cnt DESC
  `, CID);
  for (const p of allPrograms) {
    console.log(`  ${String(p.miProgram).padEnd(30)} ${String(p.cnt).padStart(8)} records`);
  }

  // Check GLAcctPeriodBalances for account 30100
  console.log('\n=== GLAcctPeriodBalances for 30100 (if available) ===');
  const periodBals = await prisma.$queryRawUnsafe<Array<{ payload: any }>>(`
    SELECT payload FROM "InforRawRecord"
    WHERE "companyId" = $1
      AND "miProgram" ILIKE '%periodbal%'
      AND payload->>'Acct' = '30100'
    ORDER BY "createdAt" DESC
    LIMIT 20
  `, CID);
  if (periodBals.length === 0) {
    console.log('  (none found)');
    // Try alternate search
    const periodBals2 = await prisma.$queryRawUnsafe<Array<{ payload: any }>>(`
      SELECT payload FROM "InforRawRecord"
      WHERE "companyId" = $1
        AND "miProgram" ILIKE '%acctperiod%'
        AND payload->>'Acct' = '30100'
      ORDER BY "createdAt" DESC
      LIMIT 20
    `, CID);
    if (periodBals2.length > 0) {
      console.log('  Found via acctperiod:');
      for (const b of periodBals2) {
        const p = b.payload;
        console.log(`  FY=${p.FiscalYear} P=${p.FiscalPeriod}  BegBal=${p.BegBalance}  Dr=${p.Debit}  Cr=${p.Credit}  EndBal=${p.EndBalance}`);
      }
    }
  } else {
    for (const b of periodBals) {
      const p = b.payload;
      console.log(`  FY=${p.FiscalYear} P=${p.FiscalPeriod}  BegBal=${p.BegBalance}  Dr=${p.Debit}  Cr=${p.Credit}  EndBal=${p.EndBalance}`);
    }
  }

  // Check company metadata for IDO contract
  console.log('\n=== Company IDO contract (if stored) ===');
  const company = await prisma.$queryRawUnsafe<Array<{ metadata: any }>>(`
    SELECT metadata FROM "Company"
    WHERE id = $1
    LIMIT 1
  `, CID);
  if (company.length > 0 && company[0].metadata) {
    const meta = company[0].metadata;
    const programs = meta.accountingProgramsBySystem || meta.programsBySystem;
    if (programs) {
      const csi = programs.INFOR_CSI || programs.infor_csi;
      if (csi) {
        console.log('  CSI programs configured:');
        for (const [key, val] of Object.entries(csi as Record<string, unknown>)) {
          console.log(`    ${key}: ${JSON.stringify(val)}`);
        }
      } else {
        console.log('  Keys:', Object.keys(programs));
      }
    } else {
      console.log('  No programsBySystem in metadata');
      console.log('  Top-level keys:', Object.keys(meta).slice(0, 20));
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
