import { ensureProductRevenueTables, loadRevenueDataset } from '@/lib/operations/product-revenue-actual-db';
import { adjustedEstimatedMonths } from '@/lib/operations/product-revenue-actual';
import {
  FORECAST_MONTHS,
  adjustedMonthQty,
  monthQty,
  normalizeAdjustedQtyMap,
} from '@/lib/operations/product-revenue-forecast';
import { withProductReportCache } from '@/lib/operations/product-report-cache';
import { estYear } from '@/lib/time/eastern';

/**
 * Product revenue exactly as the Monthly Revenue page computes it: actual dollars
 * are Infor actual units at each line's contract price, forecast dollars are the
 * unit forecast at contract price, and Forecast-ADJ uses actuals for closed months.
 */

type MonthArray = number[];

type AskRevenueLine = {
  customerName: string;
  customerGroup: string;
  itemSku: string;
  customerPartNumber: string;
  statusFlag: string;
  contractPrice: number | null;
  annualBaseQty: number;
  forecastQty: MonthArray;
  adjustedQty: MonthArray;
  actualQty: MonthArray;
  forecastDollars: MonthArray;
  adjustedDollars: MonthArray;
  actualDollars: MonthArray;
};

type AskRevenueDataset = {
  year: number;
  dataThru: string | null;
  lines: AskRevenueLine[];
};

const MEASURES = ['forecastQty', 'adjustedQty', 'actualQty', 'forecastDollars', 'adjustedDollars', 'actualDollars'] as const;
type Measure = (typeof MEASURES)[number];
const GROUP_BY = ['none', 'customer', 'customerGroup', 'item'] as const;
type GroupBy = (typeof GROUP_BY)[number];
const MAX_GROUPS = 100;

const round = (value: number) => Math.round(value * 100) / 100;

async function loadAskRevenueDataset(companyId: string, year: number): Promise<AskRevenueDataset> {
  const { payload } = await withProductReportCache<AskRevenueDataset>({
    namespace: 'ask-product-revenue',
    companyId,
    keyParts: ['all-lines-v2', year],
    build: async () => {
      await ensureProductRevenueTables();
      const dataset = await loadRevenueDataset({ companyId, year, includeAllLines: true });
      const dataThru = dataset.dataThru;
      return {
        year,
        dataThru,
        lines: dataset.lines.map((line) => {
          const adjustedQtyMap = normalizeAdjustedQtyMap(line.adjustedQty, line.forecastQty);
          const adjustedDollars = adjustedEstimatedMonths(
            line.forecastQty,
            line.actualQty,
            dataThru,
            line.contractPrice,
            adjustedQtyMap,
            line.actualRevenue,
          );
          return {
            customerName: line.customerName,
            customerGroup: line.customerGroup,
            itemSku: line.itemSku,
            customerPartNumber: line.customerPartNumber,
            statusFlag: line.statusFlag,
            contractPrice: line.contractPrice,
            annualBaseQty: Number(line.annualBaseQty) || 0,
            forecastQty: FORECAST_MONTHS.map((m) => monthQty(line.forecastQty, m)),
            adjustedQty: FORECAST_MONTHS.map((m) => adjustedMonthQty(line.forecastQty, line.actualQty, m, dataThru, adjustedQtyMap)),
            actualQty: FORECAST_MONTHS.map((m) => monthQty(line.actualQty, m)),
            forecastDollars: FORECAST_MONTHS.map((m) => round(monthQty(line.estimated, m))),
            adjustedDollars: FORECAST_MONTHS.map((m) => round(monthQty(adjustedDollars, m))),
            actualDollars: FORECAST_MONTHS.map((m) => round(monthQty(line.actualRevenue, m))),
          };
        }),
      };
    },
  });
  return payload;
}

function sumMonths(lines: AskRevenueLine[], measure: Measure, months: number[]): number {
  let total = 0;
  for (const line of lines) for (const m of months) total += line[measure][m - 1] || 0;
  return round(total);
}

function summarize(lines: AskRevenueLine[], months: number[]) {
  return Object.fromEntries(MEASURES.map((measure) => [measure, sumMonths(lines, measure, months)])) as Record<Measure, number>;
}

function sumAnnualBase(lines: AskRevenueLine[]): number {
  return round(lines.reduce((sum, line) => sum + line.annualBaseQty, 0));
}

