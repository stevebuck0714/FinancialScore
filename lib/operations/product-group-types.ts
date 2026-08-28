import { type ForecastQuarter, type MonthQtyMap } from '@/lib/operations/product-revenue-forecast';
import { type ShippingDay } from '@/lib/operations/product-shipping-days';

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
  kind: 'group' | 'sku';
  customerGroup: string;
  itemSku: string;
  customerPartNumber: string;
  customerName: string;
  productionType: string;
  skuCount: number;
  lines: ProductGroupRow[];
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
