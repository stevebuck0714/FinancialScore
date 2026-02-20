import { requireAuth, requireCompanyAccess, type UserContext } from '@/lib/tenant-security';

export async function resolveAuthorizedCompanyId(
  requestedCompanyId: string | null | undefined
): Promise<{ companyId: string; context: UserContext }> {
  const context = await requireAuth();
  const normalizedRequested = (requestedCompanyId || '').trim();

  if (normalizedRequested) {
    await requireCompanyAccess(normalizedRequested);
    return { companyId: normalizedRequested, context };
  }

  if (context.companyId) {
    await requireCompanyAccess(context.companyId);
    return { companyId: context.companyId, context };
  }

  throw new Error('Company ID is required for this request.');
}
