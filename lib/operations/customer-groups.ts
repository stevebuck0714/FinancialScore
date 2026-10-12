import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

const INFOR_CACHE_TTL_MS = 10 * 60 * 1000;
const inforCache = new Map<string, { loadedAt: number; parents: Map<string, InforParent> }>();

type InforParent = { corpCust: string; corpName: string };

function customerKey(value: unknown): string {
  const text = String(value ?? '').trim();
  return text.replace(/^0+(?=\d)/, '');
}

/** Infor corporate customer per customer number, from the latest SLCustomers load. */
async function loadInforParents(companyId: string): Promise<Map<string, InforParent>> {
  const cached = inforCache.get(companyId);
  if (cached && Date.now() - cached.loadedAt < INFOR_CACHE_TTL_MS) return cached.parents;

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

  const parents = new Map<string, InforParent>();
  for (const row of rows) {
    if (!row.custNum || !row.corpCust) continue;
    parents.set(customerKey(row.custNum), { corpCust: row.corpCust, corpName: row.corpName || row.corpCust });
  }
  inforCache.set(companyId, { loadedAt: Date.now(), parents });
  return parents;
}

/** Group saved on each customer's forecast and revenue rows; the most common one wins. */
async function loadSavedGroups(companyId: string): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<Array<{ customerId: string; customerGroup: string; rows: bigint }>>(Prisma.sql`
    SELECT "customerId", TRIM("customerGroup") AS "customerGroup", COUNT(*)::bigint AS "rows"
    FROM (
      SELECT "customerId", "customerGroup" FROM "ProductRevenueForecastLine" WHERE "companyId" = ${companyId}
      UNION ALL
      SELECT "customerId", "customerGroup" FROM "ProductRevenueLine" WHERE "companyId" = ${companyId}
    ) saved
    WHERE NULLIF(TRIM("customerGroup"), '') IS NOT NULL
    GROUP BY 1, 2
    ORDER BY 1, 3 DESC, 2
  `).catch((error) => {
    console.warn('Saved customer groups unavailable', error);
    return [];
  });

  const groups = new Map<string, string>();
  for (const row of rows) {
    const key = customerKey(row.customerId);
    if (key && !groups.has(key)) groups.set(key, row.customerGroup);
  }
  return groups;
}

/**
 * Group per customer number. A group saved in the app wins. Otherwise a customer
 * joins the saved group of another customer with the same Infor corporate
 * customer, else takes the Infor corporate customer name. Customers missing
 * from the map fall back to their own name in resolveCustomerGroup.
 */
export async function loadCustomerGroups(companyId: string): Promise<Map<string, string>> {
  const [saved, parents] = await Promise.all([loadSavedGroups(companyId), loadInforParents(companyId)]);

  const savedGroupByParent = new Map<string, string>();
  for (const [key, parent] of parents) {
    const group = saved.get(key);
    if (group && !savedGroupByParent.has(parent.corpCust)) savedGroupByParent.set(parent.corpCust, group);
  }

  const groups = new Map(saved);
  for (const [key, parent] of parents) {
    if (groups.has(key)) continue;
    groups.set(key, savedGroupByParent.get(parent.corpCust) || parent.corpName);
  }
  return groups;
}

/** Customer's group, else the customer's own name. */
export function resolveCustomerGroup(
  groups: Map<string, string>,
  customerId: string | null | undefined,
  customerName: string | null | undefined
): string {
  return groups.get(customerKey(customerId)) || String(customerName ?? '').trim();
}

export function withCustomerGroups<T extends { customerId: string; customerName: string }>(
  rows: T[],
  groups: Map<string, string>
): Array<T & { customerGroup: string }> {
  return rows.map((row) => ({ ...row, customerGroup: resolveCustomerGroup(groups, row.customerId, row.customerName) }));
}

/** Sets one group on every saved forecast and revenue row for the customer, across all years. */
export async function saveCustomerGroup(params: {
  companyId: string;
  customerId: string;
  customerGroup: string;
}): Promise<void> {
  const customerGroup = params.customerGroup.replace(/\s+/g, ' ').trim();
  if (!params.customerId || !customerGroup) return;
  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      UPDATE "ProductRevenueForecastLine"
      SET "customerGroup" = ${customerGroup}, "updatedAt" = NOW()
      WHERE "companyId" = ${params.companyId}
        AND "customerId" = ${params.customerId}
        AND "customerGroup" IS DISTINCT FROM ${customerGroup}
    `),
    prisma.$executeRaw(Prisma.sql`
      UPDATE "ProductRevenueLine"
      SET "customerGroup" = ${customerGroup}, "updatedAt" = NOW()
      WHERE "companyId" = ${params.companyId}
        AND "customerId" = ${params.customerId}
        AND "customerGroup" IS DISTINCT FROM ${customerGroup}
    `),
  ]);
}
