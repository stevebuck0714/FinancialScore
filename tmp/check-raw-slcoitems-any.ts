import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const rows = await prisma.$queryRaw<
    Array<{
      totalRows: number;
      withMiProgram: number;
      withItem: number;
      withCoNum: number;
    }>
  >`
    SELECT
      COUNT(*)::int AS "totalRows",
      COUNT(*) FILTER (WHERE UPPER(COALESCE("miProgram", '')) = 'SLCOITEMS')::int AS "withMiProgram",
      COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(payload->>'Item', payload->>'ITNO', '')), '') IS NOT NULL)::int AS "withItem",
      COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(payload->>'CoNum', payload->>'CONUM', payload->>'coNum', '')), '') IS NOT NULL)::int AS "withCoNum"
    FROM "InforRawRecord"
    WHERE "companyId" = ${companyId}
      AND platform IN ('INFOR_M3', 'INFOR_CSI')
  `;

  console.log(JSON.stringify({ companyId, ...(rows[0] || {}) }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

