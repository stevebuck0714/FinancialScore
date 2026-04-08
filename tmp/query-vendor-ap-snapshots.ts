import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const vendorId = process.argv[3] || '1007401';

async function main() {
  const billRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    select "snapshotDate", "billNo", "billDate", "amountDueHome"
    from "APOpenBillSnapshot"
    where "companyId" = ${companyId}
      and "vendorId" = ${vendorId}
      and "snapshotDate" in (
        timestamp '2026-01-15 00:00:00',
        timestamp '2026-02-26 00:00:00',
        timestamp '2026-02-28 00:00:00'
      )
    order by "snapshotDate", "billDate", "billNo"
  `;

  const totalRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    select "snapshotDate", coalesce(sum("amountDueHome"), 0) as "totalOpenAp"
    from "APOpenBillSnapshot"
    where "companyId" = ${companyId}
      and "vendorId" = ${vendorId}
      and "snapshotDate" in (
        timestamp '2026-01-15 00:00:00',
        timestamp '2026-02-26 00:00:00',
        timestamp '2026-02-28 00:00:00'
      )
    group by 1
    order by 1
  `;

  console.log(JSON.stringify({ billRows, totalRows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
