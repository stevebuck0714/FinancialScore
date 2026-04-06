import type { MonthlyDataRow } from '@/app/types';
import { getSdeSectorBenchmarks } from '@/lib/sde-sector-benchmarks';

export type SdeValuationPreviewModel = {
  formatDollars: (v: number) => string;
  sdeSectorBenchmarks: ReturnType<typeof getSdeSectorBenchmarks>;
  sdeSectorCategory: string;
  annualRevenueEbitdaData: Array<{ year: number; revenue: number; ebitdaMargin: number }>;
  ttmNetIncomeAfterTax: number;
  ttmInterest: number;
  ttmTaxesAnalysis: number;
  ttmDepreciationOnly: number;
  ttmAmortizationOnly: number;
  ttmEbitdaAnalysis: number;
  qoeOwnerSalaryAdjustment: number;
  qoePersonalAutoLease: number;
  qoeOneTimeExpenses: number;
  qoeOneTimeRevenue: number;
  qoeTotalAdjustments: number;
  qualityOfEarnings: number;
  ttmSDE: number;
  sdeValuation: number;
  sdeMultiplier: number;
  ownerCompRows: { label: string; value: number }[];
  personalRows: { label: string; value: number }[];
  nonRecurringRows: { label: string; value: number }[];
  oneTimeRevenueRows: { label: string; value: number }[];
  personalDiscretionaryAdj: number;
  nonRecurringExpenseAdj: number;
  oneTimeRevenueAdj: number;
  revenueQualityInsights: ReturnType<typeof buildRevenueQualityInsights>;
  customerQualityInsights: ReturnType<typeof buildCustomerQualityInsights>;
  workingCapitalSeries: ReturnType<typeof buildWorkingCapitalSeries>;
  workingCapitalInsights: ReturnType<typeof buildWorkingCapitalInsights>;
  cashFlowQualitySeries: ReturnType<typeof buildCashFlowQualitySeries>;
  cashFlowQualityInsights: ReturnType<typeof buildCashFlowQualityInsights>;
};

function getYearFromMonthValue(monthValue: unknown): number | null {
  if (monthValue instanceof Date && !isNaN(monthValue.getTime())) {
    return monthValue.getFullYear();
  }
  if (typeof monthValue === 'string') {
    const yearMatch = monthValue.match(/\b(20\d{2}|19\d{2})\b/);
    if (yearMatch) return Number(yearMatch[1]);
    const parsed = new Date(monthValue);
    if (!isNaN(parsed.getTime())) return parsed.getFullYear();
  }
  return null;
}

