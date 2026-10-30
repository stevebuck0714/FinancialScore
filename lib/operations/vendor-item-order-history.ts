import prisma from '@/lib/prisma';
import { readLatestDerivedApiCache, writeDerivedApiCache } from '@/lib/derived-api-cache';

const CACHE_NAMESPACE = 'vendor-item-order-history-v1';
const CACHE_TTL_SECONDS = 400 * 24 * 60 * 60;
const RAW_PAGE_SIZE = 5000;
const PO_PROGRAMS = ['SLPos', 'SLPoItems'];

export type VendorItemOrder = {
  poNumber: string;
  line: string;
  orderDate: string | null;
  quantity: number | null;
  receivedQty: number | null;
  unitPrice: number | null;
  dueDate: string | null;
  customer: string;
  status: string;
};

export type VendorItemOrderHistoryItem = {
  itemSku: string;
  description: string;
  orderCount: number;
  totalQty: number;
  latestOrderDate: string | null;
  orders: VendorItemOrder[];
};

export type VendorItemOrderHistoryCache = {
  syncRunId: string;
  builtAt: string;
  vendors: Array<{ vendorId: string; vendorName: string; orderCount: number }>;
  itemsByVendor: Record<string, VendorItemOrderHistoryItem[]>;
};

type Payload = Record<string, unknown>;

function text(row: Payload, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return '';
}

function number(row: Payload, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** CSI dates are calendar dates (`YYYYMMDD ...`); keep the day as-is. */
function date(value: string): string | null {
  const compact = value.replace(/\s+/g, '').match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : null;
}

function asPayload(value: unknown): Payload | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Payload) : null;
}

async function loadRunPayloads(companyId: string, syncRunId: string, miProgram: string): Promise<Payload[]> {
  const payloads: Payload[] = [];
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.inforRawRecord.findMany({
      where: { companyId, syncRunId, miProgram },
      select: { id: true, payload: true },
      orderBy: { id: 'asc' },
      take: RAW_PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const row of rows) {
      const payload = asPayload(row.payload);
      if (payload) payloads.push(payload);
    }
    if (rows.length < RAW_PAGE_SIZE) break;
    cursor = rows[rows.length - 1].id;
  }
  return payloads;
}

