import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';

  // Find vouchers that have BOTH an APTransactionFact AND an APP GL entry (paid vouchers)
  const facts = await prisma.aPTransactionFact.findMany({
    where: { companyId: cid },
    orderBy: { eventDate: 'desc' },
    take: 100,
    select: { voucher: true, eventDate: true, distDate: true, invoiceAmount: true, normalizedAmount: true, transType: true, vendorName: true },
  });

  let found = 0;
  for (const fact of facts) {
    const appGL = await prisma.gLTransactionFact.findFirst({
      where: { companyId: cid, accountId: '30100', ref: { contains: fact.voucher } , ref: { startsWith: 'APP' } },
      select: { ref: true, transDate: true, signedAmount: true },
    });
    if (!appGL) continue;

    // Get raw SLVCHHDRS payload
    const vchRaw = await prisma.$queryRawUnsafe(`
      SELECT payload FROM "InforRawRecord"
      WHERE "companyId" = $1 AND "miProgram" IN ('SLVchHdrs', 'SLVCHHDRS')
        AND payload->>'Voucher' = $2
      LIMIT 1
    `, cid, fact.voucher);
    const vchPayload = (vchRaw as any[])[0]?.payload;

    console.log(`=== Voucher ${fact.voucher} — ${fact.vendorName} ===\n`);

    console.log(`SLVCHHDRS (Voucher source):`);
    if (vchPayload) {
      console.log(`  Voucher:    "${vchPayload.Voucher}"`);
      console.log(`  Type:       "${vchPayload.Type}"`);
      console.log(`  InvAmt:     "${vchPayload.InvAmt}"`);
      console.log(`  DistDate:   "${vchPayload.DistDate}"`);
      console.log(`  InvDate:    "${vchPayload.InvDate}"`);
      console.log(`  RecordDate: "${vchPayload.RecordDate}"`);
    } else {
      console.log(`  (not found in raw records)`);
    }

    console.log(`\nAPTransactionFact (stored):`);
    console.log(`  voucher:          "${fact.voucher}"`);
    console.log(`  eventDate:        "${fact.eventDate.toISOString().slice(0,10)}"`);
    console.log(`  distDate:         "${fact.distDate?.toISOString().slice(0,10)}"`);
    console.log(`  normalizedAmount: ${fact.normalizedAmount}`);
    console.log(`  transType:        "${fact.transType}"`);

    console.log(`\nAPP (Payment) GL Record:`);
    console.log(`  ref:              "${appGL.ref}"`);
    console.log(`  transDate:        "${appGL.transDate.toISOString().slice(0,10)}"`);
    console.log(`  signedAmount:     ${appGL.signedAmount}`);
    console.log();

    found++;
    if (found >= 5) break;
  }

  if (found === 0) console.log('No vouchers found with both APTransactionFact and APP GL entry');
}
main().catch(console.error).finally(() => prisma.$disconnect());
