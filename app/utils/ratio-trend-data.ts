import type { MonthlyDataRow } from '../types';
import { filterClosedReportingMonths } from '@/lib/date-utils';

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

const MAX_RATIO_MONTHS = 36;
const LTM_MONTHS = 12;

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
  if (Number.isNaN(date.getTime())) return '';

  // UTC bucketing — monthDate values are stored as UTC month starts
  // (e.g. 2026-07-01T00:00:00.000Z). Local getMonth() turns July into June
  // in US Mountain/Central timezones and makes ratios lag Trends by a month.
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) return '';
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

  const populatedMonths = monthly
    .map((row) => {
      // Same order as Trends: derive from monthDate/date with UTC first.
      // Preferring row.month is unsafe — page.tsx normalizeMonthLabel still uses
      // local getMonth() and can already mislabel July as 06-YYYY.
      const formattedMonth =
        formatMonth((row as any).monthDate) ||
        formatMonth((row as any).date) ||
        formatMonth(row.month);
      return {
        row,
        month: formattedMonth,
        monthDate: (row as any).monthDate,
      };
    })
    .filter((entry) =>
      entry.month &&
      hasLoadedFinancialData(entry.row as unknown as Record<string, unknown>)
    );

  // Keep the last occurrence of each month key so mislabeled/local-TZ dupes
  // cannot bury the true latest month. Sort chronologically after dedupe.
  const monthKeyToSortable = (label: string): number => {
    const [mm, yyyy] = label.split('-').map(Number);
    if (!Number.isFinite(mm) || !Number.isFinite(yyyy)) return 0;
    return yyyy * 12 + mm;
  };
  const byMonth = new Map<string, (typeof populatedMonths)[number]>();
  for (const entry of populatedMonths) {
    byMonth.set(entry.month, entry);
  }
  const dedupedMonths = Array.from(byMonth.values())
    .sort((a, b) => monthKeyToSortable(a.month) - monthKeyToSortable(b.month))
    .slice(-MAX_RATIO_MONTHS);

  const closedMonths = filterClosedReportingMonths(dedupedMonths, (entry) => entry.month);
  if (closedMonths.length === 0) return [];

  return closedMonths.map((entry, index) => {
    const m = entry.row;
    const month = entry.month;

    // Point-in-time balance sheet values for liquidity and leverage ratios.
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
    const locDebt = toNumber((m as any).loc);
    const reportedTcl = toNumber((m as any).tcl);
    const fallbackTcl = ap + otherCL + locDebt;
    const tcl = Math.max(reportedTcl, fallbackTcl);

    const ltDebt = toNumber((m as any).ltDebt || (m as any).ltd);
    const otherLTL = toNumber((m as any).otherLTL);
    const reportedTotalLiabilities = toNumber((m as any).totalLiabilities || (m as any).totalLiab);
    const fallbackTotalLiabilities = tcl + ltDebt + otherLTL;
    const totalLiabilities = Math.max(reportedTotalLiabilities, fallbackTotalLiabilities);
    const equity = toNumber((m as any).equity || (m as any).totalEquity) || (totalAssets - totalLiabilities);

    // LTM (Last Twelve Months) numerators and average denominators for activity / turnover
    // ratios. Activity ratios are annualized by definition: numerator = trailing 12-month sum,
    // denominator = average balance across the same 12-month window. When fewer than 12 months
    // of populated history exist we return null rather than annualize a partial year (which
    // would falsely smooth volatility and mislead the trend chart).
    const hasFullLtmWindow = index >= LTM_MONTHS - 1;
    let ltmRevenue: number | null = null;
    let ltmCogs: number | null = null;
    let ltmNetProfit: number | null = null;
    let ltmInterestExpense: number | null = null;
    let ltmDepreciation: number | null = null;
    let avgInventory_ltm: number | null = null;
    let avgAr_ltm: number | null = null;
    let avgAp_ltm: number | null = null;
    let avgAssets_ltm: number | null = null;
    let avgEquity_ltm: number | null = null;
    if (hasFullLtmWindow) {
      let revSum = 0;
      let cogsSum = 0;
      let interestSum = 0;
      let depSum = 0;
      let opExpSum = 0;
      let invSum = 0;
      let arSum = 0;
      let apSum = 0;
      let assetsSum = 0;
      let equitySum = 0;
      for (let k = index - (LTM_MONTHS - 1); k <= index; k += 1) {
        const r = closedMonths[k].row as any;
        revSum += toNumber(r.revenue);
        cogsSum += toNumber(r.cogsTotal);
        interestSum += toNumber(r.interestExpense);
        depSum += toNumber(r.depreciationAmortization);
        opExpSum +=
          toNumber(r.payroll) + toNumber(r.ownerBasePay) + toNumber(r.benefits) +
          toNumber(r.insurance) + toNumber(r.professionalFees) + toNumber(r.subcontractors) +
          toNumber(r.rent) + toNumber(r.taxLicense) + toNumber(r.phoneComm) + toNumber(r.infrastructure) +
          toNumber(r.autoTravel) + toNumber(r.salesExpense) + toNumber(r.marketing) +
          toNumber(r.trainingCert) + toNumber(r.mealsEntertainment) + toNumber(r.otherExpense);
        const rInventory = toNumber(r.inventory);
        const rAr = toNumber(r.ar);
        const rAp = toNumber(r.ap);
        const rCash = toNumber(r.cash);
        const rOtherCA = toNumber(r.otherCA);
        const rTca = toNumber(r.tca) || (rCash + rAr + rInventory + rOtherCA);
        const rFixedAssets = toNumber(r.fixedAssets);
        const rOtherNCA = toNumber(r.otherNCA);
        const rTotalAssets = toNumber(r.totalAssets) || (rTca + rFixedAssets + rOtherNCA);
        const rOtherCL = toNumber(r.otherCL);
        const rLocDebt = toNumber(r.loc);
        const rReportedTcl = toNumber(r.tcl);
        const rTcl = Math.max(rReportedTcl, rAp + rOtherCL + rLocDebt);
        const rLtDebt = toNumber(r.ltDebt || r.ltd);
        const rOtherLTL = toNumber(r.otherLTL);
        const rReportedTL = toNumber(r.totalLiabilities || r.totalLiab);
        const rTotalLiabilities = Math.max(rReportedTL, rTcl + rLtDebt + rOtherLTL);
        const rEquity = toNumber(r.equity || r.totalEquity) || (rTotalAssets - rTotalLiabilities);
        invSum += rInventory;
        arSum += rAr;
        apSum += rAp;
        assetsSum += rTotalAssets;
        equitySum += rEquity;
      }
      ltmRevenue = revSum;
      ltmCogs = cogsSum;
      ltmInterestExpense = interestSum;
      ltmDepreciation = depSum;
      ltmNetProfit = revSum - cogsSum - opExpSum - interestSum;
      avgInventory_ltm = invSum / LTM_MONTHS;
      avgAr_ltm = arSum / LTM_MONTHS;
      avgAp_ltm = apSum / LTM_MONTHS;
      avgAssets_ltm = assetsSum / LTM_MONTHS;
      avgEquity_ltm = equitySum / LTM_MONTHS;
    }

    const currentRatio = tcl > 0 ? tca / tcl : null;
    const quickRatio = tcl > 0 ? (tca - inventory) / tcl : null;
    const workingCapital = tca - tcl;

    const invTurnover =
      ltmCogs !== null && avgInventory_ltm && avgInventory_ltm > 0
        ? ltmCogs / avgInventory_ltm
        : null;
    const arTurnover =
      ltmRevenue !== null && avgAr_ltm && avgAr_ltm > 0 ? ltmRevenue / avgAr_ltm : null;
    const apTurnover =
      ltmCogs !== null && avgAp_ltm && avgAp_ltm > 0 ? ltmCogs / avgAp_ltm : null;
    const daysInv = invTurnover && invTurnover > 0 ? 365 / invTurnover : null;
    const daysAR = arTurnover && arTurnover > 0 ? 365 / arTurnover : null;
    const daysAP = apTurnover && apTurnover > 0 ? 365 / apTurnover : null;
    const salesWC =
      ltmRevenue !== null && workingCapital > 0 ? ltmRevenue / workingCapital : null;

    const totalDebt = ltDebt + tcl;
    // LTM EBIT = LTM Net Profit + LTM Interest (we derived netProfit as EBIT - interest above).
    const ltmEbit =
      ltmNetProfit !== null && ltmInterestExpense !== null
        ? ltmNetProfit + ltmInterestExpense
        : null;
    const interestCov =
      ltmEbit !== null && ltmInterestExpense !== null && ltmInterestExpense > 0
        ? ltmEbit / ltmInterestExpense
        : null;
    const debtSvcCov =
      totalDebt > 0 && ltmNetProfit !== null && ltmDepreciation !== null
        ? (ltmNetProfit + ltmDepreciation) / totalDebt
        : null;
    const cfToDebt =
      totalDebt > 0 && ltmNetProfit !== null ? ltmNetProfit / totalDebt : null;

    const debtToNW = equity > 0 ? totalLiabilities / equity : null;
    const fixedToNW = equity > 0 ? fixedAssets / equity : null;
    const leverage = equity > 0 ? totalAssets / equity : null;

    const totalAssetTO =
      ltmRevenue !== null && avgAssets_ltm && avgAssets_ltm > 0 ? ltmRevenue / avgAssets_ltm : null;
    const roe =
      ltmNetProfit !== null && avgEquity_ltm && avgEquity_ltm > 0 ? ltmNetProfit / avgEquity_ltm : null;
    const roa =
      ltmNetProfit !== null && avgAssets_ltm && avgAssets_ltm > 0 ? ltmNetProfit / avgAssets_ltm : null;
    const ebitdaMargin =
      ltmRevenue !== null && ltmRevenue > 0 && ltmEbit !== null && ltmDepreciation !== null
        ? (ltmEbit + ltmDepreciation) / ltmRevenue
        : null;
    const ebitMargin =
      ltmRevenue !== null && ltmRevenue > 0 && ltmEbit !== null ? ltmEbit / ltmRevenue : null;

    return {
      month,
      monthDate: entry.monthDate,
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
