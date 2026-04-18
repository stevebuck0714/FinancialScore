import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';
  
  const sample = await prisma.inforRawRecord.findFirst({
    where: { companyId: cid, miProgram: { in: ['SLGLTRANS', 'SLGlTrans', 'SlGlTrans'] } },
    select: { payload: true },
    orderBy: { createdAt: 'desc' },
  });
  if (sample) {
    const p = sample.payload as any;
    console.log('Keys:', Object.keys(p).sort().join(', '));
    console.log('\nDate fields:');
    for (const k of Object.keys(p)) {
      if (/date|dt$/i.test(k)) console.log(`  ${k}: ${p[k]}`);
    }
  } else {
    console.log('No SLGLTRANS raw records found');
  }
  
  // Check an APP-specific record
  const appSample = await prisma.inforRawRecord.findFirst({
    where: {
      companyId: cid,
      miProgram: { in: ['SLGLTRANS', 'SLGlTrans', 'SlGlTrans'] },
    },
    select: { payload: true },
    orderBy: { createdAt: 'desc' },
  });
  if (appSample) {
    const p = appSample.payload as any;
    const ref = p.Ref || p.ref || '';
    console.log(`\nRef: ${ref}`);
    console.log(`TransDate: ${p.TransDate}`);
    console.log(`DistDate: ${p.DistDate}`);
    console.log(`RecordDate: ${p.RecordDate}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
