import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { canManageTeamAssessment, teamAssessmentErrorStatus } from '@/lib/team-assessment';

export const dynamic = 'force-dynamic';

async function requireManager(companyId: string) {
  const context = await requireCompanyAccess(companyId);
  if (!(await canManageTeamAssessment(context, companyId))) {
    throw new Error('Forbidden: Only Company Admins can manage Team Assessment groups');
  }
  return context;
}

function cleanName(value: unknown): string {
  return String(value || '').trim().slice(0, 80);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { companyId?: string; name?: string };
    const companyId = String(body.companyId || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    await requireManager(companyId);

    const count = await prisma.teamAssessmentGroup.count({ where: { companyId } });
    const name = cleanName(body.name) || `Group ${count + 1}`;
    const group = await prisma.teamAssessmentGroup.create({
      data: { companyId, name },
      select: { id: true, name: true },
    });
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create group';
    return NextResponse.json({ error: message }, { status: teamAssessmentErrorStatus(message) });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { companyId?: string; groupId?: string; name?: string };
    const companyId = String(body.companyId || '').trim();
    const groupId = String(body.groupId || '').trim();
    const name = cleanName(body.name);
    if (!companyId || !groupId || !name) {
      return NextResponse.json({ error: 'companyId, groupId, and name are required' }, { status: 400 });
    }
    await requireManager(companyId);

    const { count } = await prisma.teamAssessmentGroup.updateMany({ where: { id: groupId, companyId }, data: { name } });
    if (count === 0) return NextResponse.json({ error: 'Group not found for this company' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to rename group';
    return NextResponse.json({ error: message }, { status: teamAssessmentErrorStatus(message) });
  }
}

// Only empty groups can be deleted so submitted results are never orphaned.
export async function DELETE(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    const groupId = String(request.nextUrl.searchParams.get('groupId') || '').trim();
    if (!companyId || !groupId) {
      return NextResponse.json({ error: 'companyId and groupId are required' }, { status: 400 });
    }
    await requireManager(companyId);

    const group = await prisma.teamAssessmentGroup.findFirst({
      where: { id: groupId, companyId },
      select: { _count: { select: { members: true, records: true } } },
    });
    if (!group) return NextResponse.json({ error: 'Group not found for this company' }, { status: 404 });
    if (group._count.members > 0 || group._count.records > 0) {
      return NextResponse.json(
        { error: 'Only empty groups can be deleted. Remove its members first; groups with submitted results are kept.' },
        { status: 400 }
      );
    }

    await prisma.teamAssessmentGroup.delete({ where: { id: groupId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete group';
    return NextResponse.json({ error: message }, { status: teamAssessmentErrorStatus(message) });
  }
}
