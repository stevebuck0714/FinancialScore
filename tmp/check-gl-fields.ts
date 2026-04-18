import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';
  
  // Check a sample APP raw record payload to see all available fields
  const sample = await prisma.inforRawRecord.findFirst({
    where: { companyId: cid, miProgram: { in: ['SLGLTRANS', 'SLGlTrans', 'SlGlTrans'] } },
    select: { payload: true },
    orderBy: { createdAt: 'desc' },
  });
  if (sample) {
    console.log('=== Sample SLGLTRANS payload keys ===');
    console.log(Object.keys(sample.payload as any).sort().join('\n'));
  } else {
    console.log('No SLGLTRANS raw records found');
  }

  // Check GLTransactionFact columns
  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'GLTransactionFact' ORDER BY ordinal_position
  `);
  console.log('\n=== GLTransactionFact columns ===');
  console.log((cols as any[]).map(c => c.column_name).join('\n'));
}
main().catch(console.error).finally(() => prisma.$disconnect());
