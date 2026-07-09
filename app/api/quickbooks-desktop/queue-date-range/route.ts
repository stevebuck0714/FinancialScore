import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';

export const dynamic = 'force-dynamic';

const REQUIRED_QBD_REPORT_REQUESTS = [
  'BalanceSheetStandardReportQuery',
  'TrialBalanceReportQuery',
  'ARAgingSummaryReportQuery',
  'APAgingSummaryReportQuery',
  'OtherNameQuery',
  'EntityQuery',
];

const BULK_EXCLUDED_QBD_REQUESTS = new Set([
  'GeneralDetailReportQuery',
]);

const QBD_AGING_SNAPSHOT_REQUESTS = new Set([
  'ARAgingSummaryReportQuery',
  'APAgingSummaryReportQuery',
]);

function parseDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return '';
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? '' : trimmed;
}

function parseRequestNames(value: unknown, allowBulkExcluded = false): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((requestName) => (typeof requestName === 'string' ? requestName.trim() : ''))
        .filter((requestName) => /^[A-Za-z][A-Za-z0-9]*Query$/.test(requestName))
        .filter((requestName) => allowBulkExcluded || !BULK_EXCLUDED_QBD_REQUESTS.has(requestName)),
    ),
  );
}

function addDaysUtc(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonthsUtc(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildMonthlyDateRanges(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const ranges: Array<{ startDate: string; endDate: string; windowIndex: number }> = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  let windowIndex = 0;

  while (cursor.getTime() <= end.getTime()) {
    const monthStart = cursor < start ? start : cursor;
    const nextMonthStart = addMonthsUtc(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1)), 1);
    const monthEndCandidate = addDaysUtc(nextMonthStart, -1);
    const monthEnd = monthEndCandidate > end ? end : monthEndCandidate;
    if (monthStart <= monthEnd) {
      ranges.push({
        startDate: dateKey(monthStart),
        endDate: dateKey(monthEnd),
        windowIndex,
      });
      windowIndex += 1;
    }
    cursor = nextMonthStart;
  }

  return ranges;
}

