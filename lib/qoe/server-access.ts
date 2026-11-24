import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/tenant-security';
import { allowedQoeTabs, type QoeTabId } from './access';

/**
 * Whether the signed-in user may use a Quality of Earnings tab for this company. Only company users are
 * limited; company admins, consultants, and site admins see every tab. Company access is checked separately.
 */
export async function canUseQoeTab(companyId: string, tab: QoeTabId): Promise<boolean> {
  const context = await requireAuth();
  if (context.role !== 'USER') return true;
  const access = { companyRole: true, sidebarAccess: true } as const;
  const membership = await prisma.userCompanyAccess.findUnique({
    where: { userId_companyId: { userId: context.userId, companyId } },
    select: { ...access, user: { select: access } },
  });
  const legacyUser = membership ? null : await prisma.user.findUnique({ where: { id: context.userId }, select: access });
  const companyRole = String(membership?.companyRole || membership?.user?.companyRole || legacyUser?.companyRole || '').toLowerCase();
  if (companyRole === 'admin') return true;
  const sidebarAccess = membership?.sidebarAccess ?? membership?.user?.sidebarAccess ?? legacyUser?.sidebarAccess;
  return allowedQoeTabs(sidebarAccess).includes(tab);
}
