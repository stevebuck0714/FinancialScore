import prisma from '../lib/prisma';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const connection = await prisma.accountingConnection.findUnique({
    where: { companyId_platform: { companyId: COMPANY_ID, platform: 'INFOR_M3' } },
    select: { connectionMetadata: true },
  });
  const metadata =
    connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
      ? (connection.connectionMetadata as Record<string, unknown>)
      : {};
  const previousCount = Array.isArray(metadata.csiTrialBalanceSnapshots) ? metadata.csiTrialBalanceSnapshots.length : 0;
  await prisma.accountingConnection.updateMany({
    where: { companyId: COMPANY_ID, platform: 'INFOR_M3' },
    data: {
      connectionMetadata: {
        ...metadata,
        csiTrialBalanceSnapshots: [],
      } as any,
      lastSyncAt: new Date(),
    },
  });
  console.log(JSON.stringify({ companyId: COMPANY_ID, cleared: true, previousCount }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
