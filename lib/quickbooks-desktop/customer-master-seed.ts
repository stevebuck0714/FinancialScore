export type QuickBooksDesktopCustomerMasterRecord = {
  customerId: string;
  customerName: string;
  isActive: boolean;
};

const ID_KEYS = ['ListID', 'listId', 'listID', 'customerId', 'id'];
const NAME_KEYS = ['FullName', 'fullName', 'Name', 'name', 'customerName'];
const ACTIVE_KEYS = ['IsActive', 'isActive', 'active'];

function readText(record: Record<string, unknown>, keys: string[]): string {
  const byLowerKey = new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of keys) {
    const value = record[key] ?? byLowerKey.get(key.toLowerCase());
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function readActive(record: Record<string, unknown>): boolean {
  const value = readText(record, ACTIVE_KEYS).toLowerCase();
  if (!value) return true;
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Extract the QBD customer master from a financial-push payload. CustomerQuery
 * uses ActiveStatus=All, so this is the authoritative active/inactive state.
 */
export function extractQuickBooksDesktopCustomerMaster(
  payload: unknown,
): QuickBooksDesktopCustomerMasterRecord[] {
  const root = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const query = root.CustomerQuery ?? root.customerQuery;
  const queryRecord = query && typeof query === 'object' && !Array.isArray(query)
    ? query as Record<string, unknown>
    : {};
  const customers = queryRecord.CustomerRet ?? queryRecord.customerRet;
  const queue = Array.isArray(customers) ? [...customers] : customers ? [customers] : [];
  const deduped = new Map<string, QuickBooksDesktopCustomerMasterRecord>();

  while (queue.length > 0) {
    const value = queue.shift();
    if (Array.isArray(value)) {
      queue.push(...value);
      continue;
    }
    if (!value || typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    const customerId = readText(record, ID_KEYS);
    const customerName = readText(record, NAME_KEYS);
    if (!customerId || !customerName) continue;
    deduped.set(customerId.toLowerCase(), { customerId, customerName, isActive: readActive(record) });
  }

  return [...deduped.values()];
}
