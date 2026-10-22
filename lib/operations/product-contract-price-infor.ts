import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { loadCustomerGroups, resolveCustomerGroup } from '@/lib/operations/customer-groups';
import { ensureProductRevenueTables } from '@/lib/operations/product-revenue-actual-db';
import { priceKey } from '@/lib/operations/product-revenue-actual';
import { estYear } from '@/lib/time/eastern';

const ORDER_LOOKBACK_MONTHS = 24;

type LatestOrderPriceRow = {
  customerId: string | null;
  customerName: string | null;
  itemSku: string;
  unitPrice: number;
  orderDate: Date | null;
  snapshotDate: Date;
};

type ExistingPriceRow = {
  customerGroup: string;
  itemSku: string;
  contractPrice: number | null;
  contractPriceSource: string | null;
};

function orderTime(row: LatestOrderPriceRow): number {
  return (row.orderDate || row.snapshotDate).getTime();
}

/**
 * Current contract price per customer group + item is the price on the most
 * recent Infor customer order line across the group. SGP price is never touched.
 */
export async function refreshContractPricesFromInfor(
  companyId: string,
  now: Date = new Date()
): Promise<{ year: number; written: number }> {
  await ensureProductRevenueTables();
  const year = estYear(now);
  const since = new Date(now);
  since.setMonth(since.getMonth() - ORDER_LOOKBACK_MONTHS);

  const [orderRows, existingRows, groups] = await Promise.all([
    prisma.$queryRaw<LatestOrderPriceRow[]>(Prisma.sql`
      SELECT DISTINCT ON (
        COALESCE(NULLIF(TRIM("customerId"), ''), TRIM("customerName")),
        UPPER(TRIM(COALESCE(NULLIF(TRIM("sku"), ''), "itemId")))
      )
        "customerId",
        "customerName",
        TRIM(COALESCE(NULLIF(TRIM("sku"), ''), "itemId")) AS "itemSku",
        "unitPrice",
        "orderDate",
        "snapshotDate"
      FROM "CustomerOrderLineSnapshot"
      WHERE "companyId" = ${companyId}
        AND "unitPrice" > 0
        AND COALESCE(NULLIF(TRIM("sku"), ''), NULLIF(TRIM("itemId"), '')) IS NOT NULL
        AND COALESCE("orderDate", "snapshotDate") >= ${since}
      ORDER BY
        COALESCE(NULLIF(TRIM("customerId"), ''), TRIM("customerName")),
        UPPER(TRIM(COALESCE(NULLIF(TRIM("sku"), ''), "itemId"))),
        "orderDate" DESC NULLS LAST,
        "snapshotDate" DESC,
        "orderId" DESC,
        "lineId" DESC
    `),
    prisma.$queryRaw<ExistingPriceRow[]>(Prisma.sql`
      SELECT "customerGroup", "itemSku", "contractPrice", "contractPriceSource"
      FROM "ProductRevenuePrice"
      WHERE "companyId" = ${companyId}
        AND "year" = ${year}
    `),
    loadCustomerGroups(companyId),
  ]);

  const latestByKey = new Map<string, { customerGroup: string; row: LatestOrderPriceRow }>();
  for (const row of orderRows) {
    const customerGroup = resolveCustomerGroup(groups, row.customerId, row.customerName);
    const key = priceKey(customerGroup, row.itemSku);
    const prior = latestByKey.get(key);
    if (!prior || orderTime(row) > orderTime(prior.row)) latestByKey.set(key, { customerGroup, row });
  }

  const existingByKey = new Map(existingRows.map((row) => [priceKey(row.customerGroup, row.itemSku), row]));
  const writes: Array<{ customerGroup: string; itemSku: string; price: number; asOf: Date }> = [];
  for (const [key, { customerGroup, row }] of latestByKey) {
    const existing = existingByKey.get(key);
    const price = Number(row.unitPrice);
    if (
      existing &&
      existing.contractPriceSource === 'INFOR' &&
      existing.contractPrice != null &&
      Number(existing.contractPrice) === price
    ) {
      continue;
    }
    // Reuse the stored group/item text so the unique key matches the existing row.
    writes.push({
      customerGroup: existing?.customerGroup ?? customerGroup,
      itemSku: existing?.itemSku ?? row.itemSku,
      price,
      asOf: row.orderDate || row.snapshotDate,
    });
  }

  for (let offset = 0; offset < writes.length; offset += 200) {
    const chunk = writes.slice(offset, offset + 200);
    const values = chunk.map(
      (write) => Prisma.sql`(
        ${randomUUID()}, ${companyId}, ${year}, ${write.customerGroup}, ${write.itemSku},
        ${write.price}, 'INFOR', ${write.asOf}, NOW(), NOW()
      )`
    );
    await prisma.$executeRaw`
      INSERT INTO "ProductRevenuePrice" (
        "id", "companyId", "year", "customerGroup", "itemSku",
        "contractPrice", "contractPriceSource", "contractPriceAsOf", "createdAt", "updatedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("companyId", "year", "customerGroup", "itemSku") DO UPDATE SET
        "contractPrice" = EXCLUDED."contractPrice",
        "contractPriceSource" = 'INFOR',
        "contractPriceAsOf" = EXCLUDED."contractPriceAsOf",
        "updatedAt" = NOW()
    `;
  }

  return { year, written: writes.length };
}
