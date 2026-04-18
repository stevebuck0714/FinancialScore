import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CID = 'cmmcp278j0002kz0439rlixdj';

const ANCHORS = [
  { date: '2026-01-31', balance: 458_386.50, label: 'Jan 31' },
  { date: '2026-02-28', balance: 678_972.12, label: 'Feb 28' },
  { date: '2026-03-31', balance: 815_260.86, label: 'Mar 31' },
];

async function glNetOn30100(fromDate: string, toDate: string): Promise<number> {
  const result = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
    SELECT COALESCE(SUM("signedAmount"), 0) as total
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND "transDate" > $2::date
      AND "transDate" <= $3::date
  `, CID, fromDate, toDate);
  return Number(result[0]?.total || 0);
}

async function glBreakdown(fromDate: string, toDate: string) {
  const result = await prisma.$queryRawUnsafe<Array<{ prefix: string; cnt: bigint; net: number }>>(`
    SELECT
      CASE
        WHEN "ref" LIKE 'APP%' THEN 'APP'
        WHEN "ref" LIKE 'APA%' THEN 'APA'
        WHEN "ref" LIKE 'APV%' THEN 'APV'
        ELSE 'Other (' || LEFT("ref", 5) || ')'
      END as prefix,
      COUNT(*) as cnt,
      COALESCE(SUM("signedAmount"), 0) as net
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND "transDate" > $2::date
      AND "transDate" <= $3::date
    GROUP BY 1
    ORDER BY 1
  `, CID, fromDate, toDate);
  return result;
}

async function main() {
  console.log('=== Pure GL Roll-Forward on Account 30100 (corrected sign) ===');
  console.log('Formula: New AP = Old AP - sum(signedAmounts)');
  console.log('(Credits are negative signedAmount → increase AP when negated)\n');

  // Test 1: Jan -> Feb
  const janToFebNet = await glNetOn30100('2026-01-31', '2026-02-28');
  const febComputed = ANCHORS[0].balance - janToFebNet;  // CORRECTED: subtract GL net
  const febGap = febComputed - ANCHORS[1].balance;
  console.log('--- Jan 31 -> Feb 28 ---');
  console.log(`  Anchor (Jan 31):  $${ANCHORS[0].balance.toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  GL net (raw):     $${janToFebNet.toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  AP change:        $${(-janToFebNet).toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  Computed Feb 28:  $${febComputed.toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  Expected Feb 28:  $${ANCHORS[1].balance.toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  Gap:              $${febGap.toLocaleString(undefined, {minimumFractionDigits:2})} (${(febGap / ANCHORS[1].balance * 100).toFixed(2)}%)`);
  const janFebBreakdown = await glBreakdown('2026-01-31', '2026-02-28');
  for (const b of janFebBreakdown) {
    console.log(`    ${String(b.prefix).padEnd(12)} ${String(b.cnt).padStart(5)} entries  net: $${Number(b.net).toLocaleString(undefined, {minimumFractionDigits:2})}`);
  }

  // Test 2: Feb -> Mar
  const febToMarNet = await glNetOn30100('2026-02-28', '2026-03-31');
  const marComputed = ANCHORS[1].balance - febToMarNet;  // CORRECTED
  const marGap = marComputed - ANCHORS[2].balance;
  console.log('\n--- Feb 28 -> Mar 31 ---');
  console.log(`  Anchor (Feb 28):  $${ANCHORS[1].balance.toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  GL net (raw):     $${febToMarNet.toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  AP change:        $${(-febToMarNet).toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  Computed Mar 31:  $${marComputed.toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  Expected Mar 31:  $${ANCHORS[2].balance.toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  Gap:              $${marGap.toLocaleString(undefined, {minimumFractionDigits:2})} (${(marGap / ANCHORS[2].balance * 100).toFixed(2)}%)`);
  const febMarBreakdown = await glBreakdown('2026-02-28', '2026-03-31');
  for (const b of febMarBreakdown) {
    console.log(`    ${String(b.prefix).padEnd(12)} ${String(b.cnt).padStart(5)} entries  net: $${Number(b.net).toLocaleString(undefined, {minimumFractionDigits:2})}`);
  }

  // Test 3: Jan -> Mar (cumulative)
  const janToMarNet = await glNetOn30100('2026-01-31', '2026-03-31');
  const marFromJan = ANCHORS[0].balance - janToMarNet;  // CORRECTED
  const marFromJanGap = marFromJan - ANCHORS[2].balance;
  console.log('\n--- Jan 31 -> Mar 31 (cumulative) ---');
  console.log(`  Anchor (Jan 31):  $${ANCHORS[0].balance.toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  GL net (raw):     $${janToMarNet.toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  AP change:        $${(-janToMarNet).toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  Computed Mar 31:  $${marFromJan.toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  Expected Mar 31:  $${ANCHORS[2].balance.toLocaleString(undefined, {minimumFractionDigits:2})}`);
  console.log(`  Gap:              $${marFromJanGap.toLocaleString(undefined, {minimumFractionDigits:2})} (${(marFromJanGap / ANCHORS[2].balance * 100).toFixed(2)}%)`);

  // Also check: total GL entries on 30100 by month to detect sync gaps
  console.log('\n=== GL entry counts on 30100 by month ===');
  const months = [
    { label: 'Jan 2026', from: '2025-12-31', to: '2026-01-31' },
    { label: 'Feb 2026', from: '2026-01-31', to: '2026-02-28' },
    { label: 'Mar 2026', from: '2026-02-28', to: '2026-03-31' },
  ];
  for (const m of months) {
    const cnt = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT COUNT(*) as count FROM "GLTransactionFact"
      WHERE "companyId" = $1 AND "accountId" = '30100'
        AND "transDate" > $2::date AND "transDate" <= $3::date
    `, CID, m.from, m.to);
    console.log(`  ${m.label}: ${cnt[0]?.count} entries`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
