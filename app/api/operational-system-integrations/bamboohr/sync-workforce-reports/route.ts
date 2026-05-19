import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { buildAndSaveBambooHrWorkforceReportSnapshot } from '@/lib/operations/bamboohr-workforce-reports';

export const dynamic = 'force-dynamic';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const devBypass =
      process.env.NODE_ENV === 'development' && asString(request.headers.get('x-dev-bamboohr-probe')) === '1';
    const companyId = devBypass
      ? asString(body.companyId) || asString(request.nextUrl.searchParams.get('companyId'))
      : (await requireSiteAdminAuthorizedInforCompany(request, body)).companyId;
    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 });
    }
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }
    const snapshot = await buildAndSaveBambooHrWorkforceReportSnapshot(companyId);
    return NextResponse.json({
      ok: true,
      companyId,
      companyName: company.name,
      generatedAt: snapshot.generatedAt,
      employeesSampled: snapshot.employeesSampled,
      summary: snapshot.summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync BambooHR workforce reports';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
