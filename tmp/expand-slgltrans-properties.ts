import prisma from '../lib/prisma';

const TARGET_ENDPOINT = '/APR_PRD/CSI/IDORequestService/ido/load/SLGLTRANS?properties=*&recordCap=1000';

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function updateProgramList(value: unknown): { updated: unknown; count: number } {
  if (!Array.isArray(value)) return { updated: value, count: 0 };
  let count = 0;
  const updated = value.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const rec = { ...(row as Record<string, unknown>) };
    const program = String(rec.miProgram || '').trim().toUpperCase();
    if (program === 'SLGLTRANS') {
      rec.endpointPath = TARGET_ENDPOINT;
      count += 1;
    }
    return rec;
  });
  return { updated, count };
}

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const connection = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform: 'INFOR_M3',
      },
    },
    select: { id: true, connectionMetadata: true },
  });
  if (!connection) throw new Error(`No INFOR_M3 connection for company ${companyId}`);

  const metadata = asObject(connection.connectionMetadata);
  const bySystem = asObject(metadata.accountingProgramsBySystem);
  const csi = updateProgramList(bySystem.INFOR_CSI);
  const m3 = updateProgramList(bySystem.INFOR_M3);

  const nextBySystem: Record<string, unknown> = {
    ...bySystem,
    INFOR_CSI: csi.updated,
    INFOR_M3: m3.updated,
  };
  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    accountingProgramsBySystem: nextBySystem,
  };

  await prisma.accountingConnection.update({
    where: { id: connection.id },
    data: {
      connectionMetadata: nextMetadata as any,
      updatedAt: new Date(),
    },
  });

  console.log(
    JSON.stringify(
      {
        companyId,
        updatedInCsiPrograms: csi.count,
        updatedInM3Programs: m3.count,
        targetEndpoint: TARGET_ENDPOINT,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

