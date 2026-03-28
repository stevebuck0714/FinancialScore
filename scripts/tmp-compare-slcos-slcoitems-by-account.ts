import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function str(v: unknown): string {
  return String(v ?? '').trim();
}

type SlcosRow = {
  accountId: string;
  orderId: string;
  orderDate: string;
  capturedAt: Date;
};

async function main() {
  const companyId = 'cmmnwyofv000fqhp4z8lebbny';

  const logs = await prisma.apiSyncLog.findMany({
    where: {
      companyId,
      syncType: 'operational_sales_CSI_LOAD',
      status: 'success',
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { createdAt: true, errorDetails: true },
  });

  const slcosRows: SlcosRow[] = [];
  const slcosSeen = new Set<string>();

  for (const log of logs) {
    const details = log.errorDetails as any;
    if (!details || str(details.miProgram).toUpperCase() !== 'SLCOS') continue;
    const items = Array.isArray(details?.response?.Items) ? details.response.Items : [];
    for (const item of items) {
      const accountId = str(item?.CustNum || item?.custNum || item?.CustNo || item?.CoCustNum);
      const orderId = str(item?.CoNum || item?.coNum || item?.OrderNum);
      const orderDate = str(item?.OrderDate || item?.orderDate);
      if (!accountId || !orderId || !orderDate) continue;
      const key = `${accountId}|${orderId}|${orderDate}`;
      if (slcosSeen.has(key)) continue;
      slcosSeen.add(key);
      slcosRows.push({
        accountId,
        orderId,
        orderDate,
        capturedAt: log.createdAt,
      });
    }
  }

  const accountIds: string[] = [];
  const accountSeen = new Set<string>();
  for (const row of slcosRows) {
    if (accountSeen.has(row.accountId)) continue;
    accountSeen.add(row.accountId);
    accountIds.push(row.accountId);
    if (accountIds.length >= 20) break;
  }

  const slcoitemsRows = await prisma.$queryRawUnsafe<
    Array<{
      account_id: string;
      order_id: string;
      order_date: Date | null;
      snapshot_date: Date;
    }>
  >(
    `
    SELECT
      "customerId" AS account_id,
      "orderId" AS order_id,
      "orderDate" AS order_date,
      "snapshotDate" AS snapshot_date
    FROM "CustomerOrderLineSnapshot"
    WHERE "companyId" = $1
      AND "frequency" = 'daily'
      AND "customerId" = ANY($2)
    ORDER BY "snapshotDate" DESC, "orderId" ASC
    `,
    companyId,
    accountIds
  );

  const output = accountIds.map((accountId) => {
    const slcos = slcosRows
      .filter((r) => r.accountId === accountId)
      .slice(0, 20)
      .map((r) => ({
        orderId: r.orderId,
        orderDate: r.orderDate,
        capturedAt: r.capturedAt,
      }));

    const slcoitems = slcoitemsRows
      .filter((r) => str(r.account_id) === accountId)
      .slice(0, 20)
      .map((r) => ({
        orderId: str(r.order_id),
        orderDate: r.order_date,
        snapshotDate: r.snapshot_date,
      }));

    return { accountId, slcos, slcoitems };
  });

  console.log(JSON.stringify({ accountsCompared: accountIds.length, accounts: output }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

