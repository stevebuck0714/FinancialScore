import prisma from '../lib/prisma';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const rows = await prisma.$queryRaw<
    Array<{ createdAt: Date; status: string; miProgram: string | null; message: string | null; itemCount: number | null }>
  >`
    SELECT
      l."createdAt",
      l.status,
      l."errorDetails"->>'miProgram' AS "miProgram",
      l."errorDetails"->>'message' AS "message",
      CASE
        WHEN jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
          THEN jsonb_array_length(l."errorDetails"->'response'->'Items')
        ELSE NULL
      END::int AS "itemCount"
    FROM "ApiSyncLog" l
    WHERE l."companyId" = ${COMPANY_ID}
      AND l.platform = 'INFOR_M3'
      AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = 'SLGLTRANS'
    ORDER BY l."createdAt" DESC
    LIMIT 20
  `;

  console.log(JSON.stringify({ companyId: COMPANY_ID, rows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