export function buildSdeValuationPreviewModel(params: {
  monthly: MonthlyDataRow[];
  sdeManualInputs: Record<string, number | undefined>;
  sdeMultiplier: number;
  industrySectorCategory: string | null | undefined;
  companyIndustrySectorCategory: string | null | undefined;
  customerQualityRecords: any[];
}): SdeValuationPreviewModel | null {
  const { monthly, sdeManualInputs, sdeMultiplier, customerQualityRecords } = params;
  if (!Array.isArray(monthly) || monthly.length === 0) return null;

  const formatDollars = (value: number): string => {
    if (!Number.isFinite(value) || Math.abs(value) < 0.5) return '$-';
    const roundedAbs = Math.round(Math.abs(value)).toLocaleString();
    return value < 0 ? `($${roundedAbs})` : `$${roundedAbs}`;
  };

  const last12 = monthly.slice(-12);
  const sumTtmField = (fieldName: string): number =>
    last12.reduce((sum, month) => sum + (Number((month as any)?.[fieldName]) || 0), 0);

  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const sumTtmByKeywords = (
    keywords: string[],
    breakdownTypes: Array<'expense' | 'revenue'> = ['expense', 'revenue'],
  ): number => {
    const normalizedKeywords = keywords.map(normalize);
    return last12.reduce((sum, month) => {
      const buckets: Array<Record<string, unknown>> = [];
      if (breakdownTypes.includes('expense') && (month as any)?.expenseBreakdown && typeof (month as any).expenseBreakdown === 'object') {
        buckets.push((month as any).expenseBreakdown);
      }
      if (breakdownTypes.includes('revenue') && (month as any)?.revenueBreakdown && typeof (month as any).revenueBreakdown === 'object') {
        buckets.push((month as any).revenueBreakdown);
      }
      let monthSum = 0;
      for (const bucket of buckets) {
        for (const [key, rawValue] of Object.entries(bucket)) {
          const normalizedKey = normalize(key);
          if (normalizedKeywords.some((kw) => normalizedKey.includes(kw))) {
            monthSum += Number(rawValue) || 0;
          }
        }
      }
      return sum + monthSum;
    }, 0);
  };

  const ttmStateTaxes = last12.reduce((sum, m) => sum + (m.stateIncomeTaxes || 0), 0);
  const ttmFederalTaxes = last12.reduce((sum, m) => sum + (m.federalIncomeTaxes || 0), 0);
  const ttmTaxesAnalysis = ttmStateTaxes + ttmFederalTaxes;
  const ttmNetIncome =
    last12.reduce((sum, m) => sum + (m.revenue || 0), 0) -
    last12.reduce((sum, m) => sum + (m.cogsTotal || 0), 0) -
    last12.reduce((sum, m) => sum + (m.expense || 0), 0);
  const ttmNetIncomeAfterTax = ttmNetIncome - ttmTaxesAnalysis;
  const ttmInterest = last12.reduce((sum, m) => sum + (m.interestExpense || 0), 0);
  const ttmDepreciationBreakdown = sumTtmByKeywords(['depreciation'], ['expense']);
  const ttmAmortizationBreakdown = sumTtmByKeywords(['amortization'], ['expense']);
  const ttmDepreciation = last12.reduce((sum, m) => sum + (m.depreciationAmortization || 0), 0);
  const ttmDepreciationOnly = ttmDepreciationBreakdown > 0 ? ttmDepreciationBreakdown : ttmDepreciation;
  const ttmAmortizationOnly = ttmAmortizationBreakdown > 0 ? ttmAmortizationBreakdown : 0;
  const ttmEbitdaAnalysis =
    ttmNetIncomeAfterTax + ttmInterest + ttmTaxesAnalysis + ttmDepreciationOnly + ttmAmortizationOnly;

  const ownerSalaryAdj = Math.abs(sumTtmField('ownerBasePay'));
  const ownersDrawAdj = Math.abs(sumTtmField('ownersDraw'));
  const effectiveOwnerSalaryAdj =
    ownerSalaryAdj > 0 ? ownerSalaryAdj : Math.abs(sdeManualInputs.ownerSalary ?? 0);
  const effectiveOwnersDrawAdj =
    ownersDrawAdj > 0 ? ownersDrawAdj : Math.abs(sdeManualInputs.ownersDraw ?? 0);
  const effectiveMarketReplacementSalary = Math.abs(sdeManualInputs.marketReplacementSalary ?? 0);
  const effectiveOwnerCompOther = sdeManualInputs.ownerCompOther ?? 0;
  const coreSellerAdjustment =
    effectiveOwnerSalaryAdj + effectiveOwnersDrawAdj - effectiveMarketReplacementSalary + effectiveOwnerCompOther;

  const legalSettlements = sumTtmByKeywords(['legalsettlement', 'settlement'], ['expense']);
  const majorRepairs = sumTtmByKeywords(['majorrepair', 'majorrepairs'], ['expense']);
  const consultingExpense = sumTtmByKeywords(['consulting'], ['expense']);
  const erpInstall = sumTtmByKeywords(['erpinstall', 'erpimplementation'], ['expense']);
  const relocation = sumTtmByKeywords(['relocation', 'movingexpense'], ['expense']);
  const effectiveLegalSettlements = sdeManualInputs.legalSettlements ?? legalSettlements;
  const effectiveMajorRepairs = sdeManualInputs.majorRepairs ?? majorRepairs;
  const effectiveConsulting = sdeManualInputs.consulting ?? consultingExpense;
  const effectiveErpInstall = sdeManualInputs.erpInstall ?? erpInstall;
  const effectiveRelocation = sdeManualInputs.relocation ?? relocation;
  const effectiveNonRecurringOther = sdeManualInputs.nonRecurringOther ?? 0;
  const nonRecurringExpenseAdj =
    effectiveLegalSettlements +
    effectiveMajorRepairs +
    effectiveConsulting +
    effectiveErpInstall +
    effectiveRelocation +
    effectiveNonRecurringOther;

  const personalTravel = sumTtmByKeywords(['personaltravel'], ['expense']);
  const familyPayroll = sumTtmByKeywords(['familypayroll'], ['expense']);
  const autoLeases = sumTtmByKeywords(['autolease', 'vehiclelease'], ['expense']);
  const mealsAndEntertainmentAdj = sumTtmField('mealsEntertainment');
  const clubDues = sumTtmByKeywords(['clubdues'], ['expense']);
  const effectivePersonalTravel = sdeManualInputs.personalTravel ?? personalTravel;
  const effectiveFamilyPayroll = sdeManualInputs.familyPayroll ?? familyPayroll;
  const effectiveAutoLeases = sdeManualInputs.autoLeases ?? autoLeases;
  const effectiveMealsEntertainment = sdeManualInputs.mealsEntertainment ?? mealsAndEntertainmentAdj;
  const effectiveClubDues = sdeManualInputs.clubDues ?? clubDues;
  const effectivePersonalOther = sdeManualInputs.personalOther ?? 0;
  const personalDiscretionaryAdj =
    effectivePersonalTravel +
    effectiveFamilyPayroll +
    effectiveAutoLeases +
    effectiveMealsEntertainment +
    effectiveClubDues +
    effectivePersonalOther;

  const assetSales = sumTtmByKeywords(['assetsale', 'gainonsale'], ['revenue']);
  const insuranceProceeds = sumTtmByKeywords(['insuranceproceed'], ['revenue']);
  const oneTimeContract = sumTtmByKeywords(['onetimecontract'], ['revenue']);
  const effectiveAssetSales = sdeManualInputs.assetSales ?? assetSales;
  const effectiveInsuranceProceeds = sdeManualInputs.insuranceProceeds ?? insuranceProceeds;
  const effectiveOneTimeContract = sdeManualInputs.oneTimeContract ?? oneTimeContract;
  const effectiveOneTimeRevenueOther = sdeManualInputs.oneTimeRevenueOther ?? 0;
  const oneTimeRevenueAdj =
    effectiveAssetSales + effectiveInsuranceProceeds + effectiveOneTimeContract + effectiveOneTimeRevenueOther;

  const qoeOwnerSalaryAdjustment = coreSellerAdjustment;
  const qoePersonalAutoLease = personalDiscretionaryAdj;
  const qoeOneTimeExpenses = nonRecurringExpenseAdj;
  const qoeOneTimeRevenue = -oneTimeRevenueAdj;
  const qoeTotalAdjustments = qoeOwnerSalaryAdjustment + qoePersonalAutoLease + qoeOneTimeExpenses + qoeOneTimeRevenue;
  const qualityOfEarnings = ttmEbitdaAnalysis + qoeTotalAdjustments;
  const ttmSDE = qualityOfEarnings;
  const sdeValuation = ttmSDE * sdeMultiplier;

  const ownerCompRows = [
    { label: 'Owner salary', value: effectiveOwnerSalaryAdj },
    { label: 'Owners Draw', value: effectiveOwnersDrawAdj },
    { label: 'Market replacement salary', value: effectiveMarketReplacementSalary },
    { label: 'Other', value: effectiveOwnerCompOther },
    { label: 'Adjustment', value: coreSellerAdjustment },
  ];
  const personalRows = [
    { label: 'personal travel', value: effectivePersonalTravel },
    { label: 'family payroll', value: effectiveFamilyPayroll },
    { label: 'auto leases', value: effectiveAutoLeases },
    { label: 'meals & entertainment', value: effectiveMealsEntertainment },
    { label: 'club dues', value: effectiveClubDues },
    { label: 'Other', value: effectivePersonalOther },
  ];
  const nonRecurringRows = [
    { label: 'legal settlements', value: effectiveLegalSettlements },
    { label: 'major repairs', value: effectiveMajorRepairs },
    { label: 'consulting', value: effectiveConsulting },
    { label: 'ERP install', value: effectiveErpInstall },
    { label: 'relocation', value: effectiveRelocation },
    { label: 'Other', value: effectiveNonRecurringOther },
  ];
  const oneTimeRevenueRows = [
    { label: 'asset sales', value: effectiveAssetSales },
    { label: 'insurance proceeds', value: effectiveInsuranceProceeds },
    { label: 'one-time contract', value: effectiveOneTimeContract },
    { label: 'Other', value: effectiveOneTimeRevenueOther },
  ];

  const sdeSectorCategory =
    params.companyIndustrySectorCategory || params.industrySectorCategory || '01';
  const sdeSectorBenchmarks = getSdeSectorBenchmarks(sdeSectorCategory);

  const annualRevenueEbitdaData = (() => {
    const byYear = new Map<number, { revenue: number; ebitda: number }>();
    for (const m of monthly) {
      const year = getYearFromMonthValue((m as any)?.month);
      if (!year) continue;
      const revenue = Number((m as any)?.revenue) || 0;
      const cogs = Number((m as any)?.cogsTotal) || 0;
      const expense = Number((m as any)?.expense) || 0;
      const interest = Number((m as any)?.interestExpense) || 0;
      const da = Number((m as any)?.depreciationAmortization) || 0;
      const ebitda = revenue - cogs - expense + interest + da;
      const prev = byYear.get(year) || { revenue: 0, ebitda: 0 };
      byYear.set(year, {
        revenue: prev.revenue + revenue,
        ebitda: prev.ebitda + ebitda,
      });
    }
    return Array.from(byYear.entries())
      .map(([year, totals]) => ({
        year,
        revenue: totals.revenue,
        ebitdaMargin: totals.revenue !== 0 ? (totals.ebitda / totals.revenue) * 100 : 0,
      }))
      .sort((a, b) => a.year - b.year)
      .slice(-7);
  })();

  const revenueQualitySeries = (() => {
    const recent = monthly.slice(-36);
    return recent.map((m, idx) => {
      const revenue = Number((m as any)?.revenue) || 0;
      const ar = Number((m as any)?.ar) || 0;
      const priorAr = idx > 0 ? Number((recent[idx - 1] as any)?.ar) || 0 : ar;
      const deltaAr = ar - priorAr;
      const collectionsProxy = revenue - deltaAr;
      const gapPct = revenue !== 0 ? ((revenue - collectionsProxy) / Math.abs(revenue)) * 100 : 0;
      const monthDate = (m as any)?.month ? new Date(String((m as any).month)) : null;
      const daysInMonth =
        monthDate && !Number.isNaN(monthDate.getTime())
          ? new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
          : 30;
      const dso = ar > 0 && revenue > 0 ? (ar / revenue) * daysInMonth : 0;
      return {
        month: String((m as any)?.month || ''),
        revenue,
        ar,
        collectionsProxy,
        gapPct,
        dso,
      };
    });
  })();

  const revenueQualityInsights = buildRevenueQualityInsights(
    monthly,
    revenueQualitySeries,
    sdeSectorBenchmarks,
  );

  const customerQualityInsights = buildCustomerQualityInsights(
    customerQualityRecords,
    sdeSectorBenchmarks,
  );

  const workingCapitalSeries = buildWorkingCapitalSeries(monthly);
  const workingCapitalInsights = buildWorkingCapitalInsights(
    workingCapitalSeries,
    revenueQualityInsights,
    sdeSectorBenchmarks,
  );

  const cashFlowQualitySeries = buildCashFlowQualitySeries(monthly);
  const cashFlowQualityInsights = buildCashFlowQualityInsights(
    cashFlowQualitySeries,
    sdeSectorBenchmarks,
  );

  return {
    formatDollars,
    sdeSectorBenchmarks,
    sdeSectorCategory,
    annualRevenueEbitdaData,
    ttmNetIncomeAfterTax,
    ttmInterest,
    ttmTaxesAnalysis,
    ttmDepreciationOnly,
    ttmAmortizationOnly,
    ttmEbitdaAnalysis,
    qoeOwnerSalaryAdjustment,
    qoePersonalAutoLease,
    qoeOneTimeExpenses,
    qoeOneTimeRevenue,
    qoeTotalAdjustments,
    qualityOfEarnings,
    ttmSDE,
    sdeValuation,
    sdeMultiplier,
    ownerCompRows,
    personalRows,
    nonRecurringRows,
    oneTimeRevenueRows,
    personalDiscretionaryAdj,
    nonRecurringExpenseAdj,
    oneTimeRevenueAdj,
    revenueQualityInsights,
    customerQualityInsights,
    workingCapitalSeries,
    workingCapitalInsights,
    cashFlowQualitySeries,
    cashFlowQualityInsights,
  };
}

