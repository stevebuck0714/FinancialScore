import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export type ItemSuggestion = {
  value: string;
  label: string;
};

const MAX_SUGGESTIONS = 20;

function ownerLabel(name: string | null, count: number, noun: string): string {
  if (count > 1) return `${count} ${noun}`;
  return String(name || '').trim();
}

/** APR P/Ns on the vendor forecast, starts-with matches first. */
export async function suggestVendorForecastItems(params: {
  companyId: string;
  year: number;
  query: string;
  vendorId?: string;
}): Promise<ItemSuggestion[]> {
  const query = params.query.trim().toLowerCase();
  if (!query) return [];
  const rows = await prisma.$queryRaw<Array<{ itemSku: string; vendorName: string | null; vendors: number }>>(Prisma.sql`
    SELECT TRIM("itemSku") AS "itemSku",
           MIN(NULLIF(TRIM("vendorName"), '')) AS "vendorName",
           COUNT(DISTINCT "vendorId")::int AS "vendors"
      FROM "VendorMonthlyForecastLine"
     WHERE "companyId" = ${params.companyId}
       AND "year" = ${params.year}
       AND STRPOS(LOWER("itemSku"), ${query}) > 0
       ${params.vendorId ? Prisma.sql`AND "vendorId" = ${params.vendorId}` : Prisma.empty}
     GROUP BY TRIM("itemSku")
     ORDER BY BOOL_OR(STRPOS(LOWER("itemSku"), ${query}) = 1) DESC, TRIM("itemSku") ASC
     LIMIT ${MAX_SUGGESTIONS}
  `);
  return rows.map((row) => ({ value: row.itemSku, label: ownerLabel(row.vendorName, row.vendors, 'vendors') }));
}

/** APR P/Ns on the product forecast or booked revenue, starts-with matches first. */
export async function suggestProductItems(params: { companyId: string; query: string }): Promise<ItemSuggestion[]> {
  const query = params.query.trim().toLowerCase();
  if (!query) return [];
  const rows = await prisma.$queryRaw<Array<{ itemSku: string; customerName: string | null; customers: number }>>(Prisma.sql`
    WITH items AS (
      SELECT TRIM("itemSku") AS "itemSku", "customerId", "customerName"
        FROM "ProductRevenueForecastLine"
       WHERE "companyId" = ${params.companyId} AND STRPOS(LOWER("itemSku"), ${query}) > 0
      UNION
      SELECT TRIM("itemSku") AS "itemSku", "customerId", "customerName"
        FROM "ProductRevenueLine"
       WHERE "companyId" = ${params.companyId} AND STRPOS(LOWER("itemSku"), ${query}) > 0
    )
    SELECT "itemSku",
           MIN(NULLIF(TRIM("customerName"), '')) AS "customerName",
           COUNT(DISTINCT "customerId")::int AS "customers"
      FROM items
     GROUP BY "itemSku"
     ORDER BY BOOL_OR(STRPOS(LOWER("itemSku"), ${query}) = 1) DESC, "itemSku" ASC
     LIMIT ${MAX_SUGGESTIONS}
  `);
  return rows.map((row) => ({ value: row.itemSku, label: ownerLabel(row.customerName, row.customers, 'customers') }));
}
