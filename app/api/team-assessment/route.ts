import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  isCompanyAdminForCompany,
  requireCompanyAccess,
  type UserContext,
} from '@/lib/tenant-security';
import { auditUserOperation } from '@/lib/audit-logger';
import { sendTeamAssessmentInviteEmail } from '@/lib/managed-user-email';

export const dynamic = 'force-dynamic';

const MAX_TEAM_ASSESSMENT_INVITEES = 5;

type AccessRow = {
  userId: string;
  createdAt: Date;
  assessmentInvitedAt: Date | null;
  assessmentLastOpenedAt: Date | null;
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

// Legacy assessment-only accounts were invited by account creation, before invitations were tracked.
function isInvited(row: AccessRow): boolean {
  return Boolean(row.assessmentInvitedAt) || row.user.userType === 'ASSESSMENT';
}

function isEligibleCompanyUser(row: AccessRow): boolean {
  return row.user.role === 'USER' && row.user.userType !== 'ASSESSMENT' && !row.user.isExternal;
}

async function canManageTeamAssessment(context: UserContext, companyId: string): Promise<boolean> {
  if (context.role === 'SITEADMIN' || context.role === 'CONSULTANT') return true;
  return isCompanyAdminForCompany(context.userId, companyId);
}

async function loadAccessRows(companyId: string): Promise<AccessRow[]> {
  return prisma.userCompanyAccess.findMany({
    where: { companyId },
    select: {
      userId: true,
      createdAt: true,
      assessmentInvitedAt: true,
      assessmentLastOpenedAt: true,
      user: {
        select: { id: true, name: true, title: true, email: true, role: true, userType: true, isExternal: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  }) as Promise<AccessRow[]>;
}

function errorStatus(message: string): number {
  if (message.startsWith('Unauthorized')) return 401;
  if (message.startsWith('Forbidden')) return 403;
  return 500;
}

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });

    const context = await requireCompanyAccess(companyId);
    const rows = await loadAccessRows(companyId);
    const viewerRow = rows.find((row) => row.userId === context.userId);
    const viewerHasAccess = context.role === 'CONSULTANT' || (viewerRow ? isInvited(viewerRow) : false);
    const canManage = await canManageTeamAssessment(context, companyId);

    if (!canManage) {
      return NextResponse.json({ canManage, viewerHasAccess });
    }

    const records = await prisma.assessmentRecord.findMany({
      where: { companyId },
      select: { userId: true, isCompleted: true, completedAt: true, updatedAt: true },
    });
    const recordByUser = new Map(records.map((record) => [record.userId, record]));

    const invitees = rows.filter(isInvited).map((row) => {
      const record = recordByUser.get(row.userId);
      return {
        userId: row.userId,
        name: row.user.name,
        title: row.user.title,
        email: row.user.email,
        invitedAt: (row.assessmentInvitedAt || row.createdAt).toISOString(),
        lastOpenedAt: row.assessmentLastOpenedAt?.toISOString() || null,
        status: record?.isCompleted ? 'completed' : record ? 'in_progress' : 'not_started',
        completedAt: record?.completedAt?.toISOString() || null,
        isLegacyAssessmentAccount: row.user.userType === 'ASSESSMENT',
      };
    });

    const eligibleUsers = rows
      .filter((row) => !isInvited(row) && isEligibleCompanyUser(row))
      .map((row) => ({ userId: row.userId, name: row.user.name, title: row.user.title, email: row.user.email }));

    return NextResponse.json({
      canManage,
      viewerHasAccess,
      maxInvitees: MAX_TEAM_ASSESSMENT_INVITEES,
      invitees,
      eligibleUsers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load Team Assessment invitations';
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}

// Invites a Manage Users member to the Team Assessment, or re-sends their invitation.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { companyId?: string; userId?: string };
    const companyId = String(body.companyId || '').trim();
    const userId = String(body.userId || '').trim();
    if (!companyId || !userId) {
      return NextResponse.json({ error: 'companyId and userId are required' }, { status: 400 });
    }

    const context = await requireCompanyAccess(companyId);
    if (!(await canManageTeamAssessment(context, companyId))) {
      return NextResponse.json({ error: 'Forbidden: Only Company Admins can invite Team Assessment users' }, { status: 403 });
    }

    const rows = await loadAccessRows(companyId);
    const target = rows.find((row) => row.userId === userId);
    if (!target) {
      return NextResponse.json({ error: 'Add this person in Manage Users before inviting them.' }, { status: 400 });
    }
    if (!isInvited(target) && !isEligibleCompanyUser(target)) {
      return NextResponse.json({ error: 'Only company users can be invited to the Team Assessment.' }, { status: 400 });
    }
    const otherInvitees = rows.filter((row) => row.userId !== userId && isInvited(row)).length;
    if (otherInvitees >= MAX_TEAM_ASSESSMENT_INVITEES) {
      return NextResponse.json(
        { error: `A company can invite at most ${MAX_TEAM_ASSESSMENT_INVITEES} Team Assessment users.` },
        { status: 400 }
      );
    }

    const resent = isInvited(target);
    await prisma.userCompanyAccess.update({
      where: { userId_companyId: { userId, companyId } },
      data: { assessmentInvitedAt: new Date() },
    });
    await auditUserOperation('USER_UPDATED', userId, {
      email: target.user.email,
      companyId,
      reason: resent ? 'team_assessment_invitation_resent' : 'team_assessment_invited',
    });

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    const { emailSent, emailError } = await sendTeamAssessmentInviteEmail({
      request,
      actorUserId: context.userId,
      to: target.user.email,
      userName: target.user.name || target.user.email,
      companyName: company?.name || 'your company',
    });

    return NextResponse.json({ ok: true, resent, emailSent, emailError });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to invite Team Assessment user';
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}

// Removes a Team Assessment invitation. The person keeps their Manage Users access.
export async function DELETE(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    const userId = String(request.nextUrl.searchParams.get('userId') || '').trim();
    if (!companyId || !userId) {
      return NextResponse.json({ error: 'companyId and userId are required' }, { status: 400 });
    }

    const context = await requireCompanyAccess(companyId);
    if (!(await canManageTeamAssessment(context, companyId))) {
      return NextResponse.json({ error: 'Forbidden: Only Company Admins can remove Team Assessment users' }, { status: 403 });
    }

    const target = (await loadAccessRows(companyId)).find((row) => row.userId === userId);
    if (!target) return NextResponse.json({ error: 'User not found for this company' }, { status: 404 });

    // Assessment-only accounts have no other reason to belong to the company.
    if (target.user.userType === 'ASSESSMENT') {
      await prisma.userCompanyAccess.delete({ where: { userId_companyId: { userId, companyId } } });
    } else {
      await prisma.userCompanyAccess.update({
        where: { userId_companyId: { userId, companyId } },
        data: { assessmentInvitedAt: null },
      });
    }
    await auditUserOperation('USER_UPDATED', userId, {
      email: target.user.email,
      companyId,
      reason: 'team_assessment_invitation_removed',
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove Team Assessment user';
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}
