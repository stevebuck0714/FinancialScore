import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';

export const dynamic = 'force-dynamic';

const REQUIRED_QBD_REPORT_REQUESTS = [
  'BalanceSheetStandardReportQuery',
  'TrialBalanceReportQuery',
  'GeneralDetailReportQuery',
  'OtherNameQuery',
  'EntityQuery',
];

function parseDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return '';
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? '' : trimmed;
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

function getEnabledQbDesktopRequests(metadata: Record<string, unknown>): string[] {
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
  return Array.from(new Set([...requests, ...REQUIRED_QBD_REPORT_REQUESTS]))
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
    const enabledRequests = getEnabledQbDesktopRequests(metadata);
    const backfillJobs = Object.fromEntries(
      enabledRequests.map((requestName, index) => {
        const id = `${batchId}:${String(index + 1).padStart(3, '0')}:${requestName}`;
        return [
          id,
          {
            id,
            batchId,
            status: 'queued',
            requestName,
            dateRange: queuedDateRange,
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

    await prisma.$executeRaw`
      DELETE FROM "QuickBooksDesktopBackfillPage"
      WHERE "companyId" = ${companyId}
    `;

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
        } as any,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      queuedDateRange,
      batchId,
      jobCount: enabledRequests.length,
      message: 'The requested QuickBooks Desktop date range will run on the next Web Connector update.',
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to queue QuickBooks Desktop date range';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
