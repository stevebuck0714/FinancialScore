import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const rows = await prisma.$queryRaw<
    Array<{ total: number; withItem: number; withCoNum: number }>
  >`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(payload->>'Item', payload->>'ITNO', '')), '') IS NOT NULL)::int AS "withItem",
      COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(payload->>'CoNum', payload->>'CONUM', payload->>'coNum', '')), '') IS NOT NULL)::int AS "withCoNum"
    FROM "InforRawRecord"
    WHERE "companyId" = ${companyId}
      AND UPPER(COALESCE("miProgram", '')) = 'SLCOITEMS'
      AND platform IN ('INFOR_M3', 'INFOR_CSI')
  `;
  console.log(JSON.stringify({ companyId, ...(rows[0] || { total: 0, withItem: 0, withCoNum: 0 }) }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

