import { listCompanyItemDuties, normalizeItemSku } from '@/lib/hts/item-duty-overlay';
import { listCompanyItemFreight } from '@/lib/operations/item-freight-overlay';
import {
  annualActualRevenue,
  estimatedMonthDollars,
  adjustedEstimatedMonthDollars,
  quarterActualRevenue,
  quarterAdjustedEstimatedDollars,
  quarterEstimatedDollars,
  pctDaysShippedQuarter,
  pctDaysShippedYear,
  pctRevenueShipped,
  revenueDifference,
  workbookUpdatedDate,
  type ShippingDay,
} from '@/lib/operations/product-revenue-actual';
import { loadRevenueDataset } from '@/lib/operations/product-revenue-actual-db';
import {
  FORECAST_MONTHS,
  FORECAST_QUARTERS,
  adjustedMonthQty,
  annualAdjustedQty,
  emptyMonthQtyMap,
  monthQty,
  monthQtyTotal,
  pctVsPlan,
  quarterActualQty,
  quarterAdjustedQty,
  quarterForecastQty,
  type ForecastMonth,
  type ForecastQuarter,
  type MonthQtyMap,
} from '@/lib/operations/product-revenue-forecast';

export type ProductGroupOption = {
  key: string;
  label: string;
  skuCount: number;
};

export type ProductGroupMonthDollars = {
  estimated: number;
  adjusted: number;
  ytd: number;
};

export type ProductGroupRow = {
  key: string;
  customerGroup: string;
  skuCount: number;
  plannedCount: number;
  mtoCount: number;
  sgpUsage: number;
  sgpRevenue: number;
  projectedUsage: number;
  projectedUsageAdj: number;
  projectedRevenue: number;
  projectedRevenueAdj: number;
  ytdRevenue: number;
  ytdQty: number;
  sgpPrice: number | null;
  contractPrice: number | null;
  sgpMaterial: number | null;
  sgpTariff: number | null;
  sgpDuty: number | null;
  sgpFreight: number | null;
  sgpCostOfSales: number | null;
  sgpOpex: number | null;
  sgpFullyLoaded: number | null;
  sgpNetProfit: number | null;
  projectedPrice: number | null;
  projectedMaterial: number | null;
  projectedTariff: number | null;
  projectedDuty: number | null;
  projectedFreight: number | null;
  projectedCostOfSales: number | null;
  projectedOpex: number | null;
  projectedFullyLoaded: number | null;
  projectedNetProfit: number | null;
  proposedPrice: number | null;
  proposedNetProfit: number | null;
  forecastQty: MonthQtyMap;
  actualQty: MonthQtyMap;
  adjustedQty: MonthQtyMap;
  estimated: MonthQtyMap;
  estimatedAdjusted: MonthQtyMap;
  actualRevenue: MonthQtyMap;
  quarters: Record<ForecastQuarter, { forecastQty: number; adjustedQty: number; ytdQty: number; estimated: number; adjusted: number; ytd: number }>;
};

export type ProductGroupDataset = {
  year: number;
  dataThru: string | null;
  workbookUpdated: string | null;
  shippingDays: ShippingDay[];
  priceCount: number;
  groups: ProductGroupOption[];
  rows: ProductGroupRow[];
};

type SerializedRevenueLine = {
  customerGroup?: string | null;
  itemSku?: string | null;
  productionType?: string | null;
  annualBaseQty?: number | null;
  sgpPrice?: number | null;
  contractPrice?: number | null;
  sgpEstimated?: number;
  annualEstimated?: number;
  annualAdjusted?: number;
  annualYtd?: number;
  forecastQty?: MonthQtyMap;
  actualQty?: MonthQtyMap;
  adjustedQty?: MonthQtyMap;
  actualRevenue?: MonthQtyMap;
};

function normalizeGroup(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim() || 'Ungrouped';
}

function addMaps(target: MonthQtyMap, extra: MonthQtyMap | undefined) {
  for (const month of FORECAST_MONTHS) {
    target[String(month)] = (Number(target[String(month)]) || 0) + (Number(extra?.[String(month)]) || 0);
  }
}

