import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const cid = 'cmmcp278j0002kz0439rlixdj';

  // Get raw SLGLTRANS records that have APP or APA refs
  const raws = await prisma.inforRawRecord.findMany({
    where: {
      companyId: cid,
      miProgram: { in: ['SLGLTRANS', 'SLGlTrans', 'SlGlTrans'] },
    },
    select: { payload: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const appRecords = raws.filter(r => {
    const p = r.payload as any;
    const ref = String(p.Ref || p.ref || '');
    return ref.startsWith('APP') || ref.startsWith('APA');
  });

  console.log(`Found ${appRecords.length} APP/APA records out of ${raws.length} sampled\n`);

  // Show first 10 with ALL fields
  for (const r of appRecords.slice(0, 10)) {
    const p = r.payload as any;
    console.log('--- Record ---');
    console.log(`  Ref:        ${p.Ref}`);
    console.log(`  Acct:       ${p.Acct}`);
    console.log(`  DomAmount:  ${p.DomAmount}`);
    console.log(`  TransDate:  ${p.TransDate}`);
    console.log(`  DistDate:   ${p.DistDate}`);
    console.log(`  RecordDate: ${p.RecordDate}`);
    console.log(`  TransNum:   ${p.TransNum}`);
    console.log(`  Site:       ${p.Site}`);
    // Show ALL keys in case there are other date fields
    const allKeys = Object.keys(p).sort();
    const dateKeys = allKeys.filter(k => /date|dt$/i.test(k) || p[k]?.toString?.().match?.(/^\d{8}/));
    if (dateKeys.length > 0) {
      console.log(`  All date-like fields: ${dateKeys.map(k => `${k}=${p[k]}`).join(', ')}`);
    }
    console.log();
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
