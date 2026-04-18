import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';

  // Show APP ref patterns
  const apps = await prisma.gLTransactionFact.findMany({
    where: { companyId: cid, accountId: '30100', ref: { startsWith: 'APP' } },
    select: { ref: true, transDate: true, signedAmount: true },
    orderBy: { transDate: 'desc' },
    take: 20,
  });
  console.log('=== APP GL entries (ref patterns) ===');
  for (const a of apps) {
    console.log(`  ref: "${a.ref}"  transDate: ${a.transDate.toISOString().slice(0,10)}  amount: ${a.signedAmount}`);
  }

  // Show APV ref patterns
  const apvs = await prisma.gLTransactionFact.findMany({
    where: { companyId: cid, accountId: '30100', ref: { startsWith: 'APV' } },
    select: { ref: true, transDate: true, signedAmount: true },
    orderBy: { transDate: 'desc' },
    take: 20,
  });
  console.log('\n=== APV GL entries (ref patterns) ===');
  for (const v of apvs) {
    console.log(`  ref: "${v.ref}"  transDate: ${v.transDate.toISOString().slice(0,10)}  amount: ${v.signedAmount}`);
  }

  // Check if APV numbers match vouchers in APTransactionFact
  console.log('\n=== APV -> APTransactionFact match test ===');
  let matchCount = 0;
  for (const v of apvs.slice(0,10)) {
    const voucherNum = String(v.ref || '').replace(/^APV\s*/, '').trim();
    const fact = await prisma.aPTransactionFact.findFirst({
      where: { companyId: cid, voucher: voucherNum },
      select: { voucher: true, eventDate: true, normalizedAmount: true },
    });
    console.log(`  APV ref "${v.ref}" -> voucher "${voucherNum}" -> fact: ${fact ? `✅ eventDate=${fact.eventDate.toISOString().slice(0,10)} amount=${fact.normalizedAmount}` : '❌ not found'}`);
    if (fact) matchCount++;
  }
  console.log(`  Matched ${matchCount}/${Math.min(10,apvs.length)}`);

  // Unique APP ref number patterns
  const appNums = apps.map(a => String(a.ref).replace(/^APP\s*/, '').trim());
  const uniqueAppNums = [...new Set(appNums)];
  console.log(`\n=== Unique APP ref numbers (${uniqueAppNums.length}): ===`);
  uniqueAppNums.forEach(n => console.log(`  ${n}`));
}
main().catch(console.error).finally(() => prisma.$disconnect());
