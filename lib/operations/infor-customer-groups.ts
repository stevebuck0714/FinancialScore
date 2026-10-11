import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { loadedAt: number; groups: Map<string, string> }>();

function customerKey(value: unknown): string {
  const text = String(value ?? '').trim();
  return text.replace(/^0+(?=\d)/, '');
}

/**
 * Infor corporate customer name per customer number, from the latest SLCustomers
 * load. Only customers with a corporate customer set appear in the map.
 */
export async function loadInforCustomerGroups(companyId: string): Promise<Map<string, string>> {
  const cached = cache.get(companyId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.groups;

  const rows = await prisma.$queryRaw<Array<{ custNum: string; corpCust: string | null; corpName: string | null }>>(Prisma.sql`
    SELECT TRIM(payload->>'CustNum') AS "custNum",
           MAX(NULLIF(TRIM(payload->>'CorpCust'), '')) AS "corpCust",
           MAX(NULLIF(TRIM(payload->>'CorpadrName'), '')) AS "corpName"
    FROM "InforRawRecord"
    WHERE "companyId" = ${companyId}
      AND "platform" IN ('INFOR_M3', 'INFOR_CSI')
      AND "miProgram" IN ('SLCustomers', 'SLCUSTOMERS')
      AND "businessDate" = (
        SELECT MAX("businessDate")
        FROM "InforRawRecord"
        WHERE "companyId" = ${companyId}
          AND "platform" IN ('INFOR_M3', 'INFOR_CSI')
          AND "miProgram" IN ('SLCustomers', 'SLCUSTOMERS')
      )
    GROUP BY 1
    HAVING MAX(NULLIF(TRIM(payload->>'CorpCust'), '')) IS NOT NULL
  `).catch((error) => {
    console.warn('Infor customer groups unavailable', error);
    return [];
  });

  const groups = new Map<string, string>();
  for (const row of rows) {
    const name = row.corpName || row.corpCust;
    if (row.custNum && name) groups.set(customerKey(row.custNum), name);
  }
  cache.set(companyId, { loadedAt: Date.now(), groups });
  return groups;
}

/** Infor corporate customer name, else the customer's own name. */
export function resolveCustomerGroup(
  groups: Map<string, string>,
  customerId: string | null | undefined,
  customerName: string | null | undefined
): string {
  return groups.get(customerKey(customerId)) || String(customerName ?? '').trim();
}

export function withInforCustomerGroups<T extends { customerId: string; customerName: string }>(
  rows: T[],
  groups: Map<string, string>
): Array<T & { customerGroup: string }> {
  return rows.map((row) => ({ ...row, customerGroup: resolveCustomerGroup(groups, row.customerId, row.customerName) }));
}
