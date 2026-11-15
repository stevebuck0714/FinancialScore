import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { isOperationalDataTypeAllowed } from '@/lib/operations/operational-dashboard-access';
import { getInforReviewWarnings, setInforReviewRowReviewed } from '@/lib/operations/infor-new-identities';
import { ATLANTIC_PRECISION_COMPANY_ID } from '@/lib/operations/product-group-report-warmup';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAtlanticCronCacheWarmup(request: NextRequest, companyId: string): boolean {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const isCacheWarmup = ['1', 'true', 'yes'].includes(
    String(request.nextUrl.searchParams.get('cacheWarmup') || '').trim().toLowerCase()
  );
  return Boolean(
    cronSecret &&
      request.headers.get('authorization') === `Bearer ${cronSecret}` &&
      isCacheWarmup &&
      companyId === ATLANTIC_PRECISION_COMPANY_ID
  );
}

async function assertAccess(companyId: string): Promise<NextResponse | null> {
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
    await auditForbiddenAccess('OperationalData', companyId, 'READ:products');
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
    if (!isAtlanticCronCacheWarmup(request, companyId)) {
      const denied = await assertAccess(companyId);
      if (denied) return denied;
    }

    const refresh = ['1', 'true', 'yes'].includes(
      String(request.nextUrl.searchParams.get('refresh') || '').trim().toLowerCase()
    );
    const result = await getInforReviewWarnings(companyId, { refresh });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('Infor review warnings load failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load Infor review warnings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const companyId = String(body?.companyId || '').trim();
    const rowKey = String(body?.rowKey || '').trim();
    if (!companyId || !rowKey) {
      return NextResponse.json({ error: 'Company ID and row are required' }, { status: 400 });
    }
    const denied = await assertAccess(companyId);
    if (denied) return denied;
    const { userId } = await requireAuth();

    const result = await setInforReviewRowReviewed({
      companyId,
      rowKey,
      reviewed: body?.reviewed !== false,
      userId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('Infor review warnings update failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update the review' },
      { status: 500 }
    );
  }
}
