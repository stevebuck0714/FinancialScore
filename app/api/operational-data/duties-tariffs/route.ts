import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { isOperationalDataTypeAllowed } from '@/lib/operations/operational-dashboard-access';
import {
  ensureCompanyItemDutyTable,
  listCompanyItemDuties,
  refreshCompanyItemDuties,
  updateCompanyItemDuties,
  type CompanyItemDutyPatch,
  type CompanyItemDutyRow,
} from '@/lib/hts/item-duty-overlay';
import { loadPrimaryVendorByItem } from '@/lib/operations/vendor-monthly-forecast-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function appliedCogsPayload(companyId: string) {
  const { loadMonthlyHtsDutyCogs } = await import('@/lib/hts/apply-duty-cogs');
  const monthly = await loadMonthlyHtsDutyCogs(companyId).catch(() => new Map());
  return Array.from(monthly.values());
}

async function rebuildAppliedCogs(companyId: string) {
  const { rebuildCompanyItemDutyApplications } = await import('@/lib/hts/apply-duty-cogs');
  return rebuildCompanyItemDutyApplications(companyId);
}

async function withVendorNames(companyId: string, items: CompanyItemDutyRow[]): Promise<CompanyItemDutyRow[]> {
  const vendorByItem = await loadPrimaryVendorByItem(companyId).catch(() => new Map());
  return items.map((item) => {
    const sku = String(item.itemSku || '').trim();
    const vendor = vendorByItem.get(sku.toUpperCase()) || vendorByItem.get(sku);
    return {
      ...item,
      vendorId: vendor?.vendorId || null,
      vendorName: vendor?.vendorName || null,
    };
  });
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
    await ensureCompanyItemDutyTable();
    const sync = await refreshCompanyItemDuties(companyId);
    const allItems = await withVendorNames(companyId, await listCompanyItemDuties(companyId, 'all'));
    const items = filter === 'needs_hts' ? allItems.filter((item) => item.needsHtsInput) : allItems;
    const spreadsheetItems = allItems.filter(
      (item) => item.htsInputSource === 'spreadsheet' || Boolean(item.lastSpreadsheetSeedAt)
    ).length;
    const monthlyCogs = await appliedCogsPayload(companyId);
    return NextResponse.json({
      ok: true,
      companyId,
      filter,
      spreadsheetItems,
      discovered: sync.discovered,
      missingHtsCount: allItems.filter((item) => item.needsHtsInput).length,
      items,
      monthlyCogs,
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
    const items = await withVendorNames(companyId, await updateCompanyItemDuties(companyId, patches));
    const applied = await rebuildAppliedCogs(companyId).catch((error) => {
      console.warn('HTS duty COGS rebuild after save skipped:', error);
      return null;
    });
    const monthlyCogs = await appliedCogsPayload(companyId);
    return NextResponse.json({ ok: true, companyId, updated: items.length, items, applied, monthlyCogs });
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

    const asOfDate = String(body.asOfDate || request.nextUrl.searchParams.get('asOfDate') || '').trim() || null;
    const { refreshCompanyItemDutyRates } = await import('@/lib/hts/refresh-item-duty-rates');
    const result = await refreshCompanyItemDutyRates(companyId, asOfDate);
    const applied = await rebuildAppliedCogs(companyId).catch((error) => {
      console.warn('HTS duty COGS rebuild after rate refresh skipped:', error);
      return null;
    });
    const items = await withVendorNames(companyId, await listCompanyItemDuties(companyId, 'all'));
    const monthlyCogs = await appliedCogsPayload(companyId);
    return NextResponse.json({ ok: true, companyId, ...result, items, applied, monthlyCogs });
  } catch (error) {
    console.error('Duties & tariffs rate refresh failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refresh HTS rates' },
      { status: 500 }
    );
  }
}
