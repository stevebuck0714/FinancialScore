import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CID = 'cmmcp278j0002kz0439rlixdj';

const ANCHOR = { date: '2026-01-31', balance: 988_024.17 };
const CHECKPOINTS = [
  { date: '2026-02-28', expected: 1_059_498.86 },
  { date: '2026-03-31', expected: 815_260.86 },
];

async function main() {
  console.log(`\n=== Clean Model Validation ===`);
  console.log(`Anchor: ${ANCHOR.date} = $${ANCHOR.balance.toLocaleString()}`);
  console.log(`Rule: vouchers on DistDate, payments on GL.transDate\n`);

  for (const cp of CHECKPOINTS) {
    // Voucher events (APTransactionFact) between anchor and checkpoint
    const vouchers = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
      SELECT COALESCE(SUM("normalizedAmount"), 0) as total
      FROM "APTransactionFact"
      WHERE "companyId" = $1
        AND "eventDate" > $2::date
        AND "eventDate" <= $3::date
    `, CID, ANCHOR.date, cp.date);

    // Payment events (GLTransactionFact APP/APA) between anchor and checkpoint
    const payments = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
      SELECT COALESCE(SUM("signedAmount"), 0) as total
      FROM "GLTransactionFact"
      WHERE "companyId" = $1
        AND "accountId" = '30100'
        AND ("ref" LIKE 'APP%' OR "ref" LIKE 'APA%')
        AND "transDate" > $2::date
        AND "transDate" <= $3::date
    `, CID, ANCHOR.date, cp.date);

    const voucherTotal = Number(vouchers[0]?.total || 0);
    const paymentTotal = Number(payments[0]?.total || 0);
    const computed = ANCHOR.balance + voucherTotal - paymentTotal;
    const gap = computed - cp.expected;
    const pctGap = cp.expected !== 0 ? (gap / cp.expected * 100).toFixed(2) : 'N/A';

    console.log(`--- ${cp.date} ---`);
    console.log(`  Voucher increases (DistDate):    +$${voucherTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
    console.log(`  Payment decreases (GL.transDate): -$${paymentTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
    console.log(`  Computed:  $${computed.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
    console.log(`  Expected:  $${cp.expected.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
    console.log(`  Gap:       $${gap.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${pctGap}%)`);
    console.log();
  }

  // Also show voucher/payment counts for context
  for (const cp of CHECKPOINTS) {
    const vCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT COUNT(*) as count FROM "APTransactionFact"
      WHERE "companyId" = $1 AND "eventDate" > $2::date AND "eventDate" <= $3::date
    `, CID, ANCHOR.date, cp.date);
    const pCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT COUNT(*) as count FROM "GLTransactionFact"
      WHERE "companyId" = $1 AND "accountId" = '30100'
        AND ("ref" LIKE 'APP%' OR "ref" LIKE 'APA%')
        AND "transDate" > $2::date AND "transDate" <= $3::date
    `, CID, ANCHOR.date, cp.date);
    console.log(`${cp.date}: ${vCount[0]?.count} voucher events, ${pCount[0]?.count} payment events`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
