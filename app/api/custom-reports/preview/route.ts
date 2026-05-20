import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getReportDataCatalog, type ReportFieldCatalogItem } from '@/lib/custom-reports/report-data-catalog';
import { buildOperationalMockResponse } from '@/lib/operations/sector-mock-data';
import {
  buildBillingCashMock,
  buildCommitmentsForecastMock,
  buildConstructionApMock,
  buildConstructionArMock,
  buildJobCostControlMock,
  buildProjectPortfolioMock,
} from '@/lib/operations/construction-mock-data';

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function monthLabel(value: Date): string {
  const month = value.getUTCMonth() + 1;
  const year = String(value.getUTCFullYear()).slice(-2);
  return `${month}/${year}`;
}

function getRequestedFields(config: any, fieldCatalog: ReportFieldCatalogItem[]): string[] {
  const allowedFields = new Set(fieldCatalog.map((item) => item.field));
  const series = Array.isArray(config?.series) ? config.series : [];
  const fields: string[] = series
    .map((item: any) => String(item?.field || '').trim())
    .filter((field: string) => allowedFields.has(field));
  return [...new Set(fields)];
}

function monthKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildValues(row: any) {
  const revenue = toNumber(row.revenue);
  const cogsTotal = toNumber(row.cogsTotal);
  const expense = toNumber(row.expense);
  const nonOperatingIncome = toNumber(row.nonOperatingIncome);
  const nonOperatingExpense = toNumber(row.nonOperatingExpense);
  const grossProfit = revenue - cogsTotal;
  const netIncome = revenue - cogsTotal - expense + nonOperatingIncome - nonOperatingExpense;

  return {
    revenue,
    cogsTotal,
    grossProfit,
    grossMarginPct: revenue ? grossProfit / revenue : 0,
    expense,
    // Simplified report-builder EBITDA proxy until a dedicated saved-report metric layer is added.
    ebitda: revenue - cogsTotal - expense,
    netIncome,
    cash: toNumber(row.cash),
    ar: toNumber(row.ar),
    ap: toNumber(row.ap),
    inventory: toNumber(row.inventory),
    loc: toNumber(row.loc),
    totalAssets: toNumber(row.totalAssets),
    totalLiab: toNumber(row.totalLiab),
    totalEquity: toNumber(row.totalEquity),
    nonOperatingIncome,
    nonOperatingExpense,
  };
}

function getOperationalPayload(companyId: string, sectorCategory: string | null, dataType: string) {
  if (dataType === 'job-cost-control') return buildJobCostControlMock(companyId);
  if (dataType === 'project-portfolio') return buildProjectPortfolioMock(companyId);
  if (dataType === 'commitments-forecast') return buildCommitmentsForecastMock(companyId);
  if (dataType === 'billing-cash') return buildBillingCashMock(companyId);
  if (dataType === 'construction-ar') return buildConstructionArMock(companyId);
  if (dataType === 'construction-ap') return buildConstructionApMock(companyId);

  const now = new Date();
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const normalizedType = dataType === 'customers-sites' ? 'customers' : dataType;
  return buildOperationalMockResponse({
    companyId,
    type: normalizedType as any,
    sectorCategory,
    startDate,
    endDate: now,
    frequency: 'monthly',
    limit: 2000,
  });
}

function getRecordDate(row: any): string {
  return row?.monthDate || row?.snapshotDate || row?.date || row?.asOfDate || new Date().toISOString();
}

function passesFilters(row: any, filters: any[], fieldMeta: ReportFieldCatalogItem): boolean {
  return filters.every((filter) => {
    const value = String(filter?.value || '').trim().toLowerCase();
    if (!value) return true;
    const field = String(filter?.field || '').trim();
    const candidateKeys = [
      field,
      fieldMeta.categoryKey,
      'jobName',
      'jobId',
      'projectName',
      'customerName',
      'vendorName',
      'itemName',
      'productName',
      'accountName',
      'costType',
      'subType',
    ].filter(Boolean) as string[];
    return candidateKeys.some((key) => String(row?.[key] || '').toLowerCase().includes(value));
  });
}

