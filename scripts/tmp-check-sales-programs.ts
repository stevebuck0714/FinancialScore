import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const companyId = 'cmmnwyofv000fqhp4z8lebbny';
  const rows = await prisma.$queryRawUnsafe<Array<{ programs: any; programs_by_system: any }>>(
    `
    SELECT
      "connectionMetadata"->'accountingPrograms' AS programs,
      "connectionMetadata"->'accountingProgramsBySystem' AS programs_by_system
    FROM "AccountingConnection"
    WHERE "companyId" = $1
      AND platform = 'INFOR_M3'
    LIMIT 1
    `,
    companyId
  );

  const row = rows[0] || { programs: null, programs_by_system: null };
  const p = Array.isArray(row.programs) ? row.programs : [];
  const sales = p
    .filter((r: any) => String(r?.module || '').toLowerCase() === 'sales')
    .map((r: any) => ({
      miProgram: r?.miProgram ?? null,
      endpointPath: r?.endpointPath ?? null,
      enabled: r?.enabled ?? null,
      site: r?.site ?? null,
      mongooseConfig: r?.mongooseConfig ?? null,
    }));

  console.log(JSON.stringify({ salesPrograms: sales }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

