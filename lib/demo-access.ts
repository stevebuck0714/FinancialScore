const DEFAULT_DEMO_AFFILIATE_CODE = 'SEVENDAYDEMO';
const DEFAULT_DEMO_DURATION_DAYS = 7;

export type DemoCompanyLike = {
  affiliateCode?: string | null;
  subscriptionStatus?: string | null;
  subscriptionStartDate?: Date | string | null;
  nextBillingDate?: Date | string | null;
};

export function getDemoAffiliateCode(): string {
  return String(process.env.DEMO_AFFILIATE_CODE || DEFAULT_DEMO_AFFILIATE_CODE)
    .trim()
    .toUpperCase();
}

export function getDemoDurationDays(): number {
  const raw = Number(process.env.DEMO_DURATION_DAYS || DEFAULT_DEMO_DURATION_DAYS);
  if (!Number.isFinite(raw) || raw < 1 || raw > 30) return DEFAULT_DEMO_DURATION_DAYS;
  return Math.floor(raw);
}

export function isDemoAffiliateCode(code: unknown): boolean {
  return String(code || '').trim().toUpperCase() === getDemoAffiliateCode();
}

export function getDemoExpiryDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + getDemoDurationDays() * 24 * 60 * 60 * 1000);
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function isDemoCompany(company: DemoCompanyLike | null | undefined): boolean {
  if (!company) return false;
  const status = String(company.subscriptionStatus || '').toLowerCase();
  if (status) return status.startsWith('demo');
  return isDemoAffiliateCode(company.affiliateCode);
}

export function isDemoExpired(company: DemoCompanyLike | null | undefined, now: Date = new Date()): boolean {
  if (!isDemoCompany(company)) return false;
  const explicitExpired = String(company?.subscriptionStatus || '').toLowerCase() === 'demo_expired';
  if (explicitExpired) return true;
  const expiresAt = toDate(company?.nextBillingDate);
  if (!expiresAt) return false;
  return now.getTime() > expiresAt.getTime();
}

export function shouldBypassMfaForDemo(
  company: DemoCompanyLike | null | undefined,
  now: Date = new Date()
): boolean {
  return isDemoCompany(company) && !isDemoExpired(company, now);
}
