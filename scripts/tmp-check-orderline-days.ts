import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const companyId = 'cmmnwyofv000fqhp4z8lebbny';
  const q = `
    SELECT
      date_trunc('day', "snapshotDate") AS day,
      COUNT(*)::int AS cnt,
      SUM(COALESCE("contractValue", 0))::double precision AS contract_total
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = $1
      AND "frequency" = 'daily'
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  const rows = await (prisma as any).$queryRawUnsafe(q, companyId);
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
