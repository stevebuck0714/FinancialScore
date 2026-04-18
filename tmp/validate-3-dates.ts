import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ANCHOR = { date: '2023-12-31', balance: 697_929.58 };
const CID = 'cmmcp278j0002kz0439rlixdj';

const CHECKPOINTS = [
  { date: '2026-01-31', expected: 458_386.50 },
  { date: '2026-02-28', expected: 678_972.12 },
  { date: '2026-03-31', expected: 815_260.86 },
];

async function computeApAt(throughDate: string) {
  const vouchers = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(SUM("normalizedAmount"), 0) as total
    FROM "APTransactionFact"
    WHERE "companyId" = $1
      AND "eventDate" > '${ANCHOR.date}'::date AND "eventDate" <= '${throughDate}'::date
  `, CID);
  const voucherTotal = Number((vouchers as any[])[0]?.total || 0);

  const payments = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(SUM("signedAmount"), 0) as total
    FROM "GLTransactionFact"
    WHERE "companyId" = $1 AND "accountId" = '30100'
      AND ("ref" LIKE 'APP%' OR "ref" LIKE 'APA%')
      AND "transDate" > '${ANCHOR.date}'::date AND "transDate" <= '${throughDate}'::date
  `, CID);
  const paymentTotal = Number((payments as any[])[0]?.total || 0);

  return { voucherTotal, paymentTotal, computed: ANCHOR.balance + voucherTotal - paymentTotal };
}

async function main() {
  console.log(`Anchor: ${ANCHOR.date} = $${ANCHOR.balance.toLocaleString()}\n`);

  for (const cp of CHECKPOINTS) {
    const { voucherTotal, paymentTotal, computed } = await computeApAt(cp.date);
    const gap = computed - cp.expected;
    const pct = ((gap / cp.expected) * 100).toFixed(1);
    console.log(`--- ${cp.date} ---`);
    console.log(`  Vouchers:  +$${voucherTotal.toLocaleString()}`);
    console.log(`  Payments:  -$${paymentTotal.toLocaleString()}`);
    console.log(`  Computed:   $${computed.toLocaleString()}`);
    console.log(`  Expected:   $${cp.expected.toLocaleString()}`);
    console.log(`  Gap:        $${gap.toLocaleString()} (${pct}%)`);
    console.log();
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
