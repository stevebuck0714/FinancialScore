import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const month = process.argv[3] || '2026-03';
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      "snapshotDate",
      "sourceAccountName",
      "sourceAccountId",
      "targetField",
      "amount"
    FROM "DailyFinancialMappedLine"
    WHERE "companyId" = ${companyId}
      AND to_char(date_trunc('month',"snapshotDate"),'YYYY-MM') = ${month}
      AND (
        TRIM(COALESCE("sourceAccountId",'')) = '45000'
        OR LOWER(COALESCE("sourceAccountName",'')) LIKE '%retained earnings%'
        OR "targetField" = 'balance_movement:retainedEarnings'
      )
    ORDER BY "snapshotDate" DESC
    LIMIT 100
  `;
  console.log(JSON.stringify({ companyId, month, count: rows.length, rows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
