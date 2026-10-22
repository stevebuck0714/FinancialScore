import { NextRequest, NextResponse } from 'next/server';
import {
  emptyMonthQtyMap,
  forecastAdjustedClosedThrough,
  monthQty,
  summarizeForecastQtyMonths,
  withClosedMonthActualAdjusted,
  type ForecastMonth,
  type MonthQtyMap,
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
import prisma from '@/lib/prisma';
import { loadCustomerGroups, saveCustomerGroup, withCustomerGroups } from '@/lib/operations/customer-groups';
import { withProductReportCache } from '@/lib/operations/product-report-cache';
import { getActiveSgpBudgetLock } from '@/lib/operations/product-sgp-budget-lock';
import { scheduleOperationalCacheWarmupAfterSave } from '@/lib/operations/operational-cache-save-warmup';
import { formatEstDate } from '@/lib/time/eastern';

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

function historyMonthKeys(monthCount: number): Array<{ year: number; month: ForecastMonth; label: string }> {
  const [yearText, monthText] = formatEstDate().split('-');
  let year = Number(yearText);
  let month = Number(monthText);
  const months: Array<{ year: number; month: ForecastMonth; label: string }> = [];

  for (let offset = 0; offset < monthCount; offset += 1) {
    months.unshift({
      year,
      month: month as ForecastMonth,
      label: `${year}-${String(month).padStart(2, '0')}`,
    });
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return months;
}

async function loadItemHistory(params: {
  companyId: string;
  customerId: string;
  itemSku: string;
  customerPartNumber: string;
  customerName: string;
}) {
  const months = historyMonthKeys(36);
  const years = Array.from(new Set(months.map((month) => month.year)));
  const savedLines = await prisma.productRevenueForecastLine.findMany({
    where: {
      companyId: params.companyId,
      customerId: params.customerId,
      itemSku: params.itemSku,
      customerPartNumber: params.customerPartNumber,
      year: { in: years },
    },
    select: {
      year: true,
      forecastQty: true,
    },
  });
  const forecastsByYear = new Map(
    savedLines.map((line) => [
      line.year,
      normalizeForecastLineInput(
        {
          customerId: params.customerId,
          customerName: params.customerName,
          customerPartNumber: params.customerPartNumber,
          itemSku: params.itemSku,
          forecastQty: line.forecastQty as MonthQtyMap,
        },
        params,
        0
      ).forecastQty,
    ])
  );
  const actualsByYear = new Map(
    await Promise.all(
      years.map(async (year) => [
        year,
        await loadProductActualQty({
          companyId: params.companyId,
          year,
          customerId: params.customerId,
        }),
      ] as const)
    )
  );
  const [currentYearText, currentMonthText] = formatEstDate().split('-');
  const currentYear = Number(currentYearText);
  const currentMonth = Number(currentMonthText);

  return months.map(({ year, month, label }) => {
    const actualLine = withProductActualQty(
      [{
        customerId: params.customerId,
        customerName: params.customerName,
        customerGroup: '',
        customerPartNumber: params.customerPartNumber,
        itemSku: params.itemSku,
        team: '',
        csr: '',
        productionType: '',
        statusFlag: '',
        annualBaseQty: null,
        forecastQty: emptyMonthQtyMap(),
        sgpForecastQty: emptyMonthQtyMap(),
        adjustedQty: emptyMonthQtyMap(),
        actualQty: emptyMonthQtyMap(),
        sortOrder: 0,
      }],
      actualsByYear.get(year)!
    )[0];
    return {
      month: label,
      forecast: forecastsByYear.has(year)
        ? monthQty(forecastsByYear.get(year)!, month)
        : null,
      actual: year === currentYear && month === currentMonth ? null : monthQty(actualLine.actualQty, month),
    };
  });
}

type ItemCustomerRow = {
  customerId: string | null;
  customerName: string | null;
  customerPartNumber: string | null;
};

async function loadItemCustomers(companyId: string, itemSku: string) {
  const item = itemSku.trim().toUpperCase();
  const [forecastRows, orderRows, invoiceRows, customerItemRows] = await Promise.all([
    prisma.$queryRaw<ItemCustomerRow[]>`
      SELECT DISTINCT "customerId", "customerName", "customerPartNumber"
      FROM "ProductRevenueForecastLine"
      WHERE "companyId" = ${companyId}
        AND UPPER(TRIM("itemSku")) = ${item}
    `.catch(() => []),
    prisma.$queryRaw<ItemCustomerRow[]>`
      SELECT DISTINCT "customerId", "customerName", "customerPn" AS "customerPartNumber"
      FROM "CustomerOrderLineSnapshot"
      WHERE "companyId" = ${companyId}
        AND (UPPER(TRIM("sku")) = ${item} OR UPPER(TRIM("itemId")) = ${item})
    `.catch(() => []),
    prisma.$queryRaw<ItemCustomerRow[]>`
      SELECT DISTINCT "customerId", NULL::text AS "customerName", "customerPartNumber"
      FROM "ProductInvoiceLineFact"
      WHERE "companyId" = ${companyId}
        AND UPPER(TRIM("itemSku")) = ${item}
    `.catch(() => []),
    prisma.$queryRaw<ItemCustomerRow[]>`
      SELECT DISTINCT
        "payload"->>'CustNum' AS "customerId",
        NULL::text AS "customerName",
        "payload"->>'CustItem' AS "customerPartNumber"
      FROM "InforRawRecord"
      WHERE "companyId" = ${companyId}
        AND "miProgram" IN ('SLCustomerItems', 'SLCUSTOMERITEMS')
        AND UPPER(TRIM("payload"->>'Item')) = ${item}
    `.catch(() => []),
  ]);

  const byKey = new Map<string, { customerId: string; customerName: string; customerPartNumber: string }>();
  for (const row of [...forecastRows, ...orderRows, ...invoiceRows, ...customerItemRows]) {
    const customerId = asText(row.customerId);
    if (!customerId) continue;
    const customerPartNumber = asText(row.customerPartNumber);
    const key = `${customerId.toUpperCase()}||${customerPartNumber.toUpperCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.customerName) existing.customerName = asText(row.customerName);
      continue;
    }
    byKey.set(key, { customerId, customerName: asText(row.customerName), customerPartNumber });
  }

  // Order lines and saved rows can carry a blank customer P/N alongside the real one.
  const entries = Array.from(byKey.values());
  return entries
    .filter(
      (entry) =>
        entry.customerPartNumber ||
        !entries.some(
          (other) =>
            other !== entry &&
            other.customerPartNumber &&
            other.customerId.toUpperCase() === entry.customerId.toUpperCase()
        )
    )
    .sort((a, b) => a.customerId.localeCompare(b.customerId, undefined, { numeric: true }));
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
    const customerGroup = String(request.nextUrl.searchParams.get('customerGroup') || '').trim();
    const includeTotals = String(request.nextUrl.searchParams.get('includeTotals') || '') === '1';
    const historyMonths = Number(request.nextUrl.searchParams.get('historyMonths') || 0);
    const refresh = ['1', 'true', 'yes'].includes(
      String(request.nextUrl.searchParams.get('refresh') || '').trim().toLowerCase()
    );

    if (request.nextUrl.searchParams.get('itemCustomers') === '1') {
      const itemSku = String(request.nextUrl.searchParams.get('itemSku') || '').trim();
      if (!itemSku) {
        return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
      }
      await ensureProductRevenueForecastTables();
      return NextResponse.json({ itemSku, customers: await loadItemCustomers(companyId, itemSku) });
    }

    if (historyMonths === 36) {
      const itemSku = String(request.nextUrl.searchParams.get('itemSku') || '').trim();
      const customerPartNumber = String(request.nextUrl.searchParams.get('customerPartNumber') || '').trim();
      if (!customerId || !itemSku) {
        return NextResponse.json({ error: 'Customer ID and APR P/N are required for item history' }, { status: 400 });
      }
      await ensureProductRevenueForecastTables();
      return NextResponse.json({
        rows: await loadItemHistory({
          companyId,
          customerId,
          customerName,
          itemSku,
          customerPartNumber,
        }),
      });
    }

    const { payload } = await withProductReportCache({
      namespace: 'product-forecast-report',
      companyId,
      keyParts: ['forecast', year, customerId, customerName, customerGroup, includeTotals ? 'totals' : 'no-totals'],
      refresh,
      build: async () => {
        await ensureProductRevenueForecastTables();

        const { customers: customerPayload, catalogSourceYear } = await listProductForecastCustomersWithCatalog(
          companyId,
          year
        );
        const customerGroups = await loadCustomerGroups(companyId);
        const customers = withCustomerGroups(customerPayload, customerGroups);

        if (!customerId && !customerName && !customerGroup) {
          const actualQty = await loadProductActualQty({ companyId, year });
          const dataThru = forecastAdjustedClosedThrough(year);
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
            customers,
            totals,
            lines: [],
          };
        }

        const lines = await loadProductForecastLinesWithCatalog({
          companyId,
          year,
          customerId: customerGroup ? undefined : customerId,
          customerName: customerGroup ? undefined : customerName,
        });
        const actualQty = await loadProductActualQty({
          companyId,
          year,
          customerId: customerGroup ? undefined : customerId,
          customerName: customerGroup ? undefined : customerName,
        });
        const dataThru = forecastAdjustedClosedThrough(year);
        const groupedLines = withCustomerGroups(lines.map(serializeForecastLine), customerGroups);

        return {
          year,
          catalogSourceYear,
          dataThru,
          customers,
          lines: forecastLinesWithActuals(
            customerGroup ? groupedLines.filter((line) => line.customerGroup === customerGroup) : groupedLines,
            actualQty,
            dataThru
          ),
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
    const customerGroup =
      asText(body.customerGroup) ||
      rawLines.map((raw) => asText((raw as Record<string, unknown>)?.customerGroup)).find(Boolean) ||
      '';
    // A customer has one group, so every row takes the customer's group.
    const lines = rawLines.map((raw, index) => ({
      ...normalizeForecastLineInput(raw as ProductRevenueForecastLineInput, { customerId, customerName }, index),
      customerGroup: customerGroup || null,
    }));
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
    if (customerId && customerGroup) {
      await saveCustomerGroup({ companyId, customerId, customerGroup });
    }
    scheduleOperationalCacheWarmupAfterSave(request, companyId, 'product-forecast');

    const saved = await loadProductForecastLinesWithCatalog({
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
    const dataThru = forecastAdjustedClosedThrough(year);
    const customerGroups = await loadCustomerGroups(companyId);

    return NextResponse.json({
      ok: true,
      year,
      dataThru,
      lines: forecastLinesWithActuals(
        withCustomerGroups(saved.map(serializeForecastLine), customerGroups),
        actualQty,
        dataThru
      ),
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to save revenue forecast';
    return NextResponse.json(
      { error: message },
      { status: /SGP budget for \d{4} is locked/.test(message) ? 409 : 500 }
    );
  }
}
