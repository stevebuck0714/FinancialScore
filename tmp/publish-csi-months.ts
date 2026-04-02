import prisma from '../lib/prisma';
import { publishMonthFromDailySnapshots } from '../lib/financial/publish-month-service';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const months = process.argv.slice(3);
  const targetMonths = months.length > 0 ? months : ['2026-01', '2026-02', '2026-03'];

  const results = [];
  for (const month of targetMonths) {
    const result = await publishMonthFromDailySnapshots({
      companyId,
      month,
      force: true,
      backfillMonths: 12,
    });
    results.push({ month, ...result });
  }

  console.log(JSON.stringify({ companyId, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
