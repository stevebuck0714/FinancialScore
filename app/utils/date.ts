const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateSafeUtc(raw: string | Date | null | undefined): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  const value = String(raw).trim();
  if (!value) return null;
  const match = DATE_ONLY_RE.exec(value);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return new Date(Date.UTC(year, Math.max(0, month - 1), day));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateSafeUtc(
  raw: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
): string {
  const parsed = parseDateSafeUtc(raw);
  if (!parsed) return 'N/A';
  return parsed.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
}

export function formatDateInputLabel(raw: string | Date | null | undefined): string {
  return formatDateSafeUtc(raw, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function toLocalInputDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

