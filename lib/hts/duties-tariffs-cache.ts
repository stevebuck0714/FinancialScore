import prisma from '@/lib/prisma';
import { hashCacheParts, readDerivedApiCache, readLatestDerivedApiCache, writeDerivedApiCache } from '@/lib/derived-api-cache';
import {
  ensureCompanyItemDutyTable,
  listCompanyItemDuties,
  refreshCompanyItemDuties,
  type CompanyItemDutyRow,
} from '@/lib/hts/item-duty-overlay';
import { loadPrimaryVendorByItem } from '@/lib/operations/vendor-monthly-forecast-db';

const NAMESPACE = 'duties-tariffs';
const SOURCE_VERSION = 'duties-tariffs-warm-v1';
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
  return prisma.$queryRaw<Array<{ vendorId: string; vendorName: string; country: string | null }>>`
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
}

async function withVendorNames(companyId: string, items: CompanyItemDutyRow[]): Promise<CompanyItemDutyRow[]> {
  const vendorByItem = await loadPrimaryVendorByItem(companyId).catch(() => new Map());
  return items.map((item) => {
    const sku = String(item.itemSku || '').trim();
    const vendor = vendorByItem.get(sku.toUpperCase()) || vendorByItem.get(sku);
    return { ...item, vendorId: vendor?.vendorId || null, vendorName: vendor?.vendorName || null };
  });
}

export async function dutiesTariffsDataVersion(companyId: string): Promise<string> {
  const [duty, applications] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint; updatedAt: Date | null }>>`
      SELECT COUNT(*) AS "count", MAX("updatedAt") AS "updatedAt"
      FROM "CompanyItemDuty" WHERE "companyId" = ${companyId}
    `.catch(() => []),
    prisma.$queryRaw<Array<{ count: bigint; updatedAt: Date | null }>>`
      SELECT COUNT(*) AS "count", MAX("updatedAt") AS "updatedAt"
      FROM "CompanyItemDutyApplication" WHERE "companyId" = ${companyId}
    `.catch(() => []),
  ]);
  return hashCacheParts([SOURCE_VERSION, companyId, duty[0] || null, applications[0] || null]);
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
  return (
    await readDerivedApiCache<DutiesTariffsPayload>({ namespace: NAMESPACE, cacheKey, dataVersion })
  ) || readLatestDerivedApiCache<DutiesTariffsPayload>({ namespace: NAMESPACE, cacheKey });
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
