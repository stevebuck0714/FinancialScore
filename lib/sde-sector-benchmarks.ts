export type SdeSectorBenchmarks = {
  sectorLabel: string;
  benchmarkTargets: {
    dso: number;
    ccc: number;
    inventoryDays: number;
  };
  customerQuality: {
    top1Warn: number;
    top1High: number;
    top5Warn: number;
    top5High: number;
    hhiWarn: number;
    hhiHigh: number;
  };
  dso: {
    min: number;
    max: number;
    trendWarn: number;
    trendHigh: number;
    spreadWarn: number;
    spreadHigh: number;
    gapWarn: number;
    gapHigh: number;
    volatilityWarn: number;
    volatilityHigh: number;
  };
  workingCapital: {
    cccWarn: number;
    cccHigh: number;
    cccTrendWarn: number;
    cccTrendHigh: number;
    wcIntensityWarn: number;
    wcIntensityHigh: number;
  };
  cashFlow: {
    cashConversionWarn: number;
    cashConversionHighRisk: number;
    fcfDurabilityWarn: number;
    fcfDurabilityHighRisk: number;
    capexGapHighPctOfEbitda: number;
    conversionTrendWarn: number;
    conversionTrendHigh: number;
  };
};

const DEFAULT_BENCHMARKS: SdeSectorBenchmarks = {
  sectorLabel: 'General',
  benchmarkTargets: {
    dso: 45,
    ccc: 70,
    inventoryDays: 55,
  },
  customerQuality: {
    top1Warn: 20,
    top1High: 35,
    top5Warn: 55,
    top5High: 70,
    hhiWarn: 1800,
    hhiHigh: 2500,
  },
  dso: {
    min: 30,
    max: 60,
    trendWarn: 10,
    trendHigh: 20,
    spreadWarn: 15,
    spreadHigh: 30,
    gapWarn: 8,
    gapHigh: 15,
    volatilityWarn: 0.25,
    volatilityHigh: 0.4,
  },
  workingCapital: {
    cccWarn: 90,
    cccHigh: 120,
    cccTrendWarn: 15,
    cccTrendHigh: 30,
    wcIntensityWarn: 25,
    wcIntensityHigh: 35,
  },
  cashFlow: {
    cashConversionWarn: 60,
    cashConversionHighRisk: 45,
    fcfDurabilityWarn: 20,
    fcfDurabilityHighRisk: 0,
    capexGapHighPctOfEbitda: 0.1,
    conversionTrendWarn: 10,
    conversionTrendHigh: 20,
  },
};

