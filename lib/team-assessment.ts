import prisma from '@/lib/prisma';
import { isCompanyAdminForCompany, type UserContext } from '@/lib/tenant-security';

export const MAX_TEAM_ASSESSMENT_GROUP_SIZE = 5;

export type TeamAssessmentAccessRow = {
  userId: string;
  createdAt: Date;
  assessmentInvitedAt: Date | null;
  assessmentLastOpenedAt: Date | null;
  assessmentGroupId: string | null;
  user: {
    id: string;
    name: string;
    title: string | null;
    email: string;
    role: string;
    userType: string | null;
    isExternal: boolean;
  };
};

// Legacy assessment-only accounts were invited by account creation, before groups existed.
export function isInvited(row: TeamAssessmentAccessRow): boolean {
  return Boolean(row.assessmentGroupId) || row.user.userType === 'ASSESSMENT';
}

export function isEligibleCompanyUser(row: TeamAssessmentAccessRow): boolean {
  return row.user.role === 'USER' && row.user.userType !== 'ASSESSMENT' && !row.user.isExternal;
}

export async function canManageTeamAssessment(context: UserContext, companyId: string): Promise<boolean> {
  if (context.role === 'SITEADMIN' || context.role === 'CONSULTANT') return true;
  return isCompanyAdminForCompany(context.userId, companyId);
}

export async function loadAccessRows(companyId: string): Promise<TeamAssessmentAccessRow[]> {
  return prisma.userCompanyAccess.findMany({
    where: { companyId },
    select: {
      userId: true,
      createdAt: true,
      assessmentInvitedAt: true,
      assessmentLastOpenedAt: true,
      assessmentGroupId: true,
      user: {
        select: { id: true, name: true, title: true, email: true, role: true, userType: true, isExternal: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  }) as Promise<TeamAssessmentAccessRow[]>;
}

export function teamAssessmentErrorStatus(message: string): number {
  if (message.startsWith('Unauthorized')) return 401;
  if (message.startsWith('Forbidden')) return 403;
  return 500;
}
