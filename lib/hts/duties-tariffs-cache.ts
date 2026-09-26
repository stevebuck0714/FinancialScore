import prisma from '@/lib/prisma';
import { hashCacheParts, readDerivedApiCache, writeDerivedApiCache } from '@/lib/derived-api-cache';
import {
  ensureCompanyItemDutyTable,
  listCompanyItemDuties,
  refreshCompanyItemDuties,
  type CompanyItemDutyRow,
} from '@/lib/hts/item-duty-overlay';
import { loadPrimaryVendorByItem } from '@/lib/operations/vendor-monthly-forecast-db';

const NAMESPACE = 'duties-tariffs';
const SOURCE_VERSION = 'duties-tariffs-warm-v2-freight-vendor-link';
const TTL_SECONDS = 30 * 24 * 60 * 60;

export type DutiesTariffsPayload = {
  spreadsheetItems: number;
  discovered: number;
  missingHtsCount: number;
  items: CompanyItemDutyRow[];
  monthlyCogs: unknown[];
  vendorOptions: Array<{ vendorId: string; vendorName: string; country: string | null }>;
};

async function loadNonUsVendors(companyId: string): Promise<DutiesTariffsPayload['vendorOptions']> {
  const [vendorMasterRows, freightRows] = await Promise.all([
    prisma.$queryRaw<Array<{ vendorId: string; vendorName: string; country: string | null }>>`
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
    `.catch(() => []),
    prisma.$queryRaw<Array<{ vendorId: string | null; vendorName: string | null; country: string | null }>>`
      SELECT DISTINCT
        "spreadsheetVendorId" AS "vendorId",
        "spreadsheetVendorName" AS "vendorName",
        COALESCE("spreadsheetVendorCoo", "countryOfOrigin") AS "country"
      FROM "CompanyItemFreight"
      WHERE "companyId" = ${companyId}
        AND COALESCE(NULLIF("spreadsheetVendorId", ''), NULLIF("spreadsheetVendorName", '')) IS NOT NULL
        AND UPPER(TRIM(COALESCE("spreadsheetVendorCoo", "countryOfOrigin", ''))) NOT IN ('', 'US', 'USA', 'UNITED STATES', 'DOM')
    `.catch(() => []),
  ]);
  const vendors = new Map<string, { vendorId: string; vendorName: string; country: string | null }>();
  for (const row of [...vendorMasterRows, ...freightRows]) {
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

async function withVendorNames(companyId: string, items: CompanyItemDutyRow[]): Promise<CompanyItemDutyRow[]> {
  const [vendorByItem, freightVendorRows] = await Promise.all([
    loadPrimaryVendorByItem(companyId).catch(() => new Map()),
    prisma.$queryRaw<Array<{ itemSku: string; vendorId: string | null; vendorName: string | null }>>`
      SELECT
        "itemSku",
        "spreadsheetVendorId" AS "vendorId",
        "spreadsheetVendorName" AS "vendorName"
      FROM "CompanyItemFreight"
      WHERE "companyId" = ${companyId}
        AND COALESCE(NULLIF("spreadsheetVendorId", ''), NULLIF("spreadsheetVendorName", '')) IS NOT NULL
    `.catch(() => []),
  ]);
  const freightVendorByItem = new Map<string, { vendorId: string; vendorName: string }>();
  for (const row of freightVendorRows) {
    const itemSku = String(row.itemSku || '').trim();
    const vendorId = String(row.vendorId || '').trim();
    const vendorName = String(row.vendorName || '').trim();
    if (!itemSku || (!vendorId && !vendorName)) continue;
    freightVendorByItem.set(itemSku.toUpperCase(), { vendorId, vendorName: vendorName || vendorId });
  }
  return items.map((item) => {
    const sku = String(item.itemSku || '').trim();
    // Freight-sheet assignments are Atlantic's authoritative item/vendor link
    // and remain available for SKUs that have not received an HTS code yet.
    const vendor =
      freightVendorByItem.get(sku.toUpperCase()) ||
      vendorByItem.get(sku.toUpperCase()) ||
      vendorByItem.get(sku);
    return { ...item, vendorId: vendor?.vendorId || null, vendorName: vendor?.vendorName || null };
  });
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
  const items = await withVendorNames(companyId, dutyRows);
  const { loadMonthlyHtsDutyCogs } = await import('@/lib/hts/apply-duty-cogs');
  const monthly = await loadMonthlyHtsDutyCogs(companyId).catch(() => new Map());
  return {
    spreadsheetItems: items.filter((item) => item.htsInputSource === 'spreadsheet' || Boolean(item.lastSpreadsheetSeedAt)).length,
    discovered,
    missingHtsCount: items.filter((item) => item.needsHtsInput).length,
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