const SECTOR_BENCHMARKS_BY_CODE: Record<string, Partial<SdeSectorBenchmarks>> = {
  '23': {
    sectorLabel: 'Construction',
    benchmarkTargets: { dso: 90, ccc: 95, inventoryDays: 70 },
    customerQuality: { top1Warn: 25, top1High: 40, top5Warn: 65, top5High: 80, hhiWarn: 2200, hhiHigh: 3000 },
    dso: { min: 60, max: 120, trendWarn: 15, trendHigh: 30, spreadWarn: 20, spreadHigh: 40, gapWarn: 10, gapHigh: 18, volatilityWarn: 0.3, volatilityHigh: 0.45 },
    workingCapital: { cccWarn: 140, cccHigh: 180, cccTrendWarn: 20, cccTrendHigh: 35, wcIntensityWarn: 35, wcIntensityHigh: 50 },
    cashFlow: { cashConversionWarn: 50, cashConversionHighRisk: 35, fcfDurabilityWarn: 10, fcfDurabilityHighRisk: -5, capexGapHighPctOfEbitda: 0.15, conversionTrendWarn: 12, conversionTrendHigh: 24 },
  },
  '32': {
    sectorLabel: 'Manufacturing',
    benchmarkTargets: { dso: 60, ccc: 70, inventoryDays: 60 },
    customerQuality: { top1Warn: 22, top1High: 35, top5Warn: 60, top5High: 75, hhiWarn: 2000, hhiHigh: 2800 },
    dso: { min: 45, max: 75, trendWarn: 12, trendHigh: 24, spreadWarn: 18, spreadHigh: 35, gapWarn: 9, gapHigh: 16, volatilityWarn: 0.28, volatilityHigh: 0.42 },
    workingCapital: { cccWarn: 110, cccHigh: 145, cccTrendWarn: 18, cccTrendHigh: 32, wcIntensityWarn: 30, wcIntensityHigh: 42 },
    cashFlow: { cashConversionWarn: 55, cashConversionHighRisk: 40, fcfDurabilityWarn: 15, fcfDurabilityHighRisk: -5, capexGapHighPctOfEbitda: 0.12, conversionTrendWarn: 10, conversionTrendHigh: 22 },
  },
  '42': {
    sectorLabel: 'Wholesale Trade',
    benchmarkTargets: { dso: 52, ccc: 55, inventoryDays: 60 },
    customerQuality: { top1Warn: 20, top1High: 32, top5Warn: 58, top5High: 72, hhiWarn: 1900, hhiHigh: 2600 },
    dso: { min: 40, max: 65, trendWarn: 10, trendHigh: 20, spreadWarn: 16, spreadHigh: 32, gapWarn: 8, gapHigh: 15, volatilityWarn: 0.26, volatilityHigh: 0.4 },
    workingCapital: { cccWarn: 95, cccHigh: 130, cccTrendWarn: 16, cccTrendHigh: 30, wcIntensityWarn: 28, wcIntensityHigh: 40 },
  },
  '45': {
    sectorLabel: 'Retail',
    benchmarkTargets: { dso: 2, ccc: 25, inventoryDays: 35 },
    customerQuality: { top1Warn: 12, top1High: 20, top5Warn: 35, top5High: 50, hhiWarn: 1200, hhiHigh: 1800 },
    dso: { min: 0, max: 5, trendWarn: 4, trendHigh: 8, spreadWarn: 10, spreadHigh: 22, gapWarn: 6, gapHigh: 12, volatilityWarn: 0.22, volatilityHigh: 0.35 },
    workingCapital: { cccWarn: 45, cccHigh: 70, cccTrendWarn: 10, cccTrendHigh: 20, wcIntensityWarn: 18, wcIntensityHigh: 30 },
    cashFlow: { cashConversionWarn: 70, cashConversionHighRisk: 55, fcfDurabilityWarn: 25, fcfDurabilityHighRisk: 5, capexGapHighPctOfEbitda: 0.08, conversionTrendWarn: 8, conversionTrendHigh: 16 },
  },
  '51': {
    sectorLabel: 'Software / Subscription',
    benchmarkTargets: { dso: 15, ccc: 35, inventoryDays: 20 },
    customerQuality: { top1Warn: 18, top1High: 30, top5Warn: 50, top5High: 65, hhiWarn: 1700, hhiHigh: 2400 },
    dso: { min: 0, max: 30, trendWarn: 8, trendHigh: 15, spreadWarn: 12, spreadHigh: 24, gapWarn: 7, gapHigh: 14, volatilityWarn: 0.2, volatilityHigh: 0.32 },
    workingCapital: { cccWarn: 50, cccHigh: 80, cccTrendWarn: 10, cccTrendHigh: 20, wcIntensityWarn: 20, wcIntensityHigh: 30 },
    cashFlow: { cashConversionWarn: 70, cashConversionHighRisk: 55, fcfDurabilityWarn: 25, fcfDurabilityHighRisk: 5, capexGapHighPctOfEbitda: 0.08, conversionTrendWarn: 8, conversionTrendHigh: 16 },
  },
  '54': {
    sectorLabel: 'Professional Services',
    benchmarkTargets: { dso: 55, ccc: 65, inventoryDays: 45 },
    customerQuality: { top1Warn: 25, top1High: 40, top5Warn: 65, top5High: 80, hhiWarn: 2200, hhiHigh: 3000 },
    dso: { min: 40, max: 70, trendWarn: 10, trendHigh: 20, spreadWarn: 16, spreadHigh: 32, gapWarn: 8, gapHigh: 15, volatilityWarn: 0.24, volatilityHigh: 0.38 },
    workingCapital: { cccWarn: 95, cccHigh: 130, cccTrendWarn: 16, cccTrendHigh: 30, wcIntensityWarn: 25, wcIntensityHigh: 38 },
  },
  '62': {
    sectorLabel: 'Healthcare',
    benchmarkTargets: { dso: 45, ccc: 70, inventoryDays: 40 },
    customerQuality: { top1Warn: 20, top1High: 32, top5Warn: 55, top5High: 70, hhiWarn: 1800, hhiHigh: 2500 },
    dso: { min: 30, max: 60, trendWarn: 10, trendHigh: 20, spreadWarn: 15, spreadHigh: 30, gapWarn: 8, gapHigh: 15, volatilityWarn: 0.23, volatilityHigh: 0.36 },
    workingCapital: { cccWarn: 100, cccHigh: 135, cccTrendWarn: 16, cccTrendHigh: 30, wcIntensityWarn: 28, wcIntensityHigh: 40 },
  },
  '72': {
    sectorLabel: 'Restaurants & Hospitality',
    benchmarkTargets: { dso: 1, ccc: 20, inventoryDays: 20 },
    customerQuality: { top1Warn: 10, top1High: 18, top5Warn: 32, top5High: 45, hhiWarn: 1100, hhiHigh: 1700 },
    dso: { min: 0, max: 3, trendWarn: 3, trendHigh: 6, spreadWarn: 10, spreadHigh: 20, gapWarn: 6, gapHigh: 12, volatilityWarn: 0.25, volatilityHigh: 0.38 },
    workingCapital: { cccWarn: 35, cccHigh: 55, cccTrendWarn: 8, cccTrendHigh: 16, wcIntensityWarn: 15, wcIntensityHigh: 25 },
    cashFlow: { cashConversionWarn: 72, cashConversionHighRisk: 58, fcfDurabilityWarn: 25, fcfDurabilityHighRisk: 5, capexGapHighPctOfEbitda: 0.08, conversionTrendWarn: 8, conversionTrendHigh: 16 },
  },
};

function mergeBenchmarks(base: SdeSectorBenchmarks, partial: Partial<SdeSectorBenchmarks>): SdeSectorBenchmarks {
  return {
    sectorLabel: partial.sectorLabel || base.sectorLabel,
    benchmarkTargets: { ...base.benchmarkTargets, ...(partial.benchmarkTargets || {}) },
    customerQuality: { ...base.customerQuality, ...(partial.customerQuality || {}) },
    dso: { ...base.dso, ...(partial.dso || {}) },
    workingCapital: { ...base.workingCapital, ...(partial.workingCapital || {}) },
    cashFlow: { ...base.cashFlow, ...(partial.cashFlow || {}) },
  };
}

export function getSdeSectorBenchmarks(industrySectorCategory?: string | null): SdeSectorBenchmarks {
  const code = String(industrySectorCategory || '').trim();
  const partial = SECTOR_BENCHMARKS_BY_CODE[code];
  if (!partial) return DEFAULT_BENCHMARKS;
  return mergeBenchmarks(DEFAULT_BENCHMARKS, partial);
}

