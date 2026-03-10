import type { MonthlyDataRow } from '../types';

export type RatioTrendPoint = {
  month: string;
  monthDate?: unknown;
  currentRatio: number | null;
  quickRatio: number | null;
  workingCapital: number | null;
  invTurnover: number | null;
  arTurnover: number | null;
  apTurnover: number | null;
  daysInv: number | null;
  daysAR: number | null;
  daysAP: number | null;
  salesWC: number | null;
  interestCov: number | null;
  debtSvcCov: number | null;
  cfToDebt: number | null;
  debtToNW: number | null;
  fixedToNW: number | null;
  leverage: number | null;
  totalAssetTO: number | null;
  roe: number | null;
  roa: number | null;
  ebitdaMargin: number | null;
  ebitMargin: number | null;
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMonth = (monthValue: unknown): string => {
  if (!monthValue) return '';

  if (typeof monthValue === 'string' && /^\d{2}-\d{4}$/.test(monthValue)) {
    return monthValue;
  }

  if (typeof monthValue === 'string' && /^\d{1,2}\/\d{4}$/.test(monthValue)) {
    const [month, year] = monthValue.split('/');
    return `${month.padStart(2, '0')}-${year}`;
  }

  const date = monthValue instanceof Date ? monthValue : new Date(monthValue as string);
  if (Number.isNaN(date.getTime())) return String(monthValue);

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}-${year}`;
};

const hasLoadedFinancialData = (m: Record<string, unknown>): boolean => {
  const keys = [
    'revenue',
    'expense',
    'cogsTotal',
    'cash',
    'ar',
    'inventory',
    'ap',
    'tca',
    'tcl',
    'totalAssets',
    'totalLiabilities',
    'equity',
    'netIncome',
  ];
  return keys.some((key) => Math.abs(toNumber(m[key])) > 0.0001);
};

export function buildRatioTrendData(monthly: MonthlyDataRow[]): RatioTrendPoint[] {
  if (!Array.isArray(monthly) || monthly.length === 0) return [];

  const dataStartIndex = monthly.findIndex((row) => hasLoadedFinancialData(row as unknown as Record<string, unknown>));
  if (dataStartIndex < 0) return [];

  return monthly.map((m, index) => {
    const monthValue = (m as any).monthDate || m.month;
    const month = formatMonth(monthValue);
    const hasData = index >= dataStartIndex && hasLoadedFinancialData(m as unknown as Record<string, unknown>);
    const previousMonth = index > dataStartIndex ? monthly[index - 1] : null;
    const hasPreviousMonthData = previousMonth
      ? hasLoadedFinancialData(previousMonth as unknown as Record<string, unknown>)
      : false;

    if (!hasData) {
      return {
        month,
        monthDate: (m as any).monthDate,
        currentRatio: null,
        quickRatio: null,
        workingCapital: null,
        invTurnover: null,
        arTurnover: null,
        apTurnover: null,
        daysInv: null,
        daysAR: null,
        daysAP: null,
        salesWC: null,
        interestCov: null,
        debtSvcCov: null,
        cfToDebt: null,
        debtToNW: null,
        fixedToNW: null,
        leverage: null,
        totalAssetTO: null,
        roe: null,
        roa: null,
        ebitdaMargin: null,
        ebitMargin: null,
      };
    }

    const revenue = toNumber((m as any).revenue);
    const cogs = toNumber((m as any).cogsTotal);
    const grossProfit = revenue - cogs;

    const operatingExpenses =
      toNumber((m as any).payroll) + toNumber((m as any).ownerBasePay) + toNumber((m as any).benefits) +
      toNumber((m as any).insurance) + toNumber((m as any).professionalFees) + toNumber((m as any).subcontractors) +
      toNumber((m as any).rent) + toNumber((m as any).taxLicense) + toNumber((m as any).phoneComm) + toNumber((m as any).infrastructure) +
      toNumber((m as any).autoTravel) + toNumber((m as any).salesExpense) + toNumber((m as any).marketing) +
      toNumber((m as any).trainingCert) + toNumber((m as any).mealsEntertainment) + toNumber((m as any).otherExpense);

    const ebit = grossProfit - operatingExpenses;
    const ebitda = ebit + toNumber((m as any).depreciationAmortization);
    const interestExpense = toNumber((m as any).interestExpense);
    const netProfit = ebit - interestExpense;

    const cash = toNumber((m as any).cash);
    const ar = toNumber((m as any).ar);
    const inventory = toNumber((m as any).inventory);
    const otherCA = toNumber((m as any).otherCA);
    const tca = toNumber((m as any).tca) || (cash + ar + inventory + otherCA);

    const fixedAssets = toNumber((m as any).fixedAssets);
    const otherNCA = toNumber((m as any).otherNCA);
    const totalAssets = toNumber((m as any).totalAssets) || (tca + fixedAssets + otherNCA);

    const ap = toNumber((m as any).ap);
    const otherCL = toNumber((m as any).otherCL);
    const tcl = toNumber((m as any).tcl) || (ap + otherCL);

    const ltDebt = toNumber((m as any).ltDebt || (m as any).ltd);
    const otherLTL = toNumber((m as any).otherLTL);
    const totalLiabilities = toNumber((m as any).totalLiabilities || (m as any).totalLiab) || (tcl + ltDebt + otherLTL);
    const equity = toNumber((m as any).equity || (m as any).totalEquity) || (totalAssets - totalLiabilities);

    const prevInventory = hasPreviousMonthData ? toNumber((previousMonth as any).inventory) : null;
    const prevAr = hasPreviousMonthData ? toNumber((previousMonth as any).ar) : null;
    const prevAp = hasPreviousMonthData ? toNumber((previousMonth as any).ap) : null;
    const prevAssets = hasPreviousMonthData ? toNumber((previousMonth as any).totalAssets) : null;
    const prevEquity = hasPreviousMonthData
      ? toNumber((previousMonth as any).equity || (previousMonth as any).totalEquity)
      : null;

    const avgInventory = prevInventory !== null ? (inventory + prevInventory) / 2 : null;
    const avgAr = prevAr !== null ? (ar + prevAr) / 2 : null;
    const avgAp = prevAp !== null ? (ap + prevAp) / 2 : null;
    const avgAssets = prevAssets !== null ? (totalAssets + prevAssets) / 2 : null;
    const avgEquity = prevEquity !== null ? (equity + prevEquity) / 2 : null;

    const currentRatio = tcl > 0 ? tca / tcl : null;
    const quickRatio = tcl > 0 ? (tca - inventory) / tcl : null;
    const workingCapital = tca - tcl;

    const invTurnover = avgInventory && avgInventory > 0 ? cogs / avgInventory : null;
    const arTurnover = avgAr && avgAr > 0 ? revenue / avgAr : null;
    const apTurnover = avgAp && avgAp > 0 ? cogs / avgAp : null;
    const daysInv = invTurnover && invTurnover > 0 ? 365 / invTurnover : null;
    const daysAR = arTurnover && arTurnover > 0 ? 365 / arTurnover : null;
    const daysAP = apTurnover && apTurnover > 0 ? 365 / apTurnover : null;
    const salesWC = workingCapital > 0 ? revenue / workingCapital : null;

    const totalDebt = ltDebt + tcl;
    const interestCov = interestExpense > 0 ? ebit / interestExpense : null;
    const debtSvcCov = totalDebt > 0 ? (netProfit + toNumber((m as any).depreciationAmortization)) / totalDebt : null;
    const cfToDebt = totalDebt > 0 ? netProfit / totalDebt : null;

    const debtToNW = equity > 0 ? totalLiabilities / equity : null;
    const fixedToNW = equity > 0 ? fixedAssets / equity : null;
    const leverage = equity > 0 ? totalAssets / equity : null;

    const totalAssetTO = avgAssets && avgAssets > 0 ? revenue / avgAssets : null;
    const roe = avgEquity && avgEquity > 0 ? netProfit / avgEquity : null;
    const roa = avgAssets && avgAssets > 0 ? netProfit / avgAssets : null;
    const ebitdaMargin = revenue > 0 ? ebitda / revenue : null;
    const ebitMargin = revenue > 0 ? ebit / revenue : null;

    return {
      month,
      monthDate: (m as any).monthDate,
      currentRatio,
      quickRatio,
      workingCapital,
      invTurnover,
      arTurnover,
      apTurnover,
      daysInv,
      daysAR,
      daysAP,
      salesWC,
      interestCov,
      debtSvcCov,
      cfToDebt,
      debtToNW,
      fixedToNW,
      leverage,
      totalAssetTO,
      roe,
      roa,
      ebitdaMargin,
      ebitMargin,
    };
  });
}
