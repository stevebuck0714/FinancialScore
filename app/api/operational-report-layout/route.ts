import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { isCompanyAdminForCompany, requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

const MAX_REPORTS_PER_TAB = 250;
const MAX_REPORT_KEY_LENGTH = 160;
const METRIC_CARD_REPORT_KEY =
  /(MetricCards|Kpis|SummaryCards|bureauPerfScorecard|payrollRunScorecard|payrollOnTimeProcessing)$/;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireAuth();
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const moduleKey = String(body?.moduleKey || '').trim();
    const reportKeys: string[] = Array.isArray(body?.reportKeys)
      ? Array.from(
          new Set(
            body.reportKeys
              .map((key: unknown) => String(key || '').trim())
              .filter((key: string) => key.length > 0 && key.length <= MAX_REPORT_KEY_LENGTH)
          )
        )
      : [];

    if (!companyId || !moduleKey || moduleKey.length > MAX_REPORT_KEY_LENGTH) {
      return NextResponse.json({ error: 'companyId and moduleKey are required.' }, { status: 400 });
    }
    if (reportKeys.length === 0 || reportKeys.length > MAX_REPORTS_PER_TAB) {
      return NextResponse.json({ error: 'A valid report order is required.' }, { status: 400 });
    }
    if (reportKeys.some((key) => METRIC_CARD_REPORT_KEY.test(key))) {
      return NextResponse.json({ error: 'Metric-card sections cannot be reordered.' }, { status: 400 });
    }
    if (!(await validateCompanyAccess(companyId))) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const canManageLayout =
      context.role === 'SITEADMIN' ||
      context.role === 'CONSULTANT' ||
      (context.role === 'USER' && await isCompanyAdminForCompany(context.userId, companyId));
    if (!canManageLayout) {
      return NextResponse.json(
        { error: 'Only site admins, consultants, and company admins can change report layouts.' },
        { status: 403 }
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { userDefinedAllocations: true },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
    }

    const allocations = asObject(company.userDefinedAllocations);
    const operationalHub = asObject(allocations.operationalHub);
    const reportOrderByModule = asObject(operationalHub.reportOrderByModule);
    const nextOperationalHub = {
      ...operationalHub,
      reportOrderByModule: {
        ...reportOrderByModule,
        [moduleKey]: reportKeys,
      },
      updatedAt: new Date().toISOString(),
    };

    await prisma.company.update({
      where: { id: companyId },
      data: {
        userDefinedAllocations: {
          ...allocations,
          operationalHub: nextOperationalHub,
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ success: true, reportKeys });
  } catch (error) {
    console.error('Failed to save operational report layout:', error);
    return NextResponse.json({ error: 'Failed to save report layout.' }, { status: 500 });
  }
}
