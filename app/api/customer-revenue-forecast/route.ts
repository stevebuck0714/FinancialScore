import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { isOperationalDataTypeAllowed } from '@/lib/operations/operational-dashboard-access';
import { filterActiveCustomerRows } from '@/lib/accounting/active-customer-filter';

export const dynamic = 'force-dynamic';

type BasisMode = 'cash' | 'accrual';

function asBasisMode(value: unknown): BasisMode {
  return value === 'accrual' ? 'accrual' : 'cash';
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function scopedPayload(value: unknown, basisMode: BasisMode): Record<string, unknown> {
  const payload = asObject(value);
  if (!Object.prototype.hasOwnProperty.call(payload, 'cash') && !Object.prototype.hasOwnProperty.call(payload, 'accrual')) {
    return payload;
  }
  return asObject(payload[basisMode]);
}

function mergeScopedPayload(existing: unknown, next: Record<string, unknown>, basisMode: BasisMode) {
  const payload = asObject(existing);
  const hasScopes = Object.prototype.hasOwnProperty.call(payload, 'cash') || Object.prototype.hasOwnProperty.call(payload, 'accrual');
  if (hasScopes) return { ...payload, [basisMode]: next };
  return basisMode === 'cash' ? { cash: next } : { cash: payload, accrual: next };
}

async function assertCustomerForecastAccess(companyId: string, action: 'READ' | 'WRITE'): Promise<NextResponse | null> {
  let authContext;
  try {
    authContext = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
  }
  if (!await validateCompanyAccess(companyId)) {
    await auditForbiddenAccess('OperationalData', companyId, `${action}:customers`);
    return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
  }
  if (authContext.role !== 'USER') return null;

  const membership = await prisma.userCompanyAccess.findUnique({
    where: { userId_companyId: { userId: authContext.userId, companyId } },
    select: {
      companyRole: true,
      sidebarAccess: true,
      operationalDashboardAccess: true,
      user: { select: { companyRole: true, sidebarAccess: true, operationalDashboardAccess: true } },
    },
  });
  const companyRole = String(membership?.companyRole || membership?.user?.companyRole || '').toLowerCase();
  const sidebarAccess = membership?.sidebarAccess ?? membership?.user?.sidebarAccess;
  const canAccessOperationalDashboard =
    companyRole === 'admin' || !Array.isArray(sidebarAccess) || sidebarAccess.includes('operational-dashboard');
  const operationalDashboardAccess =
    membership?.operationalDashboardAccess ?? membership?.user?.operationalDashboardAccess;
  if (!canAccessOperationalDashboard || !isOperationalDataTypeAllowed(operationalDashboardAccess, 'customers')) {
    await auditForbiddenAccess('OperationalData', companyId, `${action}:customers`);
    return NextResponse.json({ error: 'Forbidden: Operational Dashboard page access denied' }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = String(searchParams.get('companyId') || '').trim();
    const basisMode = asBasisMode(searchParams.get('basisMode'));
    if (!companyId) return NextResponse.json({ error: 'Missing companyId parameter' }, { status: 400 });
    const denied = await assertCustomerForecastAccess(companyId, 'READ');
    if (denied) return denied;

    const [settings, actuals] = await Promise.all([
      prisma.financialForecastInputSettings.findUnique({
        where: { companyId },
        select: { revenueGrowthByRow: true, updatedAt: true },
      }),
      prisma.customerSalesSnapshot.findMany({
        where: {
          companyId,
          frequency: 'monthly',
          snapshotDate: { gte: new Date(new Date().getUTCFullYear() - 3, 0, 1) },
        },
        select: {
          snapshotDate: true,
          customerId: true,
          customerName: true,
          revenue: true,
          invoiceCount: true,
        },
        orderBy: [{ snapshotDate: 'asc' }, { customerName: 'asc' }],
        take: 100000,
      }),
    ]);
    const activeActuals = await filterActiveCustomerRows(companyId, actuals);
    const revenueInputs = scopedPayload(settings?.revenueGrowthByRow, basisMode);
    const forecast = asObject(revenueInputs.__customerRevenueForecast);

    return NextResponse.json({
      forecast,
      updatedAt: settings?.updatedAt || null,
      actuals: activeActuals.map((row) => ({
        monthKey: row.snapshotDate.toISOString().slice(0, 7),
        customerId: row.customerId || '',
        customerName: row.customerName,
        revenue: Number(row.revenue || 0),
        invoiceCount: Number(row.invoiceCount || 0),
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to load customer revenue forecast', details: error?.message || 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const basisMode = asBasisMode(body?.basisMode);
    const forecast = asObject(body?.forecast);
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
    const denied = await assertCustomerForecastAccess(companyId, 'WRITE');
    if (denied) return denied;

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const existing = await prisma.financialForecastInputSettings.findUnique({
      where: { companyId },
      select: { revenueGrowthByRow: true, cogsPctByRow: true, opexPctByRow: true },
    });
    const basisRevenueInputs = scopedPayload(existing?.revenueGrowthByRow, basisMode);
    const nextRevenueInputs = { ...basisRevenueInputs, __customerRevenueForecast: forecast };
    const revenueGrowthByRow = mergeScopedPayload(existing?.revenueGrowthByRow, nextRevenueInputs, basisMode);

    const saved = await prisma.financialForecastInputSettings.upsert({
      where: { companyId },
      create: {
        id: crypto.randomUUID(),
        companyId,
        revenueGrowthByRow: revenueGrowthByRow as any,
        cogsPctByRow: existing?.cogsPctByRow || {},
        opexPctByRow: existing?.opexPctByRow || {},
      },
      update: { revenueGrowthByRow: revenueGrowthByRow as any },
      select: { updatedAt: true },
    });

    return NextResponse.json({ success: true, updatedAt: saved.updatedAt });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to save customer revenue forecast', details: error?.message || 'Unknown error' }, { status: 500 });
  }
}
