import { NextRequest } from 'next/server';
import { resolveAuthorizedCompanyId } from '@/lib/infor-m3/request-context';
import { requireSiteAdmin } from '@/lib/tenant-security';

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getRequestedCompanyId(
  request: NextRequest,
  body?: Record<string, unknown>
): string | null {
  const fromBody = normalizeOptionalString(body?.companyId);
  if (fromBody) {
    return fromBody;
  }

  const fromQuery = normalizeOptionalString(request.nextUrl.searchParams.get('companyId'));
  return fromQuery || null;
}

export async function requireAuthorizedInforCompany(
  request: NextRequest,
  body?: Record<string, unknown>
): Promise<{ companyId: string }> {
  const requestedCompanyId = getRequestedCompanyId(request, body);
  const { companyId } = await resolveAuthorizedCompanyId(requestedCompanyId);
  return { companyId };
}

export async function requireSiteAdminAuthorizedInforCompany(
  request: NextRequest,
  body?: Record<string, unknown>
): Promise<{ companyId: string }> {
  const internalSecret = String(process.env.CRON_SECRET || '').trim();
  const workerSecret = String(request.headers.get('x-infor-sync-worker-secret') || '').trim();
  const allowDevBypass = !internalSecret && process.env.NODE_ENV === 'development' && Boolean(workerSecret);
  if ((internalSecret && workerSecret && workerSecret === internalSecret) || allowDevBypass) {
    const companyId = getRequestedCompanyId(request, body);
    if (!companyId) throw new Error('companyId is required');
    return { companyId };
  }
  await requireSiteAdmin();
  return requireAuthorizedInforCompany(request, body);
}
