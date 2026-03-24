import { NextRequest, NextResponse } from 'next/server';
import { getRequestedCompanyId } from '@/lib/infor-m3/route-guards';
import { getInforM3CredentialsForCompany } from '@/lib/infor-m3/credentials';
import { requireSiteAdmin } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const requestedCompanyId = getRequestedCompanyId(request);
    if (!requestedCompanyId) {
      return NextResponse.json(
        { error: 'companyId is required.' },
        { status: 400 }
      );
    }
    await requireSiteAdmin();
    const companyId = requestedCompanyId;
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
