import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { auditUserOperation } from '@/lib/audit-logger';
import { sendTeamAssessmentInviteEmail } from '@/lib/managed-user-email';
import {
  MAX_TEAM_ASSESSMENT_GROUP_SIZE,
  canManageTeamAssessment,
  isEligibleCompanyUser,
  isInvited,
  loadAccessRows,
  teamAssessmentErrorStatus,
} from '@/lib/team-assessment';

export const dynamic = 'force-dynamic';

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
      return NextResponse.json({ canManage, viewerHasAccess, viewerGroupId: viewerRow?.assessmentGroupId || null });
    }

    const [groups, records] = await Promise.all([
      prisma.teamAssessmentGroup.findMany({
        where: { companyId },
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.assessmentRecord.findMany({
        where: { companyId },
        select: { userId: true, groupId: true, isCompleted: true, completedAt: true },
      }),
    ]);
    const recordByUser = new Map(records.map((record) => [record.userId, record]));

    const toMember = (row: (typeof rows)[number]) => {
      const record = recordByUser.get(row.userId);
      const recordInGroup = record && record.groupId === row.assessmentGroupId ? record : null;
      return {
        userId: row.userId,
        name: row.user.name,
        title: row.user.title,
        email: row.user.email,
        invitedAt: (row.assessmentInvitedAt || row.createdAt).toISOString(),
        lastOpenedAt: row.assessmentLastOpenedAt?.toISOString() || null,
        status: recordInGroup?.isCompleted ? 'completed' : recordInGroup ? 'in_progress' : 'not_started',
        completedAt: recordInGroup?.completedAt?.toISOString() || null,
      };
    };

    return NextResponse.json({
      canManage,
      viewerHasAccess,
      viewerGroupId: viewerRow?.assessmentGroupId || null,
      maxPerGroup: MAX_TEAM_ASSESSMENT_GROUP_SIZE,
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        createdAt: group.createdAt.toISOString(),
        members: rows.filter((row) => row.assessmentGroupId === group.id).map(toMember),
      })),
      eligibleUsers: rows
        .filter((row) => !isInvited(row) && isEligibleCompanyUser(row))
        .map((row) => ({ userId: row.userId, name: row.user.name, title: row.user.title, email: row.user.email })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load Team Assessment groups';
    return NextResponse.json({ error: message }, { status: teamAssessmentErrorStatus(message) });
  }
}

// Invites a Manage Users member into a group, or re-sends their invitation.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { companyId?: string; userId?: string; groupId?: string };
    const companyId = String(body.companyId || '').trim();
    const userId = String(body.userId || '').trim();
    const groupId = String(body.groupId || '').trim();
    if (!companyId || !userId || !groupId) {
      return NextResponse.json({ error: 'companyId, userId, and groupId are required' }, { status: 400 });
    }

    const context = await requireCompanyAccess(companyId);
    if (!(await canManageTeamAssessment(context, companyId))) {
      return NextResponse.json({ error: 'Forbidden: Only Company Admins can invite Team Assessment users' }, { status: 403 });
    }

    const group = await prisma.teamAssessmentGroup.findFirst({ where: { id: groupId, companyId }, select: { id: true, name: true } });
    if (!group) return NextResponse.json({ error: 'Group not found for this company' }, { status: 404 });

    const rows = await loadAccessRows(companyId);
    const target = rows.find((row) => row.userId === userId);
    if (!target) {
      return NextResponse.json({ error: 'Add this person in Manage Users before inviting them.' }, { status: 400 });
    }
    if (!isInvited(target) && !isEligibleCompanyUser(target)) {
      return NextResponse.json({ error: 'Only company users can be invited to the Team Assessment.' }, { status: 400 });
    }
    if (target.assessmentGroupId && target.assessmentGroupId !== group.id) {
      return NextResponse.json(
        { error: 'This person is already in another group. Remove them from that group first.' },
        { status: 400 }
      );
    }
    const otherMembers = rows.filter((row) => row.userId !== userId && row.assessmentGroupId === group.id).length;
    if (otherMembers >= MAX_TEAM_ASSESSMENT_GROUP_SIZE) {
      return NextResponse.json(
        { error: `${group.name} already has ${MAX_TEAM_ASSESSMENT_GROUP_SIZE} people. Create another group for more participants.` },
        { status: 400 }
      );
    }

    const resent = target.assessmentGroupId === group.id;
    await prisma.userCompanyAccess.update({
      where: { userId_companyId: { userId, companyId } },
      data: { assessmentInvitedAt: new Date(), assessmentGroupId: group.id },
    });
    await auditUserOperation('USER_UPDATED', userId, {
      email: target.user.email,
      companyId,
      groupId: group.id,
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
    return NextResponse.json({ error: message }, { status: teamAssessmentErrorStatus(message) });
  }
}

// Removes a person from their group. They keep their Manage Users access.
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
        data: { assessmentInvitedAt: null, assessmentGroupId: null },
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
    return NextResponse.json({ error: message }, { status: teamAssessmentErrorStatus(message) });
  }
}
