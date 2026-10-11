import prisma from '@/lib/prisma';
import { hashCacheParts, readDerivedApiCache, writeDerivedApiCache } from '@/lib/derived-api-cache';
import {
  dutyOriginCode,
  ensureCompanyItemDutyTable,
  listCompanyItemDuties,
  normalizeItemSku,
  refreshCompanyItemDuties,
  type CompanyItemDutyRow,
} from '@/lib/hts/item-duty-overlay';
import {
  inforUnitCost,
  isInactiveStatus,
  loadCooOverrides,
  loadCsiItemFacts,
  loadVendorAddresses,
} from '@/lib/operations/item-freight-overlay';
import { loadPrimaryVendorByItem } from '@/lib/operations/vendor-monthly-forecast-db';

const NAMESPACE = 'duties-tariffs';
const SOURCE_VERSION = 'duties-tariffs-warm-v4-shipment-customers';
const TTL_SECONDS = 30 * 24 * 60 * 60;

export type DutiesTariffsPayload = {
  inactiveCount: number;
  discovered: number;
  missingHtsCount: number;
  items: CompanyItemDutyRow[];
  monthlyCogs: unknown[];
  vendorOptions: Array<{ vendorId: string; vendorName: string; country: string | null }>;
};

async function loadNonUsVendors(companyId: string): Promise<DutiesTariffsPayload['vendorOptions']> {
  const vendorMasterRows = await prisma.$queryRaw<Array<{ vendorId: string; vendorName: string; country: string | null }>>`
    WITH latest AS (
      SELECT MAX("snapshotDate") AS "snapshotDate"
      FROM "VendorSnapshot"
      WHERE "companyId" = ${companyId}
    )
    SELECT DISTINCT "vendorId", "vendorName", "country"
    FROM "VendorSnapshot"
    WHERE "companyId" = ${companyId}
      AND "snapshotDate" = (SELECT "snapshotDate" FROM latest)
      AND UPPER(TRIM(COALESCE("country", ''))) NOT IN ('', 'US', 'USA', 'UNITED STATES', 'DOM')
    ORDER BY "vendorName" ASC, "vendorId" ASC
  `.catch(() => []);
  const vendors = new Map<string, { vendorId: string; vendorName: string; country: string | null }>();
  for (const row of vendorMasterRows) {
    const vendorId = String(row.vendorId || '').trim();
    const vendorName = String(row.vendorName || '').trim();
    if (!vendorId && !vendorName) continue;
    const key = vendorId ? `id:${vendorId}` : `name:${vendorName.toLowerCase()}`;
    vendors.set(key, { vendorId, vendorName: vendorName || vendorId, country: row.country || null });
  }
  return Array.from(vendors.values()).sort((left, right) =>
    left.vendorName.localeCompare(right.vendorName, undefined, { sensitivity: 'base', numeric: true })
  );
}

/** Customer with the most shipped revenue per item over the last 12 months, else all time (Infor shipments). */
async function loadPrimaryCustomerByItem(companyId: string): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<Array<{ itemKey: string; customer: string }>>`
    WITH totals AS (
      SELECT
        UPPER(BTRIM("itemSku")) AS "itemKey",
        COALESCE(NULLIF(BTRIM("customerName"), ''), NULLIF(BTRIM("customerId"), '')) AS "customer",
        SUM(("qtyShipped" - "qtyReturned") * COALESCE("price", 0))
          FILTER (WHERE "shipDate" >= CURRENT_DATE - INTERVAL '12 months') AS "recentRevenue",
        SUM(("qtyShipped" - "qtyReturned") * COALESCE("price", 0)) AS "totalRevenue"
      FROM "InforShipmentFact"
      WHERE "companyId" = ${companyId}
      GROUP BY 1, 2
    )
    SELECT DISTINCT ON ("itemKey") "itemKey", "customer"
    FROM totals
    WHERE "customer" IS NOT NULL
    ORDER BY "itemKey", "recentRevenue" DESC NULLS LAST, "totalRevenue" DESC
  `.catch(() => []);
  return new Map(rows.map((row) => [row.itemKey, row.customer] as [string, string]));
}

/**
 * Limits the list to Infor items with a primary vendor and resolves each row's Infor values:
 * vendor, description, origin (shared COO override, else vendor address) and unit cost.
 */
