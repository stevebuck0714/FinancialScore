import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getDataRoomState } from '@/lib/dataroom/state';
import { resolveDataRoomCapabilities } from '@/lib/dataroom/access';
import { appendDataRoomAuditEvents, buildDataRoomAuditEvent } from '@/lib/dataroom/audit';

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function sanitizePermissionObject(value: unknown) {
  const src = asObject(value);
  const out: Record<string, boolean> = {};
  for (const key of ['view', 'download', 'upload', 'share', 'manage']) {
    if (typeof src[key] === 'boolean') out[key] = src[key];
  }
  return out;
}

function sanitizeNestedPermissionMap(value: unknown) {
  const src = asObject(value);
  const out: Record<string, Record<string, boolean>> = {};
  for (const [id, rules] of Object.entries(src)) {
    out[String(id)] = sanitizePermissionObject(rules);
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireAuth();
    const { searchParams } = new URL(request.url);
    const companyId = String(searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, userDefinedAllocations: true },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const caps = await resolveDataRoomCapabilities({
      userId: context.userId,
      role: context.role,
      companyId,
      userDefinedAllocations: company.userDefinedAllocations,
    });
    if (!caps.manage) {
      return NextResponse.json({ error: 'Forbidden: manage access required' }, { status: 403 });
    }

    const state = getDataRoomState(company.userDefinedAllocations);
    const permissions = asObject(state.dataRoom.permissions);
    return NextResponse.json({ permissions });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load DataRoom permissions' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireAuth();
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const targetUserId = String(body?.userId || '').trim();
    if (!companyId || !targetUserId) {
      return NextResponse.json({ error: 'companyId and userId are required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, userDefinedAllocations: true },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const caps = await resolveDataRoomCapabilities({
      userId: context.userId,
      role: context.role,
      companyId,
      userDefinedAllocations: company.userDefinedAllocations,
    });
    if (!caps.manage) {
      return NextResponse.json({ error: 'Forbidden: manage access required' }, { status: 403 });
    }

    const root = asObject(company.userDefinedAllocations);
    const dataRoom = asObject(root.dataRoom);
    const permissions = asObject(dataRoom.permissions);
    const users = Array.isArray(permissions.users) ? permissions.users : [];

    const rule = {
      userId: targetUserId,
      default: sanitizePermissionObject(body?.default),
      folders: sanitizeNestedPermissionMap(body?.folders),
      documents: sanitizeNestedPermissionMap(body?.documents),
      updatedAt: new Date().toISOString(),
    };

    const existingIndex = users.findIndex((u: any) => String(u?.userId || '') === targetUserId);
    const nextUsers = existingIndex >= 0
      ? users.map((u: any, idx: number) => (idx === existingIndex ? { ...u, ...rule } : u))
      : [...users, rule];

    const updatedUDA = appendDataRoomAuditEvents(
      {
        ...root,
        dataRoom: {
          ...dataRoom,
          permissions: {
            ...permissions,
            users: nextUsers,
          },
        },
      },
      [
        await buildDataRoomAuditEvent({
          action: 'permissions_updated',
          companyId,
          userId: context.userId,
          userEmail: context.email,
          details: { targetUserId },
        }),
      ],
    );

    await prisma.company.update({
      where: { id: companyId },
      data: { userDefinedAllocations: updatedUDA as any },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update DataRoom permissions' }, { status: 500 });
  }
}

