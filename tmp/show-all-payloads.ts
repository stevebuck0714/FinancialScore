import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';

  // 1. APP payment GL record
  const appRaws = await prisma.inforRawRecord.findMany({
    where: { companyId: cid, miProgram: { in: ['SLGLTRANS', 'SLGlTrans'] } },
    select: { payload: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const app = appRaws.find(r => String((r.payload as any).Ref || '').startsWith('APP') && (r.payload as any).Acct === '30100');
  console.log('=== APP (Payment) GL Record — SLGLTRANS ===');
  console.log(JSON.stringify(app?.payload, null, 2));

  // 2. APV voucher GL record
  const apv = appRaws.find(r => String((r.payload as any).Ref || '').startsWith('APV') && (r.payload as any).Acct === '30100');
  console.log('\n=== APV (Voucher) GL Record — SLGLTRANS ===');
  console.log(JSON.stringify(apv?.payload, null, 2));

  // 3. APA adjustment GL record
  const apa = appRaws.find(r => String((r.payload as any).Ref || '').startsWith('APA') && (r.payload as any).Acct === '30100');
  console.log('\n=== APA (Adjustment) GL Record — SLGLTRANS ===');
  console.log(JSON.stringify(apa?.payload, null, 2));

  // 4. SLVCHHDRS voucher record (APTransactionFact source)
  const vchRaws = await prisma.inforRawRecord.findMany({
    where: { companyId: cid, miProgram: { in: ['SLVchHdrs', 'SLVCHHDRS'] } },
    select: { payload: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log('\n=== SLVCHHDRS Voucher Record (APTransactionFact source) ===');
  console.log(JSON.stringify(vchRaws[0]?.payload, null, 2));

  // 5. APTransactionFact stored record
  const apFact = await prisma.aPTransactionFact.findFirst({
    where: { companyId: cid },
    orderBy: { eventDate: 'desc' },
  });
  console.log('\n=== APTransactionFact (stored record) ===');
  console.log(JSON.stringify(apFact, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
