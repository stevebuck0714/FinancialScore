import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const byProgram = await prisma.$queryRaw<Array<{ program: string; cnt: number }>>`
    SELECT UPPER(COALESCE("errorDetails"->>'miProgram','NULL')) AS program, COUNT(*)::int AS cnt
    FROM "ApiSyncLog"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
      AND status = 'success'
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20
  `;
  const withItems = await prisma.$queryRaw<Array<{ program: string; cnt: number }>>`
    SELECT UPPER(COALESCE("errorDetails"->>'miProgram','NULL')) AS program, COUNT(*)::int AS cnt
    FROM "ApiSyncLog"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
      AND status = 'success'
      AND jsonb_typeof("errorDetails"->'response'->'Items') = 'array'
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20
  `;
  console.log(JSON.stringify({ companyId, byProgram, withItems }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

