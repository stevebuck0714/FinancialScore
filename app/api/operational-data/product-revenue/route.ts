import { NextRequest, NextResponse } from 'next/server';
import {
  type ProductRevenueLineInput,
} from '@/lib/operations/product-revenue-actual';
import {
  asForecastYear,
  asOptionalIsoDay,
  assertProductsForecastAccess,
  ensureProductRevenueTables,
  loadRevenueDataset,
  normalizeRevenueLineInput,
  upsertRevenueLines,
} from '@/lib/operations/product-revenue-actual-db';
import { workbookUpdatedDate } from '@/lib/operations/product-revenue-actual';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function asText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const denied = await assertProductsForecastAccess(companyId);
    if (denied) return denied;

    await ensureProductRevenueTables();

    const year = asForecastYear(request.nextUrl.searchParams.get('year'));
    const customerId = String(request.nextUrl.searchParams.get('customerId') || '').trim();
    const customerName = String(request.nextUrl.searchParams.get('customerName') || '').trim();
    const dataset = await loadRevenueDataset({ companyId, year, customerId, customerName });

    return NextResponse.json({
      ...dataset,
      workbookUpdated: workbookUpdatedDate(dataset.dataThru),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load monthly revenue' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = asText(body.companyId);
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const denied = await assertProductsForecastAccess(companyId);
    if (denied) return denied;

    await ensureProductRevenueTables();

    const year = asForecastYear(body.year);
    const customerId = asText(body.customerId);
    const customerName = asText(body.customerName);
    const rawLines = Array.isArray(body.lines) ? body.lines : [];

    if (rawLines.length && !customerId && !customerName) {
      return NextResponse.json({ error: 'Select a customer before saving rows.' }, { status: 400 });
    }

    const lines = rawLines.map((raw, index) =>
      normalizeRevenueLineInput(raw as ProductRevenueLineInput, { customerId, customerName }, index)
    );
    if (lines.some((line) => !line.itemSku)) {
      return NextResponse.json({ error: 'Every row needs an APR P/N before saving.' }, { status: 400 });
    }

    await upsertRevenueLines({
      companyId,
      year,
      dataThru: asOptionalIsoDay(body.dataThru),
      replaceCustomer: customerId || customerName ? { customerId, customerName } : null,
      lines,
    });

    const dataset = await loadRevenueDataset({ companyId, year, customerId, customerName });
    return NextResponse.json({
      ok: true,
      ...dataset,
      workbookUpdated: workbookUpdatedDate(dataset.dataThru),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to save monthly revenue' },
      { status: 500 }
    );
  }
}
