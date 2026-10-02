import prisma from '@/lib/prisma';
import { ensureProductRevenueTables, normalizeRevenueLineInput, upsertRevenueLines, upsertRevenuePrices } from '@/lib/operations/product-revenue-actual-db';
import { ensureProductRevenueForecastTables, normalizeForecastLineInput, upsertForecastLines } from '@/lib/operations/product-revenue-forecast-db';
import {
  ensureVendorMonthlyForecastTables,
  normalizeVendorForecastLineInput,
  upsertVendorForecastLines,
} from '@/lib/operations/vendor-monthly-forecast-db';

export const FILTECH_COMPANY_ID = 'cmulunpak0003qhucuae8c7tv';
export const FILTECH_TRAILING_ANNUAL_REVENUE = 20_400_000;
const SOURCE = 'FILTECH_DEMO';

type Day = {
  date: Date;
  revenue: number;
  cogsTotal: number;
  expense: number;
  cash: number;
  ar: number;
  inventory: number;
  ap: number;
};

const products = [
  { sku: 'FILTECH-100', name: 'Precision Filtration Assembly', category: 'Filtration Assemblies', site: 'East Plant', price: 1_250, mix: 0.34, cogsPct: 0.48, vendor: ['FIL-V-01', 'Apex Filter Media'] },
  { sku: 'FILTECH-200', name: 'Industrial Filter Cartridge', category: 'Replacement Cartridges', site: 'East Plant', price: 760, mix: 0.27, cogsPct: 0.44, vendor: ['FIL-V-02', 'Northstar Components'] },
  { sku: 'FILTECH-300', name: 'High-Flow Process Module', category: 'Process Modules', site: 'Central Plant', price: 2_100, mix: 0.22, cogsPct: 0.52, vendor: ['FIL-V-03', 'Meridian Fabrication'] },
  { sku: 'FILTECH-400', name: 'Service and Maintenance Kit', category: 'Service Kits', site: 'Central Plant', price: 420, mix: 0.17, cogsPct: 0.31, vendor: ['FIL-V-04', 'Summit Industrial Supply'] },
] as const;

const customers = [
  ['FIL-C-01', 'Atlantic Process Systems', 'Industrial'],
  ['FIL-C-02', 'Northstar Waterworks', 'Municipal'],
  ['FIL-C-03', 'Pioneer Chemical Solutions', 'Industrial'],
  ['FIL-C-04', 'Summit Food Processing', 'Food & Beverage'],
] as const;

export type FiltechNormalizedProductRow = {
  source: 'filtech-demo';
  snapshotDate: Date;
  date: Date;
  orderDate: Date;
  itemId: string;
  itemName: string;
  sku: string;
  category: string;
  site: string;
  customerId: string;
  customerName: string;
  customer: string;
  customerGroup: string;
  customerPartNumber: string;
  orderId: string;
  lineId: string;
  quantitySold: number;
  qtyOrdered: number;
  qtyShipped: number;
  qtyInvoiced: number;
  unitPrice: number;
  unitCost: number;
  unitCostOverride: number;
  revenue: number;
  cogs: number;
  grossMargin: number;
  grossMarginPct: number;
  contractValue: number;
  invoicedAmount: number;
  remainingAmount: number;
  sourceTransaction: string;
};

export function isFiltechDemoCompany(companyId: string): boolean {
  return String(companyId || '').trim() === FILTECH_COMPANY_ID;
}

function utcDate(year: number, month: number, day = 1) {
  return new Date(Date.UTC(year, month, day));
}

function isBusinessDay(date: Date) {
  const weekday = date.getUTCDay();
  return weekday > 0 && weekday < 6;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date) {
  return dateKey(date).slice(0, 7);
}

function monthsInRange(start: Date, end: Date) {
  const months: Date[] = [];
  for (let date = utcDate(start.getUTCFullYear(), start.getUTCMonth()); date <= end; date = utcDate(date.getUTCFullYear(), date.getUTCMonth() + 1)) {
    months.push(date);
  }
  return months;
}

function previousMonths(end: Date, count: number) {
  return utcDate(end.getUTCFullYear(), end.getUTCMonth() - count + 1);
}

