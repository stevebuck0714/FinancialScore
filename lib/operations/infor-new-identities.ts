import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { estYear } from '@/lib/time/eastern';
import { ensureCompanyItemDutyTable, syncCompanyItemDutyIdentities } from '@/lib/hts/item-duty-overlay';
import { ensureCompanyItemFreightTable } from '@/lib/operations/item-freight-overlay';
import { ensureProductRevenueForecastTables } from '@/lib/operations/product-revenue-forecast-db';
import { ensureVendorMonthlyForecastTables } from '@/lib/operations/vendor-monthly-forecast-db';
import type { InforIdentityKind, InforNewIdentitiesResult, InforNewIdentity } from '@/lib/operations/infor-new-identities-types';

export type { InforIdentityKind, InforNewIdentitiesResult, InforNewIdentity } from '@/lib/operations/infor-new-identities-types';
export { INFOR_IDENTITY_KINDS } from '@/lib/operations/infor-new-identities-types';

type DiscoveredIdentity = {
  kind: InforIdentityKind;
  identityKey: string;
  label: string;
};

type SeenRow = {
  kind: string;
  identityKey: string;
  acknowledgedAt: Date | null;
};

let ensureTablesOnce: Promise<void> | null = null;

async function ensureIdentitySeenTable(): Promise<void> {
  if (!ensureTablesOnce) {
    ensureTablesOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CompanyInforIdentitySeen" (
          "id" TEXT NOT NULL,
          "companyId" TEXT NOT NULL,
          "kind" TEXT NOT NULL,
          "identityKey" TEXT NOT NULL,
          "label" TEXT,
          "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "acknowledgedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "CompanyInforIdentitySeen_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "CompanyInforIdentitySeen_companyId_kind_identityKey_key"
          ON "CompanyInforIdentitySeen"("companyId", "kind", "identityKey")
      `);
    })().catch((error) => {
      ensureTablesOnce = null;
      throw error;
    });
  }
  await ensureTablesOnce;
}

function normalizeKey(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function normalizeLabel(value: unknown, fallback: string): string {
  const label = String(value ?? '').replace(/\s+/g, ' ').trim();
  return label && label.toLowerCase() !== 'unknown item' ? label : fallback;
}

function payloadText(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (value == null) continue;
    const text = String(value).replace(/\s+/g, ' ').trim();
    if (text && !/^#n\/?a$/i.test(text)) return text;
  }
  return '';
}

async function loadLatestProgramPayloads(companyId: string, programs: string[]): Promise<Record<string, unknown>[]> {
  const rawDelegate = (prisma as { inforRawRecord?: { findFirst: Function; findMany: Function } }).inforRawRecord;
  if (!rawDelegate?.findFirst || !rawDelegate?.findMany) return [];
  const latest = await rawDelegate
    .findFirst({
      where: {
        companyId,
        platform: { in: ['INFOR_M3', 'INFOR_CSI'] },
        miProgram: { in: programs },
      },
      select: { businessDate: true },
      orderBy: [{ businessDate: 'desc' }, { fetchedAt: 'desc' }, { createdAt: 'desc' }],
    })
    .catch(() => null);
  if (!latest?.businessDate) return [];
  const rows = (await rawDelegate
    .findMany({
      where: {
        companyId,
        platform: { in: ['INFOR_M3', 'INFOR_CSI'] },
        miProgram: { in: programs },
        businessDate: latest.businessDate,
      },
      select: { payload: true },
      take: 50000,
    })
    .catch(() => [])) as Array<{ payload?: Record<string, unknown> }>;
  return rows
    .map((row) => (row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : null))
    .filter((payload): payload is Record<string, unknown> => Boolean(payload));
}

function addIdentity(target: Map<string, DiscoveredIdentity>, identity: DiscoveredIdentity) {
  if (!identity.identityKey) return;
  const mapKey = `${identity.kind}:${identity.identityKey}`;
  const existing = target.get(mapKey);
  if (!existing) {
    target.set(mapKey, identity);
    return;
  }
  if (existing.label === existing.identityKey && identity.label !== identity.identityKey) {
    existing.label = identity.label;
  }
}

async function discoverCurrentIdentities(companyId: string): Promise<DiscoveredIdentity[]> {
  const byKey = new Map<string, DiscoveredIdentity>();

  const itemRows = await prisma.inforItemOverviewCache
    .findMany({
      where: { companyId },
      select: { itemNumber: true, description: true },
    })
    .catch(() => []);
  for (const row of itemRows) {
    const identityKey = normalizeKey(row.itemNumber);
    addIdentity(byKey, {
      kind: 'item',
      identityKey,
      label: normalizeLabel(row.description, identityKey),
    });
  }

  const customerPayloads = await loadLatestProgramPayloads(companyId, ['SLCustomers', 'SLCUSTOMERS']);
  for (const payload of customerPayloads) {
    const identityKey = normalizeKey(payloadText(payload, ['CustNum', 'custNum', 'customerId', 'CUNO']));
    if (!identityKey) continue;
    addIdentity(byKey, {
      kind: 'customer',
      identityKey,
      label: normalizeLabel(payloadText(payload, ['Name', 'name', 'CustName', 'customerName']), identityKey),
    });
  }

  const orderCustomers = await prisma
    .$queryRaw<Array<{ customerId: string | null; customerName: string | null }>>`
      SELECT DISTINCT "customerId", "customerName"
      FROM "CustomerOrderLineSnapshot"
      WHERE "companyId" = ${companyId}
        AND COALESCE(NULLIF("customerId", ''), NULLIF("customerName", '')) IS NOT NULL
    `
    .catch(() => []);
  for (const row of orderCustomers) {
    const identityKey = normalizeKey(row.customerId || row.customerName);
    addIdentity(byKey, {
      kind: 'customer',
      identityKey,
      label: normalizeLabel(row.customerName, identityKey),
    });
  }

  const vendorPayloads = await loadLatestProgramPayloads(companyId, ['SLVendors', 'SLVENDORS']);
  for (const payload of vendorPayloads) {
    const identityKey = normalizeKey(payloadText(payload, ['VendNum', 'vendNum', 'vendorId', 'SUNO']));
    if (!identityKey) continue;
    addIdentity(byKey, {
      kind: 'vendor',
      identityKey,
      label: normalizeLabel(payloadText(payload, ['Name', 'name', 'VadName', 'VendaddrName', 'VendAddrName']), identityKey),
    });
  }

  const itemVendorPayloads = await loadLatestProgramPayloads(companyId, ['SLItemVends', 'SLITEMVENDS']);
  for (const payload of itemVendorPayloads) {
    const identityKey = normalizeKey(payloadText(payload, ['VendNum', 'vendNum', 'vendorId']));
    if (!identityKey) continue;
    addIdentity(byKey, {
      kind: 'vendor',
      identityKey,
      label: normalizeLabel(payloadText(payload, ['VendaddrName', 'VendAddrName', 'Name']), identityKey),
    });
  }

  return Array.from(byKey.values());
}

async function latestInforSyncAt(companyId: string): Promise<string | null> {
  const [item, raw] = await Promise.all([
    prisma.inforItemOverviewCache
      .findFirst({
        where: { companyId },
        select: { fetchedAt: true },
        orderBy: { fetchedAt: 'desc' },
      })
      .catch(() => null),
    prisma.inforRawRecord
      .findFirst({
        where: {
          companyId,
          platform: { in: ['INFOR_M3', 'INFOR_CSI'] },
          miProgram: { in: ['SLCustomers', 'SLCUSTOMERS', 'SLVendors', 'SLVENDORS', 'SLItems', 'SLITEMS'] },
        },
        select: { fetchedAt: true },
        orderBy: { fetchedAt: 'desc' },
      })
      .catch(() => null),
  ]);
  const times = [item?.fetchedAt, raw?.fetchedAt].filter((value): value is Date => value instanceof Date);
  if (!times.length) return null;
  return new Date(Math.max(...times.map((value) => value.getTime()))).toISOString();
}

async function insertSeenRows(
  companyId: string,
  identities: DiscoveredIdentity[],
  acknowledged: boolean
): Promise<void> {
  if (!identities.length) return;
  const acknowledgedAt = acknowledged ? new Date() : null;
  const chunkSize = 200;
  for (let index = 0; index < identities.length; index += chunkSize) {
    const chunk = identities.slice(index, index + chunkSize);
    const values = chunk.map(
      (identity) => Prisma.sql`(
        ${randomUUID()},
        ${companyId},
        ${identity.kind},
        ${identity.identityKey},
        ${identity.label},
        NOW(),
        ${acknowledgedAt},
        NOW(),
        NOW()
      )`
    );
    await prisma.$executeRaw`
      INSERT INTO "CompanyInforIdentitySeen" (
        "id", "companyId", "kind", "identityKey", "label", "firstSeenAt", "acknowledgedAt", "createdAt", "updatedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("companyId", "kind", "identityKey")
      DO UPDATE SET
        "label" = COALESCE(NULLIF(EXCLUDED."label", ''), "CompanyInforIdentitySeen"."label"),
        "updatedAt" = NOW()
    `;
  }
}

async function loadMissingHints(companyId: string, identities: DiscoveredIdentity[]): Promise<Map<string, string[]>> {
  const hints = new Map<string, string[]>();
  const add = (kind: InforIdentityKind, key: string, hint: string) => {
    const mapKey = `${kind}:${key}`;
    const list = hints.get(mapKey) || [];
    if (!list.includes(hint)) list.push(hint);
    hints.set(mapKey, list);
  };

  const items = identities.filter((identity) => identity.kind === 'item');
  const customers = identities.filter((identity) => identity.kind === 'customer');
  const vendors = identities.filter((identity) => identity.kind === 'vendor');
  const year = estYear();

  if (items.length) {
    await Promise.all([ensureCompanyItemDutyTable(), ensureCompanyItemFreightTable()]);
    const [dutyRows, freightRows] = await Promise.all([
      prisma
        .$queryRaw<Array<{ itemSku: string; htsCode: string | null }>>`
          SELECT "itemSku", "htsCode"
          FROM "CompanyItemDuty"
          WHERE "companyId" = ${companyId}
        `
        .catch(() => []),
      prisma
        .$queryRaw<Array<{ itemSku: string }>>`
          SELECT "itemSku"
          FROM "CompanyItemFreight"
          WHERE "companyId" = ${companyId}
        `
        .catch(() => []),
    ]);
    const dutyBySku = new Map(dutyRows.map((row) => [normalizeKey(row.itemSku), String(row.htsCode || '').trim()]));
    const freightSkus = new Set(freightRows.map((row) => normalizeKey(row.itemSku)));
    for (const item of items) {
      const hts = dutyBySku.get(item.identityKey);
      if (!hts) add('item', item.identityKey, 'HTS / origin on Duties & Tariffs');
      if (!freightSkus.has(item.identityKey)) add('item', item.identityKey, 'Freight');
    }
  }

  if (customers.length) {
    await ensureProductRevenueForecastTables().catch(() => undefined);
    const forecastCustomers = await prisma
      .$queryRaw<Array<{ customerId: string | null; customerName: string | null }>>`
        SELECT DISTINCT "customerId", "customerName"
        FROM "ProductRevenueForecastLine"
        WHERE "companyId" = ${companyId}
          AND "year" = ${year}
      `
      .catch(() => []);
    const forecastKeys = new Set(
      forecastCustomers.map((row) => normalizeKey(row.customerId || row.customerName)).filter(Boolean)
    );
    for (const customer of customers) {
      if (!forecastKeys.has(customer.identityKey)) add('customer', customer.identityKey, 'Monthly Forecast');
    }
  }

  if (vendors.length) {
    await ensureVendorMonthlyForecastTables().catch(() => undefined);
    const forecastVendors = await prisma
      .$queryRaw<Array<{ vendorId: string | null; vendorName: string | null }>>`
        SELECT DISTINCT "vendorId", "vendorName"
        FROM "VendorMonthlyForecastLine"
        WHERE "companyId" = ${companyId}
          AND "year" = ${year}
      `
      .catch(() => []);
    const forecastKeys = new Set(
      forecastVendors.map((row) => normalizeKey(row.vendorId || row.vendorName)).filter(Boolean)
    );
    for (const vendor of vendors) {
      if (!forecastKeys.has(vendor.identityKey)) add('vendor', vendor.identityKey, 'Vendor Monthly Forecast');
    }
  }

  return hints;
}

function toResult(
  companyId: string,
  lastInforSyncAt: string | null,
  identities: DiscoveredIdentity[],
  hints: Map<string, string[]>
): InforNewIdentitiesResult {
  const items: InforNewIdentity[] = [];
  const customers: InforNewIdentity[] = [];
  const vendors: InforNewIdentity[] = [];
  for (const identity of identities) {
    const row: InforNewIdentity = {
      kind: identity.kind,
      key: identity.identityKey,
      label: identity.label,
      missing: hints.get(`${identity.kind}:${identity.identityKey}`) || [],
    };
    if (identity.kind === 'item') items.push(row);
    else if (identity.kind === 'customer') customers.push(row);
    else vendors.push(row);
  }
  const sortByLabel = (left: InforNewIdentity, right: InforNewIdentity) =>
    left.label.localeCompare(right.label, undefined, { sensitivity: 'base', numeric: true });
  items.sort(sortByLabel);
  customers.sort(sortByLabel);
  vendors.sort(sortByLabel);
  return {
    companyId,
    lastInforSyncAt,
    items,
    customers,
    vendors,
    counts: {
      items: items.length,
      customers: customers.length,
      vendors: vendors.length,
      total: items.length + customers.length + vendors.length,
    },
  };
}

export async function getInforNewIdentities(companyId: string): Promise<InforNewIdentitiesResult> {
  await ensureIdentitySeenTable();
  await syncCompanyItemDutyIdentities(companyId).catch(() => ({ discovered: 0 }));

  const [current, lastInforSyncAt] = await Promise.all([
    discoverCurrentIdentities(companyId),
    latestInforSyncAt(companyId),
  ]);
  const seen = await prisma.$queryRaw<SeenRow[]>`
    SELECT "kind", "identityKey", "acknowledgedAt"
    FROM "CompanyInforIdentitySeen"
    WHERE "companyId" = ${companyId}
  `.catch(() => []);

  const seenKeys = new Set(seen.map((row) => `${row.kind}:${normalizeKey(row.identityKey)}`));
  const unknown = current.filter((identity) => !seenKeys.has(`${identity.kind}:${identity.identityKey}`));
  if (unknown.length) {
    await insertSeenRows(companyId, unknown, seen.length === 0);
  }

  const unacknowledgedKeys = new Set(
    (seen.length === 0 ? [] : seen)
      .filter((row) => !row.acknowledgedAt)
      .map((row) => `${row.kind}:${normalizeKey(row.identityKey)}`)
  );
  if (seen.length > 0) {
    for (const identity of unknown) {
      unacknowledgedKeys.add(`${identity.kind}:${identity.identityKey}`);
    }
  }

  const newIdentities = current.filter((identity) =>
    unacknowledgedKeys.has(`${identity.kind}:${identity.identityKey}`)
  );
  const hints = await loadMissingHints(companyId, newIdentities);
  return toResult(companyId, lastInforSyncAt, newIdentities, hints);
}

export async function acknowledgeInforNewIdentities(companyId: string): Promise<InforNewIdentitiesResult> {
  await ensureIdentitySeenTable();
  await prisma.$executeRaw`
    UPDATE "CompanyInforIdentitySeen"
    SET "acknowledgedAt" = NOW(), "updatedAt" = NOW()
    WHERE "companyId" = ${companyId}
      AND "acknowledgedAt" IS NULL
  `;
  return getInforNewIdentities(companyId);
}
