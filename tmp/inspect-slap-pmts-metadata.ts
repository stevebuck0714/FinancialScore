import prisma from '../lib/prisma';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';

function normalize(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

async function main() {
  const connection = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform: 'INFOR_M3',
      },
    },
    select: {
      id: true,
      companyId: true,
      connectionMetadata: true,
    },
  });

  if (!connection) {
    console.log(JSON.stringify({ ok: false, error: 'connection not found' }, null, 2));
    return;
  }

  const metadata = (connection.connectionMetadata || {}) as Record<string, any>;
  const bySystem = metadata.accountingProgramsBySystem || {};
  const allRows = Object.entries(bySystem).flatMap(([system, rowsRaw]) =>
    (Array.isArray(rowsRaw) ? rowsRaw : []).map((row: any) => ({
      system,
      row,
    }))
  );

  const matches = allRows
    .filter(({ row }) => normalize(row?.miProgram) === 'SLAPPMTS' || normalize(row?.endpointPath).includes('/SLAPPMTS'))
    .map(({ system, row }) => ({
      system,
      miProgram: row?.miProgram || null,
      module: row?.module || null,
      enabled: row?.enabled !== false,
      endpointPath: row?.endpointPath || null,
      properties: row?.properties || null,
      transaction: row?.transaction || null,
      transactions: row?.transactions || null,
      row,
    }));

  console.log(
    JSON.stringify(
      {
        ok: true,
        connectionId: connection.id,
        companyId: connection.companyId,
        matches,
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