function buildRevenueQualityInsights(
  monthly: MonthlyDataRow[],
  revenueQualitySeries: Array<{
    month: string;
    revenue: number;
    ar: number;
    gapPct: number;
    dso: number;
  }>,
  sdeSectorBenchmarks: ReturnType<typeof getSdeSectorBenchmarks>,
) {
  const last12 = revenueQualitySeries.slice(-12);
  const latest = revenueQualitySeries[revenueQualitySeries.length - 1];
  const month12Ago = revenueQualitySeries.length >= 13 ? revenueQualitySeries[revenueQualitySeries.length - 13] : null;
  const safeAvg = (values: number[]) =>
    values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;

  const avgGap12 = safeAvg(last12.map((r) => r.gapPct));
  const dsoTrend12 = latest && month12Ago ? latest.dso - month12Ago.dso : 0;
  const currentDso = latest ? latest.dso : 0;
  const dsoOverBenchmark = currentDso - sdeSectorBenchmarks.dso.max;

  const ttmRevenueCurrent = revenueQualitySeries.slice(-12).reduce((s, r) => s + r.revenue, 0);
  const ttmRevenuePrior = revenueQualitySeries.slice(-24, -12).reduce((s, r) => s + r.revenue, 0);
  const ttmArCurrent = latest ? latest.ar : 0;
  const ttmArPrior = month12Ago ? month12Ago.ar : 0;

  const revenueGrowth = ttmRevenuePrior !== 0 ? ((ttmRevenueCurrent - ttmRevenuePrior) / Math.abs(ttmRevenuePrior)) * 100 : 0;
  const arGrowth = ttmArPrior !== 0 ? ((ttmArCurrent - ttmArPrior) / Math.abs(ttmArPrior)) * 100 : 0;
  const arRevenueSpread = arGrowth - revenueGrowth;
  const dsoBenchmarkTarget = sdeSectorBenchmarks.benchmarkTargets.dso;
  const dsoCashOpportunity = Math.max(0, currentDso - dsoBenchmarkTarget) * (Math.abs(ttmRevenueCurrent) / 365);

  const breakdownTotals = new Map<string, number>();
  let breakdownTotal = 0;
  for (const row of monthly.slice(-12)) {
    const breakdown = (row as any)?.revenueBreakdown;
    if (!breakdown || typeof breakdown !== 'object') continue;
    for (const [key, raw] of Object.entries(breakdown as Record<string, unknown>)) {
      const value = Number(raw) || 0;
      if (value <= 0) continue;
      breakdownTotals.set(key, (breakdownTotals.get(key) || 0) + value);
      breakdownTotal += value;
    }
  }
  const topBucketAmount = breakdownTotals.size > 0 ? Math.max(...Array.from(breakdownTotals.values())) : 0;
  const topBucketSharePct = breakdownTotal > 0 ? (topBucketAmount / breakdownTotal) * 100 : null;

  const volatilityInputs = revenueQualitySeries.slice(-12).map((r) => r.revenue);
  const meanRevenue = safeAvg(volatilityInputs);
  const variance = volatilityInputs.length
    ? volatilityInputs.reduce((sum, value) => sum + Math.pow(value - meanRevenue, 2), 0) / volatilityInputs.length
    : 0;
  const stdDev = Math.sqrt(variance);
  const coeffVar = meanRevenue !== 0 ? stdDev / Math.abs(meanRevenue) : 0;

  const volatilitySeries = revenueQualitySeries.map((row, idx) => {
    if (idx < 11) {
      return { month: row.month, value: 0, hasData: false };
    }
    const window = revenueQualitySeries.slice(idx - 11, idx + 1).map((r) => r.revenue);
    const avg = safeAvg(window);
    const var12 = window.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / window.length;
    const sd12 = Math.sqrt(var12);
    const cv12 = avg !== 0 ? sd12 / Math.abs(avg) : 0;
    return {
      month: row.month,
      value: cv12,
      hasData: true,
    };
  });

  const flags = [
    {
      id: 'dso-spike',
      title: 'DSO trend spike',
      triggered: dsoTrend12 > sdeSectorBenchmarks.dso.trendWarn || dsoOverBenchmark > 5,
      detail: `DSO ${currentDso.toFixed(1)}d vs ${sdeSectorBenchmarks.sectorLabel} benchmark ${sdeSectorBenchmarks.dso.min}-${sdeSectorBenchmarks.dso.max}d | 12M trend ${dsoTrend12 >= 0 ? '+' : ''}${dsoTrend12.toFixed(1)}d`,
      severity:
        dsoTrend12 > sdeSectorBenchmarks.dso.trendHigh || dsoOverBenchmark > 15 ? ('high' as const) : ('medium' as const),
    },
    {
      id: 'ar-vs-revenue',
      title: 'AR growth outpacing revenue',
      triggered: arRevenueSpread > sdeSectorBenchmarks.dso.spreadWarn,
      detail: `Spread: ${arRevenueSpread >= 0 ? '+' : ''}${arRevenueSpread.toFixed(1)} pts`,
      severity: arRevenueSpread > sdeSectorBenchmarks.dso.spreadHigh ? ('high' as const) : ('medium' as const),
    },
    {
      id: 'cash-gap',
      title: 'Revenue-to-cash gap elevated',
      triggered: Math.abs(avgGap12) > sdeSectorBenchmarks.dso.gapWarn,
      detail: `Avg 12M gap: ${avgGap12 >= 0 ? '+' : ''}${avgGap12.toFixed(1)}%`,
      severity: Math.abs(avgGap12) > sdeSectorBenchmarks.dso.gapHigh ? ('high' as const) : ('medium' as const),
    },
    {
      id: 'revenue-volatility',
      title: 'Revenue volatility',
      triggered: coeffVar > sdeSectorBenchmarks.dso.volatilityWarn,
      detail: `12M coefficient of variation: ${coeffVar.toFixed(2)}`,
      severity: coeffVar > sdeSectorBenchmarks.dso.volatilityHigh ? ('high' as const) : ('low' as const),
    },
  ];

  return {
    avgGap12,
    dsoTrend12,
    currentDso,
    dsoBenchmarkTarget,
    dsoCashOpportunity,
    revenueGrowth,
    arGrowth,
    arRevenueSpread,
    topBucketSharePct,
    volatilitySeries,
    flags,
  };
}

