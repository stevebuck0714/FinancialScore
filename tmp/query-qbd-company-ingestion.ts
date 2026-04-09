import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = (process.argv[2] || '').trim();

if (!companyId) {
  console.error('Usage: npx tsx tmp/query-qbd-company-ingestion.ts <companyId>');
  process.exit(1);
}

async function main() {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      accountingSystem: true,
      createdAt: true,
    },
  });

  if (!company) {
    console.log(JSON.stringify({ found: false, companyId }, null, 2));
    return;
  }

  const [arAgingCount, apAgingCount, arOpenCount, apOpenCount, quickbooksLogs] = await Promise.all([
    prisma.aRAgingSnapshot.count({ where: { companyId } }),
    prisma.aPAgingSnapshot.count({ where: { companyId } }),
    prisma.aROpenInvoiceSnapshot.count({ where: { companyId } }),
    prisma.aPOpenBillSnapshot.count({ where: { companyId } }),
    prisma.apiSyncLog.findMany({
      where: { companyId, platform: 'QUICKBOOKS' },
      orderBy: { syncStartTime: 'desc' },
      take: 20,
      select: {
        syncType: true,
        status: true,
        recordsImported: true,
        errorCount: true,
        syncStartTime: true,
        errorDetails: true,
      },
    }),
  ]);

  const latestRows = await prisma.$queryRaw<
    Array<{
      latestARAging: Date | null;
      latestAPAging: Date | null;
      latestAROpen: Date | null;
      latestAPOpen: Date | null;
    }>
  >`
    select
      (select max("snapshotDate") from "ARAgingSnapshot" where "companyId" = ${companyId}) as "latestARAging",
      (select max("snapshotDate") from "APAgingSnapshot" where "companyId" = ${companyId}) as "latestAPAging",
      (select max("snapshotDate") from "AROpenInvoiceSnapshot" where "companyId" = ${companyId}) as "latestAROpen",
      (select max("snapshotDate") from "APOpenBillSnapshot" where "companyId" = ${companyId}) as "latestAPOpen"
  `;

  const latest = latestRows[0] || {
    latestARAging: null,
    latestAPAging: null,
    latestAROpen: null,
    latestAPOpen: null,
  };

  const toIso = (value: Date | null) => (value ? value.toISOString() : null);

  console.log(
    JSON.stringify(
      {
        found: true,
        company,
        counts: {
          arAging: arAgingCount,
          apAging: apAgingCount,
          arOpenInvoices: arOpenCount,
          apOpenBills: apOpenCount,
        },
        latestSnapshotDates: {
          arAging: toIso(latest.latestARAging),
          apAging: toIso(latest.latestAPAging),
          arOpenInvoices: toIso(latest.latestAROpen),
          apOpenBills: toIso(latest.latestAPOpen),
        },
        latestQuickBooksSyncLogs: quickbooksLogs,
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
