import { getSdeSectorBenchmarks } from './sde-sector-benchmarks';

export type SdeRecommendationPriority = 'High' | 'Medium' | 'Low';
export type SdeRecommendationModule = 'Revenue Quality' | 'Working Capital' | 'Cash Flow Quality';
export type SdeRecommendationEffort = 'Low' | 'Medium' | 'High';
export type SdeRecommendationHorizon = '30 days' | '60 days' | '90 days';

export type SdeRecommendation = {
  id: string;
  module: SdeRecommendationModule;
  priority: SdeRecommendationPriority;
  title: string;
  rationale: string;
  impactRange: { low: number; high: number };
  effort: SdeRecommendationEffort;
  confidence: number;
  horizon: SdeRecommendationHorizon;
};

export type SdeExecutiveSummary = {
  readinessScore: number;
  rating: 'Strong' | 'Moderate' | 'Needs Attention';
  highCount: number;
  mediumCount: number;
  lowCount: number;
};

export type SdeExecutiveAlert = {
  id: string;
  level: 'high' | 'medium' | 'low';
  message: string;
};

export type SdeExecutiveScorecardItem = {
  area: 'revenue_quality' | 'ebitda_quality' | 'working_capital_efficiency' | 'cash_flow_quality';
  status: 'healthy' | 'moderate_risk' | 'high_risk';
  headlineMetric: string;
  value: string;
  impactLabel: string;
  impactValue: string;
};

export type SdeExecutiveInsight = {
  id: string;
  text: string;
  severity: 'info' | 'warning' | 'critical';
  evidenceRefs: string[];
};

export type SdeExecutiveFinancialSummary = {
  headline: string;
  dataQualityScore: number;
  confidence: 'low' | 'medium' | 'high';
  scorecard: SdeExecutiveScorecardItem[];
  coreInsights: SdeExecutiveInsight[];
  valueOpportunity: {
    ebitdaUpliftLow: number;
    ebitdaUpliftHigh: number;
    narrative: string;
    growthQualityPremium: {
      active: boolean;
      suggestedMultipleDeltaLow: number;
      suggestedMultipleDeltaHigh: number;
      rationale: string;
    };
    advanceRevenueCccAdvantage: {
      active: boolean;
      suggestedMultipleDeltaLow: number;
      suggestedMultipleDeltaHigh: number;
      rationale: string;
    };
  };
  keyStrengths: string[];
  keyRisks: string[];
  trendCommentary: string[];
  alerts: SdeExecutiveAlert[];
};

type Severity = 'high' | 'medium' | 'low';

type SignalFlag = {
  id: string;
  triggered: boolean;
  severity: Severity;
};

export type SdeRecommendationsPayload = {
  executiveSummary: SdeExecutiveSummary;
  executiveFinancialSummary: SdeExecutiveFinancialSummary;
  recommendations: SdeRecommendation[];
  dataAsOf: string | null;
};

export type SdeMonthlyInput = {
  monthDate?: Date | string | null;
  month?: string | null;
  revenue?: number | null;
  cogsTotal?: number | null;
  expense?: number | null;
  interestExpense?: number | null;
  depreciationAmortization?: number | null;
  stateIncomeTaxes?: number | null;
  federalIncomeTaxes?: number | null;
  netProfit?: number | null;
  ar?: number | null;
  inventory?: number | null;
  ap?: number | null;
  otherCL?: number | null;
  fixedAssets?: number | null;
};

export type SdeRecommendationsContext = {
  industrySectorCategory?: string | null;
};


const toNumber = (value: unknown): number => Number(value) || 0;

