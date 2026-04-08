import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const targets = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    select
      "syncRunId",
      "businessDate",
      payload->>'Voucher' as voucher,
      payload->>'InvNum' as invnum,
      payload->>'VendNum' as vendnum,
      payload->>'InvDate' as invdate,
      payload->>'DistDate' as distdate,
      payload->>'RecordDate' as recorddate,
      payload->>'InvAmt' as invamt
    from "InforRawRecord"
    where "companyId" = ${companyId}
      and upper(coalesce("miProgram", '')) = 'SLVCHHDRS'
      and (
        payload->>'Voucher' in ('403292', '403317', '403390')
        or payload->>'InvNum' in ('127650', '127705', '127854', 'IN127650', 'IN127705', 'IN127854')
      )
    order by "createdAt" desc
    limit 100
  `;

  const bestRuns = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    select
      "syncRunId",
      count(*)::int as total,
      count(*) filter (
        where coalesce(payload->>'InvDate', payload->>'DistDate', payload->>'date') >= '20230101 00:00:00.000'
      )::int as ge2023
    from "InforRawRecord"
    where "companyId" = ${companyId}
      and upper(coalesce("miProgram", '')) = 'SLVCHHDRS'
    group by 1
    order by ge2023 desc, total desc
    limit 20
  `;

  console.log(JSON.stringify({ targets, bestRuns }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
