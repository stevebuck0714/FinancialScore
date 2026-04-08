import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const vendorId = process.argv[3] || '1007401';

async function main() {
  const positivePayments = await prisma.$queryRaw<
    Array<{
      paymentDate: Date;
      billNo: string | null;
      paidAmountHome: number;
      sourceProgram: string | null;
      duplicateCount: bigint;
    }>
  >`
    select
      "paymentDate",
      "billNo",
      "paidAmountHome",
      "sourceProgram",
      count(*)::bigint as "duplicateCount"
    from "APPaymentFact"
    where "companyId" = ${companyId}
      and "vendorId" = ${vendorId}
      and "paidAmountHome" > 0.0001
    group by "paymentDate", "billNo", "paidAmountHome", "sourceProgram"
    order by "paymentDate" desc, "billNo" asc nulls last
    limit 200
  `;

  console.log(
    JSON.stringify(
      positivePayments.map((row) => ({
        ...row,
        duplicateCount: Number(row.duplicateCount),
      })),
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