async function withInforContext(companyId: string, items: CompanyItemDutyRow[]): Promise<CompanyItemDutyRow[]> {
  const [csiByItem, vendorByItem, vendorAddresses, cooOverrides, primaryCustomers] = await Promise.all([
    loadCsiItemFacts(companyId).catch(() => new Map()),
    loadPrimaryVendorByItem(companyId).catch(() => new Map<string, { vendorId: string; vendorName: string }>()),
    loadVendorAddresses(companyId),
    loadCooOverrides(companyId).catch(() => new Map<string, string>()),
    loadPrimaryCustomerByItem(companyId),
  ]);
  const result: CompanyItemDutyRow[] = [];
  for (const item of items) {
    const key = normalizeItemSku(item.itemSku).toUpperCase();
    const csi = csiByItem.get(key);
    const vendor = vendorByItem.get(key);
    if (!csi || !vendor?.vendorId) continue;
    const address = vendorAddresses.get(vendor.vendorId);
    const vendorName =
      vendor.vendorName && vendor.vendorName !== vendor.vendorId ? vendor.vendorName : address?.vendorName || vendor.vendorId;
    const inforOrigin = dutyOriginCode(address?.country);
    const originOverride = dutyOriginCode(cooOverrides.get(key));
    const inforDescription = String(csi.description || '').trim() || null;
    const inforValuePerPiece = inforUnitCost(csi);
    result.push({
      ...item,
      vendorId: vendor.vendorId,
      vendorName,
      primaryCustomer: primaryCustomers.get(key) || null,
      inactive: isInactiveStatus(csi.materialStatus) || isInactiveStatus(address?.status),
      inforDescription,
      itemDescription: item.descriptionOverridden ? item.itemDescription : inforDescription || item.itemDescription,
      inforOrigin,
      originOverridden: Boolean(originOverride),
      countryOfOrigin: originOverride || inforOrigin || item.countryOfOrigin,
      inforValuePerPiece,
      enteredValuePerPiece: item.valueOverridden ? item.enteredValuePerPiece : inforValuePerPiece ?? item.enteredValuePerPiece,
    });
  }
  return result;
}

export async function dutiesTariffsDataVersion(companyId: string): Promise<string> {
  const [duty, applications, vendorMaster, freight] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint; updatedAt: Date | null }>>`
      SELECT COUNT(*) AS "count", MAX("updatedAt") AS "updatedAt"
      FROM "CompanyItemDuty" WHERE "companyId" = ${companyId}
    `.catch(() => []),
    prisma.$queryRaw<Array<{ count: bigint; updatedAt: Date | null }>>`
      SELECT COUNT(*) AS "count", MAX("updatedAt") AS "updatedAt"
      FROM "CompanyItemDutyApplication" WHERE "companyId" = ${companyId}
    `.catch(() => []),
    prisma.$queryRaw<Array<{ count: bigint; createdAt: Date | null; snapshotDate: Date | null }>>`
      SELECT COUNT(*) AS "count", MAX("createdAt") AS "createdAt", MAX("snapshotDate") AS "snapshotDate"
      FROM "VendorSnapshot" WHERE "companyId" = ${companyId}
    `.catch(() => []),
    prisma.$queryRaw<Array<{ count: bigint; updatedAt: Date | null }>>`
      SELECT COUNT(*) AS "count", MAX("updatedAt") AS "updatedAt"
      FROM "CompanyItemFreight" WHERE "companyId" = ${companyId}
    `.catch(() => []),
  ]);
  return hashCacheParts([SOURCE_VERSION, companyId, duty[0] || null, applications[0] || null, vendorMaster[0] || null, freight[0] || null]);
}

export function dutiesTariffsCacheKey(companyId: string): string {
  return hashCacheParts([NAMESPACE, companyId, 'full-payload', SOURCE_VERSION]);
}

export async function buildDutiesTariffsPayload(companyId: string, discovered = 0): Promise<DutiesTariffsPayload> {
  await ensureCompanyItemDutyTable();
  const [dutyRows, vendorOptions] = await Promise.all([
    listCompanyItemDuties(companyId, 'all'),
    loadNonUsVendors(companyId),
  ]);
  const items = await withInforContext(companyId, dutyRows);
  const { loadMonthlyHtsDutyCogs } = await import('@/lib/hts/apply-duty-cogs');
  const monthly = await loadMonthlyHtsDutyCogs(companyId).catch(() => new Map());
  return {
    inactiveCount: items.filter((item) => item.inactive).length,
    discovered,
    missingHtsCount: items.filter((item) => item.needsHtsInput && !item.inactive).length,
    items,
    monthlyCogs: Array.from(monthly.values()),
    vendorOptions,
  };
}

export async function readDutiesTariffsCache(companyId: string): Promise<DutiesTariffsPayload | null> {
  const cacheKey = dutiesTariffsCacheKey(companyId);
  const dataVersion = await dutiesTariffsDataVersion(companyId);
  return readDerivedApiCache<DutiesTariffsPayload>({ namespace: NAMESPACE, cacheKey, dataVersion });
}

export async function writeDutiesTariffsCache(companyId: string, payload: DutiesTariffsPayload): Promise<void> {
  await writeDerivedApiCache({
    namespace: NAMESPACE,
    cacheKey: dutiesTariffsCacheKey(companyId),
    dataVersion: await dutiesTariffsDataVersion(companyId),
    payload,
    ttlSeconds: TTL_SECONDS,
  });
}

export async function refreshAndWarmDutiesTariffsCache(companyId: string): Promise<DutiesTariffsPayload> {
  const refreshed = await refreshCompanyItemDuties(companyId);
  // Rate quotes are keyed by the Eastern calendar date, so repeated sync
  // completions on the same day reuse the stored quote instead of re-fetching it.
  const { refreshCompanyItemDutyRates } = await import('@/lib/hts/refresh-item-duty-rates');
  await refreshCompanyItemDutyRates(companyId);
  const { rebuildCompanyItemDutyApplications } = await import('@/lib/hts/apply-duty-cogs');
  await rebuildCompanyItemDutyApplications(companyId);
  const payload = await buildDutiesTariffsPayload(companyId, refreshed.discovered);
  await writeDutiesTariffsCache(companyId, payload);
  return payload;
}
