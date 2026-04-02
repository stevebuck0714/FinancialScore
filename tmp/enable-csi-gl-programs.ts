import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const row = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform: 'INFOR_M3',
      },
    },
    select: { id: true, connectionMetadata: true },
  });
  if (!row) throw new Error(`No INFOR_M3 connection for ${companyId}`);
  const metadata =
    row.connectionMetadata && typeof row.connectionMetadata === 'object' && !Array.isArray(row.connectionMetadata)
      ? ({ ...(row.connectionMetadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const bySystem =
    metadata.accountingProgramsBySystem && typeof metadata.accountingProgramsBySystem === 'object' && !Array.isArray(metadata.accountingProgramsBySystem)
      ? ({ ...(metadata.accountingProgramsBySystem as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const csiPrograms = Array.isArray(bySystem.INFOR_CSI) ? [...(bySystem.INFOR_CSI as Array<Record<string, unknown>>)] : [];
  const nextPrograms = csiPrograms.map((p) => {
    const miProgram = String(p?.miProgram || '').trim().toUpperCase();
    if (miProgram === 'SLGLTRANS' || miProgram === 'SLCHARTS' || miProgram === 'GLACCTPERIODBALANCES') {
      return { ...p, enabled: true };
    }
    return p;
  });
  bySystem.INFOR_CSI = nextPrograms;
  metadata.accountingProgramsBySystem = bySystem;

  await prisma.accountingConnection.update({
    where: { id: row.id },
    data: {
      connectionMetadata: metadata as any,
    },
  });

  console.log(
    JSON.stringify(
      {
        companyId,
        updated: true,
        enabledPrograms: nextPrograms
          .filter((p) => ['SLGLTRANS', 'SLCHARTS', 'GLACCTPERIODBALANCES'].includes(String(p?.miProgram || '').trim().toUpperCase()))
          .map((p) => ({ miProgram: p.miProgram, enabled: p.enabled, endpointPath: p.endpointPath })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

