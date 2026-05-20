import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

function normalizeTitle(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function normalizeDescription(value: unknown): string | null {
  const description = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 500);
  return description || null;
}

function getReportPayload(config: any) {
  const title = normalizeTitle(config?.title) || 'Custom Report';
  return {
    title,
    description: normalizeDescription(config?.description),
    chartType: String(config?.chartType || 'table').slice(0, 40),
    dataSource: String(config?.dataSource || 'monthlyFinancial').slice(0, 80),
    config,
  };
}

type CustomReportRow = {
  id: string;
  companyId?: string;
  createdByUserId?: string | null;
  title: string;
  description: string | null;
  chartType: string;
  dataSource: string | null;
  config: any;
  createdAt: Date;
  updatedAt: Date;
  createdByName?: string | null;
  createdByEmail?: string | null;
};

function serializeReport(row: CustomReportRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    chartType: row.chartType,
    dataSource: row.dataSource,
    config: row.config,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdByName || row.createdByEmail
      ? { name: row.createdByName, email: row.createdByEmail }
      : null,
  };
}

function isMissingCustomReportTableError(error: any): boolean {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === 'P2021' ||
    error?.code === '42P01' ||
    message.includes('customreport') && message.includes('does not exist') ||
    message.includes('relation "customreport" does not exist')
  );
}

function customReportStorageNotReadyResponse() {
  return NextResponse.json(
    {
      error: 'Custom Reports storage is not ready. Run the latest Prisma migrations for this environment and try again.',
    },
    { status: 503 }
  );
}

function customReportErrorResponse(error: any, fallbackMessage: string) {
  if (isMissingCustomReportTableError(error)) {
    return customReportStorageNotReadyResponse();
  }
  const message = String(error?.message || fallbackMessage);
  const status = message.toLowerCase().includes('unauthorized') ? 401 : 500;
  return NextResponse.json({ error: message }, { status });
}

async function assertCustomReportsAccess(companyId: string, action: string) {
  const hasAccess = await validateCompanyAccess(companyId);
  if (!hasAccess) {
    await auditForbiddenAccess('CustomReports', companyId, action);
    return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { userDefinedAllocations: true },
  });
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const customReports = (company.userDefinedAllocations as any)?.customReports || {};
  if (customReports.enabledByAdmin !== true) {
    return NextResponse.json({ error: 'Custom Reports are disabled for this company.' }, { status: 403 });
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const companyId = String(searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });

    const accessError = await assertCustomReportsAccess(companyId, 'LIST');
    if (accessError) return accessError;

    const reports = await prisma.$queryRaw<CustomReportRow[]>(Prisma.sql`
      SELECT
        cr.id,
        cr.title,
        cr.description,
        cr."chartType",
        cr."dataSource",
        cr.config,
        cr."createdAt",
        cr."updatedAt",
        u.name AS "createdByName",
        u.email AS "createdByEmail"
      FROM "CustomReport" cr
      LEFT JOIN "User" u ON u.id = cr."createdByUserId"
      WHERE cr."companyId" = ${companyId}
      ORDER BY cr."updatedAt" DESC
      LIMIT 100
    `);

    return NextResponse.json({ reports: reports.map(serializeReport) });
  } catch (error: any) {
    console.error('Custom Reports list error:', error);
    return customReportErrorResponse(error, 'Failed to load custom reports');
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuth();
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const config = body?.reportConfig || {};
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    if (!config || typeof config !== 'object') return NextResponse.json({ error: 'reportConfig is required' }, { status: 400 });

    const accessError = await assertCustomReportsAccess(companyId, 'CREATE');
    if (accessError) return accessError;

    const payload = getReportPayload(config);
    const reportId = `cmr_${randomUUID().replace(/-/g, '')}`;
    const reportRows = await prisma.$queryRaw<CustomReportRow[]>(Prisma.sql`
      INSERT INTO "CustomReport" (
        id,
        "companyId",
        "createdByUserId",
        title,
        description,
        "chartType",
        "dataSource",
        config,
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${reportId},
        ${companyId},
        ${context.userId === 'dev-bypass-user' ? null : context.userId},
        ${payload.title},
        ${payload.description},
        ${payload.chartType},
        ${payload.dataSource},
        ${JSON.stringify(payload.config)}::jsonb,
        now(),
        now()
      )
      RETURNING *
    `);
    const report = reportRows[0];

    return NextResponse.json({ report: serializeReport(report) });
  } catch (error: any) {
    console.error('Custom Reports save error:', error);
    return customReportErrorResponse(error, 'Failed to save custom report');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const reportId = String(body?.reportId || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    if (!reportId) return NextResponse.json({ error: 'reportId is required' }, { status: 400 });

    const accessError = await assertCustomReportsAccess(companyId, 'UPDATE');
    if (accessError) return accessError;

    const existingRows = await prisma.$queryRaw<Pick<CustomReportRow, 'id' | 'config'>[]>(Prisma.sql`
      SELECT id, config
      FROM "CustomReport"
      WHERE id = ${reportId} AND "companyId" = ${companyId}
      LIMIT 1
    `);
    const existing = existingRows[0];
    if (!existing) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

    const config = body?.reportConfig && typeof body.reportConfig === 'object'
      ? body.reportConfig
      : existing.config;
    const payload = getReportPayload({
      ...(config as any),
      title: body?.title !== undefined ? normalizeTitle(body.title) : (config as any)?.title,
      description: body?.description !== undefined ? normalizeDescription(body.description) : (config as any)?.description,
    });

    const updatedConfig = {
      ...(payload.config as any),
      title: payload.title,
      description: payload.description,
    };
    const reportRows = await prisma.$queryRaw<CustomReportRow[]>(Prisma.sql`
      UPDATE "CustomReport"
      SET
        title = ${payload.title},
        description = ${payload.description},
        "chartType" = ${payload.chartType},
        "dataSource" = ${payload.dataSource},
        config = ${JSON.stringify(updatedConfig)}::jsonb,
        "updatedAt" = now()
      WHERE id = ${reportId} AND "companyId" = ${companyId}
      RETURNING *
    `);
    const report = reportRows[0];

    return NextResponse.json({ report: serializeReport(report) });
  } catch (error: any) {
    console.error('Custom Reports update error:', error);
    return customReportErrorResponse(error, 'Failed to update custom report');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const companyId = String(searchParams.get('companyId') || '').trim();
    const reportId = String(searchParams.get('reportId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    if (!reportId) return NextResponse.json({ error: 'reportId is required' }, { status: 400 });

    const accessError = await assertCustomReportsAccess(companyId, 'DELETE');
    if (accessError) return accessError;

    const existingRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM "CustomReport"
      WHERE id = ${reportId} AND "companyId" = ${companyId}
      LIMIT 1
    `);
    const existing = existingRows[0];
    if (!existing) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "CustomReport"
      WHERE id = ${reportId} AND "companyId" = ${companyId}
    `);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Custom Reports delete error:', error);
    return customReportErrorResponse(error, 'Failed to delete custom report');
  }
}