function numeric(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * The Operations Product UI expects invoice-like rows rather than the monthly
 * ProductRevenueLine workbook shape. Keep this adapter alongside the canonical
 * demo fixtures so a freshly provisioned Filtech company can render the same
 * reports before any ERP snapshot import exists.
 */
export function buildFiltechNormalizedProductRows(params: {
  startDate: Date;
  endDate: Date;
}): FiltechNormalizedProductRow[] {
  const start = utcDate(
    params.startDate.getUTCFullYear(),
    params.startDate.getUTCMonth(),
    params.startDate.getUTCDate()
  );
  const end = utcDate(
    params.endDate.getUTCFullYear(),
    params.endDate.getUTCMonth(),
    params.endDate.getUTCDate()
  );
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const rows: FiltechNormalizedProductRow[] = [];
  const customerMix = [0.34, 0.27, 0.22, 0.17];
  for (let date = new Date(start); date <= end; date = new Date(date.getTime() + 86_400_000)) {
    if (!isBusinessDay(date)) continue;
    const seasonality = 1 + Math.sin((date.getUTCMonth() / 12) * Math.PI * 2) * 0.09;
    const weekday = [0, 0.94, 1.01, 1.04, 1.02, 0.99, 0][date.getUTCDay()];
    const dailyRevenue = numeric((FILTECH_TRAILING_ANNUAL_REVENUE / 260) * seasonality * weekday);
    const dayKey = dateKey(date).replace(/-/g, '');

    for (const [customerIndex, [customerId, customerName, customerGroup]] of customers.entries()) {
      for (const [productIndex, product] of products.entries()) {
        const revenue = numeric(dailyRevenue * product.mix * (customerMix[customerIndex] || 0.25) / 0.25);
        const quantitySold = numeric(revenue / product.price);
        const unitCost = numeric(product.price * product.cogsPct);
        const cogs = numeric(quantitySold * unitCost);
        const grossMargin = numeric(revenue - cogs);
        const orderId = `FIL-${dayKey}-${String(customerIndex + 1).padStart(2, '0')}-${String(productIndex + 1).padStart(2, '0')}`;
        rows.push({
          source: 'filtech-demo',
          snapshotDate: new Date(date),
          date: new Date(date),
          orderDate: new Date(date),
          itemId: product.sku,
          itemName: product.name,
          sku: product.sku,
          category: product.category,
          site: product.site,
          customerId,
          customerName,
          customer: customerName,
          customerGroup,
          customerPartNumber: `FIL-${customerIndex + 1}${productIndex + 1}`,
          orderId,
          lineId: '1-0',
          quantitySold,
          qtyOrdered: quantitySold,
          qtyShipped: quantitySold,
          qtyInvoiced: quantitySold,
          unitPrice: product.price,
          unitCost,
          unitCostOverride: unitCost,
          revenue,
          cogs,
          grossMargin,
          grossMarginPct: revenue > 0 ? numeric((grossMargin / revenue) * 100) : 0,
          contractValue: revenue,
          invoicedAmount: revenue,
          remainingAmount: 0,
          sourceTransaction: `FILTECH-DEMO:${orderId}`,
        });
      }
    }
  }
  return rows;
}

function buildDays(asOf: Date, months: number): Day[] {
  const start = previousMonths(asOf, months);
  const days: Day[] = [];
  const workdays: Date[] = [];
  for (let date = start; date <= asOf; date = new Date(date.getTime() + 86_400_000)) {
    if (isBusinessDay(date)) workdays.push(new Date(date));
  }

  const baseRevenue = FILTECH_TRAILING_ANNUAL_REVENUE / 260;
  workdays.forEach((date, index) => {
    const seasonality = 1 + Math.sin((date.getUTCMonth() / 12) * Math.PI * 2) * 0.09;
    const trend = 0.93 + (index / Math.max(1, workdays.length - 1)) * 0.14;
    const weekday = [0, 0.94, 1.01, 1.04, 1.02, 0.99, 0][date.getUTCDay()];
    const revenue = numeric(baseRevenue * seasonality * trend * weekday);
    const cogsTotal = numeric(revenue * 0.455);
    const expense = numeric(revenue * 0.295);
    const cash = numeric(1_450_000 + index * 1_250 + Math.sin(index / 13) * 95_000);
    const ar = numeric(revenue * (0.92 + (index % 5) * 0.03));
    const inventory = numeric(revenue * 1.62);
    const ap = numeric(cogsTotal * 0.84);
    days.push({ date, revenue, cogsTotal, expense, cash, ar, inventory, ap });
  });
  return days;
}

function daySnapshot(day: Day) {
  const cogsPayroll = numeric(day.cogsTotal * 0.23);
  const cogsMaterials = numeric(day.cogsTotal * 0.53);
  const cogsContractors = numeric(day.cogsTotal * 0.12);
  const cogsOther = numeric(day.cogsTotal - cogsPayroll - cogsMaterials - cogsContractors);
  const payroll = numeric(day.expense * 0.34);
  const rent = numeric(day.expense * 0.14);
  const marketing = numeric(day.expense * 0.12);
  const professionalFees = numeric(day.expense * 0.08);
  const insurance = numeric(day.expense * 0.05);
  const infrastructure = numeric(day.expense * 0.09);
  const otherExpense = numeric(day.expense - payroll - rent - marketing - professionalFees - insurance - infrastructure);
  const otherCA = 280_000;
  const fixedAssets = 4_850_000;
  const totalAssets = numeric(day.cash + day.ar + day.inventory + otherCA + fixedAssets);
  const otherCL = 410_000;
  const ltd = 2_100_000;
  const totalLiab = numeric(day.ap + otherCL + ltd);
  const retainedEarnings = numeric(totalAssets - totalLiab - 2_400_000);
  return {
    snapshotDate: day.date,
    frequency: 'daily',
    sourcePlatform: SOURCE,
    sourceRunId: `${SOURCE}:${dateKey(day.date)}`,
    revenue: day.revenue,
    expense: day.expense,
    cogsPayroll,
    cogsContractors,
    cogsMaterials,
    cogsOther,
    cogsTotal: day.cogsTotal,
    payroll,
    rent,
    marketing,
    professionalFees,
    insurance,
    infrastructure,
    otherExpense,
    cash: day.cash,
    ar: day.ar,
    inventory: day.inventory,
    otherCA,
    tca: numeric(day.cash + day.ar + day.inventory + otherCA),
    fixedAssets,
    totalAssets,
    ap: day.ap,
    otherCL,
    tcl: numeric(day.ap + otherCL),
    ltd,
    totalLiab,
    ownersCapital: 2_400_000,
    retainedEarnings,
    totalEquity: numeric(2_400_000 + retainedEarnings),
    totalLAndE: totalAssets,
  };
}

function monthMaps(days: Day[]) {
  const revenue = new Map<string, number>();
  const quantity = new Map<string, number>();
  for (const day of days) {
    const key = monthKey(day.date);
    revenue.set(key, (revenue.get(key) || 0) + day.revenue);
    quantity.set(key, (quantity.get(key) || 0) + 1);
  }
  return { revenue, quantity };
}

async function seedProductAndVendorReports(companyId: string, days: Day[], asOf: Date) {
  await Promise.all([ensureProductRevenueTables(), ensureVendorMonthlyForecastTables(), ensureProductRevenueForecastTables()]);
  const monthly = monthMaps(days);
  const years = [...new Set(days.map((day) => day.date.getUTCFullYear()))];

  for (const year of years) {
    const yearlyDays = days.filter((day) => day.date.getUTCFullYear() === year);
    const dataThru = year === asOf.getUTCFullYear() ? asOf : utcDate(year, 11, 31);
    const revenueLines = [];
    const forecastLines = [];
    const vendorLines = [];
    const prices = [];

    for (const [customerIndex, [customerId, customerName, customerGroup]] of customers.entries()) {
      for (const [productIndex, product] of products.entries()) {
        const mix = product.mix * ([0.34, 0.27, 0.22, 0.17][customerIndex] || 0.2) / 0.25;
        const actualRevenue: Record<string, number> = {};
        const actualQty: Record<string, number> = {};
        const forecastQty: Record<string, number> = {};
        for (const day of yearlyDays) {
          const key = monthKey(day.date);
          actualRevenue[key] = numeric((actualRevenue[key] || 0) + day.revenue * mix);
        }
        for (const month of monthsInRange(utcDate(year, 0), utcDate(year, 11, 31))) {
          const key = monthKey(month);
          const monthlyRevenue = actualRevenue[key] || (monthly.revenue.get(key) || 0) * mix;
          actualQty[key] = Math.round(monthlyRevenue / product.price);
          forecastQty[key] = Math.round(actualQty[key] * (1.04 + productIndex * 0.01));
        }

        const common = {
          customerId,
          customerName,
          customerGroup,
          customerPartNumber: `FIL-${customerIndex + 1}${productIndex + 1}`,
          itemSku: product.sku,
          team: customerIndex < 2 ? 'East' : 'Central',
          csr: customerIndex < 2 ? 'Jordan Lee' : 'Morgan Reyes',
          productionType: productIndex < 3 ? 'Make-to-Order' : 'Service',
          statusFlag: 'ACTIVE',
        };
        revenueLines.push(normalizeRevenueLineInput({ ...common, actualRevenue }, { customerId, customerName }, revenueLines.length));
        forecastLines.push(normalizeForecastLineInput({
          ...common,
          annualBaseQty: Object.values(actualQty).reduce((sum, value) => sum + value, 0),
          forecastQty,
          actualQty,
        }, { customerId, customerName }, forecastLines.length));
        vendorLines.push(normalizeVendorForecastLineInput({
          ...common,
          vendorId: product.vendor[0],
          vendorName: product.vendor[1],
          annualBaseQty: Object.values(actualQty).reduce((sum, value) => sum + value, 0),
          forecastQty,
          actualQty,
        }, { vendorId: product.vendor[0], vendorName: product.vendor[1] }, vendorLines.length));
        prices.push({ customerGroup, itemSku: product.sku, contractPrice: product.price, sgpPrice: numeric(product.price * 1.04) });
      }
    }

    await upsertRevenueLines({ companyId, year, dataThru, lines: revenueLines });
    await upsertRevenuePrices({ companyId, year, prices });
    await upsertForecastLines({ companyId, year, dataThru, lines: forecastLines });
    await upsertVendorForecastLines({ companyId, year, dataThru, lines: vendorLines });
  }
}

export async function provisionFiltechDemoData(params: { companyId?: string; asOf?: Date; months?: number } = {}) {
  const companyId = params.companyId || FILTECH_COMPANY_ID;
  const asOf = params.asOf ? new Date(params.asOf) : new Date();
  const end = utcDate(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const months = Math.max(24, params.months || 24);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, addressCountry: true },
  });
  if (!company) throw new Error(`Filtech company ${companyId} does not exist.`);
  const owner =
    await prisma.user.findFirst({ where: { companyId }, select: { id: true } }) ??
    await prisma.user.findFirst({ where: { role: 'SITEADMIN' }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  if (!owner) throw new Error(`Filtech company ${companyId} needs a company user or site admin before financial history can be provisioned.`);

  const days = buildDays(end, months);
  const snapshots = days.map(daySnapshot);
  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: companyId },
      data: { baseCurrency: 'USD', reportingCurrency: null, locale: 'en-US' },
    });
    await tx.dailyFinancialMappedLine.deleteMany({ where: { companyId, sourcePlatform: SOURCE } });
    await tx.dailyFinancialSnapshot.deleteMany({ where: { companyId, sourcePlatform: SOURCE } });
    await tx.dailyFinancialSnapshot.createMany({ data: snapshots.map((row) => ({ companyId, ...row })) });

    const sourceRecords = await tx.financialRecord.findMany({
      where: { companyId, fileName: { startsWith: `${SOURCE}-` } },
      select: { id: true },
    });
    await tx.monthlyFinancial.deleteMany({ where: { financialRecordId: { in: sourceRecords.map((record) => record.id) } } });
    await tx.financialRecord.deleteMany({ where: { id: { in: sourceRecords.map((record) => record.id) } } });
    const financialRecord = await tx.financialRecord.create({
      data: {
        companyId,
        uploadedByUserId: owner.id,
        fileName: `${SOURCE}-${dateKey(end)}`,
        rawData: { source: SOURCE, months, trailingAnnualRevenueTarget: FILTECH_TRAILING_ANNUAL_REVENUE },
        columnMapping: { source: SOURCE, currency: 'USD' },
      },
    });
    const grouped = new Map<string, typeof snapshots>();
    for (const snapshot of snapshots) {
      const key = monthKey(snapshot.snapshotDate);
      grouped.set(key, [...(grouped.get(key) || []), snapshot]);
    }
    await tx.monthlyFinancial.createMany({
      data: [...grouped.entries()].map(([key, rows]) => {
        const latest = rows.at(-1)!;
        const sum = (field: 'revenue' | 'expense' | 'cogsTotal') => numeric(rows.reduce((total, row) => total + Number(row[field]), 0));
        return {
          companyId,
          financialRecordId: financialRecord.id,
          monthDate: new Date(`${key}-01T00:00:00.000Z`),
          revenue: sum('revenue'),
          expense: sum('expense'),
          cogsTotal: sum('cogsTotal'),
          cash: latest.cash,
          ar: latest.ar,
          inventory: latest.inventory,
          ap: latest.ap,
          totalAssets: latest.totalAssets,
          totalLiab: latest.totalLiab,
          totalEquity: latest.totalEquity,
          totalLAndE: latest.totalLAndE,
        };
      }),
    });
  }, { timeout: 120_000 });

  await seedProductAndVendorReports(companyId, days, end);
  await prisma.derivedApiCache.deleteMany({ where: { namespace: 'product-revenue-report', cacheKey: { contains: companyId } } });

  const trailingStart = new Date(end);
  trailingStart.setUTCFullYear(trailingStart.getUTCFullYear() - 1);
  const trailingRevenue = numeric(days.filter((day) => day.date > trailingStart).reduce((total, day) => total + day.revenue, 0));
  return {
    companyId,
    companyName: company.name,
    currency: 'USD',
    country: company.addressCountry,
    months,
    dailyFinancialSnapshots: snapshots.length,
    monthlyFinancials: new Set(snapshots.map((row) => monthKey(row.snapshotDate))).size,
    trailingAnnualRevenue: trailingRevenue,
    productYears: [...new Set(days.map((day) => day.date.getUTCFullYear()))],
  };
}