function buildOperationalPreviewRows(
  companyId: string,
  sectorCategory: string | null,
  fields: string[],
  fieldCatalog: ReportFieldCatalogItem[],
  filters: any[]
): Map<string, { month: string; monthDate: string; values: Record<string, number> }> {
  const rowsByMonth = new Map<string, { month: string; monthDate: string; values: Record<string, number> }>();
  const operationalFields = fields
    .map((field) => fieldCatalog.find((item) => item.field === field))
    .filter((field): field is ReportFieldCatalogItem => Boolean(field?.dataType && field?.valueKey));
  const dataTypes = [...new Set(operationalFields.map((field) => field.dataType).filter(Boolean))] as string[];

  dataTypes.forEach((dataType) => {
    const payload = getOperationalPayload(companyId, sectorCategory, dataType);
    const fieldsForType = operationalFields.filter((field) => field.dataType === dataType);
    fieldsForType.forEach((field) => {
      const records = Array.isArray((payload as any)?.[field.recordSet || 'records'])
        ? (payload as any)[field.recordSet || 'records']
        : Array.isArray((payload as any)?.records)
          ? (payload as any).records
          : [];

      records
        .filter((record: any) => passesFilters(record, filters, field))
        .forEach((record: any) => {
          const rawDate = getRecordDate(record);
          const key = monthKey(rawDate);
          const monthDate = `${key}-01T00:00:00.000Z`;
          const existing = rowsByMonth.get(key) || {
            month: monthLabel(new Date(monthDate)),
            monthDate,
            values: {},
          };
          existing.values[field.field] = toNumber(existing.values[field.field]) + toNumber(record?.[field.valueKey || '']);
          rowsByMonth.set(key, existing);
        });
    });
  });

  return rowsByMonth;
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const config = body?.reportConfig || {};

    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('CustomReports', companyId, 'PREVIEW');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { industrySectorCategory: true, userDefinedAllocations: true },
    });
    const customReports = (company?.userDefinedAllocations as any)?.customReports || {};
    if (customReports.enabledByAdmin !== true) {
      return NextResponse.json({ error: 'Custom Reports are disabled for this company.' }, { status: 403 });
    }
    const fieldCatalog = getReportDataCatalog(company?.industrySectorCategory || null);
    const fields = getRequestedFields(config, fieldCatalog);
    if (fields.length === 0) return NextResponse.json({ error: 'Report config has no supported series fields.' }, { status: 400 });

    const rows = await prisma.monthlyFinancial.findMany({
      where: { companyId },
      orderBy: { monthDate: 'desc' },
      take: 36,
      select: {
        monthDate: true,
        revenue: true,
        cogsTotal: true,
        expense: true,
        cash: true,
        ar: true,
        ap: true,
        inventory: true,
        loc: true,
        totalAssets: true,
        totalLiab: true,
        totalEquity: true,
        nonOperatingIncome: true,
        nonOperatingExpense: true,
      },
    });

    const previewRowsByMonth = new Map<string, { month: string; monthDate: string; values: Record<string, number> }>();

    rows
      .slice()
      .reverse()
      .forEach((row) => {
        const values = buildValues(row);
        previewRowsByMonth.set(monthKey(row.monthDate), {
          month: monthLabel(row.monthDate),
          monthDate: row.monthDate.toISOString(),
          values: fields.reduce<Record<string, number>>((acc, field) => {
            if ((values as Record<string, number>)[field] !== undefined) {
              acc[field] = toNumber((values as Record<string, number>)[field]);
            }
            return acc;
          }, {}),
        });
      });

    const operationalRows = buildOperationalPreviewRows(
      companyId,
      company?.industrySectorCategory || null,
      fields,
      fieldCatalog,
      Array.isArray(config?.filters) ? config.filters : []
    );
    operationalRows.forEach((row, key) => {
      const existing = previewRowsByMonth.get(key) || row;
      previewRowsByMonth.set(key, {
        ...existing,
        values: {
          ...existing.values,
          ...row.values,
        },
      });
    });

    const previewRows = Array.from(previewRowsByMonth.values()).sort((a, b) => a.monthDate.localeCompare(b.monthDate));

    return NextResponse.json({
      rows: previewRows,
      fields,
      fieldCatalog: fieldCatalog.filter((field) => fields.includes(field.field)),
    });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to build report preview');
    const status = message.toLowerCase().includes('unauthorized') ? 401 : 500;
    console.error('Custom Reports preview error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
