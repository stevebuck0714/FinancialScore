import { NextRequest, NextResponse } from 'next/server';
import { clearInforM3CredentialsForCompany } from '@/lib/infor-m3/credentials';
import { requireAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireAuthorizedInforCompany(request, body);

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
