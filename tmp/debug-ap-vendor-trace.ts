import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const vendorId = process.argv[3] || '1007401';

async function main() {
  const rawSummary = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    select
      "businessDate",
      count(*)::int as row_count,
      min(payload->>'Voucher') as min_voucher,
      max(payload->>'Voucher') as max_voucher,
      min(payload->>'InvDate') as min_invdate,
      max(payload->>'InvDate') as max_invdate,
      min(payload->>'DistDate') as min_distdate,
      max(payload->>'DistDate') as max_distdate,
      min(payload->>'RecordDate') as min_recorddate,
      max(payload->>'RecordDate') as max_recorddate
    from "InforRawRecord"
    where "companyId" = ${companyId}
      and upper(coalesce("miProgram", '')) = 'SLVCHHDRS'
      and payload->>'VendNum' = ${vendorId}
    group by 1
    order by 1 desc
    limit 20
  `;

  const recentRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    select
      "syncRunId",
      "businessDate",
      payload->>'Voucher' as voucher,
      payload->>'InvNum' as invnum,
      payload->>'InvDate' as invdate,
      payload->>'DistDate' as distdate,
      payload->>'RecordDate' as recorddate,
      payload->>'InvAmt' as invamt
    from "InforRawRecord"
    where "companyId" = ${companyId}
      and upper(coalesce("miProgram", '')) = 'SLVCHHDRS'
      and payload->>'VendNum' = ${vendorId}
    order by "businessDate" desc, "createdAt" desc
    limit 120
  `;

  console.log(JSON.stringify({ rawSummary, recentRows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