function buildCustomerQualityInsights(
  customerQualityRecords: any[],
  sdeSectorBenchmarks: ReturnType<typeof getSdeSectorBenchmarks>,
) {
  const emptyResult = {
    hasData: false,
    top1Pct: 0,
    top5Pct: 0,
    hhi: 0,
    customerCount: 0,
    totalTtmRevenue: 0,
    top1Series: [] as Array<{ month: string; value: number }>,
    top5Series: [] as Array<{ month: string; value: number }>,
    hhiSeries: [] as Array<{ month: string; value: number }>,
    customerCountSeries: [] as Array<{ month: string; value: number }>,
    flags: [] as Array<{
      id: 'top1' | 'top5' | 'hhi';
      title: string;
      triggered: boolean;
      detail: string;
      severity: 'high' | 'medium' | 'low';
    }>,
  };
  if (!Array.isArray(customerQualityRecords) || customerQualityRecords.length === 0) return emptyResult;

  const monthKey = (value: unknown): string | null => {
    const parsed = value ? new Date(value as any) : null;
    if (!parsed || isNaN(parsed.getTime())) return null;
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
  };

  const normalized = customerQualityRecords
    .map((r) => ({
      month: monthKey((r as any).snapshotDate),
      customerName: String((r as any).customerName || '').trim(),
      revenue: Number((r as any).revenue) || 0,
    }))
    .filter((r) => !!r.month && !!r.customerName);

  if (normalized.length === 0) return emptyResult;

  const monthCustomerRevenue = new Map<string, Map<string, number>>();
  for (const row of normalized) {
    const perCustomer = monthCustomerRevenue.get(row.month!) || new Map<string, number>();
    perCustomer.set(row.customerName, (perCustomer.get(row.customerName) || 0) + row.revenue);
    monthCustomerRevenue.set(row.month!, perCustomer);
  }

  const months = Array.from(monthCustomerRevenue.keys()).sort();
  if (months.length === 0) return emptyResult;

  const rollingMetrics: Array<{
    month: string;
    top1Pct: number;
    top5Pct: number;
    hhi: number;
    customerCount: number;
    totalRevenue: number;
  }> = [];
  for (let i = 0; i < months.length; i++) {
    if (i < 11) continue;
    const windowMonths = months.slice(i - 11, i + 1);
    const totalsByCustomer = new Map<string, number>();
    for (const mKey of windowMonths) {
      const customerMap = monthCustomerRevenue.get(mKey);
      if (!customerMap) continue;
      for (const [customer, revenue] of Array.from(customerMap.entries())) {
        totalsByCustomer.set(customer, (totalsByCustomer.get(customer) || 0) + revenue);
      }
    }
    const totalRevenue = Array.from(totalsByCustomer.values()).reduce((s, v) => s + v, 0);
    const sortedRevenue = Array.from(totalsByCustomer.values()).sort((a, b) => b - a);
    const top1 = sortedRevenue[0] || 0;
    const top5 = sortedRevenue.slice(0, 5).reduce((s, v) => s + v, 0);
    const top1Pct = totalRevenue > 0 ? (top1 / totalRevenue) * 100 : 0;
    const top5Pct = totalRevenue > 0 ? (top5 / totalRevenue) * 100 : 0;
    const hhi =
      totalRevenue > 0
        ? Array.from(totalsByCustomer.values()).reduce((sum, rev) => {
            const sharePct = (rev / totalRevenue) * 100;
            return sum + sharePct * sharePct;
          }, 0)
        : 0;
    rollingMetrics.push({
      month: months[i],
      top1Pct,
      top5Pct,
      hhi,
      customerCount: totalsByCustomer.size,
      totalRevenue,
    });
  }

  if (rollingMetrics.length === 0) return emptyResult;

  const latest = rollingMetrics[rollingMetrics.length - 1];
  const bench = sdeSectorBenchmarks.customerQuality;

  const flags = [
    {
      id: 'top1' as const,
      title: 'Top customer concentration',
      triggered: latest.top1Pct > bench.top1Warn,
      detail: `Top 1 customer: ${latest.top1Pct.toFixed(1)}% (sector warn ${bench.top1Warn.toFixed(0)}%)`,
      severity: latest.top1Pct > bench.top1High ? ('high' as const) : ('medium' as const),
    },
    {
      id: 'top5' as const,
      title: 'Top 5 customer concentration',
      triggered: latest.top5Pct > bench.top5Warn,
      detail: `Top 5 customers: ${latest.top5Pct.toFixed(1)}% (sector warn ${bench.top5Warn.toFixed(0)}%)`,
      severity: latest.top5Pct > bench.top5High ? ('high' as const) : ('medium' as const),
    },
    {
      id: 'hhi' as const,
      title: 'Customer concentration index (HHI)',
      triggered: latest.hhi > bench.hhiWarn,
      detail: `HHI: ${Math.round(latest.hhi)} (sector warn ${bench.hhiWarn})`,
      severity: latest.hhi > bench.hhiHigh ? ('high' as const) : ('medium' as const),
    },
  ];

  return {
    hasData: true,
    top1Pct: latest.top1Pct,
    top5Pct: latest.top5Pct,
    hhi: latest.hhi,
    customerCount: latest.customerCount,
    totalTtmRevenue: latest.totalRevenue,
    top1Series: rollingMetrics.map((m) => ({ month: m.month, value: m.top1Pct })),
    top5Series: rollingMetrics.map((m) => ({ month: m.month, value: m.top5Pct })),
    hhiSeries: rollingMetrics.map((m) => ({ month: m.month, value: m.hhi })),
    customerCountSeries: rollingMetrics.map((m) => ({ month: m.month, value: m.customerCount })),
    flags,
  };
}

