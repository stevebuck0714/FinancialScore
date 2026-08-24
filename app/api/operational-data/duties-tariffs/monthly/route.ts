import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { isOperationalDataTypeAllowed } from '@/lib/operations/operational-dashboard-access';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function assertDutiesAccess(companyId: string): Promise<NextResponse | null> {
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(body.companyId || request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    const denied = await assertDutiesAccess(companyId);
    if (denied) return denied;

    const { loadMonthlyHtsDutyCogs, rebuildProgramAmountsIfLumped } = await import('@/lib/hts/apply-duty-cogs');
    await rebuildProgramAmountsIfLumped(companyId).catch(() => false);

    const vendorId = String(body.vendorId || '').trim();
    const vendorName = String(body.vendorName || '').trim();
    const unassigned = body.unassigned === true;
    let itemSkus: string[] | undefined;
    if (vendorId || vendorName || unassigned) {
      const { listCompanyItemDuties } = await import('@/lib/hts/item-duty-overlay');
      const { loadPrimaryVendorByItem } = await import('@/lib/operations/vendor-monthly-forecast-db');
      const [allItems, vendorByItem] = await Promise.all([
        listCompanyItemDuties(companyId, 'all'),
        loadPrimaryVendorByItem(companyId).catch(() => new Map()),
      ]);
      itemSkus = allItems
        .map((item) => String(item.itemSku || '').trim())
        .filter((sku) => {
          if (!sku) return false;
          const vendor = vendorByItem.get(sku.toUpperCase()) || vendorByItem.get(sku);
          if (unassigned) return !vendor?.vendorId && !vendor?.vendorName;
          if (vendorId) return String(vendor?.vendorId || '') === vendorId;
          return String(vendor?.vendorName || '') === vendorName;
        });
    }

    const monthly = await loadMonthlyHtsDutyCogs(companyId, itemSkus ? { itemSkus } : undefined);
    return NextResponse.json({
      ok: true,
      companyId,
      monthlyCogs: Array.from(monthly.values()),
    });
  } catch (error) {
    console.error('Duties & tariffs monthly summary failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load monthly tariff summary' },
      { status: 500 }
    );
  }
}
