import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';

  // Start from a recent APTransactionFact voucher
  const facts = await prisma.aPTransactionFact.findMany({
    where: { companyId: cid },
    orderBy: { eventDate: 'desc' },
    take: 20,
    select: { voucher: true, eventDate: true, distDate: true, invoiceAmount: true, transType: true, vendorName: true },
  });

  for (const fact of facts) {
    // Look for APP or APV GL entries referencing this voucher
    const glMatches = await prisma.gLTransactionFact.findMany({
      where: {
        companyId: cid,
        accountId: '30100',
        ref: { contains: fact.voucher },
      },
      select: { ref: true, transDate: true, signedAmount: true, transNum: true },
    });

    if (glMatches.length > 0) {
      console.log(`=== Voucher ${fact.voucher} — ${fact.vendorName} ===`);
      console.log(`  APTransactionFact:`);
      console.log(`    eventDate (DistDate): ${fact.distDate?.toISOString().slice(0,10)}`);
      console.log(`    amount:              $${fact.invoiceAmount}`);
      console.log(`    type:                ${fact.transType}`);
      console.log(`  GL matches on 30100:`);
      for (const gl of glMatches) {
        console.log(`    ${gl.ref?.padEnd(16)} transDate: ${gl.transDate.toISOString().slice(0,10)}  amount: $${gl.signedAmount}`);
      }
      console.log();
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
