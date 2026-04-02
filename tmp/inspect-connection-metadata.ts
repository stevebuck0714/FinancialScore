import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const rows = await prisma.$queryRaw<Array<{ metadata: unknown }>>`
    SELECT "connectionMetadata" AS metadata
    FROM "AccountingConnection"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
    LIMIT 1
  `;
  const metadata =
    rows[0]?.metadata && typeof rows[0].metadata === 'object' && !Array.isArray(rows[0].metadata)
      ? (rows[0].metadata as Record<string, unknown>)
      : {};
  const keys = Object.keys(metadata).sort();
  console.log(
    JSON.stringify(
      {
        companyId,
        topLevelKeys: keys,
        metadata,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
