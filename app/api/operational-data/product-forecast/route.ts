import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  actualsClosedThrough,
  summarizeForecastQtyMonths,
  withClosedMonthActualAdjusted,
  type ProductRevenueForecastLineInput,
} from '@/lib/operations/product-revenue-forecast';
import {
  asForecastYear,
  asOptionalIsoDay,
  assertProductsForecastAccess,
  ensureProductRevenueForecastTables,
  loadProductActualQty,
  normalizeForecastLineInput,
  serializeForecastLine,
  upsertForecastLines,
  withProductActualQty,
  type ProductActualQty,
} from '@/lib/operations/product-revenue-forecast-db';
import {
  listProductForecastCustomersWithCatalog,
  loadProductForecastLinesWithCatalog,
} from '@/lib/operations/product-catalog-carryforward';

import { withProductReportCache } from '@/lib/operations/product-report-cache';
import { getActiveSgpBudgetLock } from '@/lib/operations/product-sgp-budget-lock';
import { scheduleOperationalCacheWarmupAfterSave } from '@/lib/operations/operational-cache-save-warmup';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function asText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function forecastLinesWithActuals(
  lines: ReturnType<typeof serializeForecastLine>[],
  actualQty: ProductActualQty,
  dataThru: string | null
) {
  return withClosedMonthActualAdjusted(withProductActualQty(lines, actualQty), dataThru);
}

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const denied = await assertProductsForecastAccess(companyId);
    if (denied) return denied;

    const year = asForecastYear(request.nextUrl.searchParams.get('year'));
    const customerId = String(request.nextUrl.searchParams.get('customerId') || '').trim();
    const customerName = String(request.nextUrl.searchParams.get('customerName') || '').trim();
    const includeTotals = String(request.nextUrl.searchParams.get('includeTotals') || '') === '1';
    const refresh = ['1', 'true', 'yes'].includes(
      String(request.nextUrl.searchParams.get('refresh') || '').trim().toLowerCase()
    );

    const { payload } = await withProductReportCache({
      namespace: 'product-forecast-report',
      companyId,
      keyParts: ['forecast', year, customerId, customerName, includeTotals ? 'totals' : 'no-totals'],
      refresh,
      build: async () => {
        await ensureProductRevenueForecastTables();

        const settings = await prisma.productRevenueForecastSettings.findUnique({
          where: { companyId_year: { companyId, year } },
        });

        const { customers: customerPayload, catalogSourceYear } = await listProductForecastCustomersWithCatalog(
          companyId,
          year
        );

        const workbookDataThru = settings?.dataThru ? settings.dataThru.toISOString().slice(0, 10) : null;

        if (!customerId && !customerName) {
          const actualQty = await loadProductActualQty({ companyId, year });
          const dataThru = actualsClosedThrough(year, actualQty.actuals.asOf) ?? workbookDataThru;
          let totals = null;
          if (includeTotals) {
            const companyLines = await loadProductForecastLinesWithCatalog({ companyId, year });
            totals = summarizeForecastQtyMonths(
              forecastLinesWithActuals(companyLines.map(serializeForecastLine), actualQty, dataThru)
            );
          }
          return {
            year,
            catalogSourceYear,
            dataThru,
            customers: customerPayload,
            totals,
            lines: [],
          };
        }

        const lines = await loadProductForecastLinesWithCatalog({
          companyId,
          year,
          customerId,
          customerName,
        });
        const actualQty = await loadProductActualQty({
          companyId,
          year,
          customerId,
          customerName,
        });
        const dataThru = actualsClosedThrough(year, actualQty.actuals.asOf) ?? workbookDataThru;

        return {
          year,
          catalogSourceYear,
          dataThru,
          customers: customerPayload,
          lines: forecastLinesWithActuals(lines.map(serializeForecastLine), actualQty, dataThru),
        };
      },
    });

    return NextResponse.json(payload);
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

    const sgpLock = await getActiveSgpBudgetLock(companyId, year);
    await upsertForecastLines({
      companyId,
      year,
      dataThru: asOptionalIsoDay(body.dataThru),
      replaceCustomer: { customerId, customerName },
      preserveLockedMonthQtys: true,
      sgpLocked: Boolean(sgpLock),
      lines,
    });
    scheduleOperationalCacheWarmupAfterSave(request, companyId, 'product-forecast');

    const saved = await loadProductForecastLinesWithCatalog({
      companyId,
      year,
      customerId,
      customerName,
    });
    const settings = await prisma.productRevenueForecastSettings.findUnique({
      where: { companyId_year: { companyId, year } },
    });

    const actualQty = await loadProductActualQty({
      companyId,
      year,
      customerId,
      customerName,
    });
    const dataThru =
      actualsClosedThrough(year, actualQty.actuals.asOf) ??
      (settings?.dataThru ? settings.dataThru.toISOString().slice(0, 10) : null);

    return NextResponse.json({
      ok: true,
      year,
      dataThru,
      lines: forecastLinesWithActuals(saved.map(serializeForecastLine), actualQty, dataThru),
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to save revenue forecast';
    return NextResponse.json(
      { error: message },
      { status: /SGP budget for \d{4} is locked/.test(message) ? 409 : 500 }
    );
  }
}
