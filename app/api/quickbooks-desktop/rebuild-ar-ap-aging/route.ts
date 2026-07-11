import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';
import { saveQuickBooksDesktopDetailOpenSnapshots } from '@/lib/quickbooks-desktop/operational-sync';
import type { QbDesktopOperationalPayload } from '@/lib/quickbooks-desktop/operational-sync';

export const dynamic = 'force-dynamic';

const QBD_SOURCE_REQUESTS = [
  'InvoiceQuery',
  'BillQuery',
  'ReceivePaymentQuery',
  'BillPaymentCheckQuery',
  'BillPaymentCreditCardQuery',
] as const;

function parseDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return '';
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? '' : trimmed;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((row) => Object.keys(row).length > 0) : [];
}

function countApplied(records: Record<string, unknown>[]): number {
  return records.reduce((sum, record) => sum + asArray(record.AppliedToTxnRet).length, 0);
}

async function loadQbdRecords(companyId: string, requestName: string, endDate: string): Promise<Record<string, unknown>[]> {
  const rows = await prisma.$queryRaw<Array<{ record: unknown }>>`
    SELECT record
    FROM "QuickBooksDesktopBackfillPage"
    CROSS JOIN LATERAL jsonb_array_elements("payload"::jsonb) AS record
    WHERE "companyId" = ${companyId}
      AND "requestName" = ${requestName}
      AND NULLIF(record->>'TxnDate', '')::date <= ${endDate}::date
    ORDER BY "createdAt" ASC, "pageNumber" ASC
  `;
  return rows.map((row) => asRecord(row.record)).filter((row) => Object.keys(row).length > 0);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const startDate = parseDate(body?.startDate);
    const endDate = parseDate(body?.endDate);
    if (!startDate || !endDate) {
      return NextResponse.json({ ok: false, error: 'startDate and endDate are required.' }, { status: 400 });
    }
    if (startDate > endDate) {
      return NextResponse.json({ ok: false, error: 'startDate must be before or equal to endDate.' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    if (!isQuickBooksDesktopFamily(company?.accountingSystem)) {
      return NextResponse.json({ ok: false, error: 'Company is not configured for QuickBooks Desktop/Enterprise.' }, { status: 400 });
    }

    const [
      invoices,
      bills,
      receivePayments,
      billPaymentChecks,
      billPaymentCreditCards,
    ] = await Promise.all([
      loadQbdRecords(companyId, 'InvoiceQuery', endDate),
      loadQbdRecords(companyId, 'BillQuery', endDate),
      loadQbdRecords(companyId, 'ReceivePaymentQuery', endDate),
      loadQbdRecords(companyId, 'BillPaymentCheckQuery', endDate),
      loadQbdRecords(companyId, 'BillPaymentCreditCardQuery', endDate),
    ]);

    if (!invoices.length && !bills.length) {
      return NextResponse.json({ ok: false, error: 'No saved QBD invoice or bill records are available to rebuild AR/AP aging.' }, { status: 400 });
    }
    if (!receivePayments.length && !billPaymentChecks.length && !billPaymentCreditCards.length) {
      return NextResponse.json({ ok: false, error: 'No saved QBD payment records are available to rebuild AR/AP aging.' }, { status: 400 });
    }

    const payload: QbDesktopOperationalPayload = {
      asOfDate: endDate,
      __qbdSourceDateRange: { startDate, endDate },
      __qbdInvoices: invoices,
      __qbdBills: bills,
      __qbdReceivePayments: receivePayments,
      __qbdBillPayments: [...billPaymentChecks, ...billPaymentCreditCards],
    };

    const recordsCreated = await saveQuickBooksDesktopDetailOpenSnapshots(companyId, 'daily', payload);
    return NextResponse.json({
      ok: true,
      success: true,
      companyId,
      startDate,
      endDate,
      recordsCreated,
      sourceCounts: {
        InvoiceQuery: invoices.length,
        BillQuery: bills.length,
        ReceivePaymentQuery: receivePayments.length,
        BillPaymentCheckQuery: billPaymentChecks.length,
        BillPaymentCreditCardQuery: billPaymentCreditCards.length,
      },
      appliedLinkCounts: {
        ReceivePaymentQuery: countApplied(receivePayments),
        BillPaymentCheckQuery: countApplied(billPaymentChecks),
        BillPaymentCreditCardQuery: countApplied(billPaymentCreditCards),
      },
      sourceRequests: QBD_SOURCE_REQUESTS,
    });
  } catch (error) {
    console.error('[quickbooks-desktop/rebuild-ar-ap-aging] failed', error);
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to rebuild QuickBooks Desktop AR/AP aging.',
      },
      { status: 500 },
    );
  }
}
