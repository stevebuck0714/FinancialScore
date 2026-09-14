import prisma from '@/lib/prisma';
import type { QuickBooksDesktopCustomerMasterRecord } from '@/lib/quickbooks-desktop/customer-master-seed';

type CustomerRow = {
  customerId?: string | null;
  customerName?: string | null;
};

type ActiveCustomerKeys = {
  enabled: boolean;
  ids: Set<string>;
  names: Set<string>;
};

function normalize(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

/**
 * Returns QBD active customer keys when a CustomerQuery master snapshot has
 * been stored. Until a master snapshot exists, filtering is disabled so a
 * partial or legacy sync cannot hide every customer.
 */
export async function loadActiveCustomerKeys(companyId: string): Promise<ActiveCustomerKeys> {
  const connection = await prisma.accountingConnection.findUnique({
    where: { companyId_platform: { companyId, platform: 'QUICKBOOKS' } },
    select: { connectionMetadata: true },
  });
  const metadata = connection?.connectionMetadata as Record<string, unknown> | null;
  const snapshot = Array.isArray(metadata?.quickbooksDesktopCustomerMasterSnapshot)
    ? metadata.quickbooksDesktopCustomerMasterSnapshot as QuickBooksDesktopCustomerMasterRecord[]
    : [];
  if (snapshot.length === 0) return { enabled: false, ids: new Set(), names: new Set() };

  return {
    enabled: true,
    ids: new Set(snapshot.filter((customer) => customer.isActive).map((customer) => normalize(customer.customerId))),
    names: new Set(snapshot.filter((customer) => customer.isActive).map((customer) => normalize(customer.customerName))),
  };
}

export function isActiveCustomerRow(row: CustomerRow, keys: ActiveCustomerKeys): boolean {
  if (!keys.enabled) return true;
  const id = normalize(row.customerId);
  if (id) return keys.ids.has(id);
  const name = normalize(row.customerName);
  return name ? keys.names.has(name) : false;
}

export async function filterActiveCustomerRows<T extends CustomerRow>(
  companyId: string,
  rows: T[],
): Promise<T[]> {
  const keys = await loadActiveCustomerKeys(companyId);
  return rows.filter((row) => isActiveCustomerRow(row, keys));
}
