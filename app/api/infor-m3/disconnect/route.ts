import { NextRequest, NextResponse } from 'next/server';
import { clearInforM3CredentialsForCompany } from '@/lib/infor-m3/credentials';
import { resolveAuthorizedCompanyId } from '@/lib/infor-m3/request-context';

export const dynamic = 'force-dynamic';

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requestedCompanyId = normalizeString(body.companyId) || request.nextUrl.searchParams.get('companyId');
    const { companyId } = await resolveAuthorizedCompanyId(requestedCompanyId);

    await clearInforM3CredentialsForCompany(companyId);

    return NextResponse.json({
      ok: true,
      companyId,
      message: 'Infor M3 credentials removed for this company.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to disconnect Infor M3',
        details: message,
      },
      { status }
    );
  }
}
