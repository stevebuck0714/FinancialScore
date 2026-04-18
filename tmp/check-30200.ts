import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CID = 'cmmcp278j0002kz0439rlixdj';

async function main() {
  // 30200 ref breakdown for Feb-Mar 2026
  const refs = await prisma.$queryRawUnsafe<Array<{ prefix: string; cnt: bigint; total_debit: number; total_credit: number }>>(`
    SELECT
      CASE
        WHEN "ref" LIKE 'APP%' THEN 'APP'
        WHEN "ref" LIKE 'APA%' THEN 'APA'
        WHEN "ref" LIKE 'APV%' THEN 'APV'
        ELSE LEFT("ref", 3)
      END as prefix,
      COUNT(*) as cnt,
      COALESCE(SUM(CASE WHEN "signedAmount" > 0 THEN "signedAmount" ELSE 0 END), 0) as total_debit,
      COALESCE(SUM(CASE WHEN "signedAmount" < 0 THEN "signedAmount" ELSE 0 END), 0) as total_credit
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30200'
      AND "transDate" > '2026-01-31'::date
      AND "transDate" <= '2026-03-31'::date
    GROUP BY 1
    ORDER BY cnt DESC
  `, CID);

  console.log('=== Account 30200 — Feb-Mar 2026 ===');
  console.log(`${'Prefix'.padEnd(10)} ${'Count'.padStart(8)} ${'Debit'.padStart(16)} ${'Credit'.padStart(16)} ${'Net'.padStart(16)}`);
  let totalNet = 0;
  for (const r of refs) {
    const net = Number(r.total_debit) + Number(r.total_credit);
    totalNet += net;
    console.log(`${String(r.prefix).padEnd(10)} ${String(r.cnt).padStart(8)} ${Number(r.total_debit).toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)} ${Number(r.total_credit).toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)} ${net.toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)}`);
  }
  console.log(`\nNet 30200 movement (Feb-Mar): $${totalNet.toLocaleString(undefined, {minimumFractionDigits:2})}`);

  // Combined 30100 + 30200 net for Feb-Mar
  const combined = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
    SELECT COALESCE(SUM("signedAmount"), 0) as total
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" IN ('30100', '30200')
      AND "transDate" > '2026-01-31'::date
      AND "transDate" <= '2026-03-31'::date
  `, CID);
  const combinedNet = Number(combined[0]?.total || 0);
  console.log(`\nCombined 30100+30200 net (Feb-Mar): $${combinedNet.toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`Expected change: $${(-172763.31).toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`30100-only net was: $${(-245843.67).toLocaleString(undefined, {minimumFractionDigits:2})}`);

  // Also check: what is 30200? Accrued AP? Let me show a few sample entries
  const samples = await prisma.$queryRawUnsafe<Array<{ ref: string; transDate: Date; signedAmount: number }>>(`
    SELECT "ref", "transDate", "signedAmount"
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30200'
    ORDER BY "transDate" DESC
    LIMIT 20
  `, CID);
  console.log('\n=== Recent 30200 sample entries ===');
  for (const s of samples) {
    console.log(`  ${s.transDate.toISOString().slice(0,10)}  ref="${s.ref}"  amount=${s.signedAmount}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
