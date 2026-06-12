export type QuickBooksDesktopVariant = 'DESKTOP' | 'ENTERPRISE';

export const QUICKBOOKS_DESKTOP_SYSTEM = 'QUICKBOOKS_DESKTOP';
export const QUICKBOOKS_ENTERPRISE_SYSTEM = 'QUICKBOOKS_ENTERPRISE';

export function normalizeAccountingSystemKey(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

export function isQuickBooksDesktopFamily(value: unknown): boolean {
  const normalized = normalizeAccountingSystemKey(value);
  return normalized === QUICKBOOKS_DESKTOP_SYSTEM || normalized === QUICKBOOKS_ENTERPRISE_SYSTEM;
}

export function getQuickBooksDesktopVariant(value: unknown): QuickBooksDesktopVariant {
  return normalizeAccountingSystemKey(value) === QUICKBOOKS_ENTERPRISE_SYSTEM ? 'ENTERPRISE' : 'DESKTOP';
}

export function getQuickBooksDesktopFamilyLabel(value: unknown): string {
  return getQuickBooksDesktopVariant(value) === 'ENTERPRISE' ? 'QuickBooks Enterprise' : 'QuickBooks Desktop';
}
