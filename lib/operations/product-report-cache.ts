import prisma from '@/lib/prisma';
import { hashCacheParts, readDerivedApiCache, writeDerivedApiCache } from '@/lib/derived-api-cache';

// Product report payloads only change when an import, a save, or a nightly sync
// touches one of the tables below, so they can be cached for a long time and
// invalidated by content rather than by clock time.
const PRODUCT_REPORT_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

// Bump when a report's payload shape or math changes so stored payloads are ignored.
const PRODUCT_REPORT_CACHE_VERSION = 'product-reports-v1';

type Fingerprint = { label: string; count?: number; updatedAt?: string | null; latest?: string | null };

const isoOrNull = (value: unknown): string | null =>
  value instanceof Date ? value.toISOString() : null;

async function safeFingerprint(label: string, load: () => Promise<Fingerprint>): Promise<Fingerprint> {
  try {
    return await load();
  } catch {
    // A missing runtime-created table must not break the version, but it also
    // must not silently look identical to a populated one.
    return { label, updatedAt: 'unavailable' };
  }
}

/**
 * Content fingerprint for everything the product reports read. Any import,
 * user save, or nightly sync changes a count or an updatedAt, which changes the
 * version and retires the cached payloads without needing manual busting.
 */
export async function buildProductReportDataVersion(companyId: string): Promise<string> {
  const parts = await Promise.all([
    safeFingerprint('ProductRevenueForecastLine', async () => {
      const result = await prisma.productRevenueForecastLine.aggregate({
        where: { companyId },
        _count: { _all: true },
        _max: { updatedAt: true },
      });
      return {
        label: 'ProductRevenueForecastLine',
        count: result._count._all,
        updatedAt: isoOrNull(result._max.updatedAt),
      };
    }),
    safeFingerprint('ProductRevenueLine', async () => {
      const result = await prisma.productRevenueLine.aggregate({
        where: { companyId },
        _count: { _all: true },
        _max: { updatedAt: true },
      });
      return {
        label: 'ProductRevenueLine',
        count: result._count._all,
        updatedAt: isoOrNull(result._max.updatedAt),
      };
    }),
    safeFingerprint('ProductRevenueSettings', async () => {
      // dataThru decides which months count as actual versus forecast.
      const result = await prisma.productRevenueSettings.aggregate({
        where: { companyId },
        _max: { updatedAt: true },
      });
      return { label: 'ProductRevenueSettings', updatedAt: isoOrNull(result._max.updatedAt) };
    }),
    safeFingerprint('ProductRevenueForecastSettings', async () => {
      const result = await prisma.productRevenueForecastSettings.aggregate({
        where: { companyId },
        _max: { updatedAt: true },
      });
      return { label: 'ProductRevenueForecastSettings', updatedAt: isoOrNull(result._max.updatedAt) };
    }),
    safeFingerprint('ProductRevenuePrice', async () => {
      const result = await prisma.productRevenuePrice.aggregate({
        where: { companyId },
        _count: { _all: true },
        _max: { updatedAt: true },
      });
      return {
        label: 'ProductRevenuePrice',
        // Counts matter as much as timestamps: a save that only deletes rows
        // leaves the surviving max(updatedAt) untouched.
        count: result._count._all,
        updatedAt: isoOrNull(result._max.updatedAt),
      };
    }),
    safeFingerprint('ProductGoalUpdate', async () => {
      const result = await prisma.productGoalUpdate.aggregate({
        where: { companyId },
        _max: { updatedAt: true },
      });
      return { label: 'ProductGoalUpdate', updatedAt: isoOrNull(result._max.updatedAt) };
    }),
    safeFingerprint('CompanyItemDuty', async () => {
      const result = await prisma.companyItemDuty.aggregate({
        where: { companyId },
        _count: { _all: true },
        _max: { updatedAt: true },
      });
      return {
        label: 'CompanyItemDuty',
        count: result._count._all,
        updatedAt: isoOrNull(result._max.updatedAt),
      };
    }),
    safeFingerprint('CompanyItemFreight', async () => {
      // Created at runtime rather than through the Prisma schema.
      const rows = await prisma.$queryRaw<Array<{ count: bigint; updatedAt: Date | null }>>`
        SELECT COUNT(*)::bigint AS count, MAX("updatedAt") AS "updatedAt"
        FROM "CompanyItemFreight"
        WHERE "companyId" = ${companyId}
      `;
      return {
        label: 'CompanyItemFreight',
        count: Number(rows[0]?.count || 0),
        updatedAt: isoOrNull(rows[0]?.updatedAt),
      };
    }),
    safeFingerprint('CompanyItemFreightSettings', async () => {
      // Freight rates drive group margin math, and editing them leaves the
      // per-item freight rows untouched.
      const rows = await prisma.$queryRaw<Array<{ updatedAt: Date | null }>>`
        SELECT MAX("updatedAt") AS "updatedAt"
        FROM "CompanyItemFreightSettings"
        WHERE "companyId" = ${companyId}
      `;
      return { label: 'CompanyItemFreightSettings', updatedAt: isoOrNull(rows[0]?.updatedAt) };
    }),
    safeFingerprint('ProductSalesSnapshot', async () => {
      const result = await prisma.productSalesSnapshot.aggregate({
        where: { companyId },
        _max: { snapshotDate: true },
      });
      return { label: 'ProductSalesSnapshot', latest: isoOrNull(result._max.snapshotDate) };
    }),
    safeFingerprint('InforRawRecord', async () => {
      // Raw SQL rather than prisma.aggregate: on this table (10M+ rows) the
      // generated aggregate takes ~1.9s while this returns in ~70ms, both using
      // the same (companyId, businessDate, ...) index.
      const rows = await prisma.$queryRaw<Array<{ businessDate: Date | null }>>`
        SELECT MAX("businessDate") AS "businessDate"
        FROM "InforRawRecord"
        WHERE "companyId" = ${companyId}
      `;
      return { label: 'InforRawRecord', latest: isoOrNull(rows[0]?.businessDate) };
    }),
  ]);
  return hashCacheParts([PRODUCT_REPORT_CACHE_VERSION, companyId, parts]);
}

/**
 * Serves a product report from the derived cache, building and storing it on a
 * miss. These reports rebuild from the full company dataset, so an uncached
 * route pays 20s or more on every single request.
 */
export async function withProductReportCache<T>(params: {
  namespace: string;
  companyId: string;
  keyParts: unknown[];
  refresh?: boolean;
  build: () => Promise<T>;
}): Promise<{ payload: T; cacheHit: boolean }> {
  const descriptor = {
    namespace: params.namespace,
    cacheKey: hashCacheParts([params.companyId, ...params.keyParts]),
    dataVersion: await buildProductReportDataVersion(params.companyId).catch(() => ''),
  };
  const cacheable = Boolean(descriptor.dataVersion);

  if (cacheable && !params.refresh) {
    const cached = await readDerivedApiCache<T>(descriptor).catch(() => null);
    if (cached) return { payload: cached, cacheHit: true };
  }

  const payload = await params.build();
  if (cacheable) {
    await writeDerivedApiCache({
      ...descriptor,
      payload,
      ttlSeconds: PRODUCT_REPORT_CACHE_TTL_SECONDS,
    }).catch((error) => {
      console.warn(`${params.namespace} cache write failed:`, error);
    });
  }
  return { payload, cacheHit: false };
}
