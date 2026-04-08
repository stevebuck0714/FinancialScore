import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const syncRunId = process.argv[3] || 'a10a5719-cbe1-4712-9f76-4cbea2a7b7d8';
const businessDateIso = process.argv[4] || '2026-01-15';
const vendorId = process.argv[5] || '1007401';

async function main() {
  const rows = await prisma.$queryRaw<Array<{
    miProgram: string | null;
    module: string | null;
    transaction: string | null;
    businessDate: Date | null;
    createdAt: Date;
    payload: unknown;
  }>>`
    select "miProgram", module, transaction, "businessDate", "createdAt", payload
    from "InforRawRecord"
    where "companyId" = ${companyId}
      and "syncRunId" = ${syncRunId}
      and "businessDate" = ${new Date(`${businessDateIso}T00:00:00.000Z`)}
      and (
        payload->>'VendNum' = ${vendorId}
        or payload->>'vendorId' = ${vendorId}
      )
    order by "createdAt" asc
    limit 500
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
