import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const vendNum = process.argv[3] || '1007401';

async function main() {
  const rawRows = await prisma.$queryRaw<
    Array<{
      source: string;
      createdAt: Date;
      payload: unknown;
      miProgram: string | null;
      businessDate: Date | null;
    }>
  >`
    select
      'InforRawRecord' as source,
      "createdAt",
      payload,
      "miProgram",
      "businessDate"
    from "InforRawRecord"
    where "companyId" = ${companyId}
      and upper(coalesce("miProgram", '')) = 'SLVENDORS'
      and payload::text ilike ${`%${vendNum}%`}
    order by "createdAt" desc
    limit 50
  `;

  const apiRows = await prisma.$queryRaw<
    Array<{
      createdAt: Date;
      item: unknown;
    }>
  >`
    with logs as (
      select
        l."createdAt",
        l."errorDetails"->'response'->'Items' as items
      from "ApiSyncLog" l
      where l."companyId" = ${companyId}
        and l.platform = 'INFOR_M3'
        and l.status = 'success'
        and upper(coalesce(l."errorDetails"->>'miProgram','')) = 'SLVENDORS'
        and jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    )
    select
      logs."createdAt",
      x.value as item
    from logs
    cross join lateral jsonb_array_elements(logs.items) x
    where x.value::text ilike ${`%${vendNum}%`}
    order by logs."createdAt" desc
    limit 100
  `;

  console.log(
    JSON.stringify(
      {
        ok: true,
        companyId,
        vendNum,
        rawCount: rawRows.length,
        rawRows,
        apiCount: apiRows.length,
        apiRows,
      },
      null,
      2
    )
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
