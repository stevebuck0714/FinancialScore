import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = 'cmmnwyofv000fqhp4z8lebbny';

const partialDates = [
  '2026-03-31',
  '2026-04-01',
  '2026-04-02',
];

async function main() {
  for (const dateStr of partialDates) {
    const snapshotDate = new Date(`${dateStr}T00:00:00.000Z`);
    const result = await prisma.customerOrderLineSnapshot.deleteMany({
      where: { companyId, snapshotDate },
    });
    console.log(`Deleted ${result.count} partial rows for ${dateStr}`);
  }
  console.log('Done — partial snapshots cleaned up.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
