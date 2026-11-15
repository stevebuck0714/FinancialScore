import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { estYear } from '@/lib/time/eastern';
import { hashCacheParts } from '@/lib/derived-api-cache';
import { ensureCompanyItemDutyTable, syncCompanyItemDutyIdentities } from '@/lib/hts/item-duty-overlay';
import { listCompanyItemFreight, type CompanyItemFreightRow } from '@/lib/operations/item-freight-overlay';
import { buildProductReportDataVersion, withProductReportCache } from '@/lib/operations/product-report-cache';
import { ensureProductRevenueForecastTables } from '@/lib/operations/product-revenue-forecast-db';
import { ensureVendorMonthlyForecastTables } from '@/lib/operations/vendor-monthly-forecast-db';
import { deriveShipmentType } from '@/lib/operational/sgp-freight-calc';
import type {
  InforIdentityKind,
  InforReviewCustomer,
  InforReviewedRow,
  InforReviewRow,
  InforReviewWarnings,
} from '@/lib/operations/infor-new-identities-types';

export type {
  InforIdentityKind,
  InforReviewCustomer,
  InforReviewedRow,
  InforReviewRow,
  InforReviewSection,
  InforReviewWarnings,
} from '@/lib/operations/infor-new-identities-types';
export { INFOR_IDENTITY_KINDS } from '@/lib/operations/infor-new-identities-types';

// Bump when the row shape or the checks change so stored payloads are ignored.
const REVIEW_WARNINGS_CACHE_VERSION = 'infor-review-warnings-v2';

/** The cached build. Reviewed rows are split out on read so a checkbox never waits on a rebuild. */
type BuiltReviewWarnings = Omit<InforReviewWarnings, 'reviewedRows'>;

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