function weightedAvg(sum: number, weight: number): number | null {
  if (!Number.isFinite(sum) || !Number.isFinite(weight) || weight <= 0) return null;
  return sum / weight;
}

function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function emptyQuarter() {
  return { forecastQty: 0, adjustedQty: 0, ytdQty: 0, estimated: 0, adjusted: 0, ytd: 0 };
}

function skuKey(value: unknown): string {
  return normalizeItemSku(value).toUpperCase();
}

function firstFinite(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (value != null && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function sumPieces(...values: Array<number | null | undefined>): number | null {
  let total = 0;
  let sawValue = false;
  for (const value of values) {
    if (value == null || !Number.isFinite(Number(value))) continue;
    total += Number(value);
    sawValue = true;
  }
  return sawValue ? total : null;
}

function emptyAccumulator(group: string) {
  return {
    customerGroup: group,
    skuCount: 0,
    plannedCount: 0,
    mtoCount: 0,
    sgpUsage: 0,
    sgpRevenue: 0,
    projectedUsage: 0,
    projectedUsageAdj: 0,
    projectedRevenue: 0,
    projectedRevenueAdj: 0,
    ytdRevenue: 0,
    ytdQty: 0,
    priceWeight: 0,
    sgpPriceSum: 0,
    contractPriceSum: 0,
    sgpMaterialSum: 0,
    sgpTariffSum: 0,
    sgpDutySum: 0,
    sgpFreightSum: 0,
    sgpCosSum: 0,
    sgpOpexSum: 0,
    sgpFullySum: 0,
    sgpNpSum: 0,
    projectedPriceSum: 0,
    projectedMaterialSum: 0,
    projectedTariffSum: 0,
    projectedDutySum: 0,
    projectedFreightSum: 0,
    projectedCosSum: 0,
    projectedOpexSum: 0,
    projectedFullySum: 0,
    projectedNpSum: 0,
    proposedPriceSum: 0,
    proposedNpSum: 0,
    economicsWeight: 0,
    forecastQty: emptyMonthQtyMap(),
    actualQty: emptyMonthQtyMap(),
    adjustedQty: emptyMonthQtyMap(),
    estimated: emptyMonthQtyMap(),
    estimatedAdjusted: emptyMonthQtyMap(),
    actualRevenue: emptyMonthQtyMap(),
    quarters: {
      1: emptyQuarter(),
      2: emptyQuarter(),
      3: emptyQuarter(),
      4: emptyQuarter(),
    } as Record<ForecastQuarter, ReturnType<typeof emptyQuarter>>,
  };
}

function indexBySku<T extends { itemSku: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = skuKey(row.itemSku);
    if (key && !map.has(key)) map.set(key, row);
  }
  return map;
}

export async function loadProductGroupDataset(params: {
  companyId: string;
  year: number;
}): Promise<ProductGroupDataset> {
  const [dataset, duties, freight] = await Promise.all([
    loadRevenueDataset({ companyId: params.companyId, year: params.year, includeAllLines: true }),
    listCompanyItemDuties(params.companyId).catch(() => []),
    listCompanyItemFreight(params.companyId).catch(() => []),
  ]);
  const dutyBySku = indexBySku(duties);
  const freightBySku = indexBySku(freight);
  const buckets = new Map<string, ReturnType<typeof emptyAccumulator>>();
  const dataThru = dataset.dataThru;

  for (const raw of dataset.lines as SerializedRevenueLine[]) {
    const group = normalizeGroup(raw.customerGroup);
    const bucket = buckets.get(group) || emptyAccumulator(group);
    buckets.set(group, bucket);
    bucket.skuCount += 1;
    const production = String(raw.productionType || '').trim().toUpperCase();
    if (production === 'PLANNED') bucket.plannedCount += 1;
    if (production === 'MTO') bucket.mtoCount += 1;

    const forecastQty = raw.forecastQty || emptyMonthQtyMap();
    const actualQty = raw.actualQty || emptyMonthQtyMap();
    const adjustedQty = raw.adjustedQty || emptyMonthQtyMap();
    const actualRevenue = raw.actualRevenue || emptyMonthQtyMap();
    addMaps(bucket.forecastQty, forecastQty);
    addMaps(bucket.actualQty, actualQty);
    addMaps(bucket.actualRevenue, actualRevenue);
    for (const month of FORECAST_MONTHS) {
      bucket.adjustedQty[String(month)] += adjustedMonthQty(
        forecastQty,
        actualQty,
        month,
        dataThru,
        adjustedQty
      );
    }

    const sgpUsage = Number(raw.annualBaseQty) || 0;
    const weight = sgpUsage > 0 ? sgpUsage : monthQtyTotal(forecastQty) || 1;
    bucket.sgpUsage += sgpUsage;
    bucket.sgpRevenue += Number(raw.sgpEstimated) || 0;
    bucket.projectedUsage += monthQtyTotal(forecastQty);
    bucket.projectedUsageAdj += annualAdjustedQty(forecastQty, actualQty, dataThru, adjustedQty);
    bucket.projectedRevenue += Number(raw.annualEstimated) || 0;
    bucket.projectedRevenueAdj += Number(raw.annualAdjusted) || 0;
    bucket.ytdRevenue += Number(raw.annualYtd) || annualActualRevenue(actualRevenue);
    bucket.ytdQty += monthQtyTotal(actualQty);

    if (raw.sgpPrice != null && Number.isFinite(Number(raw.sgpPrice))) {
      bucket.sgpPriceSum += Number(raw.sgpPrice) * weight;
    }
    if (raw.contractPrice != null && Number.isFinite(Number(raw.contractPrice))) {
      bucket.contractPriceSum += Number(raw.contractPrice) * weight;
    }
    bucket.priceWeight += weight;

    const sku = skuKey(raw.itemSku);
    const duty = sku ? dutyBySku.get(sku) : undefined;
    const freightRow = sku ? freightBySku.get(sku) : undefined;
    const sgpMaterial = firstFinite(freightRow?.unitCost);
    const projectedMaterial = firstFinite(freightRow?.currentUnitCost, freightRow?.unitCost);
    const tariff = firstFinite(duty?.tariffPerPiece);
    const dutyPerPiece = firstFinite(duty?.dutyPerPiece);
    const sgpFreight = firstFinite(freightRow?.estimatedFreightCurrent);
    const projectedFreight = firstFinite(freightRow?.estimatedFreightFuture, freightRow?.estimatedFreightCurrent);
    const sgpCostOfSales = sumPieces(sgpMaterial, tariff, dutyPerPiece, sgpFreight);
    const projectedCostOfSales = sumPieces(projectedMaterial, tariff, dutyPerPiece, projectedFreight);
    const sgpPrice = firstFinite(raw.sgpPrice);
    const projectedPrice = firstFinite(raw.contractPrice, raw.sgpPrice);
    const addWeighted = (sumKey: keyof ReturnType<typeof emptyAccumulator>, value: number | null | undefined) => {
      if (value == null || !Number.isFinite(Number(value))) return;
      (bucket[sumKey] as number) += Number(value) * weight;
    };
    addWeighted('sgpMaterialSum', sgpMaterial);
    addWeighted('sgpTariffSum', tariff);
    addWeighted('sgpDutySum', dutyPerPiece);
    addWeighted('sgpFreightSum', sgpFreight);
    addWeighted('sgpCosSum', sgpCostOfSales);
    addWeighted('sgpFullySum', sgpCostOfSales);
    addWeighted('sgpNpSum', sgpPrice != null && sgpCostOfSales != null ? sgpPrice - sgpCostOfSales : null);
    addWeighted('projectedPriceSum', projectedPrice);
    addWeighted('projectedMaterialSum', projectedMaterial);
    addWeighted('projectedTariffSum', tariff);
    addWeighted('projectedDutySum', dutyPerPiece);
    addWeighted('projectedFreightSum', projectedFreight);
    addWeighted('projectedCosSum', projectedCostOfSales);
    addWeighted('projectedFullySum', projectedCostOfSales);
    addWeighted('projectedNpSum', projectedPrice != null && projectedCostOfSales != null ? projectedPrice - projectedCostOfSales : null);
    if (sgpCostOfSales != null || projectedCostOfSales != null) {
      bucket.economicsWeight += weight;
    }

    for (const month of FORECAST_MONTHS) {
      bucket.estimated[String(month)] += estimatedMonthDollars(forecastQty, raw.contractPrice, month);
      bucket.estimatedAdjusted[String(month)] += adjustedEstimatedMonthDollars(
        forecastQty,
        actualQty,
        month,
        dataThru,
        raw.contractPrice,
        adjustedQty
      );
    }

    for (const quarter of FORECAST_QUARTERS) {
      bucket.quarters[quarter].forecastQty += quarterForecastQty(forecastQty, quarter);
      bucket.quarters[quarter].adjustedQty += quarterAdjustedQty(forecastQty, actualQty, dataThru, quarter, adjustedQty);
      bucket.quarters[quarter].ytdQty += quarterActualQty(actualQty, quarter);
      bucket.quarters[quarter].estimated += quarterEstimatedDollars(forecastQty, raw.contractPrice, quarter);
      bucket.quarters[quarter].adjusted += quarterAdjustedEstimatedDollars(
        forecastQty,
        actualQty,
        dataThru,
        raw.contractPrice,
        quarter,
        adjustedQty
      );
      bucket.quarters[quarter].ytd += quarterActualRevenue(actualRevenue, quarter);
    }
  }

  const rows = Array.from(buckets.values())
    .map((bucket): ProductGroupRow => ({
      key: bucket.customerGroup,
      customerGroup: bucket.customerGroup,
      skuCount: bucket.skuCount,
      plannedCount: bucket.plannedCount,
      mtoCount: bucket.mtoCount,
      sgpUsage: bucket.sgpUsage,
      sgpRevenue: bucket.sgpRevenue,
      projectedUsage: bucket.projectedUsage,
      projectedUsageAdj: bucket.projectedUsageAdj,
      projectedRevenue: bucket.projectedRevenue,
      projectedRevenueAdj: bucket.projectedRevenueAdj,
      ytdRevenue: bucket.ytdRevenue,
      ytdQty: bucket.ytdQty,
      sgpPrice: weightedAvg(bucket.sgpPriceSum, bucket.priceWeight),
      contractPrice: weightedAvg(bucket.contractPriceSum, bucket.priceWeight),
      sgpMaterial: weightedAvg(bucket.sgpMaterialSum, bucket.economicsWeight),
      sgpTariff: weightedAvg(bucket.sgpTariffSum, bucket.economicsWeight),
      sgpDuty: weightedAvg(bucket.sgpDutySum, bucket.economicsWeight),
      sgpFreight: weightedAvg(bucket.sgpFreightSum, bucket.economicsWeight),
      sgpCostOfSales: weightedAvg(bucket.sgpCosSum, bucket.economicsWeight),
      sgpOpex: weightedAvg(bucket.sgpOpexSum, bucket.economicsWeight),
      sgpFullyLoaded: weightedAvg(bucket.sgpFullySum, bucket.economicsWeight),
      sgpNetProfit: weightedAvg(bucket.sgpNpSum, bucket.economicsWeight),
      projectedPrice: weightedAvg(bucket.projectedPriceSum, bucket.economicsWeight) ?? weightedAvg(bucket.contractPriceSum, bucket.priceWeight),
      projectedMaterial: weightedAvg(bucket.projectedMaterialSum, bucket.economicsWeight),
      projectedTariff: weightedAvg(bucket.projectedTariffSum, bucket.economicsWeight),
      projectedDuty: weightedAvg(bucket.projectedDutySum, bucket.economicsWeight),
      projectedFreight: weightedAvg(bucket.projectedFreightSum, bucket.economicsWeight),
      projectedCostOfSales: weightedAvg(bucket.projectedCosSum, bucket.economicsWeight),
      projectedOpex: weightedAvg(bucket.projectedOpexSum, bucket.economicsWeight),
      projectedFullyLoaded: weightedAvg(bucket.projectedFullySum, bucket.economicsWeight),
      projectedNetProfit: weightedAvg(bucket.projectedNpSum, bucket.economicsWeight),
      proposedPrice: weightedAvg(bucket.proposedPriceSum, bucket.economicsWeight),
      proposedNetProfit: weightedAvg(bucket.proposedNpSum, bucket.economicsWeight),
      forecastQty: bucket.forecastQty,
      actualQty: bucket.actualQty,
      adjustedQty: bucket.adjustedQty,
      estimated: bucket.estimated,
      estimatedAdjusted: bucket.estimatedAdjusted,
      actualRevenue: bucket.actualRevenue,
      quarters: bucket.quarters,
    }))
    .sort((a, b) => a.customerGroup.localeCompare(b.customerGroup, undefined, { sensitivity: 'base' }));

  return {
    year: dataset.year,
    dataThru: dataset.dataThru,
    workbookUpdated: workbookUpdatedDate(dataset.dataThru),
    shippingDays: dataset.shippingDays,
    priceCount: dataset.priceCount,
    groups: rows.map((row) => ({ key: row.key, label: row.customerGroup, skuCount: row.skuCount })),
    rows,
  };
}

export function groupMonthQty(row: ProductGroupRow, month: ForecastMonth) {
  return {
    forecasted: monthQty(row.forecastQty, month),
    adjusted: monthQty(row.adjustedQty, month) || monthQty(row.forecastQty, month),
    actual: monthQty(row.actualQty, month),
  };
}

export function groupMonthDollars(row: ProductGroupRow, month: ForecastMonth): ProductGroupMonthDollars {
  return {
    estimated: monthQty(row.estimated, month),
    adjusted: monthQty(row.estimatedAdjusted, month),
    ytd: monthQty(row.actualRevenue, month),
  };
}

export function groupTotals(rows: ProductGroupRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.skuCount += row.skuCount;
      acc.sgpUsage += row.sgpUsage;
      acc.sgpRevenue += row.sgpRevenue;
      acc.projectedUsage += row.projectedUsage;
      acc.projectedUsageAdj += row.projectedUsageAdj;
      acc.projectedRevenue += row.projectedRevenue;
      acc.projectedRevenueAdj += row.projectedRevenueAdj;
      acc.ytdRevenue += row.ytdRevenue;
      acc.ytdQty += row.ytdQty;
      addMaps(acc.forecastQty, row.forecastQty);
      addMaps(acc.actualQty, row.actualQty);
      addMaps(acc.adjustedQty, row.adjustedQty);
      addMaps(acc.estimated, row.estimated);
      addMaps(acc.estimatedAdjusted, row.estimatedAdjusted);
      addMaps(acc.actualRevenue, row.actualRevenue);
      for (const quarter of FORECAST_QUARTERS) {
        acc.quarters[quarter].forecastQty += row.quarters[quarter].forecastQty;
        acc.quarters[quarter].adjustedQty += row.quarters[quarter].adjustedQty;
        acc.quarters[quarter].ytdQty += row.quarters[quarter].ytdQty;
        acc.quarters[quarter].estimated += row.quarters[quarter].estimated;
        acc.quarters[quarter].adjusted += row.quarters[quarter].adjusted;
        acc.quarters[quarter].ytd += row.quarters[quarter].ytd;
      }
      return acc;
    },
    {
      skuCount: 0,
      sgpUsage: 0,
      sgpRevenue: 0,
      projectedUsage: 0,
      projectedUsageAdj: 0,
      projectedRevenue: 0,
      projectedRevenueAdj: 0,
      ytdRevenue: 0,
      ytdQty: 0,
      forecastQty: emptyMonthQtyMap(),
      actualQty: emptyMonthQtyMap(),
      adjustedQty: emptyMonthQtyMap(),
      estimated: emptyMonthQtyMap(),
      estimatedAdjusted: emptyMonthQtyMap(),
      actualRevenue: emptyMonthQtyMap(),
      quarters: {
        1: emptyQuarter(),
        2: emptyQuarter(),
        3: emptyQuarter(),
        4: emptyQuarter(),
      } as Record<ForecastQuarter, ReturnType<typeof emptyQuarter>>,
    }
  );
}

export { pctDaysShippedQuarter, pctDaysShippedYear, pctRevenueShipped, pctVsPlan, revenueDifference };
