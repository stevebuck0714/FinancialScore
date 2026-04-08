import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const rawMatches = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    select
      "syncRunId",
      upper(coalesce("miProgram", '')) as "miProgram",
      module,
      transaction,
      "businessDate",
      payload
    from "InforRawRecord"
    where "companyId" = ${companyId}
      and (
        payload::text ilike '%127650%'
        or payload::text ilike '%127705%'
        or payload::text ilike '%127854%'
        or payload::text ilike '%403292%'
        or payload::text ilike '%403317%'
        or payload::text ilike '%403390%'
      )
    order by "createdAt" desc
    limit 100
  `;

  const appPayments = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    select
      "paymentDate",
      "vendorId",
      "vendorName",
      "billNo",
      "paidAmountHome",
      "sourceProgram",
      "sourceTransaction",
      "createdAt"
    from "APPaymentFact"
    where "companyId" = ${companyId}
      and "billNo" in ('127650', '127705', '127854')
    order by "paymentDate" asc
  `;

  console.log(JSON.stringify({ rawMatches, appPayments }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
