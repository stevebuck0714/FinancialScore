import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const vendorId = process.argv[3] || '1007401';

async function main() {
  const appPaymentFacts = await prisma.$queryRaw<
    Array<{
      paymentDate: Date;
      vendorId: string | null;
      vendorName: string;
      billNo: string | null;
      paidAmountHome: number;
      sourceProgram: string | null;
      sourceTransaction: string | null;
      createdAt: Date;
    }>
  >`
    select "paymentDate", "vendorId", "vendorName", "billNo", "paidAmountHome", "sourceProgram", "sourceTransaction", "createdAt"
    from "APPaymentFact"
    where "companyId" = ${companyId}
      and (
        "vendorId" = ${vendorId}
        or lower("vendorName") = lower((
          select "vendorName"
          from "VendorSnapshot"
          where "companyId" = ${companyId}
            and "vendorId" = ${vendorId}
          order by "snapshotDate" desc
          limit 1
        ))
      )
    order by "paymentDate" desc, "createdAt" desc
    limit 100
  `;

  const rawPaymentProgramCounts = await prisma.$queryRaw<
    Array<{
      miProgram: string | null;
      module: string | null;
      typeToken: string | null;
      cnt: bigint;
    }>
  >`
    select
      "miProgram",
      module,
      nullif(trim(coalesce(payload->>'Type', payload->>'type', '')), '') as "typeToken",
      count(*)::bigint as cnt
    from "InforRawRecord"
    where "companyId" = ${companyId}
      and (
        payload->>'VendNum' = ${vendorId}
        or payload->>'vendorId' = ${vendorId}
      )
      and upper(coalesce(module, '')) = 'AP'
    group by "miProgram", module, "typeToken"
    order by cnt desc, "miProgram" asc nulls last, "typeToken" asc nulls last
  `;

  const rawPaymentSamples = await prisma.$queryRaw<
    Array<{
      miProgram: string | null;
      module: string | null;
      businessDate: Date | null;
      createdAt: Date;
      payload: unknown;
    }>
  >`
    select "miProgram", module, "businessDate", "createdAt", payload
    from "InforRawRecord"
    where "companyId" = ${companyId}
      and (
        payload->>'VendNum' = ${vendorId}
        or payload->>'vendorId' = ${vendorId}
      )
      and upper(coalesce(module, '')) = 'AP'
      and (
        upper(coalesce("miProgram", '')) in ('SLAPPMTS', 'SLAPTRXP', 'SLAPTRXPS', 'SLAPTRXS')
        or upper(coalesce(payload->>'Type', payload->>'type', '')) in ('P', 'A')
      )
    order by "businessDate" desc nulls last, "createdAt" desc
    limit 30
  `;

  const vendorSnapshots = await prisma.$queryRaw<
    Array<{
      snapshotDate: Date;
      sourceRecordDate: Date | null;
      lastPaidDate: Date | null;
      payYtd: number | null;
      payLastYear: number | null;
      purchaseYtd: number | null;
      purchaseLastYear: number | null;
    }>
  >`
    select "snapshotDate", "sourceRecordDate", "lastPaidDate", "payYtd", "payLastYear", "purchaseYtd", "purchaseLastYear"
    from "VendorSnapshot"
    where "companyId" = ${companyId}
      and "vendorId" = ${vendorId}
    order by "snapshotDate" desc
    limit 20
  `;

  console.log(
    JSON.stringify(
      {
        companyId,
        vendorId,
        appPaymentFacts,
        rawPaymentProgramCounts: rawPaymentProgramCounts.map((row) => ({ ...row, cnt: Number(row.cnt) })),
        rawPaymentSamples,
        vendorSnapshots,
      },
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
