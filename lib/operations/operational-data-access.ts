import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { isOperationalDataTypeAllowed } from '@/lib/operations/operational-dashboard-access';

/**
 * Same read checks as /api/operational-data for one report type: signed in,
 * access to the company, and (for company users) the Operational Dashboard
 * page plus that report's permission. Returns a response when denied.
 */
export async function assertOperationalDataTypeAccess(companyId: string, dataType: string): Promise<NextResponse | null> {
  let authContext;
  try {
    authContext = await requireAuth();
  } catch {
    authContext = null;
  }
  if (!authContext) {
    return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
  }

  if (!(await validateCompanyAccess(companyId))) {
    await auditForbiddenAccess('OperationalData', companyId, `READ:${dataType}`);
    return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
  }

  if (authContext.role !== 'USER') return null;

  const access = { companyRole: true, sidebarAccess: true, operationalDashboardAccess: true } as const;
  const membership = await prisma.userCompanyAccess.findUnique({
    where: { userId_companyId: { userId: authContext.userId, companyId } },
    select: { ...access, user: { select: access } },
  });
  const legacyUser = membership ? null : await prisma.user.findUnique({ where: { id: authContext.userId }, select: access });
  const companyRole = String(membership?.companyRole || membership?.user?.companyRole || legacyUser?.companyRole || '').toLowerCase();
  const sidebarAccess = membership?.sidebarAccess ?? membership?.user?.sidebarAccess ?? legacyUser?.sidebarAccess;
  const canAccessOperationalDashboard =
    companyRole === 'admin' || !Array.isArray(sidebarAccess) || sidebarAccess.includes('operational-dashboard');
  const operationalDashboardAccess =
    membership?.operationalDashboardAccess ?? membership?.user?.operationalDashboardAccess ?? legacyUser?.operationalDashboardAccess;

  if (!canAccessOperationalDashboard || !isOperationalDataTypeAllowed(operationalDashboardAccess, dataType)) {
    await auditForbiddenAccess('OperationalData', companyId, `READ:${dataType}`);
    return NextResponse.json({ error: 'Forbidden: Operational Dashboard page access denied' }, { status: 403 });
  }
  return null;
}
