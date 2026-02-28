import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { getInforM3CredentialsForCompany } from '@/lib/infor-m3/credentials';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);
    const credentials = await getInforM3CredentialsForCompany(companyId);

    return NextResponse.json({
      ok: true,
      companyId,
      credentials,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to load Infor M3 credentials',
        details: message,
      },
      { status }
    );
  }
}
