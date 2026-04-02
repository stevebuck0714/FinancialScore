import prisma from '../lib/prisma';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';

function norm(value: unknown): string {
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
    select: { connectionMetadata: true },
  });
  const metadata = (connection?.connectionMetadata || {}) as any;
  const bySystem = metadata.accountingProgramsBySystem || {};
  const rows = Object.entries(bySystem).flatMap(([system, arr]) =>
    (Array.isArray(arr) ? arr : []).map((row: any, idx: number) => ({
      system,
      idx,
      module: row?.module || null,
      miProgram: row?.miProgram || null,
      enabled: row?.enabled !== false,
      endpointPath: row?.endpointPath || null,
      mongooseConfig: row?.mongooseConfig || null,
      site: row?.site || null,
      transactions: Array.isArray(row?.transactions) ? row.transactions : [],
    }))
  );

  const aptrxRows = rows.filter((row) => {
    const mi = norm(row.miProgram);
    const ep = norm(row.endpointPath);
    return mi.includes('APTRX') || ep.includes('/SLAPTRX');
  });

  console.log(JSON.stringify({ count: aptrxRows.length, aptrxRows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
