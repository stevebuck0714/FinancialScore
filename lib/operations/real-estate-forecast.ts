export type ForecastQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export type AttachRateAssumptions = Record<
  ForecastQuarter,
  {
    mortgagePct: number;
    titlePct: number;
    insurancePct: number;
    mortgageGrowthPct: number;
    titleGrowthPct: number;
    insuranceGrowthPct: number;
  }
>;

export type ResidentialRevenueForecastAssumptions = {
  averageSalesPrice: number;
  gciPct: number;
  revenuePerMortgage: number;
  revenuePerTitle: number;
  revenuePerInsurance: number;
  attachRates: AttachRateAssumptions;
};

export type ResidentialRevenueForecastRow = {
  monthKey: string;
  monthLabel: string;
  quarterKey: string;
  periodType: 'Actual' | 'Forecast';
  existingHomeSales: number;
  newHomeSales: number;
  totalHomeSales: number;
  lowHomeSales: number | null;
  highHomeSales: number | null;
  salesVolume: number;
  residentialGci: number;
  mortgageAttachRate: number;
  mortgageAttachments: number;
  mortgageRevenue: number;
  titleAttachRate: number;
  titleAttachments: number;
  titleRevenue: number;
  insuranceAttachRate: number;
  insuranceAttachments: number;
  insuranceRevenue: number;
  totalRevenue: number;
  lowRevenue: number;
  highRevenue: number;
};

export type ResidentialRevenueForecastQuarterRow = {
  quarterKey: string;
  periodType: 'Actual' | 'Forecast';
  totalHomeSales: number;
  residentialGci: number;
  mortgageRevenue: number;
  titleRevenue: number;
  insuranceRevenue: number;
  totalRevenue: number;
  lowRevenue: number;
  highRevenue: number;
};

export type ResidentialRevenueForecastMacroInput = {
  impliedMortgage30Year?: number | null;
  latestMortgage30Year?: number | null;
  expectedInflation1Year?: number | null;
  breakevenInflation10Year?: number | null;
  consumerSentiment?: number | null;
  financialConditionsIndex?: number | null;
};

export type ResidentialRevenueForecastOptions = {
  macroProjectionInputs?: ResidentialRevenueForecastMacroInput[];
};

