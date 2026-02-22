import { NextRequest } from 'next/server';
import { resolveAuthorizedCompanyId } from '@/lib/infor-m3/request-context';

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
