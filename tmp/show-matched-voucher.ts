import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';

  // Find an APP GL record on 30100
  const glRaws = await prisma.inforRawRecord.findMany({
    where: { companyId: cid, miProgram: { in: ['SLGLTRANS', 'SLGlTrans'] } },
    select: { payload: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  
  const appRecord = glRaws.find(r => {
    const p = r.payload as any;
    return String(p.Ref || '').startsWith('APP') && p.Acct === '30100';
  });
  if (!appRecord) { console.log('No APP record found'); return; }

  const appPayload = appRecord.payload as any;
  const voucherNum = String(appPayload.Ref).replace(/^APP\s*/, '').trim();
  console.log(`=== Voucher number extracted from APP ref: "${voucherNum}" ===\n`);

  // 1. APP GL record
  console.log('--- APP (Payment) GL Record ---');
  console.log(JSON.stringify(appPayload, null, 2));

  // 2. APV GL record for same voucher
  const apvRecord = glRaws.find(r => {
    const p = r.payload as any;
    const ref = String(p.Ref || '');
    const num = ref.replace(/^APV\s*/, '').trim();
    return ref.startsWith('APV') && num === voucherNum && p.Acct === '30100';
  });
  console.log('\n--- APV (Voucher GL posting) for same voucher ---');
  console.log(apvRecord ? JSON.stringify(apvRecord.payload, null, 2) : 'Not found in sample');

  // 3. SLVCHHDRS record for same voucher
  const vchRecord = await prisma.$queryRawUnsafe(`
    SELECT payload FROM "InforRawRecord"
    WHERE "companyId" = $1 AND "miProgram" IN ('SLVchHdrs', 'SLVCHHDRS')
      AND payload->>'Voucher' = $2
    LIMIT 1
  `, cid, voucherNum);
  console.log('\n--- SLVCHHDRS (Voucher header) for same voucher ---');
  console.log((vchRecord as any[])[0] ? JSON.stringify((vchRecord as any[])[0].payload, null, 2) : 'Not found');

  // 4. APTransactionFact for same voucher
  const apFact = await prisma.aPTransactionFact.findFirst({
    where: { companyId: cid, voucher: voucherNum },
  });
  console.log('\n--- APTransactionFact (stored) for same voucher ---');
  console.log(apFact ? JSON.stringify(apFact, null, 2) : 'Not found');
}
main().catch(console.error).finally(() => prisma.$disconnect());
