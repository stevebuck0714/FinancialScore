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
      transaction: row?.transaction || null,
      endpointPath: row?.endpointPath || null,
      site: row?.site || null,
      mongooseConfig: row?.mongooseConfig || null,
    }))
  );

  const arRows = rows.filter((row) => {
    const mi = norm(row.miProgram);
    const ep = norm(row.endpointPath);
    return row.module === 'ar' || mi.includes('AR') || ep.includes('/SLAR') || ep.includes('/SLCUSTDRFTS') || ep.includes('/SLINVHDRS');
  });

  console.log(JSON.stringify({ count: arRows.length, arRows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
