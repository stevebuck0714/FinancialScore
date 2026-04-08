import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const syncRunId = process.argv[3] || 'a10a5719-cbe1-4712-9f76-4cbea2a7b7d8';

async function main() {
  const counts = await prisma.$queryRaw<Array<{ total: number; ge2023: number }>>`
    select
      count(*)::int as total,
      count(*) filter (
        where coalesce(payload->>'InvDate', payload->>'DistDate', payload->>'date') >= '20230101 00:00:00.000'
      )::int as ge2023
    from "InforRawRecord"
    where "companyId" = ${companyId}
      and "syncRunId" = ${syncRunId}
      and upper(coalesce("miProgram", '')) = 'SLVCHHDRS'
  `;

  const targets = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    select
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
      and "syncRunId" = ${syncRunId}
      and upper(coalesce("miProgram", '')) = 'SLVCHHDRS'
      and (
        payload->>'Voucher' in ('403292', '403317', '403390')
        or payload->>'InvNum' in ('127650', '127705', '127854', 'IN127650', 'IN127705', 'IN127854')
      )
    order by "businessDate" asc
    limit 100
  `;

  console.log(JSON.stringify({ counts: counts[0] || null, targets }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
