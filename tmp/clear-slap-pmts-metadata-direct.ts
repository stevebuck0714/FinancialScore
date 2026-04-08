import { PrismaClient } from '@prisma/client';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';

function normalize(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function isSlapPmtsRow(row: any): boolean {
  return normalize(row?.miProgram) === 'SLAPPMTS' || normalize(row?.endpointPath).includes('/SLAPPMTS');
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      select: {
        id: true,
        connectionMetadata: true,
      },
    });

    if (!connection) {
      console.log(JSON.stringify({ ok: false, error: 'connection not found' }, null, 2));
      return;
    }

    const metadata = (connection.connectionMetadata || {}) as Record<string, any>;
    const bySystem = metadata.accountingProgramsBySystem && typeof metadata.accountingProgramsBySystem === 'object'
      ? (metadata.accountingProgramsBySystem as Record<string, unknown>)
      : {};

    const nextBySystem: Record<string, unknown[]> = {};
    let removedBySystem = 0;

    for (const [system, rowsRaw] of Object.entries(bySystem)) {
      const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
      const filtered = rows.filter((row: any) => !isSlapPmtsRow(row));
      removedBySystem += rows.length - filtered.length;
      nextBySystem[system] = filtered;
    }

    const topLevelRows = Array.isArray(metadata.accountingPrograms) ? metadata.accountingPrograms : [];
    const nextTopLevelRows = topLevelRows.filter((row: any) => !isSlapPmtsRow(row));
    const removedTopLevel = topLevelRows.length - nextTopLevelRows.length;

    const nextMetadata = {
      ...metadata,
      accountingProgramsBySystem: nextBySystem,
      accountingPrograms: nextTopLevelRows,
    };

    await prisma.accountingConnection.update({
      where: { id: connection.id },
      data: {
        connectionMetadata: nextMetadata as any,
      },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          connectionId: connection.id,
          removedBySystem,
          removedTopLevel,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