export const DEFAULT_RESIDENTIAL_REVENUE_FORECAST_ASSUMPTIONS: ResidentialRevenueForecastAssumptions = {
  averageSalesPrice: 441000,
  gciPct: 2.62,
  revenuePerMortgage: 3900,
  revenuePerTitle: 1850,
  revenuePerInsurance: 925,
  attachRates: {
    Q1: { mortgagePct: 49, titlePct: 58, insurancePct: 35, mortgageGrowthPct: 0.5, titleGrowthPct: 0.4, insuranceGrowthPct: 0.6 },
    Q2: { mortgagePct: 50, titlePct: 59, insurancePct: 36, mortgageGrowthPct: 0.5, titleGrowthPct: 0.4, insuranceGrowthPct: 0.6 },
    Q3: { mortgagePct: 51, titlePct: 60, insurancePct: 37, mortgageGrowthPct: 0.5, titleGrowthPct: 0.4, insuranceGrowthPct: 0.6 },
    Q4: { mortgagePct: 52, titlePct: 61, insurancePct: 38, mortgageGrowthPct: 0.5, titleGrowthPct: 0.4, insuranceGrowthPct: 0.6 },
  },
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function round(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function pctToDecimal(value: number) {
  return Number(value || 0) / 100;
}

function quarterForForecastOffset(offset: number): ForecastQuarter {
  if (offset <= 2) return 'Q1';
  if (offset <= 5) return 'Q2';
  if (offset <= 8) return 'Q3';
  return 'Q4';
}

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function quarterKey(date: Date) {
  return `${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function monthLabel(date: Date) {
  return `${MONTH_LABELS[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`;
}

function applyAttachmentGrowth(basePct: number, growthPct: number, forecastOffset: number) {
  const quarterIndex = Math.floor(forecastOffset / 3);
  return Math.max(0, basePct + quarterIndex * growthPct);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function macroDemandAdjustment(input?: ResidentialRevenueForecastMacroInput) {
  if (!input) return 1;

  let adjustment = 1;
  const currentMortgageRate = input.latestMortgage30Year ?? input.impliedMortgage30Year;
  if (input.impliedMortgage30Year != null && currentMortgageRate != null) {
    adjustment -= (input.impliedMortgage30Year - currentMortgageRate) * 0.055;
  }
  if (input.expectedInflation1Year != null && input.breakevenInflation10Year != null) {
    adjustment -= Math.max(0, input.expectedInflation1Year - input.breakevenInflation10Year) * 0.012;
  }
  if (input.consumerSentiment != null) {
    adjustment += (input.consumerSentiment - 70) * 0.0015;
  }
  if (input.financialConditionsIndex != null) {
    adjustment -= input.financialConditionsIndex * 0.025;
  }

  return clamp(adjustment, 0.84, 1.12);
}

export function buildResidentialRevenueForecast(
  assumptions: ResidentialRevenueForecastAssumptions,
  asOf: Date = new Date(Date.UTC(2026, 5, 1)),
  options: ResidentialRevenueForecastOptions = {}
) {
  const historyStart = addMonths(asOf, -23);
  const rows: ResidentialRevenueForecastRow[] = [];

  for (let index = 0; index < 36; index += 1) {
    const date = addMonths(historyStart, index);
    const isForecast = index >= 24;
    const forecastOffset = index - 24;
    const month = date.getUTCMonth();
    const seasonal = 1 + Math.sin((month / 12) * Math.PI * 2 - 0.7) * 0.14;
    const trend = 1 + index * 0.004;
    const macroAdjustment = isForecast ? macroDemandAdjustment(options.macroProjectionInputs?.[forecastOffset]) : 1;
    const affordabilityPressure = isForecast ? (1 - Math.min(forecastOffset, 11) * 0.0025) * macroAdjustment : 1;
    const baseExisting = 820 + index * 6;
    const baseNew = 118 + index * 1.4;
    const existingHomeSales = round(baseExisting * seasonal * trend * affordabilityPressure);
    const newHomeSales = round(baseNew * (seasonal * 0.55 + 0.45) * trend * affordabilityPressure);
    const totalHomeSales = existingHomeSales + newHomeSales;
    const confidenceSpread = isForecast ? 0.07 + forecastOffset * 0.008 : 0.03;

    const quarter = isForecast ? quarterForForecastOffset(forecastOffset) : quarterForForecastOffset(Math.min(index % 12, 11));
    const attach = assumptions.attachRates[quarter];
    const mortgageAttachRate = isForecast ? applyAttachmentGrowth(attach.mortgagePct, attach.mortgageGrowthPct, forecastOffset) : 47 + (index % 8) * 0.45;
    const titleAttachRate = isForecast ? applyAttachmentGrowth(attach.titlePct, attach.titleGrowthPct, forecastOffset) : 55 + (index % 7) * 0.5;
    const insuranceAttachRate = isForecast ? applyAttachmentGrowth(attach.insurancePct, attach.insuranceGrowthPct, forecastOffset) : 32 + (index % 6) * 0.55;
    const averageSalesPrice = assumptions.averageSalesPrice * (1 + index * 0.0018);
    const salesVolume = round(totalHomeSales * averageSalesPrice);
    const residentialGci = round(salesVolume * pctToDecimal(assumptions.gciPct));
    const mortgageAttachments = round(totalHomeSales * pctToDecimal(mortgageAttachRate));
    const titleAttachments = round(totalHomeSales * pctToDecimal(titleAttachRate));
    const insuranceAttachments = round(totalHomeSales * pctToDecimal(insuranceAttachRate));
    const mortgageRevenue = round(mortgageAttachments * assumptions.revenuePerMortgage);
    const titleRevenue = round(titleAttachments * assumptions.revenuePerTitle);
    const insuranceRevenue = round(insuranceAttachments * assumptions.revenuePerInsurance);
    const totalRevenue = residentialGci + mortgageRevenue + titleRevenue + insuranceRevenue;

    rows.push({
      monthKey: monthKey(date),
      monthLabel: monthLabel(date),
      quarterKey: quarterKey(date),
      periodType: isForecast ? 'Forecast' : 'Actual',
      existingHomeSales,
      newHomeSales,
      totalHomeSales,
      lowHomeSales: isForecast ? round(totalHomeSales * (1 - confidenceSpread)) : null,
      highHomeSales: isForecast ? round(totalHomeSales * (1 + confidenceSpread)) : null,
      salesVolume,
      residentialGci,
      mortgageAttachRate: Math.round(mortgageAttachRate * 10) / 10,
      mortgageAttachments,
      mortgageRevenue,
      titleAttachRate: Math.round(titleAttachRate * 10) / 10,
      titleAttachments,
      titleRevenue,
      insuranceAttachRate: Math.round(insuranceAttachRate * 10) / 10,
      insuranceAttachments,
      insuranceRevenue,
      totalRevenue,
      lowRevenue: round(totalRevenue * (1 - confidenceSpread)),
      highRevenue: round(totalRevenue * (1 + confidenceSpread)),
    });
  }

  return rows;
}

export function buildResidentialRevenueForecastQuarters(rows: ResidentialRevenueForecastRow[]): ResidentialRevenueForecastQuarterRow[] {
  const buckets = new Map<string, ResidentialRevenueForecastQuarterRow>();

  for (const row of rows) {
    const existing = buckets.get(row.quarterKey) || {
      quarterKey: row.quarterKey,
      periodType: row.periodType,
      totalHomeSales: 0,
      residentialGci: 0,
      mortgageRevenue: 0,
      titleRevenue: 0,
      insuranceRevenue: 0,
      totalRevenue: 0,
      lowRevenue: 0,
      highRevenue: 0,
    };
    existing.periodType = existing.periodType === 'Forecast' || row.periodType === 'Forecast' ? 'Forecast' : 'Actual';
    existing.totalHomeSales += row.totalHomeSales;
    existing.residentialGci += row.residentialGci;
    existing.mortgageRevenue += row.mortgageRevenue;
    existing.titleRevenue += row.titleRevenue;
    existing.insuranceRevenue += row.insuranceRevenue;
    existing.totalRevenue += row.totalRevenue;
    existing.lowRevenue += row.lowRevenue;
    existing.highRevenue += row.highRevenue;
    buckets.set(row.quarterKey, existing);
  }

  return Array.from(buckets.values());
}
