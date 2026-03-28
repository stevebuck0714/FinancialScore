import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizeOrderId(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const noPadding = raw.replace(/^0+/, '');
  return noPadding || '0';
}

async function main() {
  const companyId = 'cmmnwyofv000fqhp4z8lebbny';
  const logs = await prisma.apiSyncLog.findMany({
    where: { companyId, syncType: 'operational_sales_CSI_LOAD', status: 'success' },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: { createdAt: true, errorDetails: true },
  });

  const slcoitemsLogs = logs.filter((log) => {
    const d: any = log.errorDetails || {};
    return String(d?.miProgram || '').trim().toUpperCase() === 'SLCOITEMS';
  });

  const ids = new Set<string>();
  for (const log of slcoitemsLogs) {
    const d: any = log.errorDetails || {};
    const items = Array.isArray(d?.response?.Items) ? d.response.Items : [];
    for (const it of items) {
      const id = normalizeOrderId(it?.CoNum || it?.coNum || it?.orderNo || it?.OrderNum);
      if (id) ids.add(id);
    }
  }

  const times = slcoitemsLogs.map((x) => x.createdAt.getTime()).sort((a, b) => a - b);
  const minCreatedAt = times.length ? new Date(times[0]).toISOString() : null;
  const maxCreatedAt = times.length ? new Date(times[times.length - 1]).toISOString() : null;

  console.log(
    JSON.stringify(
      {
        sampleTake: 300,
        slcoitemsLogRowsInSample: slcoitemsLogs.length,
        minCreatedAt,
        maxCreatedAt,
        distinctOrders: ids.size,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