function buildWorkingCapitalSeries(monthly: MonthlyDataRow[]) {
  const recent = monthly.slice(-36);
  return recent.map((m) => {
    const revenue = Number((m as any)?.revenue) || 0;
    const cogs = Number((m as any)?.cogsTotal) || 0;
    const ar = Number((m as any)?.ar) || 0;
    const inventory = Number((m as any)?.inventory) || 0;
    const ap = Number((m as any)?.ap) || 0;
    const accruedOpLiabilities = Number((m as any)?.otherCL) || 0;
    const operatingWc = ar + inventory - ap - accruedOpLiabilities;
    const wcIntensityPct = revenue !== 0 ? (operatingWc / Math.abs(revenue)) * 100 : 0;
    const monthDate = (m as any)?.month ? new Date(String((m as any).month)) : null;
    const daysInMonth =
      monthDate && !Number.isNaN(monthDate.getTime())
        ? new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
        : 30;
    const dso = ar > 0 && revenue > 0 ? (ar / revenue) * daysInMonth : 0;
    const dio = inventory > 0 && cogs !== 0 ? (inventory / Math.abs(cogs)) * daysInMonth : 0;
    const dpo = Math.abs(ap) > 0 && cogs !== 0 ? (Math.abs(ap) / Math.abs(cogs)) * daysInMonth : 0;
    const ccc = dso + dio - dpo;
    return {
      month: String((m as any)?.month || ''),
      revenue,
      cogs,
      ar,
      inventory,
      ap,
      accruedOpLiabilities,
      operatingWc,
      wcIntensityPct,
      dso,
      dio,
      dpo,
      ccc,
    };
  });
}

