import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { isOperationalDataTypeAllowed } from '@/lib/operations/operational-dashboard-access';
import {
  getCompanyProductMarginSettings,
  updateCompanyProductMarginSettings,
} from '@/lib/operations/product-margin-settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function assertProductMarginAccess(companyId: string): Promise<NextResponse | null> {
  let authContext;
  try {
    authContext = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
  }

  const hasAccess = await validateCompanyAccess(companyId);
  if (!hasAccess) {
    await auditForbiddenAccess('OperationalData', companyId, 'READ:products');
    return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
  }

  if (authContext.role !== 'USER') return null;

  const { default: prisma } = await import('@/lib/prisma');
  const membership = await prisma.userCompanyAccess.findUnique({
    where: { userId_companyId: { userId: authContext.userId, companyId } },
    select: {
      companyRole: true,
      sidebarAccess: true,
      operationalDashboardAccess: true,
      user: {
        select: { companyRole: true, sidebarAccess: true, operationalDashboardAccess: true },
      },
    },
  });
  const companyRole = String(membership?.companyRole || membership?.user?.companyRole || '').toLowerCase();
  const sidebarAccess = membership?.sidebarAccess ?? membership?.user?.sidebarAccess;
  const canAccessOperationalDashboard =
    companyRole === 'admin' || !Array.isArray(sidebarAccess) || sidebarAccess.includes('operational-dashboard');
  const operationalDashboardAccess =
    membership?.operationalDashboardAccess ?? membership?.user?.operationalDashboardAccess;
  if (!canAccessOperationalDashboard || !isOperationalDataTypeAllowed(operationalDashboardAccess, 'products')) {
    await auditForbiddenAccess('OperationalData', companyId, 'WRITE:products');
    return NextResponse.json(
      { error: 'Forbidden: Operational Dashboard page access denied' },
      { status: 403 }
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    const denied = await assertProductMarginAccess(companyId);
    if (denied) return denied;

    const settings = await getCompanyProductMarginSettings(companyId);
    return NextResponse.json({ ok: true, ...settings });
  } catch (error) {
    console.error('Product margin settings load failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load product margin settings' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(body.companyId || request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    const denied = await assertProductMarginAccess(companyId);
    if (denied) return denied;

    const settings = await updateCompanyProductMarginSettings(companyId, body.operatingExpensePct);
    return NextResponse.json({ ok: true, ...settings });
  } catch (error) {
    console.error('Product margin settings save failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save product margin settings' },
      { status: 400 }
    );
  }
}
