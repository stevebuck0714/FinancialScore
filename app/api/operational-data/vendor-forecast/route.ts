import { NextRequest, NextResponse } from 'next/server';
import { isSgpAsOfDate, type VendorMonthlyForecastLineInput } from '@/lib/operations/vendor-monthly-forecast';
import {
  asForecastYear,
  asOptionalIsoDay,
  assertVendorsForecastAccess,
  ensureVendorMonthlyForecastTables,
  loadOperationsForecastYtd,
  loadVendorForecastLines,
  loadVendorForecastSettings,
  loadVendorForecastVendors,
  normalizeVendorForecastLineInput,
  overlayVendorForecastActuals,
  resolveVendorDataThru,
  serializeVendorForecastLine,
  upsertVendorForecastLines,
} from '@/lib/operations/vendor-monthly-forecast-db';

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

    const denied = await assertVendorsForecastAccess(companyId);
    if (denied) return denied;

    await ensureVendorMonthlyForecastTables();

    const year = asForecastYear(request.nextUrl.searchParams.get('year'));
    const vendorId = String(request.nextUrl.searchParams.get('vendorId') || '').trim();
    const vendorName = String(request.nextUrl.searchParams.get('vendorName') || '').trim();

    const settings = await loadVendorForecastSettings(companyId, year);
    const vendors = await loadVendorForecastVendors(companyId, year);
    const operations = await loadOperationsForecastYtd(companyId, year);
    const dataThru = resolveVendorDataThru(settings?.dataThru, operations.dataThru);

    const vendorPayload = vendors.map((row) => ({
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      key: `${row.vendorId}||${row.vendorName}`,
      label: row.vendorName || row.vendorId || 'Unassigned',
      lineCount: row.lineCount,
    }));

    if (!vendorId && !vendorName) {
      return NextResponse.json({
        year,
        dataThru,
        vendors: vendorPayload,
        lines: [],
      });
    }

    const lines = await loadVendorForecastLines({
      companyId,
      year,
      vendorId: vendorId || undefined,
      vendorName: vendorName || undefined,
    });

    return NextResponse.json({
      year,
      dataThru,
      vendors: vendorPayload,
      lines: lines.map((line) => overlayVendorForecastActuals(serializeVendorForecastLine(line), operations.actuals)),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load vendor monthly forecast' },
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

    const denied = await assertVendorsForecastAccess(companyId);
    if (denied) return denied;

    await ensureVendorMonthlyForecastTables();

    const year = asForecastYear(body.year);
    const vendorId = asText(body.vendorId);
    const vendorName = asText(body.vendorName);
    if (!vendorId && !vendorName) {
      return NextResponse.json({ error: 'Select a vendor before saving.' }, { status: 400 });
    }

    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    const lines = rawLines.map((raw, index) =>
      normalizeVendorForecastLineInput(raw as VendorMonthlyForecastLineInput, { vendorId, vendorName }, index)
    );
    if (lines.some((line) => !line.itemSku)) {
      return NextResponse.json({ error: 'Every row needs an APR P/N before saving.' }, { status: 400 });
    }

    const requestedThru = asOptionalIsoDay(body.dataThru);
    const persistThru = requestedThru && isSgpAsOfDate(requestedThru.toISOString().slice(0, 10))
      ? undefined
      : requestedThru;

    await upsertVendorForecastLines({
      companyId,
      year,
      dataThru: persistThru,
      replaceVendor: { vendorId, vendorName },
      lines,
    });

    const saved = await loadVendorForecastLines({
      companyId,
      year,
      vendorId: vendorId || undefined,
      vendorName: vendorName || undefined,
    });
    const settings = await loadVendorForecastSettings(companyId, year);
    const operations = await loadOperationsForecastYtd(companyId, year);

    return NextResponse.json({
      ok: true,
      year,
      dataThru: resolveVendorDataThru(settings?.dataThru, operations.dataThru),
      lines: saved.map((line) => overlayVendorForecastActuals(serializeVendorForecastLine(line), operations.actuals)),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to save vendor monthly forecast' },
      { status: 500 }
    );
  }
}
