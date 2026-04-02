import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const rows = await prisma.$queryRaw<Array<{ contract: unknown }>>`
    SELECT "connectionMetadata"->'inforCsiFinancialIdoContract' AS contract
    FROM "AccountingConnection"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
    LIMIT 1
  `;
  console.log(JSON.stringify(rows[0]?.contract ?? null, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

