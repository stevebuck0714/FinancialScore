import prisma from '@/lib/prisma';
import { formatEstDate } from '@/lib/time/eastern';
import {
  expensePoolsFromFinancialTotals,
  normalizeClientMatchKey,
  scalePools,
  type CostToServeExpensePools,
  type CostToServeRevenueInput,
} from '@/lib/operational/payroll-bureau-cost-to-serve';

export type PayrollBureauAccountingClient = CostToServeRevenueInput & {
  customerId: string | null;
  displayName: string;
};

export type PayrollBureauAccountingInputs = {
  monthByName: Map<string, PayrollBureauAccountingClient>;
  ytdByName: Map<string, PayrollBureauAccountingClient>;
  annualByName: Map<string, PayrollBureauAccountingClient>;
  monthPools: CostToServeExpensePools | null;
  ytdPools: CostToServeExpensePools | null;
  annualPools: CostToServeExpensePools | null;
  unmappedMonthRevenue: number;
  unmappedYtdRevenue: number;
  unmappedAnnualRevenue: number;
  hasCustomerSales: boolean;
  hasFinancials: boolean;
};

type SalesRow = {
  customerId: string | null;
  customerName: string;
  revenue: number;
  snapshotDate: Date;
  frequency: string;
};

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function estMonthParts(asOfDate = formatEstDate()) {
  const year = Number(asOfDate.slice(0, 4));
  const month = Number(asOfDate.slice(5, 7));
  return { year, month, monthIndex: month, monthKey: `${year}-${String(month).padStart(2, '0')}` };
}

function emptyClient(displayName: string, customerId: string | null): PayrollBureauAccountingClient {
  return {
    clientName: displayName,
    displayName,
    customerId,
    grossBilled: 0,
    credits: 0,
    directCosts: 0,
    mappedToQbd: true,
    itemizedInvoices: false,
  };
}

function addSales(
  map: Map<string, PayrollBureauAccountingClient>,
  row: SalesRow
): void {
  const displayName = String(row.customerName || '').trim() || 'Unknown customer';
  const key = normalizeClientMatchKey(displayName);
  if (!key) return;
  const current = map.get(key) || emptyClient(displayName, row.customerId);
  current.grossBilled = round2(current.grossBilled + Number(row.revenue || 0));
  current.customerId = current.customerId || row.customerId;
  map.set(key, current);
}

function poolsFromMonths(rows: Array<{
  payroll?: number;
  benefits?: number;
  cogsPayroll?: number;
  professionalFees?: number;
  infrastructure?: number;
  phoneComm?: number;
  insurance?: number;
  rent?: number;
  otherExpense?: number;
}>): CostToServeExpensePools | null {
  if (rows.length === 0) return null;
  const totals = rows.reduce(
    (acc, row) => {
      acc.payroll += Number(row.payroll || 0);
      acc.benefits += Number(row.benefits || 0);
      acc.cogsPayroll += Number(row.cogsPayroll || 0);
      acc.professionalFees += Number(row.professionalFees || 0);
      acc.infrastructure += Number(row.infrastructure || 0);
      acc.phoneComm += Number(row.phoneComm || 0);
      acc.insurance += Number(row.insurance || 0);
      acc.rent += Number(row.rent || 0);
      acc.otherExpense += Number(row.otherExpense || 0);
      return acc;
    },
    {
      payroll: 0,
      benefits: 0,
      cogsPayroll: 0,
      professionalFees: 0,
      infrastructure: 0,
      phoneComm: 0,
      insurance: 0,
      rent: 0,
      otherExpense: 0,
    }
  );
  const pools = expensePoolsFromFinancialTotals(totals);
  const hasSignal =
    pools.payrollLabor + pools.isolved + pools.ach + pools.checks + pools.support + pools.overhead > 0;
  return hasSignal ? pools : null;
}

export async function loadPayrollBureauAccountingInputs(
  companyId: string
): Promise<PayrollBureauAccountingInputs | null> {
  const { year, monthKey: currentMonthKey, monthIndex } = estMonthParts();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const nextYearStart = new Date(Date.UTC(year + 1, 0, 1));

  const [sales, monthlyFinancials] = await Promise.all([
    prisma.customerSalesSnapshot.findMany({
      where: {
        companyId,
        snapshotDate: { gte: yearStart, lt: nextYearStart },
      },
      select: {
        customerId: true,
        customerName: true,
        revenue: true,
        snapshotDate: true,
        frequency: true,
      },
      orderBy: { snapshotDate: 'desc' },
      take: 20000,
    }),
    prisma.monthlyFinancial.findMany({
      where: {
        companyId,
        monthDate: { gte: yearStart, lt: nextYearStart },
      },
      select: {
        monthDate: true,
        payroll: true,
        benefits: true,
        cogsPayroll: true,
        professionalFees: true,
        infrastructure: true,
        phoneComm: true,
        insurance: true,
        rent: true,
        otherExpense: true,
      },
      orderBy: { monthDate: 'desc' },
    }),
  ]);

  if (sales.length === 0 && monthlyFinancials.length === 0) return null;

  const preferredFrequency = sales.some((row) => row.frequency === 'monthly')
    ? 'monthly'
    : sales[0]?.frequency || 'monthly';
  const scopedSales = sales.filter((row) => row.frequency === preferredFrequency);

  const monthByName = new Map<string, PayrollBureauAccountingClient>();
  const ytdByName = new Map<string, PayrollBureauAccountingClient>();
  for (const row of scopedSales) {
    const key = monthKey(row.snapshotDate);
    if (key === currentMonthKey) addSales(monthByName, row);
    if (row.snapshotDate.getUTCFullYear() === year) addSales(ytdByName, row);
  }

  // If the current EST month has no sales yet, use the latest available month.
  if (monthByName.size === 0 && scopedSales.length > 0) {
    const latestKey = monthKey(scopedSales[0].snapshotDate);
    for (const row of scopedSales) {
      if (monthKey(row.snapshotDate) === latestKey) addSales(monthByName, row);
    }
  }

  const annualByName = new Map<string, PayrollBureauAccountingClient>();
  const annualFactor = monthIndex > 0 ? 12 / monthIndex : 12;
  for (const [key, row] of ytdByName.entries()) {
    annualByName.set(key, {
      ...row,
      grossBilled: round2(row.grossBilled * annualFactor),
      credits: round2(row.credits * annualFactor),
      directCosts: round2(row.directCosts * annualFactor),
    });
  }

  const monthFinancials = monthlyFinancials.filter((row) => monthKey(row.monthDate) === currentMonthKey);
  const monthPools = poolsFromMonths(monthFinancials.length > 0 ? monthFinancials : monthlyFinancials.slice(0, 1));
  const ytdPools = poolsFromMonths(monthlyFinancials);
  const annualPools = ytdPools ? scalePools(ytdPools, annualFactor) : monthPools ? scalePools(monthPools, 12) : null;

  return {
    monthByName,
    ytdByName,
    annualByName,
    monthPools,
    ytdPools,
    annualPools,
    unmappedMonthRevenue: 0,
    unmappedYtdRevenue: 0,
    unmappedAnnualRevenue: 0,
    hasCustomerSales: scopedSales.length > 0,
    hasFinancials: monthlyFinancials.length > 0,
  };
}