function buildBusinessDayDateRanges(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const ranges: Array<{ startDate: string; endDate: string; windowIndex: number }> = [];
  const cursor = new Date(start);
  let windowIndex = 0;

  while (cursor.getTime() <= end.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      const key = dateKey(cursor);
      ranges.push({ startDate: key, endDate: key, windowIndex });
      windowIndex += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return ranges;
}

function buildMonthEndDateRanges(startDate: string, endDate: string) {
  return buildMonthlyDateRanges(startDate, endDate).map((range) => ({
    startDate: range.endDate,
    endDate: range.endDate,
    windowIndex: range.windowIndex,
  }));
}

const DEFAULT_QBD_REQUESTS = [
  'AccountQuery',
  ...REQUIRED_QBD_REPORT_REQUESTS,
  'CustomerQuery',
  'VendorQuery',
  'InvoiceQuery',
  'BillQuery',
  'ReceivePaymentQuery',
  'ItemQuery',
  'SalesReceiptQuery',
  'DepositQuery',
  'CreditMemoQuery',
  'JournalEntryQuery',
  'PurchaseOrderQuery',
  'CheckQuery',
  'VendorCreditQuery',
  'BillPaymentCheckQuery',
  'BillPaymentCreditCardQuery',
];

function getEnabledQbDesktopRequests(metadata: Record<string, unknown>, allowBulkExcluded = false): string[] {
  const programs = Array.isArray(metadata.quickbooksDesktopPrograms)
    ? metadata.quickbooksDesktopPrograms
    : [];
  const requests = programs.length > 0
    ? programs
        .filter((program) => {
          const row = program && typeof program === 'object' && !Array.isArray(program)
            ? program as Record<string, unknown>
            : {};
          return row.enabled !== false;
        })
        .map((program) => {
          const row = program && typeof program === 'object' && !Array.isArray(program)
            ? program as Record<string, unknown>
            : {};
          return typeof row.qbEntity === 'string' ? row.qbEntity.trim() : '';
        })
    : DEFAULT_QBD_REQUESTS;
  return Array.from(new Set([
    ...requests,
    ...REQUIRED_QBD_REPORT_REQUESTS,
    ...(allowBulkExcluded ? Array.from(BULK_EXCLUDED_QBD_REQUESTS) : []),
  ]))
    .filter((requestName) => allowBulkExcluded || !BULK_EXCLUDED_QBD_REQUESTS.has(requestName))
    .filter((requestName) => /^[A-Za-z][A-Za-z0-9]*Query$/.test(requestName));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const startDate = parseDate(body.startDate);
    const endDate = parseDate(body.endDate);

    if (!startDate || !endDate) {
      return NextResponse.json(
        { ok: false, error: 'startDate and endDate are required in YYYY-MM-DD format.' },
        { status: 400 },
      );
    }
    if (startDate > endDate) {
      return NextResponse.json(
        { ok: false, error: 'startDate must be before or equal to endDate.' },
        { status: 400 },
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }
    if (!isQuickBooksDesktopFamily(company.accountingSystem)) {
      return NextResponse.json(
        { ok: false, error: 'Date range pulls are only available for QuickBooks Desktop-family companies.' },
        { status: 400 },
      );
    }

    const existing = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
        },
      },
      select: { connectionMetadata: true },
    });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: 'QuickBooks Desktop connection settings have not been saved yet.' },
        { status: 404 },
      );
    }

    const metadata =
      existing.connectionMetadata && typeof existing.connectionMetadata === 'object' && !Array.isArray(existing.connectionMetadata)
        ? (existing.connectionMetadata as Record<string, unknown>)
        : {};
    const queuedDateRange = {
      mode: 'MANUAL',
      startDate,
      endDate,
      requestedAt: new Date().toISOString(),
    };
    const batchId = randomUUID();
    const now = new Date().toISOString();
    const chunkByMonth = body.chunkByMonth === true;
    const allowBulkExcludedRequests = body.allowBulkExcludedRequests === true || chunkByMonth;
    const hasSelectedRequestNames = Array.isArray(body.requestNames);
    const hasAgingSnapshotRequestNames =
      Array.isArray(body.agingSnapshotRequestNames) && body.agingSnapshotRequestNames.length > 0;
    const hasProfileRequestNames =
      Array.isArray(body.staticRequestNames) ||
      Array.isArray(body.monthlyRequestNames) ||
      hasAgingSnapshotRequestNames;
    const selectedRequests = parseRequestNames(body.requestNames, allowBulkExcludedRequests);
    const staticRequests = parseRequestNames(body.staticRequestNames, true);
    const monthlyRequests = parseRequestNames(body.monthlyRequestNames, allowBulkExcludedRequests);
    const agingSnapshotRequests = parseRequestNames(body.agingSnapshotRequestNames, true)
      .filter((requestName) => QBD_AGING_SNAPSHOT_REQUESTS.has(requestName));
    if (hasSelectedRequestNames && selectedRequests.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No valid requestNames were provided for the targeted QuickBooks Desktop pull.' },
        { status: 400 },
      );
    }
    if (hasProfileRequestNames && staticRequests.length === 0 && monthlyRequests.length === 0 && agingSnapshotRequests.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No valid staticRequestNames, monthlyRequestNames, or agingSnapshotRequestNames were provided for the targeted QuickBooks Desktop pull.' },
        { status: 400 },
      );
    }
    if (hasAgingSnapshotRequestNames && agingSnapshotRequests.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No valid agingSnapshotRequestNames were provided for the targeted QuickBooks Desktop pull.' },
        { status: 400 },
      );
    }
    const enabledRequests = hasProfileRequestNames
      ? Array.from(new Set([...staticRequests, ...monthlyRequests, ...agingSnapshotRequests]))
      : hasSelectedRequestNames
        ? selectedRequests
        : getEnabledQbDesktopRequests(metadata, allowBulkExcludedRequests);
    const dateRanges = chunkByMonth
      ? buildMonthlyDateRanges(startDate, endDate)
      : [{ startDate, endDate, windowIndex: 0 }];
    const agingSnapshotGranularity = body.agingSnapshotGranularity === 'monthEnd' ? 'monthEnd' : 'businessDay';
    const agingSnapshotDateRanges = agingSnapshotGranularity === 'monthEnd'
      ? buildMonthEndDateRanges(startDate, endDate)
      : buildBusinessDayDateRanges(startDate, endDate);
    if (dateRanges.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No valid date windows were generated for the QuickBooks Desktop pull.' },
        { status: 400 },
      );
    }
    const jobSpecs = hasProfileRequestNames
      ? [
          ...staticRequests.map((requestName) => ({
            requestName,
            dateRange: queuedDateRange,
            windowIndex: 0,
          })),
          ...dateRanges.flatMap((range) =>
            monthlyRequests.map((requestName) => ({
              requestName,
              dateRange: {
                ...queuedDateRange,
                startDate: range.startDate,
                endDate: range.endDate,
              },
              windowIndex: range.windowIndex,
            })),
          ),
          ...agingSnapshotDateRanges.flatMap((range) =>
            agingSnapshotRequests.map((requestName) => ({
              requestName,
              processingMode: 'aging_snapshot' as const,
              dateRange: {
                ...queuedDateRange,
                startDate: range.startDate,
                endDate: range.endDate,
              },
              windowIndex: range.windowIndex,
            })),
          ),
        ]
      : dateRanges.flatMap((range) =>
        enabledRequests.map((requestName) => ({
        requestName,
        dateRange: {
          ...queuedDateRange,
          startDate: range.startDate,
          endDate: range.endDate,
        },
        windowIndex: range.windowIndex,
      })),
    );
    const backfillJobs = Object.fromEntries(
      jobSpecs.map((job, index) => {
        const id = `${batchId}:${String(index + 1).padStart(3, '0')}:${String(job.windowIndex).padStart(3, '0')}:${job.requestName}`;
        return [
          id,
          {
            id,
            batchId,
            status: 'queued',
            requestName: job.requestName,
            ...(job.processingMode ? { processingMode: job.processingMode } : {}),
            windowIndex: job.windowIndex,
            dateRange: job.dateRange,
            createdAt: now,
            updatedAt: now,
            recordCount: 0,
            pageCount: 0,
            iteratorRemainingCount: null,
            lastError: null,
          },
        ];
      }),
    );

    // Do not delete QuickBooksDesktopBackfillPage rows here. They are raw QBD
    // source archives keyed by batchId/jobId and are needed for audit,
    // historical remapping, and recovery. The active processing batch is scoped
    // by quickbooksDesktopBackfillJobs below, so older archive rows will not be
    // mixed into the current run.
    await prisma.accountingConnection.update({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
        },
      },
      data: {
        connectionMetadata: {
          ...metadata,
          quickbooksDesktopQueuedDateRange: queuedDateRange,
          quickbooksDesktopBackfillBatchId: batchId,
          quickbooksDesktopBackfillJobs: backfillJobs,
          quickbooksDesktopBackfillResponses: {},
          quickbooksDesktopBackfillRequestNames: hasSelectedRequestNames ? selectedRequests : null,
          quickbooksDesktopBackfillChunkByMonth: chunkByMonth,
          quickbooksDesktopBackfillAgingSnapshotGranularity: hasAgingSnapshotRequestNames ? agingSnapshotGranularity : null,
        } as any,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      queuedDateRange,
      batchId,
      jobCount: jobSpecs.length,
      requestNames: enabledRequests,
      dateWindowCount: dateRanges.length,
      agingSnapshotDateWindowCount: hasAgingSnapshotRequestNames ? agingSnapshotDateRanges.length : 0,
      message: 'The requested QuickBooks Desktop date range will run on the next Web Connector update.',
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to queue QuickBooks Desktop date range';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