/** Infor pads customer numbers with leading zeros in some programs. */
function customerKey(value: unknown): string {
  return normalizeKey(value).replace(/^0+(?=\d)/, '');
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeLabel(value: unknown, fallback: string): string {
  const label = cleanText(value);
  return label && label.toLowerCase() !== 'unknown item' ? label : fallback;
}

function payloadText(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (value == null) continue;
    const text = cleanText(value);
    if (text && !/^#n\/?a$/i.test(text)) return text;
  }
  return '';
}

async function loadLatestProgramPayloads(companyId: string, programs: string[]): Promise<Record<string, unknown>[]> {
  const latest = await prisma.inforRawRecord
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
  const rows = await prisma.inforRawRecord
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
    .catch(() => []);
  return rows
    .map((row) => (row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : null))
    .filter((payload): payload is Record<string, unknown> => Boolean(payload)) as Record<string, unknown>[];
}

/** Customers on the latest daily order snapshot, the same day the Products page reads. */
async function loadLatestOrderCustomers(companyId: string) {
  return prisma
    .$queryRaw<Array<{ customerId: string | null; customerName: string | null }>>`
      SELECT DISTINCT "customerId", "customerName"
      FROM "CustomerOrderLineSnapshot"
      WHERE "companyId" = ${companyId}
        AND "frequency" = 'daily'
        AND "snapshotDate" >= (
          SELECT MAX("snapshotDate") - INTERVAL '1 day'
          FROM "CustomerOrderLineSnapshot"
          WHERE "companyId" = ${companyId} AND "frequency" = 'daily'
        )
        AND COALESCE(NULLIF("customerId", ''), NULLIF("customerName", '')) IS NOT NULL
    `
    .catch(() => []);
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

type Discovery = {
  identities: DiscoveredIdentity[];
  customerNames: Map<string, string>;
};

async function discoverCurrentIdentities(companyId: string): Promise<Discovery> {
  const [itemRows, customerPayloads, orderCustomers, vendorPayloads, itemVendorPayloads] = await Promise.all([
    prisma.inforItemOverviewCache
      .findMany({ where: { companyId }, select: { itemNumber: true, description: true } })
      .catch(() => []),
    loadLatestProgramPayloads(companyId, ['SLCustomers', 'SLCUSTOMERS']),
    loadLatestOrderCustomers(companyId),
    loadLatestProgramPayloads(companyId, ['SLVendors', 'SLVENDORS']),
    loadLatestProgramPayloads(companyId, ['SLItemVends', 'SLITEMVENDS']),
  ]);

  const byKey = new Map<string, DiscoveredIdentity>();
  const customerNames = new Map<string, string>();
  const rememberCustomerName = (id: string, name: string) => {
    const key = customerKey(id);
    if (key && name && name !== id && !customerNames.has(key)) customerNames.set(key, name);
  };

  for (const row of itemRows) {
    const identityKey = normalizeKey(row.itemNumber);
    addIdentity(byKey, { kind: 'item', identityKey, label: normalizeLabel(row.description, identityKey) });
  }
  for (const payload of customerPayloads) {
    const identityKey = normalizeKey(payloadText(payload, ['CustNum', 'custNum', 'customerId', 'CUNO']));
    if (!identityKey) continue;
    const label = normalizeLabel(payloadText(payload, ['Name', 'name', 'CustName', 'customerName']), identityKey);
    addIdentity(byKey, { kind: 'customer', identityKey, label });
    rememberCustomerName(identityKey, label);
  }
  for (const row of orderCustomers) {
    const identityKey = normalizeKey(row.customerId || row.customerName);
    const label = normalizeLabel(row.customerName, identityKey);
    addIdentity(byKey, { kind: 'customer', identityKey, label });
    if (row.customerId) rememberCustomerName(row.customerId, label);
  }
  for (const payload of vendorPayloads) {
    const identityKey = normalizeKey(payloadText(payload, ['VendNum', 'vendNum', 'vendorId', 'SUNO']));
    if (!identityKey) continue;
    addIdentity(byKey, {
      kind: 'vendor',
      identityKey,
      label: normalizeLabel(payloadText(payload, ['Name', 'name', 'VadName', 'VendaddrName', 'VendAddrName']), identityKey),
    });
  }
  for (const payload of itemVendorPayloads) {
    const identityKey = normalizeKey(payloadText(payload, ['VendNum', 'vendNum', 'vendorId']));
    if (!identityKey) continue;
    addIdentity(byKey, {
      kind: 'vendor',
      identityKey,
      label: normalizeLabel(payloadText(payload, ['VendaddrName', 'VendAddrName', 'Name']), identityKey),
    });
  }

  return { identities: Array.from(byKey.values()), customerNames };
}

async function latestInforSyncAt(companyId: string): Promise<string | null> {
  const [item, raw] = await Promise.all([
    prisma.inforItemOverviewCache
      .findFirst({ where: { companyId }, select: { fetchedAt: true }, orderBy: { fetchedAt: 'desc' } })
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

async function insertSeenRows(companyId: string, identities: DiscoveredIdentity[], acknowledged: boolean): Promise<void> {
  if (!identities.length) return;
  const acknowledgedAt = acknowledged ? new Date() : null;
  const chunkSize = 200;
  for (let index = 0; index < identities.length; index += chunkSize) {
    const chunk = identities.slice(index, index + chunkSize);
    const values = chunk.map(
      (identity) => Prisma.sql`(
        ${randomUUID()}, ${companyId}, ${identity.kind}, ${identity.identityKey}, ${identity.label},
        NOW(), ${acknowledgedAt}, NOW(), NOW()
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

/** A new identity leaves the warning only once every section has the data it needs. */
async function markResolved(companyId: string, identities: DiscoveredIdentity[]): Promise<void> {
  if (!identities.length) return;
  const conditions = identities.map(
    (identity) => Prisma.sql`("kind" = ${identity.kind} AND "identityKey" = ${identity.identityKey})`
  );
  await prisma.$executeRaw`
    UPDATE "CompanyInforIdentitySeen"
    SET "acknowledgedAt" = NOW(), "updatedAt" = NOW()
    WHERE "companyId" = ${companyId}
      AND "acknowledgedAt" IS NULL
      AND (${Prisma.join(conditions, ' OR ')})
  `;
}

type ItemCustomerLink = InforReviewCustomer & { key: string; customerPartNumber: string };

/** Every customer an item applies to: its forecast rows, open orders, and Infor customer items. */
async function loadItemCustomerLinks(
  companyId: string,
  itemKeys: string[],
  customerNames: Map<string, string>
): Promise<Map<string, ItemCustomerLink[]>> {
  const links = new Map<string, Map<string, ItemCustomerLink>>();
  if (!itemKeys.length) return new Map();
  type LinkRow = { item: string; customerId: string | null; customerName: string | null; customerPartNumber: string | null };
  const [forecastRows, orderRows, customerItemRows] = await Promise.all([
    prisma.$queryRaw<LinkRow[]>`
      SELECT DISTINCT UPPER(TRIM("itemSku")) AS "item", TRIM("customerId") AS "customerId",
             TRIM("customerName") AS "customerName", TRIM("customerPartNumber") AS "customerPartNumber"
      FROM "ProductRevenueForecastLine"
      WHERE "companyId" = ${companyId}
        AND UPPER(TRIM("itemSku")) = ANY(${itemKeys})
    `.catch(() => []),
    prisma.$queryRaw<LinkRow[]>`
      SELECT DISTINCT UPPER(TRIM(COALESCE(NULLIF(TRIM("sku"), ''), "itemId"))) AS "item",
             TRIM("customerId") AS "customerId", TRIM("customerName") AS "customerName",
             TRIM("customerPn") AS "customerPartNumber"
      FROM "CustomerOrderLineSnapshot"
      WHERE "companyId" = ${companyId}
        AND (UPPER(TRIM("sku")) = ANY(${itemKeys}) OR UPPER(TRIM("itemId")) = ANY(${itemKeys}))
    `.catch(() => []),
    prisma.$queryRaw<LinkRow[]>`
      SELECT DISTINCT UPPER(TRIM("payload"->>'Item')) AS "item", TRIM("payload"->>'CustNum') AS "customerId",
             NULL::text AS "customerName", TRIM("payload"->>'CustItem') AS "customerPartNumber"
      FROM "InforRawRecord"
      WHERE "companyId" = ${companyId}
        AND "miProgram" IN ('SLCustomerItems', 'SLCUSTOMERITEMS')
        AND UPPER(TRIM("payload"->>'Item')) = ANY(${itemKeys})
        AND "businessDate" = (
          SELECT MAX("businessDate") FROM "InforRawRecord"
          WHERE "companyId" = ${companyId} AND "miProgram" IN ('SLCustomerItems', 'SLCUSTOMERITEMS')
        )
    `.catch(() => []),
  ]);

  for (const row of [...forecastRows, ...orderRows, ...customerItemRows]) {
    const item = normalizeKey(row.item);
    const key = customerKey(row.customerId);
    if (!item || !key) continue;
    const byCustomer = links.get(item) || new Map<string, ItemCustomerLink>();
    links.set(item, byCustomer);
    const existing = byCustomer.get(key);
    const name = cleanText(row.customerName) || customerNames.get(key) || '';
    if (existing) {
      if (!existing.customerName && name) existing.customerName = name;
      if (!existing.customerPartNumber && row.customerPartNumber) existing.customerPartNumber = cleanText(row.customerPartNumber);
      continue;
    }
    byCustomer.set(key, {
      key,
      customerId: cleanText(row.customerId),
      customerName: name,
      customerPartNumber: cleanText(row.customerPartNumber),
    });
  }

  return new Map(
    Array.from(links, ([item, byCustomer]) => [
      item,
      Array.from(byCustomer.values()).sort((a, b) =>
        (a.customerName || a.customerId).localeCompare(b.customerName || b.customerId, undefined, { sensitivity: 'base' })
      ),
    ])
  );
}

function monthTotal(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  return Object.values(value as Record<string, unknown>).reduce<number>((sum, qty) => {
    const number = Number(qty);
    return Number.isFinite(number) ? sum + Math.abs(number) : sum;
  }, 0);
}

function customerLabel(customer: InforReviewCustomer): string {
  return customer.customerName || customer.customerId;
}

type Issue = { code: string; text: string };

function issueFields(issues: Issue[]): Pick<InforReviewRow, 'issues' | 'issueCodes'> {
  return { issues: issues.map((issue) => issue.text), issueCodes: issues.map((issue) => issue.code) };
}

function emptyRow(
  partial: Partial<InforReviewRow> & Pick<InforReviewRow, 'key' | 'section' | 'kind' | 'issues' | 'issueCodes'>
): InforReviewRow {
  return {
    itemId: null,
    itemDescription: null,
    customerId: null,
    customerName: null,
    customerPartNumber: null,
    vendorId: null,
    vendorName: null,
    customers: [],
    ...partial,
  };
}

async function buildItemRows(
  companyId: string,
  year: number,
  items: DiscoveredIdentity[],
  customerNames: Map<string, string>
): Promise<InforReviewRow[]> {
  if (!items.length) return [];
  const itemKeys = items.map((item) => item.identityKey);
  await Promise.all([ensureCompanyItemDutyTable(), ensureProductRevenueForecastTables()]);
  type ForecastLineRow = {
    item: string;
    customerId: string;
    forecastQty: unknown;
    productionType: string | null;
    statusFlag: string | null;
  };
  type DutyRow = { itemSku: string; htsCode: string | null; countryOfOrigin: string | null };
  const [links, forecastLines, dutyRows, freightRows] = await Promise.all([
    loadItemCustomerLinks(companyId, itemKeys, customerNames),
    prisma.$queryRaw<ForecastLineRow[]>`
      SELECT UPPER(TRIM("itemSku")) AS "item", TRIM("customerId") AS "customerId",
             "forecastQty", "productionType", "statusFlag"
      FROM "ProductRevenueForecastLine"
      WHERE "companyId" = ${companyId}
        AND "year" = ${year}
        AND UPPER(TRIM("itemSku")) = ANY(${itemKeys})
    `.catch((): ForecastLineRow[] => []),
    prisma.$queryRaw<DutyRow[]>`
      SELECT "itemSku", "htsCode", "countryOfOrigin"
      FROM "CompanyItemDuty"
      WHERE "companyId" = ${companyId}
    `.catch((): DutyRow[] => []),
    listCompanyItemFreight(companyId).catch((): CompanyItemFreightRow[] => []),
  ]);

  const forecastByItemCustomer = new Map<string, ForecastLineRow[]>();
  for (const line of forecastLines) {
    const mapKey = `${normalizeKey(line.item)}||${customerKey(line.customerId)}`;
    forecastByItemCustomer.set(mapKey, [...(forecastByItemCustomer.get(mapKey) || []), line]);
  }
  const dutyBySku = new Map<string, DutyRow>(dutyRows.map((row) => [normalizeKey(row.itemSku), row]));
  const freightBySku = new Map<string, CompanyItemFreightRow>(
    freightRows.map((row) => [normalizeKey(row.itemSku), row])
  );

  const rows: InforReviewRow[] = [];
  for (const item of items) {
    const itemId = item.identityKey;
    const itemDescription = item.label !== itemId ? item.label : null;
    const customers = links.get(itemId) || [];
    const customerList = customers.map(({ customerId, customerName }) => ({ customerId, customerName }));

    for (const customer of customers) {
      const lines = forecastByItemCustomer.get(`${itemId}||${customer.key}`) || [];
      const issues: Issue[] = [];
      if (!lines.length) {
        issues.push({
          code: 'notOnForecast',
          text: `Not on ${customerLabel(customer)}'s ${year} forecast. Add APR P/N ${itemId} for this customer, enter monthly quantities, then Save page.`,
        });
      } else {
        const active = lines.filter((line) => !['LOST', 'OBS'].includes(normalizeKey(line.statusFlag)));
        if (active.length && active.every((line) => monthTotal(line.forecastQty) === 0)) {
          issues.push({ code: 'noQuantities', text: `On the ${year} forecast, but no monthly quantities are entered.` });
        }
        if (lines.some((line) => !cleanText(line.productionType))) {
          issues.push({ code: 'productionTypeBlank', text: 'Production type (Planned or MTO) is blank.' });
        }
      }
      if (!issues.length) continue;
      rows.push(emptyRow({
        key: `volumeForecast:${itemId}:${customer.key}`,
        section: 'volumeForecast',
        kind: 'item',
        itemId,
        itemDescription,
        customerId: customer.customerId,
        customerName: customer.customerName || null,
        customerPartNumber: customer.customerPartNumber || null,
        ...issueFields(issues),
      }));
    }

    const duty = dutyBySku.get(itemId);
    const freight = freightBySku.get(itemId);
    const origin = cleanText(duty?.countryOfOrigin) || cleanText(freight?.countryOfOrigin);
    const dutyIssues: Issue[] = [];
    if (!duty) {
      dutyIssues.push({ code: 'notOnDuties', text: 'Not on Duties & Tariffs yet. It is added on the next Infor sync.' });
    } else {
      if (!origin) dutyIssues.push({ code: 'originBlank', text: 'Country of origin is blank.' });
      if (!cleanText(duty.htsCode) && deriveShipmentType(null, origin) !== 'DOM') {
        dutyIssues.push({ code: 'htsBlank', text: 'HTS code is blank, so duty and tariff cannot be calculated.' });
      }
    }
    if (dutyIssues.length) {
      rows.push(emptyRow({
        key: `dutiesTariffs:${itemId}`,
        section: 'dutiesTariffs',
        kind: 'item',
        itemId,
        itemDescription,
        customers: customerList,
        ...issueFields(dutyIssues),
      }));
    }

    const freightIssues: Issue[] = [];
    if (!freight) {
      freightIssues.push({ code: 'notOnFreight', text: 'Not on the Freight page. Infor has not reported this item yet.' });
    } else if (freight.estimatedFreightCurrent == null) {
      const overseas = normalizeKey(freight.shipmentType) === 'OVERSEAS';
      if (!cleanText(freight.shipmentType)) {
        freightIssues.push({ code: 'shipmentTypeBlank', text: 'Shipment type is blank (DOM or OVERSEAS).' });
      }
      if (overseas && freight.cbm == null) {
        freightIssues.push({ code: 'cbmBlank', text: 'CBM is blank. Enter CBM or the carton height, width, and length.' });
      }
      if (overseas && freight.cbm != null && !(Number(freight.orderMultiple) > 0)) {
        freightIssues.push({ code: 'orderMultipleBlank', text: 'Order multiple is blank.' });
      }
      if (!overseas && freight.unitCost == null && freight.currentUnitCost == null) {
        freightIssues.push({ code: 'unitCostBlank', text: 'Unit cost is blank.' });
      }
      if (!freightIssues.length) {
        freightIssues.push({ code: 'freightNotCalculable', text: 'Freight per piece cannot be calculated from the current inputs.' });
      }
    }
    if (freightIssues.length) {
      rows.push(emptyRow({
        key: `freight:${itemId}`,
        section: 'freight',
        kind: 'item',
        itemId,
        itemDescription,
        customers: customerList,
        ...issueFields(freightIssues),
      }));
    }
  }
  return rows;
}

async function buildCustomerRows(companyId: string, year: number, customers: DiscoveredIdentity[]): Promise<InforReviewRow[]> {
  if (!customers.length) return [];
  await ensureProductRevenueForecastTables().catch(() => undefined);
  const forecastCustomers = await prisma.$queryRaw<Array<{ customerId: string | null; customerName: string | null }>>`
    SELECT DISTINCT "customerId", "customerName"
    FROM "ProductRevenueForecastLine"
    WHERE "companyId" = ${companyId}
      AND "year" = ${year}
  `.catch(() => []);
  const forecastKeys = new Set<string>();
  for (const row of forecastCustomers) {
    if (row.customerId) forecastKeys.add(customerKey(row.customerId));
    if (row.customerName) forecastKeys.add(normalizeKey(row.customerName));
  }
  return customers
    .filter((customer) => !forecastKeys.has(customerKey(customer.identityKey)) && !forecastKeys.has(customer.identityKey))
    .map((customer) =>
      emptyRow({
        key: `volumeForecast:customer:${customer.identityKey}`,
        section: 'volumeForecast',
        kind: 'customer',
        customerId: customer.identityKey,
        customerName: customer.label !== customer.identityKey ? customer.label : null,
        ...issueFields([
          {
            code: 'newCustomerNoForecast',
            text: `New customer with no ${year} forecast. Add its items and monthly quantities, then Save page.`,
          },
        ]),
      })
    );
}

async function buildVendorRows(companyId: string, year: number, vendors: DiscoveredIdentity[]): Promise<InforReviewRow[]> {
  if (!vendors.length) return [];
  await ensureVendorMonthlyForecastTables().catch(() => undefined);
  type VendorCountRow = { vendorId: string; vendorName: string; blank: bigint };
  const counts = await prisma.$queryRaw<VendorCountRow[]>`
    SELECT TRIM("vendorId") AS "vendorId", MAX(TRIM("vendorName")) AS "vendorName",
           COUNT(*) FILTER (WHERE COALESCE(TRIM("productionType"), '') = '')::bigint AS "blank"
    FROM "VendorMonthlyForecastLine"
    WHERE "companyId" = ${companyId}
      AND "year" = ${year}
    GROUP BY 1
  `.catch((): VendorCountRow[] => []);
  const blankByVendor = new Map<string, number>(counts.map((row) => [normalizeKey(row.vendorId), Number(row.blank)]));
  const rows: InforReviewRow[] = [];
  for (const vendor of vendors) {
    const blank = blankByVendor.get(vendor.identityKey) || 0;
    if (blank <= 0) continue;
    rows.push(emptyRow({
      key: `vendorForecast:${vendor.identityKey}`,
      section: 'vendorForecast',
      kind: 'vendor',
      vendorId: vendor.identityKey,
      vendorName: vendor.label !== vendor.identityKey ? vendor.label : null,
      ...issueFields([
        {
          code: 'vendorProductionTypeBlank',
          text: `Production type (Planned or MTO) is blank on ${blank} ${year} forecast line${blank === 1 ? '' : 's'}.`,
        },
      ]),
    }));
  }
  return rows;
}

async function buildInforReviewWarnings(companyId: string): Promise<BuiltReviewWarnings> {
  await ensureIdentitySeenTable();
  await syncCompanyItemDutyIdentities(companyId).catch(() => ({ discovered: 0 }));
  const year = estYear();

  const [discovery, lastInforSyncAt, seen] = await Promise.all([
    discoverCurrentIdentities(companyId),
    latestInforSyncAt(companyId),
    prisma.$queryRaw<SeenRow[]>`
      SELECT "kind", "identityKey", "acknowledgedAt"
      FROM "CompanyInforIdentitySeen"
      WHERE "companyId" = ${companyId}
    `.catch(() => []),
  ]);
  const current = discovery.identities;

  // The first check for a company records everything as the baseline instead of flagging it.
  const seenKeys = new Set(seen.map((row) => `${row.kind}:${normalizeKey(row.identityKey)}`));
  const unknown = current.filter((identity) => !seenKeys.has(`${identity.kind}:${identity.identityKey}`));
  if (unknown.length) await insertSeenRows(companyId, unknown, seen.length === 0);

  const openKeys = new Set(
    seen.filter((row) => !row.acknowledgedAt).map((row) => `${row.kind}:${normalizeKey(row.identityKey)}`)
  );
  if (seen.length > 0) for (const identity of unknown) openKeys.add(`${identity.kind}:${identity.identityKey}`);
  const open = current.filter((identity) => openKeys.has(`${identity.kind}:${identity.identityKey}`));

  const [itemRows, customerRows, vendorRows] = await Promise.all([
    buildItemRows(companyId, year, open.filter((identity) => identity.kind === 'item'), discovery.customerNames),
    buildCustomerRows(companyId, year, open.filter((identity) => identity.kind === 'customer')),
    buildVendorRows(companyId, year, open.filter((identity) => identity.kind === 'vendor')),
  ]);
  const rows = [...itemRows, ...customerRows, ...vendorRows];

  // Reviewed rows still count here so the identity stays open and a later, different gap can resurface it.
  const flagged = new Set<string>();
  for (const row of rows) {
    if (row.kind === 'item' && row.itemId) flagged.add(`item:${row.itemId}`);
    if (row.kind === 'customer' && row.customerId) flagged.add(`customer:${row.customerId}`);
    if (row.kind === 'vendor' && row.vendorId) flagged.add(`vendor:${row.vendorId}`);
  }
  await markResolved(
    companyId,
    open.filter((identity) => !flagged.has(`${identity.kind}:${identity.identityKey}`))
  ).catch((error) => console.warn('Infor review warnings: resolve failed', error));

  return {
    companyId,
    year,
    builtAt: new Date().toISOString(),
    lastInforSyncAt,
    rows,
  };
}

/** Sources the warnings read that the product report fingerprint does not cover. */
async function buildReviewWarningsDataVersion(companyId: string): Promise<string> {
  const [products, vendorLines, items, orders] = await Promise.all([
    buildProductReportDataVersion(companyId),
    prisma.$queryRaw<Array<{ count: bigint; updatedAt: Date | null }>>`
      SELECT COUNT(*)::bigint AS count, MAX("updatedAt") AS "updatedAt"
      FROM "VendorMonthlyForecastLine"
      WHERE "companyId" = ${companyId}
    `.catch(() => []),
    prisma.inforItemOverviewCache
      .aggregate({ where: { companyId }, _count: { _all: true }, _max: { fetchedAt: true } })
      .catch(() => null),
    prisma.$queryRaw<Array<{ latest: Date | null }>>`
      SELECT MAX("snapshotDate") AS "latest"
      FROM "CustomerOrderLineSnapshot"
      WHERE "companyId" = ${companyId} AND "frequency" = 'daily'
    `.catch(() => []),
  ]);
  if (!products) return '';
  return hashCacheParts([
    REVIEW_WARNINGS_CACHE_VERSION,
    products,
    vendorLines[0] ?? null,
    items ? [items._count._all, items._max.fetchedAt] : null,
    orders[0]?.latest ?? null,
  ]);
}

/**
 * Review warnings are built after the Infor sync and after saves, then served
 * from the derived cache so opening a section never waits on the checks.
 */
async function getBuiltReviewWarnings(companyId: string, refresh?: boolean): Promise<BuiltReviewWarnings> {
  const { payload } = await withProductReportCache({
    namespace: 'infor-review-warnings',
    companyId,
    keyParts: [REVIEW_WARNINGS_CACHE_VERSION, estYear()],
    refresh,
    dataVersion: () => buildReviewWarningsDataVersion(companyId),
    build: () => buildInforReviewWarnings(companyId),
  });
  return payload;
}

let ensureReviewTableOnce: Promise<void> | null = null;

async function ensureReviewedRowTable(): Promise<void> {
  if (!ensureReviewTableOnce) {
    ensureReviewTableOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CompanyInforReviewedRow" (
          "id" TEXT NOT NULL,
          "companyId" TEXT NOT NULL,
          "rowKey" TEXT NOT NULL,
          "section" TEXT NOT NULL,
          "issueCodes" JSONB NOT NULL DEFAULT '[]'::jsonb,
          "reviewedByUserId" TEXT,
          "reviewedByName" TEXT,
          "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "CompanyInforReviewedRow_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "CompanyInforReviewedRow_companyId_rowKey_key"
          ON "CompanyInforReviewedRow"("companyId", "rowKey")
      `);
    })().catch((error) => {
      ensureReviewTableOnce = null;
      throw error;
    });
  }
  await ensureReviewTableOnce;
}

type ReviewedRecord = {
  rowKey: string;
  issueCodes: unknown;
  reviewedByName: string | null;
  reviewedAt: Date;
};

async function loadReviewedRecords(companyId: string): Promise<Map<string, ReviewedRecord>> {
  await ensureReviewedRowTable();
  const records = await prisma.$queryRaw<ReviewedRecord[]>`
    SELECT "rowKey", "issueCodes", "reviewedByName", "reviewedAt"
    FROM "CompanyInforReviewedRow"
    WHERE "companyId" = ${companyId}
  `;
  return new Map(records.map((record) => [record.rowKey, record]));
}

function codeList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((code) => String(code)) : [];
}

function applyReviews(built: BuiltReviewWarnings, reviewed: Map<string, ReviewedRecord>): InforReviewWarnings {
  const rows: InforReviewRow[] = [];
  const reviewedRows: InforReviewedRow[] = [];
  for (const row of built.rows) {
    const record = reviewed.get(row.key);
    const reviewedCodes = new Set(codeList(record?.issueCodes));
    if (record && row.issueCodes.every((code) => reviewedCodes.has(code))) {
      reviewedRows.push({
        ...row,
        reviewedAt: new Date(record.reviewedAt).toISOString(),
        reviewedByName: record.reviewedByName,
      });
    } else {
      rows.push(row);
    }
  }
  return { ...built, rows, reviewedRows };
}

export async function getInforReviewWarnings(
  companyId: string,
  options: { refresh?: boolean } = {}
): Promise<InforReviewWarnings> {
  const [built, reviewed] = await Promise.all([
    getBuiltReviewWarnings(companyId, options.refresh),
    loadReviewedRecords(companyId),
  ]);
  return applyReviews(built, reviewed);
}

/**
 * Marks one warning row reviewed (hidden) or puts it back. The row is reviewed
 * for the gaps it has now; a different gap later brings it back.
 */
export async function setInforReviewRowReviewed(params: {
  companyId: string;
  rowKey: string;
  reviewed: boolean;
  userId: string;
}): Promise<InforReviewWarnings> {
  const { companyId, rowKey, reviewed, userId } = params;
  await ensureReviewedRowTable();
  if (!reviewed) {
    await prisma.$executeRaw`
      DELETE FROM "CompanyInforReviewedRow"
      WHERE "companyId" = ${companyId} AND "rowKey" = ${rowKey}
    `;
    return getInforReviewWarnings(companyId);
  }

  const built = await getBuiltReviewWarnings(companyId);
  const row = built.rows.find((candidate) => candidate.key === rowKey);
  if (!row) throw new Error('This row is no longer flagged. Refresh the page.');
  const existing = (await loadReviewedRecords(companyId)).get(rowKey);
  const codes = Array.from(new Set([...codeList(existing?.issueCodes), ...row.issueCodes]));
  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { name: true, email: true } })
    .catch(() => null);
  const reviewedByName = cleanText(user?.name) || cleanText(user?.email) || null;
  await prisma.$executeRaw`
    INSERT INTO "CompanyInforReviewedRow" (
      "id", "companyId", "rowKey", "section", "issueCodes", "reviewedByUserId", "reviewedByName", "reviewedAt"
    )
    VALUES (
      ${randomUUID()}, ${companyId}, ${rowKey}, ${row.section}, ${JSON.stringify(codes)}::jsonb,
      ${userId}, ${reviewedByName}, NOW()
    )
    ON CONFLICT ("companyId", "rowKey")
    DO UPDATE SET
      "issueCodes" = EXCLUDED."issueCodes",
      "reviewedByUserId" = EXCLUDED."reviewedByUserId",
      "reviewedByName" = EXCLUDED."reviewedByName",
      "reviewedAt" = NOW()
  `;
  return getInforReviewWarnings(companyId);
}