function buildWorkingCapitalInsights(
  workingCapitalSeries: ReturnType<typeof buildWorkingCapitalSeries>,
  revenueQualityInsights: ReturnType<typeof buildRevenueQualityInsights>,
  sdeSectorBenchmarks: ReturnType<typeof getSdeSectorBenchmarks>,
) {
  const safeAvg = (values: number[]) =>
    values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  const last12 = workingCapitalSeries.slice(-12);
  const latest = workingCapitalSeries[workingCapitalSeries.length - 1];
  const month12Ago = workingCapitalSeries.length >= 13 ? workingCapitalSeries[workingCapitalSeries.length - 13] : null;

  const normalizedTarget = safeAvg(last12.map((r) => r.operatingWc));
  const currentWc = latest ? latest.operatingWc : 0;
  const wcAdjustment = currentWc - normalizedTarget;
  const avgWcIntensity12 = safeAvg(last12.map((r) => r.wcIntensityPct));
  const currentCcc = latest ? latest.ccc : 0;
  const priorCcc = month12Ago ? month12Ago.ccc : 0;
  const cccTrend12 = latest && month12Ago ? latest.ccc - month12Ago.ccc : 0;
  const cccTrendTitle = currentCcc < 0 && priorCcc < 0 ? 'CCC becoming less favorable' : 'CCC deterioration';
  const cccTrendDetail = `12M change: ${cccTrend12 >= 0 ? '+' : ''}${cccTrend12.toFixed(1)} days (${priorCcc.toFixed(1)} -> ${currentCcc.toFixed(1)})`;
  const cccWarn = sdeSectorBenchmarks.workingCapital.cccWarn;
  const cccHigh = sdeSectorBenchmarks.workingCapital.cccHigh;
  const cccInterpretation =
    currentCcc < 0
      ? 'Negative CCC can indicate supplier financing of growth (cash collected before payments are due).'
      : currentCcc <= Math.max(60, Math.round(cccWarn * 0.67))
        ? 'Low positive CCC typically indicates efficient working capital conversion.'
        : currentCcc <= cccWarn
          ? 'Moderate CCC suggests normal cash tie-up; monitor trend and driver mix (DSO, DIO, DPO).'
          : `High CCC versus ${sdeSectorBenchmarks.sectorLabel} norms suggests significant cash tied in operations.`;
  const annualRevenue = last12.reduce((sum, row) => sum + row.revenue, 0);
  const annualCogs = last12.reduce((sum, row) => sum + row.cogs, 0);

  const wcRecent12 = workingCapitalSeries.slice(-12);
  const cccMiniSeries = wcRecent12.map((r) => ({ month: r.month, value: r.ccc }));

  const flags = [
    {
      id: 'wc-deficit',
      title: 'WC below normalized target',
      triggered: wcAdjustment < 0,
      detail: `Current vs target: $${Math.round(currentWc).toLocaleString()} vs $${Math.round(normalizedTarget).toLocaleString()}`,
      severity: wcAdjustment < -Math.abs(normalizedTarget) * 0.2 ? ('high' as const) : ('medium' as const),
    },
    {
      id: 'ccc-deterioration',
      title: cccTrendTitle,
      triggered: cccTrend12 > sdeSectorBenchmarks.workingCapital.cccTrendWarn,
      detail: cccTrendDetail,
      severity:
        currentCcc < 0 ? ('low' as const) : cccTrend12 > sdeSectorBenchmarks.workingCapital.cccTrendHigh ? ('high' as const) : ('medium' as const),
    },
    {
      id: 'wc-intensity',
      title: 'Working capital intensity elevated',
      triggered: avgWcIntensity12 > sdeSectorBenchmarks.workingCapital.wcIntensityWarn,
      detail: `Avg 12M WC intensity: ${avgWcIntensity12.toFixed(1)}%`,
      severity:
        avgWcIntensity12 > sdeSectorBenchmarks.workingCapital.wcIntensityHigh ? ('high' as const) : ('medium' as const),
    },
    {
      id: 'ccc-level',
      title: 'Cash conversion cycle level high',
      triggered: currentCcc > cccWarn,
      detail: `Current CCC: ${currentCcc.toFixed(1)} days vs benchmark trigger ${cccWarn.toFixed(0)} days`,
      severity: currentCcc > cccHigh ? ('high' as const) : ('medium' as const),
    },
  ];

  return {
    normalizedTarget,
    currentWc,
    wcAdjustment,
    avgWcIntensity12,
    currentCcc,
    priorCcc,
    cccTrend12,
    cccInterpretation,
    annualRevenue,
    annualCogs,
    cccMiniSeries,
    flags,
    revenueQualityCurrentDso: revenueQualityInsights.currentDso,
  };
}

