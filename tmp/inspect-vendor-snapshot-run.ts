import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const runId = process.argv[2] || '06579346-9a94-41eb-9cf4-c148f60068f3';
const companyId = process.argv[3] || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const [vendorSnapshotCount, recentSnapshots, rawProgramCounts, rawSamples, run] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`
      select count(*)::bigint as count
      from "VendorSnapshot"
      where "companyId" = ${companyId}
    `,
    prisma.$queryRaw<
      Array<{
        snapshotDate: Date;
        vendorId: string;
        vendorName: string;
        sourceRecordDate: Date | null;
        lastPaidDate: Date | null;
        payYtd: number | null;
      }>
    >`
      select "snapshotDate", "vendorId", "vendorName", "sourceRecordDate", "lastPaidDate", "payYtd"
      from "VendorSnapshot"
      where "companyId" = ${companyId}
      order by "snapshotDate" desc, "vendorId" asc
      limit 5
    `,
    prisma.$queryRaw<
      Array<{
        miProgram: string | null;
        module: string | null;
        cnt: bigint;
      }>
    >`
      select "miProgram", module, count(*)::bigint as cnt
      from "InforRawRecord"
      where "companyId" = ${companyId}
        and "syncRunId" = ${runId}
      group by "miProgram", module
      order by cnt desc, "miProgram" asc nulls last
    `,
    prisma.$queryRaw<
      Array<{
        id: string;
        miProgram: string | null;
        module: string | null;
        businessDate: Date | null;
        createdAt: Date;
        payload: unknown;
      }>
    >`
      select id, "miProgram", module, "businessDate", "createdAt", payload
      from "InforRawRecord"
      where "companyId" = ${companyId}
        and "syncRunId" = ${runId}
        and upper(coalesce("miProgram", '')) = 'SLVENDORS'
      order by "createdAt" desc
      limit 3
    `,
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      select *
      from "InforSyncRun"
      where id = ${runId}
      limit 1
    `,
  ]);

  console.log(
    JSON.stringify(
      {
        runId,
        companyId,
        vendorSnapshotCount: Number(vendorSnapshotCount[0]?.count || 0),
        recentSnapshots,
        rawProgramCounts: rawProgramCounts.map((row) => ({
          ...row,
          cnt: Number(row.cnt),
        })),
        rawSamples,
        run: run[0] || null,
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