const monthLabel = (row: SdeMonthlyInput, index: number): string => {
  if (typeof row.month === 'string' && row.month.trim()) return row.month;
  if (row.monthDate) {
    const date = new Date(row.monthDate);
    if (!isNaN(date.getTime())) {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${month}-${date.getFullYear()}`;
    }
  }
  return `M${index + 1}`;
};

const daysInMonthFromLabel = (month: string): number => {
  const date = new Date(month);
  if (!isNaN(date.getTime())) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }
  const monthMatch = month.match(/^(\d{1,2})[-/](\d{4})$/);
  if (monthMatch) {
    const m = Number(monthMatch[1]);
    const y = Number(monthMatch[2]);
    if (m >= 1 && m <= 12) {
      return new Date(y, m, 0).getDate();
    }
  }
  return 30;
};

const avg = (values: number[]): number => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const fmtDollar = (value: number): string => `$${Math.round(value).toLocaleString()}`;
const fmtPct = (value: number): string => `${value.toFixed(1)}%`;

export function computeSdeRecommendationsFromMonthly(
  monthlyRows: SdeMonthlyInput[],
  context?: SdeRecommendationsContext,
): SdeRecommendationsPayload {
  const rows = [...monthlyRows]
    .filter((row) => row && (row.monthDate || row.month))
    .sort((a, b) => {
      const aDate = a.monthDate ? new Date(a.monthDate).getTime() : Number.NaN;
      const bDate = b.monthDate ? new Date(b.monthDate).getTime() : Number.NaN;
      if (isNaN(aDate) || isNaN(bDate)) return 0;
      return aDate - bDate;
    });
  const sectorBenchmarks = getSdeSectorBenchmarks(context?.industrySectorCategory || null);

  const recent24 = rows.slice(-24).map((row, idx) => ({
    month: monthLabel(row, idx),
    revenue: toNumber(row.revenue),
    cogs: toNumber(row.cogsTotal),
    expense: toNumber(row.expense),
    ar: toNumber(row.ar),
    inventory: toNumber(row.inventory),
    ap: toNumber(row.ap),
    otherCL: toNumber(row.otherCL),
    netIncome: toNumber(row.revenue) - toNumber(row.cogsTotal) - toNumber(row.expense),
    stateIncomeTaxes: toNumber(row.stateIncomeTaxes),
    federalIncomeTaxes: toNumber(row.federalIncomeTaxes),
    interest: toNumber(row.interestExpense),
    depreciation: toNumber(row.depreciationAmortization),
    fixedAssets: toNumber(row.fixedAssets),
  }));

  const revenueSeries = recent24.map((row, idx) => {
    const priorAr = idx > 0 ? recent24[idx - 1].ar : row.ar;
    const deltaAr = row.ar - priorAr;
    const collectionsProxy = row.revenue - deltaAr;
    const gapPct = row.revenue !== 0 ? ((row.revenue - collectionsProxy) / Math.abs(row.revenue)) * 100 : 0;
    const daysInMonth = daysInMonthFromLabel(row.month);
    const dso = row.ar > 0 && row.revenue > 0 ? (row.ar / row.revenue) * daysInMonth : 0;
    return {
      month: row.month,
      revenue: row.revenue,
      ar: row.ar,
      gapPct,
      dso,
    };
  });

  const revenueLast12 = revenueSeries.slice(-12);
  const revenueLatest = revenueSeries[revenueSeries.length - 1];
  const revenue12Ago = revenueSeries.length >= 13 ? revenueSeries[revenueSeries.length - 13] : null;
  const dsoTrend12 = revenueLatest && revenue12Ago ? revenueLatest.dso - revenue12Ago.dso : 0;
  const currentDso = revenueLatest ? revenueLatest.dso : 0;
  const dsoBenchmark = sectorBenchmarks.dso;
  const dsoBenchmarkTarget = sectorBenchmarks.benchmarkTargets.dso;
  const dsoOverBenchmark = currentDso - dsoBenchmark.max;
  const avgGap12 = avg(revenueLast12.map((row) => row.gapPct));
  const ttmRevenueCurrent = revenueSeries.slice(-12).reduce((sum, row) => sum + row.revenue, 0);
  const ttmRevenuePrior = revenueSeries.slice(-24, -12).reduce((sum, row) => sum + row.revenue, 0);
  const revenueGrowth = ttmRevenuePrior !== 0 ? ((ttmRevenueCurrent - ttmRevenuePrior) / Math.abs(ttmRevenuePrior)) * 100 : 0;
  const arCurrent = revenueLatest ? revenueLatest.ar : 0;
  const arPrior = revenue12Ago ? revenue12Ago.ar : 0;
  const arGrowth = arPrior !== 0 ? ((arCurrent - arPrior) / Math.abs(arPrior)) * 100 : 0;
  const arRevenueSpread = arGrowth - revenueGrowth;
  const revenueMean = avg(revenueLast12.map((row) => row.revenue));
  const revenueVariance = revenueLast12.length
    ? revenueLast12.reduce((sum, row) => sum + Math.pow(row.revenue - revenueMean, 2), 0) / revenueLast12.length
    : 0;
  const revenueCv = revenueMean !== 0 ? Math.sqrt(revenueVariance) / Math.abs(revenueMean) : 0;
  const dsoCashOpportunity = Math.max(0, currentDso - dsoBenchmarkTarget) * (Math.abs(ttmRevenueCurrent) / 365);

  const revenueFlags: SignalFlag[] = [
    {
      id: 'dso-spike',
      triggered: dsoTrend12 > dsoBenchmark.trendWarn || dsoOverBenchmark > 5,
      severity: dsoTrend12 > dsoBenchmark.trendHigh || dsoOverBenchmark > 15 ? 'high' : 'medium',
    },
    {
      id: 'dso-vs-sector',
      triggered: dsoOverBenchmark > 0,
      severity: dsoOverBenchmark > 15 ? 'high' : 'medium',
    },
    { id: 'ar-vs-revenue', triggered: arRevenueSpread > dsoBenchmark.spreadWarn, severity: arRevenueSpread > dsoBenchmark.spreadHigh ? 'high' : 'medium' },
    { id: 'cash-gap', triggered: Math.abs(avgGap12) > dsoBenchmark.gapWarn, severity: Math.abs(avgGap12) > dsoBenchmark.gapHigh ? 'high' : 'medium' },
    { id: 'revenue-volatility', triggered: revenueCv > dsoBenchmark.volatilityWarn, severity: revenueCv > dsoBenchmark.volatilityHigh ? 'high' : 'low' },
  ];

  const wcSeries = recent24.map((row) => {
    const operatingWc = row.ar + row.inventory - row.ap - row.otherCL;
    const wcIntensityPct = row.revenue !== 0 ? (operatingWc / Math.abs(row.revenue)) * 100 : 0;
    const daysInMonth = daysInMonthFromLabel(row.month);
    const dso = row.ar > 0 && row.revenue > 0 ? (row.ar / row.revenue) * daysInMonth : 0;
    const dio = row.inventory > 0 && row.cogs !== 0 ? (row.inventory / Math.abs(row.cogs)) * daysInMonth : 0;
    const dpo = Math.abs(row.ap) > 0 && row.cogs !== 0 ? (Math.abs(row.ap) / Math.abs(row.cogs)) * daysInMonth : 0;
    return {
      operatingWc,
      wcIntensityPct,
      ccc: dso + dio - dpo,
    };
  });
  const wcLast12 = wcSeries.slice(-12);
  const wcLatest = wcSeries[wcSeries.length - 1];
  const wc12Ago = wcSeries.length >= 13 ? wcSeries[wcSeries.length - 13] : null;
  const normalizedTarget = avg(wcLast12.map((row) => row.operatingWc));
  const currentWc = wcLatest ? wcLatest.operatingWc : 0;
  const wcAdjustment = currentWc - normalizedTarget;
  const avgWcIntensity12 = avg(wcLast12.map((row) => row.wcIntensityPct));
  const currentCcc = wcLatest ? wcLatest.ccc : 0;
  const cccTrend12 = wcLatest && wc12Ago ? wcLatest.ccc - wc12Ago.ccc : 0;

  const workingCapitalFlags: SignalFlag[] = [
    {
      id: 'wc-deficit',
      triggered: wcAdjustment < 0,
      severity: wcAdjustment < -Math.abs(normalizedTarget) * 0.2 ? 'high' : 'medium'
    },
    { id: 'ccc-deterioration', triggered: cccTrend12 > sectorBenchmarks.workingCapital.cccTrendWarn, severity: cccTrend12 > sectorBenchmarks.workingCapital.cccTrendHigh ? 'high' : 'medium' },
    { id: 'wc-intensity', triggered: avgWcIntensity12 > sectorBenchmarks.workingCapital.wcIntensityWarn, severity: avgWcIntensity12 > sectorBenchmarks.workingCapital.wcIntensityHigh ? 'high' : 'medium' },
    { id: 'ccc-level', triggered: currentCcc > sectorBenchmarks.workingCapital.cccWarn, severity: currentCcc > sectorBenchmarks.workingCapital.cccHigh ? 'high' : 'medium' },
  ];

  const cfSeries = recent24.map((row, idx) => {
    // Align EBITDA baseline to SDE panel math: Revenue - COGS - Expense + Interest + D&A.
    const ebitda = (row.revenue - row.cogs - row.expense) + row.interest + row.depreciation;
    // Align OCF with financial reports: net income + depreciation + change in working capital.
    const netIncomeForCashFlow = row.revenue - row.cogs - row.expense;
    const priorFixedAssets = idx > 0 ? recent24[idx - 1].fixedAssets : row.fixedAssets;
    const priorAr = idx > 0 ? recent24[idx - 1].ar : row.ar;
    const priorInventory = idx > 0 ? recent24[idx - 1].inventory : row.inventory;
    const priorAp = idx > 0 ? recent24[idx - 1].ap : row.ap;
    const changeInWorkingCapital = -((row.ar - priorAr) + (row.inventory - priorInventory) - (row.ap - priorAp));
    const capex = idx > 0 ? (row.fixedAssets - priorFixedAssets) + row.depreciation : 0;
    const operatingCashFlow = netIncomeForCashFlow + row.depreciation + changeInWorkingCapital;
    const freeCashFlow = operatingCashFlow - Math.max(0, capex);
    const cashConversionPct = ebitda !== 0 ? (operatingCashFlow / ebitda) * 100 : 0;
    return {
      ebitda,
      capex,
      depreciation: row.depreciation,
      operatingCashFlow,
      freeCashFlow,
      cashConversionPct,
    };
  });
  const cfLast12 = cfSeries.slice(-12);
  const cfPrev12 = cfSeries.slice(-24, -12);
  const ttmEbitda = cfLast12.reduce((sum, row) => sum + row.ebitda, 0);
  const ttmOperatingCashFlow = cfLast12.reduce((sum, row) => sum + row.operatingCashFlow, 0);
  const ttmOperatingCashFlowPrev = cfPrev12.reduce((sum, row) => sum + row.operatingCashFlow, 0);
  const ttmReportedCapex = cfLast12.reduce((sum, row) => sum + row.capex, 0);
  const ttmDepreciation = cfLast12.reduce((sum, row) => sum + row.depreciation, 0);
  const maintenanceCapexEstimate = Math.max(ttmDepreciation, ttmReportedCapex);
  const capexGap = maintenanceCapexEstimate - ttmReportedCapex;
  const cashConversionPct = ttmEbitda !== 0 ? (ttmOperatingCashFlow / ttmEbitda) * 100 : 0;
  const fcfDurabilityPct = ttmEbitda !== 0 ? ((ttmOperatingCashFlow - maintenanceCapexEstimate) / ttmEbitda) * 100 : 0;
  const cashConversionTrend = avg(cfLast12.map((row) => row.cashConversionPct)) - avg(cfPrev12.map((row) => row.cashConversionPct));
  const ocfTrend = ttmOperatingCashFlow - ttmOperatingCashFlowPrev;
  const fcfTrend = cfLast12.reduce((sum, row) => sum + row.freeCashFlow, 0) - cfPrev12.reduce((sum, row) => sum + row.freeCashFlow, 0);

  const cashFlowFlags: SignalFlag[] = [
    { id: 'cash-conversion-weak', triggered: cashConversionPct < sectorBenchmarks.cashFlow.cashConversionWarn, severity: cashConversionPct < sectorBenchmarks.cashFlow.cashConversionHighRisk ? 'high' : 'medium' },
    { id: 'capex-gap', triggered: capexGap > 0, severity: capexGap > Math.max(1, Math.abs(ttmEbitda) * sectorBenchmarks.cashFlow.capexGapHighPctOfEbitda) ? 'high' : 'medium' },
    { id: 'fcf-weakness', triggered: fcfDurabilityPct < sectorBenchmarks.cashFlow.fcfDurabilityWarn, severity: fcfDurabilityPct < sectorBenchmarks.cashFlow.fcfDurabilityHighRisk ? 'high' : 'medium' },
    {
      id: 'ocf-deterioration',
      triggered: cashConversionTrend < -sectorBenchmarks.cashFlow.conversionTrendWarn || fcfTrend < 0 || ocfTrend < 0,
      severity: cashConversionTrend < -sectorBenchmarks.cashFlow.conversionTrendHigh || (ocfTrend < 0 && fcfTrend < 0) ? 'high' : 'medium'
    },
  ];

  const triggeredFlags = [...revenueFlags, ...workingCapitalFlags, ...cashFlowFlags].filter((flag) => flag.triggered);
  const highCount = triggeredFlags.filter((flag) => flag.severity === 'high').length;
  const mediumCount = triggeredFlags.filter((flag) => flag.severity === 'medium').length;
  const lowCount = triggeredFlags.filter((flag) => flag.severity === 'low').length;
  const weightedRisk = highCount * 2 + mediumCount;
  const readinessScore = Math.max(0, Math.min(100, 100 - weightedRisk * 8));
  const rating =
    readinessScore >= 80 ? 'Strong' :
    readinessScore >= 60 ? 'Moderate' :
    'Needs Attention';

  const executiveStrengths: string[] = [];
  if (cashConversionPct >= 80) {
    executiveStrengths.push(`Cash conversion is strong at ${cashConversionPct.toFixed(1)}% of EBITDA.`);
  }
  if (currentCcc < 0) {
    executiveStrengths.push(`Cash conversion cycle is negative (${currentCcc.toFixed(1)} days), indicating supplier-funded growth dynamics.`);
  } else if (currentCcc <= 60 && currentCcc !== 0) {
    executiveStrengths.push(`Cash conversion cycle remains efficient at ${currentCcc.toFixed(1)} days.`);
  }
  if (fcfDurabilityPct >= 20) {
    executiveStrengths.push(`Free cash flow durability is healthy at ${fcfDurabilityPct.toFixed(1)}% of EBITDA.`);
  }

  const executiveRisks: string[] = [];
  if (dsoOverBenchmark > 0) {
    executiveRisks.push(
      `Current DSO is ${currentDso.toFixed(1)} days, above ${sectorBenchmarks.sectorLabel} benchmark (${dsoBenchmark.min}-${dsoBenchmark.max} days).`,
    );
    if (dsoCashOpportunity > 0) {
      executiveRisks.push(
        `Reducing DSO to ${dsoBenchmarkTarget} days (sector benchmark target) could release approximately ${fmtDollar(dsoCashOpportunity)} of cash.`,
      );
    }
  } else {
    executiveStrengths.push(
      `Current DSO is ${currentDso.toFixed(1)} days, within ${sectorBenchmarks.sectorLabel} benchmark (${dsoBenchmark.min}-${dsoBenchmark.max} days).`,
    );
  }
  if (dsoTrend12 > dsoBenchmark.trendWarn) {
    executiveRisks.push(`DSO increased ${dsoTrend12.toFixed(1)} days over 12 months, increasing receivables collection risk.`);
  }
  if (arRevenueSpread > dsoBenchmark.spreadWarn) {
    executiveRisks.push(`AR growth outpaced revenue by ${arRevenueSpread.toFixed(1)} points, signaling potential revenue quality pressure.`);
  }
  if (currentCcc > sectorBenchmarks.workingCapital.cccWarn) {
    executiveRisks.push(`CCC is elevated at ${currentCcc.toFixed(1)} days, tying up cash in operations.`);
  }
  if (cashConversionPct < sectorBenchmarks.cashFlow.cashConversionWarn) {
    executiveRisks.push(`Cash conversion is weak at ${cashConversionPct.toFixed(1)}% of EBITDA.`);
  }
  if (capexGap > 0) {
    executiveRisks.push(`Maintenance CapEx appears underfunded by about $${Math.round(capexGap).toLocaleString()}.`);
  }

  const trendCommentary: string[] = [
    `Revenue trend (TTM vs prior TTM): ${revenueGrowth >= 0 ? '+' : ''}${revenueGrowth.toFixed(1)}%.`,
    `DSO vs ${sectorBenchmarks.sectorLabel} benchmark (${dsoBenchmark.min}-${dsoBenchmark.max} days): ${currentDso.toFixed(1)} days.`,
    `Operating cash flow trend (TTM delta): ${ocfTrend >= 0 ? '+' : '-'}$${Math.round(Math.abs(ocfTrend)).toLocaleString()}.`,
    `Working capital intensity (avg 12M): ${avgWcIntensity12.toFixed(1)}%.`,
  ];

  const alerts: SdeExecutiveAlert[] = triggeredFlags
    .slice(0, 6)
    .map((flag) => {
      const labelMap: Record<string, string> = {
        'dso-spike': `DSO spike detected (${dsoTrend12.toFixed(1)} days over 12 months).`,
        'dso-vs-sector': `DSO is ${currentDso.toFixed(1)} days versus ${sectorBenchmarks.sectorLabel} benchmark (${dsoBenchmark.min}-${dsoBenchmark.max}).`,
        'ar-vs-revenue': `AR growth spread elevated (${arRevenueSpread.toFixed(1)} points above revenue growth).`,
        'cash-gap': `Revenue-to-cash gap is elevated (${avgGap12.toFixed(1)}% average over 12 months).`,
        'revenue-volatility': `Revenue volatility is elevated (CV ${revenueCv.toFixed(2)}).`,
        'wc-deficit': `Current working capital is below normalized target by $${Math.round(Math.abs(wcAdjustment)).toLocaleString()}.`,
        'ccc-deterioration': `Cash conversion cycle deteriorated by ${cccTrend12.toFixed(1)} days.`,
        'wc-intensity': `Working capital intensity is elevated at ${avgWcIntensity12.toFixed(1)}%.`,
        'ccc-level': `Cash conversion cycle level is high at ${currentCcc.toFixed(1)} days.`,
        'cash-conversion-weak': `Cash conversion below threshold at ${cashConversionPct.toFixed(1)}%.`,
        'capex-gap': `Maintenance CapEx gap is approximately $${Math.round(capexGap).toLocaleString()}.`,
        'fcf-weakness': `FCF durability is below target at ${fcfDurabilityPct.toFixed(1)}% of EBITDA.`,
        'ocf-deterioration': `Cash flow trend deterioration detected across OCF/FCF/conversion.`,
      };
      return {
        id: flag.id,
        level: flag.severity,
        message: labelMap[flag.id] || `Signal triggered: ${flag.id}`,
      };
    });

  const recommendations: SdeRecommendation[] = [];
  const ebitdaBase = Math.max(0, ttmEbitda);
  const addRecommendation = (recommendation: {
    id: string;
    module: SdeRecommendationModule;
    priority: SdeRecommendationPriority;
    title: string;
    rationale: string;
    impactPct: { low: number; high: number };
    effort: SdeRecommendationEffort;
    confidence: number;
    horizon: SdeRecommendationHorizon;
  }) => {
    recommendations.push({
      id: recommendation.id,
      module: recommendation.module,
      priority: recommendation.priority,
      title: recommendation.title,
      rationale: recommendation.rationale,
      impactRange: {
        low: ebitdaBase * recommendation.impactPct.low,
        high: ebitdaBase * recommendation.impactPct.high,
      },
      effort: recommendation.effort,
      confidence: recommendation.confidence,
      horizon: recommendation.horizon,
    });
  };

  if (revenueFlags.some((flag) => (flag.id === 'dso-spike' || flag.id === 'dso-vs-sector') && flag.triggered)) {
    addRecommendation({
      id: 'reduce-dso',
      module: 'Revenue Quality',
      priority: 'High',
      title: 'Reduce DSO through collections cadence',
      rationale: `Current DSO is ${currentDso.toFixed(1)} days vs ${sectorBenchmarks.sectorLabel} benchmark (${dsoBenchmark.min}-${dsoBenchmark.max}); improving to ${dsoBenchmarkTarget} days could release about ${fmtDollar(dsoCashOpportunity)} cash.`,
      impactPct: { low: 0.01, high: 0.03 },
      effort: 'Medium',
      confidence: 0.82,
      horizon: '60 days'
    });
  }

  if (revenueFlags.some((flag) => flag.id === 'ar-vs-revenue' && flag.triggered)) {
    addRecommendation({
      id: 'tighten-credit-policy',
      module: 'Revenue Quality',
      priority: 'High',
      title: 'Tighten customer credit and invoicing controls',
      rationale: `AR growth spread is ${arRevenueSpread.toFixed(1)} points above revenue growth.`,
      impactPct: { low: 0.01, high: 0.025 },
      effort: 'Medium',
      confidence: 0.79,
      horizon: '60 days'
    });
  }

  if (workingCapitalFlags.some((flag) => flag.id === 'wc-intensity' && flag.triggered)) {
    addRecommendation({
      id: 'normalize-working-capital',
      module: 'Working Capital',
      priority: 'Medium',
      title: 'Normalize working capital intensity',
      rationale: `Average WC intensity is ${avgWcIntensity12.toFixed(1)}% in the last 12 months.`,
      impactPct: { low: 0.005, high: 0.02 },
      effort: 'Medium',
      confidence: 0.74,
      horizon: '90 days'
    });
  }

  if (workingCapitalFlags.some((flag) => flag.id === 'ccc-level' && flag.triggered)) {
    addRecommendation({
      id: 'optimize-ccc-drivers',
      module: 'Working Capital',
      priority: 'High',
      title: 'Improve CCC drivers (DSO, DIO, DPO)',
      rationale: `Current CCC is ${currentCcc.toFixed(1)} days.`,
      impactPct: { low: 0.01, high: 0.03 },
      effort: 'High',
      confidence: 0.76,
      horizon: '90 days'
    });
  }

  if (cashFlowFlags.some((flag) => flag.id === 'cash-conversion-weak' && flag.triggered)) {
    addRecommendation({
      id: 'raise-cash-conversion',
      module: 'Cash Flow Quality',
      priority: 'High',
      title: 'Raise EBITDA-to-cash conversion',
      rationale: `TTM cash conversion is ${cashConversionPct.toFixed(1)}%, below target.`,
      impactPct: { low: 0.015, high: 0.04 },
      effort: 'Medium',
      confidence: 0.84,
      horizon: '60 days'
    });
  }

  if (cashFlowFlags.some((flag) => flag.id === 'capex-gap' && flag.triggered)) {
    addRecommendation({
      id: 'capex-plan',
      module: 'Cash Flow Quality',
      priority: 'Medium',
      title: 'Implement maintenance CapEx plan',
      rationale: `Estimated maintenance CapEx gap is $${Math.round(capexGap).toLocaleString()}.`,
      impactPct: { low: 0.005, high: 0.015 },
      effort: 'High',
      confidence: 0.71,
      horizon: '90 days'
    });
  }

  if (recommendations.length === 0) {
    addRecommendation({
      id: 'monitoring-pack',
      module: 'Cash Flow Quality',
      priority: 'Low',
      title: 'Maintain KPI monitoring pack',
      rationale: 'No material SDE quality risk flags are currently triggered.',
      impactPct: { low: 0, high: 0.01 },
      effort: 'Low',
      confidence: 0.9,
      horizon: '30 days'
    });
  }

  const priorityRank: Record<SdeRecommendationPriority, number> = { High: 3, Medium: 2, Low: 1 };
  const sorted = recommendations.sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority]).slice(0, 6);
  const ebitdaUpliftLow = sorted.reduce((sum, rec) => sum + rec.impactRange.low, 0);
  const ebitdaUpliftHigh = sorted.reduce((sum, rec) => sum + rec.impactRange.high, 0);
  const rowsCoverageScore = Math.min(rows.length, 24) / 24;
  const revenueFieldCoverage = recent24.length ? recent24.filter((row) => row.revenue !== 0).length / recent24.length : 0;
  const dataQualityScore = Math.round((rowsCoverageScore * 70 + revenueFieldCoverage * 30) * 100);
  const confidence: 'low' | 'medium' | 'high' =
    dataQualityScore >= 80 ? 'high' : dataQualityScore >= 60 ? 'medium' : 'low';

  const revenueStatus: 'healthy' | 'moderate_risk' | 'high_risk' =
    dsoOverBenchmark > 15 || dsoTrend12 > dsoBenchmark.trendHigh || arRevenueSpread > dsoBenchmark.spreadHigh ? 'high_risk' :
    dsoOverBenchmark > 0 || dsoTrend12 > dsoBenchmark.trendWarn || arRevenueSpread > dsoBenchmark.spreadWarn || Math.abs(avgGap12) > dsoBenchmark.gapWarn ? 'moderate_risk' :
    'healthy';
  const ebitdaStatus: 'healthy' | 'moderate_risk' | 'high_risk' =
    ttmEbitda <= 0 || cashConversionPct < 45 ? 'high_risk' :
    cashConversionPct < 60 || fcfDurabilityPct < 20 ? 'moderate_risk' :
    'healthy';
  const wcStatus: 'healthy' | 'moderate_risk' | 'high_risk' =
    currentCcc > sectorBenchmarks.workingCapital.cccHigh || avgWcIntensity12 > sectorBenchmarks.workingCapital.wcIntensityHigh ? 'high_risk' :
    currentCcc > sectorBenchmarks.workingCapital.cccWarn || avgWcIntensity12 > sectorBenchmarks.workingCapital.wcIntensityWarn ? 'moderate_risk' :
    'healthy';
  const cashFlowStatus: 'healthy' | 'moderate_risk' | 'high_risk' =
    (ocfTrend < 0 && fcfTrend < 0) || capexGap > Math.max(1, Math.abs(ttmEbitda) * sectorBenchmarks.cashFlow.capexGapHighPctOfEbitda) ? 'high_risk' :
    ocfTrend < 0 || capexGap > 0 ? 'moderate_risk' :
    'healthy';

  const scorecard = [
    {
      area: 'revenue_quality' as const,
      status: revenueStatus,
      headlineMetric: 'AR vs Revenue Discipline',
      value: `DSO ${currentDso.toFixed(1)}d (benchmark ${dsoBenchmark.min}-${dsoBenchmark.max})`,
      impactLabel: 'Valuation impact',
      impactValue:
        dsoOverBenchmark > 0 || arRevenueSpread > dsoBenchmark.spreadWarn
          ? 'Higher diligence quality-of-revenue risk'
          : 'Revenue quality posture stable',
    },
    {
      area: 'ebitda_quality' as const,
      status: ebitdaStatus,
      headlineMetric: 'EBITDA Cash Conversion',
      value: fmtPct(cashConversionPct),
      impactLabel: 'Valuation impact',
      impactValue: cashConversionPct < 60 ? 'Earnings quality discount risk' : 'Supports earnings quality credibility',
    },
    {
      area: 'working_capital_efficiency' as const,
      status: wcStatus,
      headlineMetric: 'Cash Conversion Cycle',
      value: `${currentCcc.toFixed(1)} days`,
      impactLabel: 'Valuation impact',
      impactValue: currentCcc > 90 ? 'Higher working-capital requirement at close' : 'Working-capital risk manageable',
    },
    {
      area: 'cash_flow_quality' as const,
      status: cashFlowStatus,
      headlineMetric: 'Operating Cash Flow Trend',
      value: `${ocfTrend >= 0 ? '+' : '-'}${fmtDollar(Math.abs(ocfTrend))}`,
      impactLabel: 'Valuation impact',
      impactValue: ocfTrend < 0 ? 'Cash flow trajectory pressure' : 'Cash flow trend supports valuation narrative',
    },
  ];

  const coreInsights = sorted.slice(0, 4).map((rec) => ({
    id: rec.id,
    text: `${rec.title}: ${rec.rationale}`,
    severity: rec.priority === 'High' ? 'critical' as const : rec.priority === 'Medium' ? 'warning' as const : 'info' as const,
    evidenceRefs: [rec.module],
  }));

  const growthQualityPremiumActive = revenueGrowth > 15 && (arRevenueSpread <= 15 || dsoTrend12 <= 10);
  const growthQualityPremiumDeltaLow = growthQualityPremiumActive ? 0.1 : 0;
  const growthQualityPremiumDeltaHigh = growthQualityPremiumActive ? 0.35 : 0;
  const advanceRevenueCccAdvantageActive = currentCcc < 15;
  const advanceRevenueCccDeltaLow = advanceRevenueCccAdvantageActive ? 0.1 : 0;
  const advanceRevenueCccDeltaHigh = advanceRevenueCccAdvantageActive ? 0.3 : 0;

  const executiveFinancialSummary: SdeExecutiveFinancialSummary = {
    headline:
      rating === 'Strong'
        ? 'Financial profile is currently transaction-ready with manageable diligence risk.'
        : rating === 'Moderate'
          ? 'Financial profile is improving but key diligence risks should be addressed pre-transaction.'
          : 'Financial profile has material diligence risks that should be remediated before a transaction process.',
    dataQualityScore,
    confidence,
    scorecard,
    coreInsights,
    valueOpportunity: {
      ebitdaUpliftLow,
      ebitdaUpliftHigh,
      narrative:
        ebitdaUpliftHigh > 0
          ? `Executing the priority action plan can improve EBITDA by approximately ${fmtDollar(ebitdaUpliftLow)} to ${fmtDollar(ebitdaUpliftHigh)} over time.`
          : 'Action focus should be on stabilization first; EBITDA uplift range will populate once a positive EBITDA baseline is established.',
      growthQualityPremium: {
        active: growthQualityPremiumActive,
        suggestedMultipleDeltaLow: growthQualityPremiumDeltaLow,
        suggestedMultipleDeltaHigh: growthQualityPremiumDeltaHigh,
        rationale: growthQualityPremiumActive
          ? `Sales growth is strong (${fmtPct(revenueGrowth)}) with acceptable receivables discipline, which can support a valuation multiple premium if sustained.`
          : 'Growth quality premium is not currently supported due to receivables/revenue quality pressure or lower growth trajectory.',
      },
      advanceRevenueCccAdvantage: {
        active: advanceRevenueCccAdvantageActive,
        suggestedMultipleDeltaLow: advanceRevenueCccDeltaLow,
        suggestedMultipleDeltaHigh: advanceRevenueCccDeltaHigh,
        rationale: advanceRevenueCccAdvantageActive
          ? `CCC is strong at ${currentCcc.toFixed(1)} days, indicating advance-cash or efficient working-capital dynamics that can improve valuation confidence.`
          : 'CCC currently does not indicate a structural advance-revenue/working-capital advantage.',
      },
    },
    keyStrengths: executiveStrengths.length > 0 ? executiveStrengths : ['No major strengths detected from current monthly financial signals.'],
    keyRisks: executiveRisks.length > 0 ? executiveRisks : ['No material risks detected from current monthly financial signals.'],
    trendCommentary,
    alerts,
  };

  const latestMonthDateRaw = rows.length ? rows[rows.length - 1].monthDate : null;
  let dataAsOf: string | null = null;
  if (latestMonthDateRaw) {
    const parsed = new Date(latestMonthDateRaw);
    if (!isNaN(parsed.getTime())) {
      dataAsOf = parsed.toISOString();
    }
  }

  return {
    executiveSummary: {
      readinessScore,
      rating,
      highCount,
      mediumCount,
      lowCount,
    },
    executiveFinancialSummary,
    recommendations: sorted,
    dataAsOf,
  };
}

