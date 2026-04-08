import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    select
      "syncRunId",
      upper(coalesce("miProgram", '')) as "miProgram",
      module,
      transaction,
      "businessDate",
      "createdAt",
      payload
    from "InforRawRecord"
    where "companyId" = ${companyId}
      and upper(coalesce("miProgram", '')) = 'SLAPTRXPS'
      and (
        payload::text ilike '%127650%'
        or payload::text ilike '%127705%'
        or payload::text ilike '%127854%'
        or payload::text ilike '%1007401%'
      )
    order by "createdAt" desc
    limit 60
  `;

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
