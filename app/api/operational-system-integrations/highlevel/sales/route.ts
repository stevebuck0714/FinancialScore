import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getOperationalSystemConnection } from '@/lib/operational/operational-system-connections';
import { HIGHLEVEL_SOURCE_CODE, highLevelCredentialsFromConnection } from '@/lib/highlevel';
import { loadHighLevelSalesData } from '@/lib/crm/highlevel-sales';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 });
    if (!await validateCompanyAccess(companyId)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
    const connection = await getOperationalSystemConnection(companyId, 'HIGHLEVEL', HIGHLEVEL_SOURCE_CODE);
    const credentials = connection?.status === 'ACTIVE' ? highLevelCredentialsFromConnection(connection) : null;
    if (!credentials) {
      return NextResponse.json({ ok: false, error: 'HighLevel is not connected for this company.' }, { status: 409 });
    }
    return NextResponse.json(await loadHighLevelSalesData(credentials, connection?.connectionMetadata));
  } catch (error: any) {
    const message = error?.message || 'Failed to load HighLevel sales data';
    return NextResponse.json({ ok: false, error: message }, { status: message.includes('Forbidden') ? 403 : 500 });
  }
}