function buildCashFlowQualitySeries(monthly: MonthlyDataRow[]) {
  const recent = monthly.slice(-36);
  return recent.map((m, idx) => {
    const revenue = Number((m as any)?.revenue) || 0;
    const cogs = Number((m as any)?.cogsTotal) || 0;
    const expense = Number((m as any)?.expense) || 0;
    const interest = Number((m as any)?.interestExpense) || 0;
    const depreciation = Number((m as any)?.depreciationAmortization) || 0;
    const netIncome = revenue - cogs - expense;
    const ebitda = netIncome + interest + depreciation;
    const prevFixedAssets = idx > 0 ? Number((recent[idx - 1] as any)?.fixedAssets) || 0 : Number((m as any)?.fixedAssets) || 0;
    const fixedAssets = Number((m as any)?.fixedAssets) || 0;
    const prevAr = idx > 0 ? Number((recent[idx - 1] as any)?.ar) || 0 : Number((m as any)?.ar) || 0;
    const prevInventory = idx > 0 ? Number((recent[idx - 1] as any)?.inventory) || 0 : Number((m as any)?.inventory) || 0;
    const prevAp = idx > 0 ? Number((recent[idx - 1] as any)?.ap) || 0 : Number((m as any)?.ap) || 0;
    const currAr = Number((m as any)?.ar) || 0;
    const currInventory = Number((m as any)?.inventory) || 0;
    const currAp = Number((m as any)?.ap) || 0;
    const changeInAr = currAr - prevAr;
    const changeInInventory = currInventory - prevInventory;
    const changeInAp = currAp - prevAp;
    const changeInWorkingCapital = -(changeInAr + changeInInventory - changeInAp);
    const operatingCashFlow = netIncome + depreciation + changeInWorkingCapital;
    const capex = idx > 0 ? fixedAssets - prevFixedAssets + depreciation : 0;
    const freeCashFlow = operatingCashFlow - Math.max(0, capex);
    const cashConversionPct = ebitda !== 0 ? (operatingCashFlow / ebitda) * 100 : 0;
    return {
      month: String((m as any)?.month || ''),
      revenue,
      netIncome,
      depreciation,
      ebitda,
      capex,
      operatingCashFlow,
      freeCashFlow,
      cashConversionPct,
    };
  });
}

