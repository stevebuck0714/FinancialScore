import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';

  // SLVCHHDRS raw payload
  const vch = await prisma.$queryRawUnsafe(`
    SELECT payload FROM "InforRawRecord"
    WHERE "companyId" = $1 AND "miProgram" IN ('SLVchHdrs', 'SLVCHHDRS')
    ORDER BY "createdAt" DESC LIMIT 1
  `, cid);
  console.log('=== SLVCHHDRS Voucher Record ===');
  console.log(JSON.stringify((vch as any[])[0]?.payload, null, 2));

  // APTransactionFact stored record
  const apFact = await prisma.aPTransactionFact.findFirst({
    where: { companyId: cid },
    orderBy: { eventDate: 'desc' },
  });
  console.log('\n=== APTransactionFact (stored) ===');
  console.log(JSON.stringify(apFact, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
