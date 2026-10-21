import { NextRequest, NextResponse } from 'next/server';
import { isSgpAsOfDate } from '@/lib/operations/vendor-monthly-forecast';
import {
  loadCsiMonthlyShippedActuals,
  withCsiShippedActuals,
} from '@/lib/operations/product-revenue-forecast-db';
import {
  asForecastYear,
  asOptionalIsoDay,
  assertVendorsForecastAccess,
  ensureVendorMonthlyForecastTables,
  loadVendorForecastLines,
  loadVendorForecastSettings,
  loadVendorForecastVendors,
  patchVendorForecastLines,
  resolveVendorDataThru,
  serializeVendorForecastLine,
  upsertVendorForecastLines,
  type VendorForecastLinePatch,
} from '@/lib/operations/vendor-monthly-forecast-db';
import { loadCustomerGroups, withCustomerGroups } from '@/lib/operations/customer-groups';
import { scheduleOperationalCacheWarmupAfterSave } from '@/lib/operations/operational-cache-save-warmup';

export const dynamic = 'force-dynamic';
// Leaves room for the post-response operational cache rebuild.
export const maxDuration = 300;

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

    // The Infor rebuild is performed after source sync and by the scheduled
    // warmup. Returning the last completed forecast here keeps the vendor
    // selector interactive even if a refresh is delayed or fails.
    const [settings, vendors] = await Promise.all([
      loadVendorForecastSettings(companyId, year),
      loadVendorForecastVendors(companyId, year),
    ]);
    const dataThru = resolveVendorDataThru(settings?.dataThru, null);
    const inforSourceDate = settings?.inforSourceDate ? settings.inforSourceDate.toISOString().slice(0, 10) : null;

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
        inforSourceDate,
        vendors: vendorPayload,
        lines: [],
      });
    }

    const [lines, customerGroups, shipped] = await Promise.all([
      loadVendorForecastLines({
        companyId,
        year,
        vendorId: vendorId || undefined,
        vendorName: vendorName || undefined,
      }),
      loadCustomerGroups(companyId),
      loadCsiMonthlyShippedActuals({ companyId, year }),
    ]);

    return NextResponse.json({
      year,
      dataThru: resolveVendorDataThru(settings?.dataThru, shipped.asOf),
      inforSourceDate,
      vendors: vendorPayload,
      lines: withCsiShippedActuals(
        withCustomerGroups(lines.map(serializeVendorForecastLine), customerGroups),
        shipped
      ),
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
    const patches: VendorForecastLinePatch[] = rawLines
      .filter((raw): raw is Record<string, unknown> => Boolean(raw) && typeof raw === 'object')
      .map((raw) => ({
        id: asText(raw.id),
        ...(raw.productionType !== undefined ? { productionType: asText(raw.productionType) || null } : {}),
        ...(raw.forecastOverrideQty !== undefined
          ? { forecastOverrideQty: raw.forecastOverrideQty as Record<string, number> }
          : {}),
      }))
      .filter((patch) => patch.id);

    const requestedThru = asOptionalIsoDay(body.dataThru);
    const persistThru = requestedThru && isSgpAsOfDate(requestedThru.toISOString().slice(0, 10))
      ? undefined
      : requestedThru;

    await upsertVendorForecastLines({ companyId, year, dataThru: persistThru, lines: [] });
    await patchVendorForecastLines(companyId, year, patches);
    scheduleOperationalCacheWarmupAfterSave(request, companyId, 'vendor-forecast');

    const saved = await loadVendorForecastLines({
      companyId,
      year,
      vendorId: vendorId || undefined,
      vendorName: vendorName || undefined,
    });
    const settings = await loadVendorForecastSettings(companyId, year);
    const shipped = await loadCsiMonthlyShippedActuals({ companyId, year });

    return NextResponse.json({
      ok: true,
      year,
      dataThru: resolveVendorDataThru(settings?.dataThru, shipped.asOf),
      inforSourceDate: settings?.inforSourceDate ? settings.inforSourceDate.toISOString().slice(0, 10) : null,
      lines: withCsiShippedActuals(
        withCustomerGroups(saved.map(serializeVendorForecastLine), await loadCustomerGroups(companyId)),
        shipped
      ),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to save vendor monthly forecast' },
      { status: 500 }
    );
  }
}