function buildCashFlowQualityInsights(
  cashFlowQualitySeries: ReturnType<typeof buildCashFlowQualitySeries>,
  sdeSectorBenchmarks: ReturnType<typeof getSdeSectorBenchmarks>,
) {
  const safeAvg = (values: number[]) =>
    values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  const last12 = cashFlowQualitySeries.slice(-12);
  const prev12 = cashFlowQualitySeries.slice(-24, -12);

  const ttmEbitda = last12.reduce((sum, row) => sum + row.ebitda, 0);
  const ttmOperatingCashFlow = last12.reduce((sum, row) => sum + row.operatingCashFlow, 0);
  const ttmOperatingCashFlowPrev = prev12.reduce((sum, row) => sum + row.operatingCashFlow, 0);
  const ttmReportedCapex = last12.reduce((sum, row) => sum + row.capex, 0);
  const ttmDepreciation = last12.reduce((sum, row) => sum + row.depreciation, 0);
  const maintenanceCapexEstimate = Math.max(ttmDepreciation, ttmReportedCapex);
  const capexGap = maintenanceCapexEstimate - ttmReportedCapex;
  const cashConversionPct = ttmEbitda !== 0 ? (ttmOperatingCashFlow / ttmEbitda) * 100 : 0;
  const fcfDurabilityPct =
    ttmEbitda !== 0 ? ((ttmOperatingCashFlow - maintenanceCapexEstimate) / ttmEbitda) * 100 : 0;
  const ocfTrend = ttmOperatingCashFlow - ttmOperatingCashFlowPrev;
  const fcfTtm = last12.reduce((sum, row) => sum + row.freeCashFlow, 0);
  const fcfPrevTtm = prev12.reduce((sum, row) => sum + row.freeCashFlow, 0);
  const fcfTrend = fcfTtm - fcfPrevTtm;

  const flags = [
    {
      id: 'cash-conversion-weak',
      title: 'Cash conversion below target',
      triggered: cashConversionPct < sdeSectorBenchmarks.cashFlow.cashConversionWarn,
      detail: `Current TTM cash conversion: ${cashConversionPct.toFixed(1)}%`,
      severity:
        cashConversionPct < sdeSectorBenchmarks.cashFlow.cashConversionHighRisk ? ('high' as const) : ('medium' as const),
    },
    {
      id: 'capex-gap',
      title: 'Maintenance CapEx underinvestment',
      triggered: capexGap > 0,
      detail: `Estimated gap: $${Math.round(capexGap).toLocaleString()}`,
      severity:
        capexGap > Math.max(1, Math.abs(ttmEbitda) * sdeSectorBenchmarks.cashFlow.capexGapHighPctOfEbitda)
          ? ('high' as const)
          : ('medium' as const),
    },
    {
      id: 'fcf-weakness',
      title:
        fcfDurabilityPct < sdeSectorBenchmarks.cashFlow.fcfDurabilityWarn
          ? 'Free cash flow durability weak'
          : 'Free cash flow durability healthy',
      triggered: fcfDurabilityPct < sdeSectorBenchmarks.cashFlow.fcfDurabilityWarn,
      detail: `FCF durability: ${fcfDurabilityPct.toFixed(1)}% of EBITDA`,
      severity:
        fcfDurabilityPct < sdeSectorBenchmarks.cashFlow.fcfDurabilityHighRisk ? ('high' as const) : ('medium' as const),
    },
    {
      id: 'ocf-deterioration',
      title: 'Cash flow trend deterioration',
      triggered: fcfTrend < 0 || ocfTrend < 0,
      detail: `OCF trend: ${ocfTrend >= 0 ? '+' : ''}$${Math.round(Math.abs(ocfTrend)).toLocaleString()} | FCF trend: ${fcfTrend >= 0 ? '+' : ''}$${Math.round(Math.abs(fcfTrend)).toLocaleString()}`,
      severity: ocfTrend < 0 && fcfTrend < 0 ? ('high' as const) : ('medium' as const),
    },
  ];

  return {
    ttmEbitda,
    ttmOperatingCashFlow,
    ttmReportedCapex,
    maintenanceCapexEstimate,
    capexGap,
    cashConversionPct,
    fcfDurabilityPct,
    ocfTrend,
    fcfTtm,
    fcfTrend,
    flags,
  };
}
