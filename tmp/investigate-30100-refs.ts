import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CID = 'cmmcp278j0002kz0439rlixdj';

async function main() {
  // All ref prefixes on account 30100, grouped
  const refs = await prisma.$queryRawUnsafe<Array<{ prefix: string; cnt: bigint; total_debit: number; total_credit: number }>>(`
    SELECT
      CASE
        WHEN "ref" LIKE 'APP%' THEN 'APP'
        WHEN "ref" LIKE 'APA%' THEN 'APA'
        WHEN "ref" LIKE 'APV%' THEN 'APV'
        WHEN "ref" LIKE 'APD%' THEN 'APD'
        WHEN "ref" LIKE 'GJ%'  THEN 'GJ'
        WHEN "ref" IS NULL OR "ref" = '' THEN '(empty)'
        ELSE LEFT("ref", 3)
      END as prefix,
      COUNT(*) as cnt,
      COALESCE(SUM(CASE WHEN "signedAmount" > 0 THEN "signedAmount" ELSE 0 END), 0) as total_debit,
      COALESCE(SUM(CASE WHEN "signedAmount" < 0 THEN "signedAmount" ELSE 0 END), 0) as total_credit
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
    GROUP BY 1
    ORDER BY cnt DESC
  `, CID);

  console.log('=== All ref prefixes on account 30100 ===');
  console.log(`${'Prefix'.padEnd(10)} ${'Count'.padStart(8)} ${'Total Debit'.padStart(16)} ${'Total Credit'.padStart(16)} ${'Net'.padStart(16)}`);
  for (const r of refs) {
    const net = Number(r.total_debit) + Number(r.total_credit);
    console.log(`${String(r.prefix).padEnd(10)} ${String(r.cnt).padStart(8)} ${Number(r.total_debit).toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)} ${Number(r.total_credit).toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)} ${net.toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)}`);
  }

  // Same but filtered to Feb-Mar 2026
  console.log('\n=== Same, filtered to Feb 1 - Mar 31, 2026 ===');
  const refs2 = await prisma.$queryRawUnsafe<Array<{ prefix: string; cnt: bigint; total_debit: number; total_credit: number }>>(`
    SELECT
      CASE
        WHEN "ref" LIKE 'APP%' THEN 'APP'
        WHEN "ref" LIKE 'APA%' THEN 'APA'
        WHEN "ref" LIKE 'APV%' THEN 'APV'
        WHEN "ref" LIKE 'APD%' THEN 'APD'
        WHEN "ref" LIKE 'GJ%'  THEN 'GJ'
        WHEN "ref" IS NULL OR "ref" = '' THEN '(empty)'
        ELSE LEFT("ref", 3)
      END as prefix,
      COUNT(*) as cnt,
      COALESCE(SUM(CASE WHEN "signedAmount" > 0 THEN "signedAmount" ELSE 0 END), 0) as total_debit,
      COALESCE(SUM(CASE WHEN "signedAmount" < 0 THEN "signedAmount" ELSE 0 END), 0) as total_credit
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND "transDate" > '2026-01-31'::date
      AND "transDate" <= '2026-03-31'::date
    GROUP BY 1
    ORDER BY cnt DESC
  `, CID);

  console.log(`${'Prefix'.padEnd(10)} ${'Count'.padStart(8)} ${'Total Debit'.padStart(16)} ${'Total Credit'.padStart(16)} ${'Net'.padStart(16)}`);
  for (const r of refs2) {
    const net = Number(r.total_debit) + Number(r.total_credit);
    console.log(`${String(r.prefix).padEnd(10)} ${String(r.cnt).padStart(8)} ${Number(r.total_debit).toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)} ${Number(r.total_credit).toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)} ${net.toLocaleString(undefined, {minimumFractionDigits:2}).padStart(16)}`);
  }

  // Net GL movement on 30100 for Feb-Mar (ALL entries)
  const glNet = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
    SELECT COALESCE(SUM("signedAmount"), 0) as total
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND "transDate" > '2026-01-31'::date
      AND "transDate" <= '2026-03-31'::date
  `, CID);
  console.log(`\nNet GL movement on 30100 (Feb-Mar): $${Number(glNet[0]?.total || 0).toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`Expected change from anchor: $${(815260.86 - 988024.17).toLocaleString(undefined, {minimumFractionDigits:2})}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
