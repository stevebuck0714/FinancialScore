import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';

export const dynamic = 'force-dynamic';

const DETAIL_REQUESTS = [
  'InvoiceQuery',
  'BillQuery',
  'SalesReceiptQuery',
  'CreditMemoQuery',
  'CheckQuery',
  'DepositQuery',
  'VendorCreditQuery',
  'JournalEntryQuery',
];

function parseDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return '';
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? '' : trimmed;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildMonthlyWindows(startDate: string, endDate: string): Array<{ startDate: string; endDate: string; windowIndex: number }> {
  const windows: Array<{ startDate: string; endDate: string; windowIndex: number }> = [];
  let cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  let windowIndex = 1;

  while (cursor <= end) {
    const nextMonth = addUtcMonths(cursor, 1);
    const windowEnd = addUtcDays(nextMonth, -1);
    windows.push({
      startDate: formatDate(cursor),
      endDate: formatDate(windowEnd < end ? windowEnd : end),
      windowIndex,
    });
    cursor = nextMonth;
    windowIndex += 1;
  }

  return windows;
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
        { ok: false, error: 'Detail backfills are only available for QuickBooks Desktop-family companies.' },
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
    // Preserve prior QuickBooksDesktopBackfillPage rows as raw source archives.
    // New detail jobs receive a fresh batchId/jobId, and processing reads only
    // the active jobs stored in quickbooksDesktopDetailBackfillJobs below.
    const batchId = randomUUID();
    const now = new Date().toISOString();
    const requestedAt = now;
    const windows = buildMonthlyWindows(startDate, endDate);
    const detailJobs: Record<string, Record<string, unknown>> = {};

    for (const window of windows) {
      for (const requestName of DETAIL_REQUESTS) {
        const id = `${batchId}:detail:${String(window.windowIndex).padStart(3, '0')}:${requestName}`;
        detailJobs[id] = {
          id,
          batchId,
          status: 'queued',
          requestName,
          detailType: 'line_items',
          windowIndex: window.windowIndex,
          dateRange: {
            mode: 'MANUAL',
            startDate: window.startDate,
            endDate: window.endDate,
            requestedAt,
          },
          createdAt: now,
          updatedAt: now,
          recordCount: 0,
          pageCount: 0,
          iteratorRemainingCount: null,
          lastError: null,
        };
      }
    }

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
          quickbooksDesktopDetailBackfillBatchId: batchId,
          quickbooksDesktopDetailBackfillJobs: detailJobs,
          quickbooksDesktopDetailBackfillResponses: {},
          quickbooksDesktopDetailBackfillLastRun: null,
        } as any,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      batchId,
      windowCount: windows.length,
      jobCount: Object.keys(detailJobs).length,
      requests: DETAIL_REQUESTS,
      message: 'The requested QuickBooks Desktop line-item detail backfill will run on upcoming Web Connector updates.',
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to queue QuickBooks Desktop detail backfill';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
