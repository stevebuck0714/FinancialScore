import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';
  
  // Find vouchers present in APTransactionFact that also have APV GL entries
  const facts = await prisma.aPTransactionFact.findMany({
    where: { companyId: cid },
    orderBy: { eventDate: 'desc' },
    take: 50,
  });

  let found = 0;
  for (const fact of facts) {
    // Find the APV GL entry for this voucher
    const apvGL = await prisma.gLTransactionFact.findFirst({
      where: { companyId: cid, accountId: '30100', ref: { contains: fact.voucher, startsWith: 'APV' } },
      select: { ref: true, transDate: true, signedAmount: true },
    });
    if (!apvGL) continue;

    // Get raw SLVCHHDRS payload
    const vchRaw = await prisma.$queryRawUnsafe(`
      SELECT payload FROM "InforRawRecord"
      WHERE "companyId" = $1 AND "miProgram" IN ('SLVchHdrs', 'SLVCHHDRS')
        AND payload->>'Voucher' = $2
      LIMIT 1
    `, cid, fact.voucher);
    const vch = (vchRaw as any[])[0]?.payload;
    if (!vch) continue;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`VOUCHER ${fact.voucher} — ${fact.vendorName}`);
    console.log(`${'='.repeat(60)}\n`);

    console.log(`SLVCHHDRS (Voucher source):`);
    console.log(`  Voucher:    "${vch.Voucher}"`);
    console.log(`  Type:       "${vch.Type}"`);
    console.log(`  InvAmt:     "${vch.InvAmt}"`);
    console.log(`  DistDate:   "${vch.DistDate}"           ← THE accounting date`);
    console.log(`  InvDate:    "${vch.InvDate}"`);
    console.log(`  RecordDate: "${vch.RecordDate}"           ← entered later`);

    console.log(`\nAPTransactionFact (stored):`);
    console.log(`  voucher:          "${fact.voucher}"`);
    console.log(`  eventDate:        "${fact.eventDate.toISOString().slice(0,10)}"   ← from DistDate`);
    console.log(`  distDate:         "${fact.distDate?.toISOString().slice(0,10)}"`);
    console.log(`  normalizedAmount: ${fact.normalizedAmount}`);
    console.log(`  transType:        "${fact.transType}"`);

    console.log(`\nAPV (Voucher) GL Record:`);
    console.log(`  ref:              "${apvGL.ref}"`);
    console.log(`  transDate:        "${apvGL.transDate.toISOString().slice(0,10)}"   ← GL posting date`);
    console.log(`  signedAmount:     ${apvGL.signedAmount}`);

    const distDay = String(vch.DistDate).slice(0,8);
    const glDay = apvGL.transDate.toISOString().slice(0,10).replace(/-/g,'');
    console.log(`\n  DistDate vs GL transDate: ${distDay} vs ${glDay} → ${distDay === glDay ? '✅ SAME' : '❌ DIFFERENT by ' + Math.abs(new Date(vch.DistDate.slice(0,4)+'-'+vch.DistDate.slice(4,6)+'-'+vch.DistDate.slice(6,8)).getTime() - apvGL.transDate.getTime()) / 86400000 + ' days'}`);

    found++;
    if (found >= 5) break;
  }

  if (found === 0) console.log('No vouchers found in all three sources');
}
main().catch(console.error).finally(() => prisma.$disconnect());
