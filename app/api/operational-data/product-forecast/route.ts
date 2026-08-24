import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  type ProductRevenueForecastLineInput,
} from '@/lib/operations/product-revenue-forecast';
import {
  asForecastYear,
  asOptionalIsoDay,
  assertProductsForecastAccess,
  ensureProductRevenueForecastTables,
  loadCsiMonthlyShippedActuals,
  normalizeForecastLineInput,
  serializeForecastLine,
  upsertForecastLines,
  withCsiShippedActuals,
} from '@/lib/operations/product-revenue-forecast-db';

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

    await ensureProductRevenueForecastTables();

    const year = asForecastYear(request.nextUrl.searchParams.get('year'));
    const customerId = String(request.nextUrl.searchParams.get('customerId') || '').trim();
    const customerName = String(request.nextUrl.searchParams.get('customerName') || '').trim();

    const settings = await prisma.productRevenueForecastSettings.findUnique({
      where: { companyId_year: { companyId, year } },
    });

    const customers = await prisma.productRevenueForecastLine.groupBy({
      by: ['customerId', 'customerName'],
      where: { companyId, year },
      _count: { _all: true },
      orderBy: { customerName: 'asc' },
    });

    const customerPayload = customers.map((row) => ({
      customerId: row.customerId,
      customerName: row.customerName,
      key: `${row.customerId}||${row.customerName}`,
      label: row.customerName || row.customerId || 'Unknown customer',
      lineCount: row._count._all,
    }));

    if (!customerId && !customerName) {
      return NextResponse.json({
        year,
        dataThru: settings?.dataThru ? settings.dataThru.toISOString().slice(0, 10) : null,
        customers: customerPayload,
        lines: [],
      });
    }

    const lines = await prisma.productRevenueForecastLine.findMany({
      where: {
        companyId,
        year,
        ...(customerId ? { customerId } : { customerName }),
      },
      orderBy: [{ sortOrder: 'asc' }, { itemSku: 'asc' }],
    });
    const shipped = await loadCsiMonthlyShippedActuals({
      companyId,
      year,
      customerId,
      customerName,
    });

    return NextResponse.json({
      year,
      dataThru: settings?.dataThru ? settings.dataThru.toISOString().slice(0, 10) : null,
      customers: customerPayload,
      lines: withCsiShippedActuals(lines.map(serializeForecastLine), shipped),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load revenue forecast' },
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

    await ensureProductRevenueForecastTables();

    const year = asForecastYear(body.year);
    const customerId = asText(body.customerId);
    const customerName = asText(body.customerName);
    if (!customerId && !customerName) {
      return NextResponse.json({ error: 'Select a customer before saving.' }, { status: 400 });
    }

    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    const lines = rawLines.map((raw, index) =>
      normalizeForecastLineInput(raw as ProductRevenueForecastLineInput, { customerId, customerName }, index)
    );
    if (lines.some((line) => !line.itemSku)) {
      return NextResponse.json({ error: 'Every row needs an APR P/N before saving.' }, { status: 400 });
    }

    await upsertForecastLines({
      companyId,
      year,
      dataThru: asOptionalIsoDay(body.dataThru),
      replaceCustomer: { customerId, customerName },
      lines,
    });

    const saved = await prisma.productRevenueForecastLine.findMany({
      where: {
        companyId,
        year,
        ...(customerId ? { customerId } : { customerName }),
      },
      orderBy: [{ sortOrder: 'asc' }, { itemSku: 'asc' }],
    });
    const settings = await prisma.productRevenueForecastSettings.findUnique({
      where: { companyId_year: { companyId, year } },
    });

    const shipped = await loadCsiMonthlyShippedActuals({
      companyId,
      year,
      customerId,
      customerName,
    });

    return NextResponse.json({
      ok: true,
      year,
      dataThru: settings?.dataThru ? settings.dataThru.toISOString().slice(0, 10) : null,
      lines: withCsiShippedActuals(saved.map(serializeForecastLine), shipped),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to save revenue forecast' },
      { status: 500 }
    );
  }
}
