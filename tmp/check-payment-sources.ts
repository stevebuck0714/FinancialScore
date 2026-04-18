import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmnwyofv000fqhp4z8lebbny';
  
  // Check SLAPPMTS raw record count + date range
  const paymentPrograms = await prisma.$queryRawUnsafe(`
    SELECT "miProgram", COUNT(*)::int as cnt,
           MIN("businessDate")::date as earliest,
           MAX("businessDate")::date as latest
    FROM "InforRawRecord"
    WHERE "companyId" = $1 AND "miProgram" IN ('SLAPPMTS', 'SLApPmts', 'SLAPTRXP', 'SLApTrxP')
    GROUP BY "miProgram"
  `, cid);
  console.log('=== Payment Program Raw Records ===');
  console.table(paymentPrograms);

  // Sample a payment record payload
  const sample = await prisma.inforRawRecord.findFirst({
    where: { companyId: cid, miProgram: { in: ['SLAPPMTS', 'SLApPmts'] } },
    select: { payload: true },
    orderBy: { createdAt: 'desc' },
  });
  if (sample) {
    console.log('\n=== Sample SLAPPMTS Payload ===');
    console.log(JSON.stringify(sample.payload, null, 2));
  }

  // Also check what's in AP module generally  
  const apPrograms = await prisma.$queryRawUnsafe(`
    SELECT "miProgram", COUNT(*)::int as cnt
    FROM "InforRawRecord"
    WHERE "companyId" = $1 AND "module" = 'ap'
    GROUP BY "miProgram" ORDER BY cnt DESC
  `, cid);
  console.log('\n=== All AP Module Programs ===');
  console.table(apPrograms);
}
main().catch(console.error).finally(() => prisma.$disconnect());
