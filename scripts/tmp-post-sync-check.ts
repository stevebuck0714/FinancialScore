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

  const salesLogs = await prisma.apiSyncLog.findMany({
    where: {
      companyId,
      syncType: 'operational_sales_CSI_LOAD',
      status: 'success',
    },
    orderBy: { createdAt: 'desc' },
    take: 400,
    select: { createdAt: true, errorDetails: true, recordsImported: true },
  });

  const slcos = new Set<string>();
  const slcoitems = new Set<string>();
  const shape: Array<Record<string, unknown>> = [];

  for (const log of salesLogs) {
    const details = (log.errorDetails || {}) as any;
    const miProgram = String(details?.miProgram || '').trim().toUpperCase();
    if (miProgram !== 'SLCOS' && miProgram !== 'SLCOITEMS') continue;
    const items = Array.isArray(details?.response?.Items) ? details.response.Items : [];
    shape.push({
      createdAt: log.createdAt,
      miProgram,
      endpointPath: details?.endpointPath || null,
      pagesFetched: details?.pagesFetched ?? null,
      paginationTruncated: details?.paginationTruncated ?? null,
      sourceRecordCount: details?.sourceRecordCount ?? null,
      postWindowRecordCount: details?.postWindowRecordCount ?? null,
      recordsImported: log.recordsImported,
    });
    for (const item of items) {
      const orderId = normalizeOrderId(item?.CoNum || item?.coNum || item?.orderNo || item?.OrderNum);
      if (!orderId) continue;
      if (miProgram === 'SLCOS') slcos.add(orderId);
      if (miProgram === 'SLCOITEMS') slcoitems.add(orderId);
    }
  }

  const overlap = Array.from(slcos).filter((id) => slcoitems.has(id)).sort();

  const coverage = await prisma.$queryRawUnsafe<
    Array<{ total: bigint; with_order_date: bigint; without_order_date: bigint; max_order_date: Date | null }>
  >(
    `
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE "orderDate" IS NOT NULL)::bigint AS with_order_date,
        COUNT(*) FILTER (WHERE "orderDate" IS NULL)::bigint AS without_order_date,
        MAX("orderDate") AS max_order_date
      FROM "CustomerOrderLineSnapshot"
      WHERE "companyId" = $1
        AND "frequency" = 'daily'
    `,
    companyId
  );

  const joinedRows = await prisma.$queryRawUnsafe<
    Array<{
      order_id: string;
      line_id: string;
      customer_id: string | null;
      customer_name: string;
      order_date: Date | null;
      snapshot_date: Date;
      contract_value: number;
    }>
  >(
    `
      SELECT
        "orderId" AS order_id,
        "lineId" AS line_id,
        "customerId" AS customer_id,
        "customerName" AS customer_name,
        "orderDate" AS order_date,
        "snapshotDate" AS snapshot_date,
        "contractValue" AS contract_value
      FROM "CustomerOrderLineSnapshot"
      WHERE "companyId" = $1
        AND "frequency" = 'daily'
        AND "orderDate" IS NOT NULL
      ORDER BY "snapshotDate" DESC, "orderDate" DESC, "orderId", "lineId"
      LIMIT 20
    `,
    companyId
  );

  const latestOperational = await prisma.apiSyncLog.findMany({
    where: {
      companyId,
      syncType: { startsWith: 'operational_' },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      createdAt: true,
      syncType: true,
      status: true,
      errorCount: true,
      recordsImported: true,
      errorDetails: true,
    },
  });

  const c = coverage[0];
  const toNum = (v: unknown) => (typeof v === 'bigint' ? Number(v) : Number(v || 0));

  console.log(
    JSON.stringify(
      {
        overlap: {
          slcosDistinctOrders: slcos.size,
          slcoitemsDistinctOrders: slcoitems.size,
          overlapCount: overlap.length,
          overlapSample20: overlap.slice(0, 20),
        },
        orderDateCoverage: {
          totalRows: toNum(c?.total),
          withOrderDate: toNum(c?.with_order_date),
          withoutOrderDate: toNum(c?.without_order_date),
          maxOrderDate: c?.max_order_date || null,
        },
        joinedRows,
        latestOperational: latestOperational.map((row) => ({
          createdAt: row.createdAt,
          syncType: row.syncType,
          status: row.status,
          errorCount: row.errorCount,
          recordsImported: row.recordsImported,
          miProgram: (row.errorDetails as any)?.miProgram || null,
          endpointPath: (row.errorDetails as any)?.endpointPath || null,
        })),
        requestShape: shape.slice(0, 20),
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

