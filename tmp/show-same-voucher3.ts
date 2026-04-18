import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';

  // Get APP GL records and extract voucher numbers from ref
  const appGLs = await prisma.gLTransactionFact.findMany({
    where: { companyId: cid, accountId: '30100', ref: { startsWith: 'APP' } },
    select: { ref: true, transDate: true, signedAmount: true },
    orderBy: { transDate: 'desc' },
    take: 200,
  });

  let found = 0;
  for (const gl of appGLs) {
    const voucherNum = String(gl.ref || '').replace(/^APP\s*/, '').trim();
    if (!voucherNum || !/^\d+$/.test(voucherNum)) continue;

    const fact = await prisma.aPTransactionFact.findFirst({
      where: { companyId: cid, voucher: voucherNum },
    });
    if (!fact) continue;

    const vchRaw = await prisma.$queryRawUnsafe(`
      SELECT payload FROM "InforRawRecord"
      WHERE "companyId" = $1 AND "miProgram" IN ('SLVchHdrs', 'SLVCHHDRS')
        AND payload->>'Voucher' = $2
      LIMIT 1
    `, cid, voucherNum);
    const vch = (vchRaw as any[])[0]?.payload;

    console.log(`=== Voucher ${voucherNum} — ${fact.vendorName} ===\n`);
    console.log(`SLVCHHDRS (Voucher source):`);
    if (vch) {
      console.log(`  Voucher:    "${vch.Voucher}"`);
      console.log(`  Type:       "${vch.Type}"`);
      console.log(`  InvAmt:     "${vch.InvAmt}"`);
      console.log(`  DistDate:   "${vch.DistDate}"`);
      console.log(`  InvDate:    "${vch.InvDate}"`);
      console.log(`  RecordDate: "${vch.RecordDate}"`);
    } else {
      console.log(`  (not in raw records)`);
    }

    console.log(`\nAPTransactionFact (stored):`);
    console.log(`  voucher:          "${fact.voucher}"`);
    console.log(`  eventDate:        "${fact.eventDate.toISOString().slice(0,10)}"`);
    console.log(`  distDate:         "${fact.distDate?.toISOString().slice(0,10)}"`);
    console.log(`  normalizedAmount: ${fact.normalizedAmount}`);

    console.log(`\nAPP (Payment) GL Record:`);
    console.log(`  ref:              "${gl.ref}"`);
    console.log(`  transDate:        "${gl.transDate.toISOString().slice(0,10)}"`);
    console.log(`  signedAmount:     ${gl.signedAmount}`);
    
    const distDateStr = vch?.DistDate?.slice(0,8) || '';
    const transDateStr = gl.transDate.toISOString().slice(0,10).replace(/-/g,'');
    console.log(`\n  DistDate vs TransDate: ${distDateStr} vs ${transDateStr} ${distDateStr === transDateStr ? '✅ SAME' : '❌ DIFFERENT'}`);
    console.log();

    found++;
    if (found >= 5) break;
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
