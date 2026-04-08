import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const syncRunId = process.argv[3] || '717ad35d-ccb4-4d04-a16e-167c18c4d527';

async function main() {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    select
      "businessDate",
      module,
      "miProgram",
      transaction,
      "endpointPath",
      "pageNo",
      "bookmarkIn",
      "bookmarkOut",
      "recordCount",
      status,
      "createdAt"
    from "InforRawBatch"
    where "companyId" = ${companyId}
      and "syncRunId" = ${syncRunId}
      and upper(coalesce("miProgram", '')) = 'SLVCHHDRS'
    order by "businessDate" asc, "pageNo" asc, "createdAt" asc
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