/** Newest completed sync run that imported CSI purchase-order headers. */
async function findLatestCompletedPoRun(companyId: string): Promise<string | null> {
  const runs = await prisma.inforSyncRun.findMany({
    where: { companyId, status: 'done' },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  for (const run of runs) {
    const header = await prisma.inforRawRecord.findFirst({
      where: { companyId, syncRunId: run.id, miProgram: 'SLPos' },
      select: { id: true },
    });
    if (header) return run.id;
  }
  return null;
}

export async function buildVendorItemOrderHistory(
  companyId: string,
  syncRunId: string
): Promise<VendorItemOrderHistoryCache> {
  const [headerRows, lineRows] = await Promise.all([
    loadRunPayloads(companyId, syncRunId, 'SLPos'),
    loadRunPayloads(companyId, syncRunId, 'SLPoItems'),
  ]);

  const headers = new Map<string, { vendorKey: string; orderDate: string | null; customer: string; status: string }>();
  const vendors = new Map<string, { vendorId: string; vendorName: string; orderCount: number }>();
  for (const payload of headerRows) {
    const poNumber = text(payload, 'PoNum', 'PONum', 'PoNumber');
    if (!poNumber || headers.has(poNumber)) continue;
    const vendorId = text(payload, 'VendNum', 'VendorNum', 'Vendor');
    const vendorName = text(payload, 'VendName', 'VendAddrName', 'VendaddrName', 'VendorName', 'Name');
    const vendorKey = vendorId || vendorName || 'UNASSIGNED';
    headers.set(poNumber, {
      vendorKey,
      orderDate: date(text(payload, 'OrderDate', 'PoDate')),
      customer: text(payload, 'CustNum', 'CustName', 'DerCustNoName', 'Customer'),
      status: text(payload, 'Stat', 'Status'),
    });
    const vendor = vendors.get(vendorKey) || {
      vendorId: vendorKey,
      vendorName: vendorName || vendorId || 'Unassigned vendor',
      orderCount: 0,
    };
    vendor.orderCount += 1;
    vendors.set(vendorKey, vendor);
  }

  const itemsByVendor = new Map<string, Map<string, VendorItemOrderHistoryItem>>();
  const seenLines = new Set<string>();
  for (const payload of lineRows) {
    const poNumber = text(payload, 'PoNum', 'PONum', 'PoNumber');
    const header = headers.get(poNumber);
    const itemSku = text(payload, 'Item', 'ItemNum', 'ItemId');
    if (!header || !itemSku) continue;
    const line = text(payload, 'PoLine', 'Line');
    const release = text(payload, 'PoRelease');
    const lineKey = `${poNumber}|${line}|${release}`;
    if (seenLines.has(lineKey)) continue;
    seenLines.add(lineKey);

    const vendorItems = itemsByVendor.get(header.vendorKey) || new Map<string, VendorItemOrderHistoryItem>();
    const item = vendorItems.get(itemSku) || {
      itemSku,
      description: text(payload, 'Description', 'ItemDescription'),
      orderCount: 0,
      totalQty: 0,
      latestOrderDate: null,
      orders: [],
    };
    const quantity = number(payload, 'QtyOrdered', 'QtyOrderedConv', 'Qty');
    item.orderCount += 1;
    item.totalQty += quantity || 0;
    if (header.orderDate && (!item.latestOrderDate || header.orderDate > item.latestOrderDate)) {
      item.latestOrderDate = header.orderDate;
    }
    item.orders.push({
      poNumber,
      line: release && release !== '0' ? `${line}-${release}` : line,
      orderDate: header.orderDate,
      quantity,
      receivedQty: number(payload, 'QtyReceived', 'QtyRcvd'),
      unitPrice: number(payload, 'ItemCost'),
      dueDate: date(text(payload, 'DueDate', 'PromiseDate')),
      customer: header.customer,
      status: text(payload, 'Stat', 'Status') || header.status,
    });
    vendorItems.set(itemSku, item);
    itemsByVendor.set(header.vendorKey, vendorItems);
  }

  const itemsByVendorRecord: Record<string, VendorItemOrderHistoryItem[]> = {};
  for (const [vendorKey, vendorItems] of itemsByVendor) {
    const items = [...vendorItems.values()];
    for (const item of items) {
      item.orders.sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || '')));
    }
    itemsByVendorRecord[vendorKey] = items.sort(
      (a, b) => b.totalQty - a.totalQty || a.itemSku.localeCompare(b.itemSku)
    );
  }

  return {
    syncRunId,
    builtAt: new Date().toISOString(),
    vendors: [...vendors.values()]
      .filter((vendor) => itemsByVendorRecord[vendor.vendorId]?.length)
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName)),
    itemsByVendor: itemsByVendorRecord,
  };
}

async function writeCache(companyId: string, payload: VendorItemOrderHistoryCache): Promise<void> {
  await writeDerivedApiCache({
    namespace: CACHE_NAMESPACE,
    cacheKey: companyId,
    dataVersion: payload.syncRunId,
    payload,
    ttlSeconds: CACHE_TTL_SECONDS,
  });
}

/** Rebuilds the cache when a completed sync run imported purchase orders. */
export async function refreshVendorItemOrderHistoryAfterSync(companyId: string, syncRunId: string): Promise<boolean> {
  const imported = await prisma.inforRawRecord.findFirst({
    where: { companyId, syncRunId, miProgram: { in: PO_PROGRAMS } },
    select: { id: true },
  });
  if (!imported) return false;
  await writeCache(companyId, await buildVendorItemOrderHistory(companyId, syncRunId));
  return true;
}

/** Serves the cached history, building it once from the latest completed PO run on a miss. */
export async function loadVendorItemOrderHistory(companyId: string): Promise<VendorItemOrderHistoryCache | null> {
  const cached = await readLatestDerivedApiCache<VendorItemOrderHistoryCache>({
    namespace: CACHE_NAMESPACE,
    cacheKey: companyId,
  });
  if (cached) return cached;
  const syncRunId = await findLatestCompletedPoRun(companyId);
  if (!syncRunId) return null;
  const built = await buildVendorItemOrderHistory(companyId, syncRunId);
  await writeCache(companyId, built);
  return built;
}
