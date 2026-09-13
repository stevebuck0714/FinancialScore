import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { isOperationalDataTypeAllowed } from '@/lib/operations/operational-dashboard-access';
import {
  ensureCompanyItemDutyTable,
  updateCompanyItemDuties,
  type CompanyItemDutyPatch,
} from '@/lib/hts/item-duty-overlay';
import {
  buildDutiesTariffsPayload,
  readDutiesTariffsCache,
  writeDutiesTariffsCache,
} from '@/lib/hts/duties-tariffs-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function rebuildAppliedCogs(companyId: string) {
  const { rebuildCompanyItemDutyApplications } = await import('@/lib/hts/apply-duty-cogs');
  return rebuildCompanyItemDutyApplications(companyId);
}

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

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    const denied = await assertDutiesAccess(companyId);
    if (denied) return denied;

    const filter = request.nextUrl.searchParams.get('filter') === 'needs_hts' ? 'needs_hts' : 'all';
    // Page reads must be read-only: the overnight sync warmup owns workbook
    // seeding, identity discovery, and the full cached report build.
    let payload = await readDutiesTariffsCache(companyId);
    if (!payload) {
      payload = await buildDutiesTariffsPayload(companyId);
      await writeDutiesTariffsCache(companyId, payload).catch((error) => {
        console.warn('Duties & Tariffs cache write after cold read failed:', error);
      });
    }
    const allItems = payload.items;
    const items = filter === 'needs_hts' ? allItems.filter((item) => item.needsHtsInput) : allItems;
    return NextResponse.json({
      ok: true,
      companyId,
      filter,
      spreadsheetItems: payload.spreadsheetItems,
      discovered: payload.discovered,
      missingHtsCount: payload.missingHtsCount,
      items,
      monthlyCogs: payload.monthlyCogs,
    });
  } catch (error) {
    console.error('Duties & tariffs list failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load duties overlay' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(body.companyId || request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    const denied = await assertDutiesAccess(companyId);
    if (denied) return denied;

    const patches = Array.isArray(body.items) ? (body.items as CompanyItemDutyPatch[]) : [];
    if (!patches.length) return NextResponse.json({ error: 'items are required' }, { status: 400 });

    await ensureCompanyItemDutyTable();
    await updateCompanyItemDuties(companyId, patches);
    const applied = await rebuildAppliedCogs(companyId).catch((error) => {
      console.warn('HTS duty COGS rebuild after save skipped:', error);
      return null;
    });
    const payload = await buildDutiesTariffsPayload(companyId);
    await writeDutiesTariffsCache(companyId, payload);
    return NextResponse.json({ ok: true, companyId, updated: patches.length, items: payload.items, applied, monthlyCogs: payload.monthlyCogs });
  } catch (error) {
    console.error('Duties & tariffs update failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save duties overlay' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = String(body.companyId || request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    const denied = await assertDutiesAccess(companyId);
    if (denied) return denied;

    const action = String(body.action || request.nextUrl.searchParams.get('action') || '').trim();
    if (action === 'rebuild-hts-from-infor') {
      const { clearDutyHtsIdentity, refreshCompanyItemDuties } = await import('@/lib/hts/item-duty-overlay');
      const cleared = await clearDutyHtsIdentity(companyId);
      const refreshed = await refreshCompanyItemDuties(companyId);
      const resetPayload = await buildDutiesTariffsPayload(companyId);
      await writeDutiesTariffsCache(companyId, resetPayload);
      return NextResponse.json({
        ok: true,
        companyId,
        action,
        cleared,
        ...refreshed,
        items: resetPayload.items,
        monthlyCogs: resetPayload.monthlyCogs,
      });
    }

    const asOfDate = String(body.asOfDate || request.nextUrl.searchParams.get('asOfDate') || '').trim() || null;
    const { refreshCompanyItemDutyRates } = await import('@/lib/hts/refresh-item-duty-rates');
    const result = await refreshCompanyItemDutyRates(companyId, asOfDate);
    const applied = await rebuildAppliedCogs(companyId).catch((error) => {
      console.warn('HTS duty COGS rebuild after rate refresh skipped:', error);
      return null;
    });
    const payload = await buildDutiesTariffsPayload(companyId);
    await writeDutiesTariffsCache(companyId, payload);
    return NextResponse.json({ ok: true, companyId, ...result, items: payload.items, applied, monthlyCogs: payload.monthlyCogs });
  } catch (error) {
    console.error('Duties & tariffs rate refresh failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refresh HTS rates' },
      { status: 500 }
    );
  }
}
