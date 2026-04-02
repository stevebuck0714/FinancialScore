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
  const bySystem =
    metadata.accountingProgramsBySystem && typeof metadata.accountingProgramsBySystem === 'object'
      ? (metadata.accountingProgramsBySystem as Record<string, unknown>)
      : {};
  const csi = Array.isArray(bySystem.INFOR_CSI) ? bySystem.INFOR_CSI : [];
  const gl = csi
    .filter((p: any) => String(p?.module || '').trim().toUpperCase() === 'GL')
    .map((p: any) => ({
      miProgram: p?.miProgram,
      endpointPath: p?.endpointPath,
      enabled: p?.enabled,
      recordCap: p?.recordCap,
    }));
  console.log(JSON.stringify({ csiGlPrograms: gl }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

