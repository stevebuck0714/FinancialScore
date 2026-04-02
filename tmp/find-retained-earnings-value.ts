import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const target = Number(process.argv[3] || '2549669.61');
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      "monthDate",
      "retainedEarnings",
      "totalEquity",
      "financialRecordId"
    FROM "MonthlyFinancial"
    WHERE "companyId" = ${companyId}
      AND ABS("retainedEarnings" - ${target}) < 0.5
    ORDER BY "monthDate" DESC
    LIMIT 20
  `;
  const top = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      "monthDate",
      "retainedEarnings",
      "totalEquity",
      "financialRecordId"
    FROM "MonthlyFinancial"
    WHERE "companyId" = ${companyId}
    ORDER BY ABS("retainedEarnings") DESC
    LIMIT 10
  `;
  console.log(JSON.stringify({ companyId, target, exactish: rows, topByMagnitude: top }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
