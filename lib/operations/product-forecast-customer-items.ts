import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export type NewCustomerItem = {
  itemSku: string;
  customerPartNumber: string;
};

/**
 * Infor customer parts (SLCustomerItems) for one customer that have never been
 * ordered or invoiced, so a new part can be forecast before its first order.
 */
export async function loadNewCustomerItems(params: {
  companyId: string;
  customerId: string;
  excludeItemSkus: Iterable<string>;
}): Promise<NewCustomerItem[]> {
  const customerId = params.customerId.trim();
  if (!customerId) return [];
  const rows = await prisma
    .$queryRaw<Array<{ itemSku: string; customerPartNumber: string | null }>>(Prisma.sql`
      SELECT DISTINCT ON (UPPER(TRIM(r."payload"->>'Item')))
        TRIM(r."payload"->>'Item') AS "itemSku",
        NULLIF(TRIM(r."payload"->>'CustItem'), '') AS "customerPartNumber"
      FROM "InforRawRecord" r
      WHERE r."companyId" = ${params.companyId}
        AND r."platform" IN ('INFOR_M3', 'INFOR_CSI')
        AND r."miProgram" IN ('SLCustomerItems', 'SLCUSTOMERITEMS')
        AND regexp_replace(TRIM(r."payload"->>'CustNum'), '^0+(?=\\d)', '') = regexp_replace(${customerId}, '^0+(?=\\d)', '')
        AND NULLIF(TRIM(r."payload"->>'Item'), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "CustomerOrderLineSnapshot" o
          WHERE o."companyId" = ${params.companyId}
            AND o."customerId" = ${customerId}
            AND UPPER(TRIM(COALESCE(NULLIF(TRIM(o."sku"), ''), o."itemId"))) = UPPER(TRIM(r."payload"->>'Item'))
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "ProductInvoiceLineFact" f
          WHERE f."companyId" = ${params.companyId}
            AND f."customerId" = ${customerId}
            AND UPPER(TRIM(f."itemSku")) = UPPER(TRIM(r."payload"->>'Item'))
        )
      ORDER BY UPPER(TRIM(r."payload"->>'Item')), r."fetchedAt" DESC
    `)
    .catch((error) => {
      console.warn('Infor customer items unavailable for forecast', error);
      return [];
    });

  const exclude = new Set(Array.from(params.excludeItemSkus, (sku) => sku.trim().toUpperCase()));
  return rows
    .filter((row) => row.itemSku && !exclude.has(row.itemSku.trim().toUpperCase()))
    .map((row) => ({ itemSku: row.itemSku.trim(), customerPartNumber: row.customerPartNumber || '' }));
}
