import prisma from '@/lib/prisma';
import { isCompanyAdminForCompany, type UserContext } from '@/lib/tenant-security';

export async function isExternalUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isExternal: true },
  });
  return Boolean(user?.isExternal);
}

/**
 * External users may be added by the company's Company Admin, the consultant
 * admin (primary contact) of the firm that manages the company, or a Site Admin.
 */
export async function canAddExternalUsers(
  context: UserContext,
  companyId: string,
  company: { consultantId: string | null },
): Promise<boolean> {
  if (context.role === 'SITEADMIN') return true;

  if (context.role === 'CONSULTANT') {
    return Boolean(
      context.isPrimaryContact &&
        context.consultantId &&
        company.consultantId === context.consultantId,
    );
  }

  if (context.role === 'USER') {
    return isCompanyAdminForCompany(context.userId, companyId);
  }

  return false;
}