function groupKey(line: AskRevenueLine, groupBy: GroupBy): string {
  if (groupBy === 'customer') return line.customerName || '(no customer)';
  if (groupBy === 'customerGroup') return line.customerGroup || '(no group)';
  if (groupBy === 'item') return [line.itemSku, line.customerName].filter(Boolean).join(' | ');
  return 'all';
}

export async function getAskProductRevenue(companyId: string, args: Record<string, unknown>) {
  const year = Number.isInteger(Number(args.year)) && Number(args.year) >= 2000 ? Number(args.year) : estYear();
  const customer = String(args.customer || '').trim().toLowerCase();
  const item = String(args.itemSku || '').trim().toLowerCase();
  const groupBy: GroupBy = GROUP_BY.includes(args.groupBy as GroupBy) ? (args.groupBy as GroupBy) : 'customer';
  const requestedMonths = (Array.isArray(args.months) ? args.months : [])
    .map(Number)
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  const months = requestedMonths.length ? [...new Set(requestedMonths)].sort((a, b) => a - b) : [...FORECAST_MONTHS];
  const limit = Math.max(1, Math.min(MAX_GROUPS, Math.floor(Number(args.limit) || 25)));

  const dataset = await loadAskRevenueDataset(companyId, year);
  if (!dataset.lines.length) return { year, note: `No product revenue data for ${year}.` };

  const lines = dataset.lines.filter((line) => {
    if (customer && !`${line.customerName} ${line.customerGroup}`.toLowerCase().includes(customer)) return false;
    if (item && !`${line.itemSku} ${line.customerPartNumber}`.toLowerCase().includes(item)) return false;
    return true;
  });
  if (!lines.length) return { year, note: 'No product revenue lines match those filters.', lineCount: 0 };

  const byMonth = months.map((m) => ({ month: m, ...summarize(lines, [m]) }));
  const groups = new Map<string, AskRevenueLine[]>();
  if (groupBy !== 'none') {
    for (const line of lines) {
      const key = groupKey(line, groupBy);
      const list = groups.get(key) || [];
      list.push(line);
      groups.set(key, list);
    }
  }
  const groupRows = [...groups.entries()]
    .map(([key, groupLines]) => ({
      [groupBy]: key,
      lineCount: groupLines.length,
      annualBaseQty: sumAnnualBase(groupLines),
      ...summarize(groupLines, months),
    }))
    .sort((a, b) => (b.adjustedDollars as number) - (a.adjustedDollars as number));

  return {
    year,
    actualsClosedThrough: dataset.dataThru,
    months,
    lineCount: lines.length,
    definitions: {
      actualDollars: 'Infor actual units x contract price. Months after actualsClosedThrough are month-to-date.',
      forecastDollars: 'Forecast units x contract price (the plan).',
      adjustedDollars: 'Forecast-ADJ: actual dollars for closed months, planner-adjusted forecast units x contract price for open months.',
      adjustedQty: 'Forecast-ADJ units: actual units for closed months, planner-adjusted forecast units for open months.',
      annualBaseQty: 'Full-year base quantity on the forecast (not limited to the selected months).',
    },
    totals: { annualBaseQty: sumAnnualBase(lines), ...summarize(lines, months) },
    byMonth,
    ...(groupBy !== 'none'
      ? { groupBy, groupCount: groupRows.length, returnedGroups: Math.min(limit, groupRows.length), groups: groupRows.slice(0, limit) }
      : {}),
  };
}

export const ASK_PRODUCT_REVENUE_TOOL_DEFINITION = {
  type: 'function' as const,
  function: {
    name: 'get_product_revenue',
    description: [
      'Wholesale product revenue and unit forecast by month, exactly as shown on the Monthly Revenue page.',
      'Use this for every product forecast question (units or dollars), product/customer/item sales dollars, actuals vs forecast, and projected revenue or units for a month.',
      'Returns actual units and dollars (from Infor), forecast and Forecast-ADJ units and dollars, totals, by-month detail, and a breakdown by customer, customer group, or item.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        year: { type: 'integer', description: 'Calendar year (default: current year)' },
        customer: { type: 'string', description: 'Case-insensitive match on customer name or customer group (e.g. "daikin")' },
        itemSku: { type: 'string', description: 'Case-insensitive match on item SKU or customer part number' },
        months: { type: 'array', items: { type: 'integer' }, description: 'Months 1-12 to include (default: all)' },
        groupBy: { type: 'string', enum: [...GROUP_BY], description: 'Breakdown (default: customer)' },
        limit: { type: 'integer', description: `Max groups to return (1-${MAX_GROUPS}, default 25)` },
      },
      additionalProperties: false,
    },
  },
};
