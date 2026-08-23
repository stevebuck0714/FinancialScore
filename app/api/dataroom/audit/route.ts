import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { resolveDataRoomCapabilities } from '@/lib/dataroom/access';
import { formatEstDate } from '@/lib/time/eastern';

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function escapeCsv(value: unknown) {
  const raw = String(value ?? '');
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireAuth();
    const { searchParams } = new URL(request.url);
    const companyId = String(searchParams.get('companyId') || '').trim();
    const action = String(searchParams.get('action') || '').trim().toLowerCase();
    const userEmail = String(searchParams.get('userEmail') || '').trim().toLowerCase();
    const documentId = String(searchParams.get('documentId') || '').trim();
    const folderId = String(searchParams.get('folderId') || '').trim();
    const from = String(searchParams.get('from') || '').trim();
    const to = String(searchParams.get('to') || '').trim();
    const format = String(searchParams.get('format') || 'json').trim().toLowerCase();
    const limitRaw = Number(searchParams.get('limit') || 100);
    const offsetRaw = Number(searchParams.get('offset') || 0);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 100;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, userDefinedAllocations: true },
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
    const auditLog = Array.isArray(dataRoom.auditLog) ? dataRoom.auditLog : [];

    let events = auditLog
      .filter((e: any) => e && typeof e === 'object')
      .map((e: any) => ({
        id: String(e?.id || ''),
        at: String(e?.at || ''),
        action: String(e?.action || ''),
        companyId: String(e?.companyId || ''),
        userId: String(e?.userId || ''),
        userEmail: String(e?.userEmail || ''),
        ipAddress: String(e?.ipAddress || ''),
        userAgent: String(e?.userAgent || ''),
        folderId: e?.folderId ? String(e.folderId) : null,
        documentId: e?.documentId ? String(e.documentId) : null,
        details: e?.details ?? null,
      }))
      .filter((e: any) => e.companyId === companyId);

    if (action) {
      events = events.filter((e: any) => String(e.action || '').toLowerCase() === action);
    }
    if (userEmail) {
      events = events.filter((e: any) => String(e.userEmail || '').toLowerCase().includes(userEmail));
    }
    if (documentId) {
      events = events.filter((e: any) => String(e.documentId || '') === documentId);
    }
    if (folderId) {
      events = events.filter((e: any) => String(e.folderId || '') === folderId);
    }
    if (from) {
      const fromTs = new Date(from).getTime();
      if (!Number.isNaN(fromTs)) {
        events = events.filter((e: any) => new Date(e.at).getTime() >= fromTs);
      }
    }
    if (to) {
      const toTs = new Date(to).getTime();
      if (!Number.isNaN(toTs)) {
        events = events.filter((e: any) => new Date(e.at).getTime() <= toTs);
      }
    }

    events.sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const total = events.length;
    const page = events.slice(offset, offset + limit);

    if (format === 'csv') {
      const header = [
        'id',
        'at',
        'action',
        'companyId',
        'userId',
        'userEmail',
        'ipAddress',
        'userAgent',
        'folderId',
        'documentId',
        'details',
      ];
      const rows = page.map((e: any) =>
        [
          e.id,
          e.at,
          e.action,
          e.companyId,
          e.userId,
          e.userEmail,
          e.ipAddress,
          e.userAgent,
          e.folderId || '',
          e.documentId || '',
          JSON.stringify(e.details || {}),
        ]
          .map(escapeCsv)
          .join(','),
      );
      const csv = [header.join(','), ...rows].join('\n');
      const filename = `dataroom-audit-${companyId}-${formatEstDate()}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      company: { id: company.id, name: company.name },
      total,
      limit,
      offset,
      events: page,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load DataRoom audit log' }, { status: 500 });
  }
}

