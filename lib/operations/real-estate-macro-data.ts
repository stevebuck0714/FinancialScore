export type FredSeriesKey =
  | 'existingHomeSales'
  | 'newHomeSales'
  | 'mortgage30Year'
  | 'treasury10Year'
  | 'treasury2Year'
  | 'unemploymentRate'
  | 'nonfarmPayrolls'
  | 'initialJoblessClaims'
  | 'personalIncome'
  | 'disposablePersonalIncome'
  | 'averageHourlyEarnings'
  | 'cpi'
  | 'coreCpi'
  | 'pceInflation'
  | 'housingStarts'
  | 'buildingPermits'
  | 'newHomesForSale'
  | 'monthsSupply'
  | 'caseShillerNational'
  | 'fhfaHousePriceIndex'
  | 'consumerSentiment'
  | 'fedFundsRate'
  | 'financialConditionsIndex'
  | 'expectedInflation1Year'
  | 'breakevenInflation10Year'
  | 'forwardInflation5y5y';

export type FredSeriesDefinition = {
  key: FredSeriesKey;
  seriesId: string;
  label: string;
  category: 'target' | 'financing' | 'labor' | 'income' | 'inflation' | 'supply' | 'prices' | 'confidence' | 'policy' | 'expectations';
  modelUsage?: 'target' | 'historical-driver' | 'forecast-driver' | 'both-driver';
  typicalLagMonths: [number, number];
  frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
};

export type FredObservation = {
  date: string;
  value: number | null;
};

export type FredSeriesResult = FredSeriesDefinition & {
  observations: FredObservation[];
};

export type RealEstateMacroProjectionInput = {
  monthOffset: number;
  expectedInflation1Year: number | null;
  breakevenInflation10Year: number | null;
  forwardInflation5y5y: number | null;
  treasury10Year: number | null;
  treasury2Year: number | null;
  yieldCurve: number | null;
  latestMortgage30Year: number | null;
  mortgageSpread: number | null;
  impliedMortgage30Year: number | null;
  fedFundsRate: number | null;
  consumerSentiment: number | null;
  financialConditionsIndex: number | null;
};

export const REAL_ESTATE_FRED_SERIES: FredSeriesDefinition[] = [
  { key: 'existingHomeSales', seriesId: 'EXHOSLUSM495S', label: 'Existing Home Sales', category: 'target', modelUsage: 'target', typicalLagMonths: [1, 1], frequency: 'monthly' },
  { key: 'newHomeSales', seriesId: 'HSN1F', label: 'New One Family Houses Sold', category: 'target', modelUsage: 'target', typicalLagMonths: [1, 1], frequency: 'monthly' },
  { key: 'mortgage30Year', seriesId: 'MORTGAGE30US', label: '30-Year Mortgage Rate', category: 'financing', modelUsage: 'both-driver', typicalLagMonths: [1, 4], frequency: 'weekly' },
  { key: 'treasury10Year', seriesId: 'DGS10', label: '10-Year Treasury', category: 'financing', modelUsage: 'both-driver', typicalLagMonths: [1, 3], frequency: 'daily' },
  { key: 'treasury2Year', seriesId: 'DGS2', label: '2-Year Treasury', category: 'financing', modelUsage: 'both-driver', typicalLagMonths: [1, 3], frequency: 'daily' },
  { key: 'unemploymentRate', seriesId: 'UNRATE', label: 'Unemployment Rate', category: 'labor', modelUsage: 'historical-driver', typicalLagMonths: [1, 3], frequency: 'monthly' },
  { key: 'nonfarmPayrolls', seriesId: 'PAYEMS', label: 'Nonfarm Payrolls', category: 'labor', modelUsage: 'historical-driver', typicalLagMonths: [1, 3], frequency: 'monthly' },
  { key: 'initialJoblessClaims', seriesId: 'ICSA', label: 'Initial Jobless Claims', category: 'labor', modelUsage: 'historical-driver', typicalLagMonths: [1, 2], frequency: 'weekly' },
  { key: 'personalIncome', seriesId: 'PI', label: 'Personal Income', category: 'income', modelUsage: 'historical-driver', typicalLagMonths: [1, 3], frequency: 'monthly' },
  { key: 'disposablePersonalIncome', seriesId: 'DSPIC96', label: 'Real Disposable Personal Income', category: 'income', modelUsage: 'historical-driver', typicalLagMonths: [1, 3], frequency: 'monthly' },
  { key: 'averageHourlyEarnings', seriesId: 'CES0500000003', label: 'Average Hourly Earnings', category: 'income', modelUsage: 'historical-driver', typicalLagMonths: [1, 3], frequency: 'monthly' },
  { key: 'cpi', seriesId: 'CPIAUCSL', label: 'CPI', category: 'inflation', modelUsage: 'historical-driver', typicalLagMonths: [1, 3], frequency: 'monthly' },
  { key: 'coreCpi', seriesId: 'CPILFESL', label: 'Core CPI', category: 'inflation', modelUsage: 'historical-driver', typicalLagMonths: [1, 3], frequency: 'monthly' },
  { key: 'pceInflation', seriesId: 'PCEPI', label: 'PCE Price Index', category: 'inflation', modelUsage: 'historical-driver', typicalLagMonths: [1, 3], frequency: 'monthly' },
  { key: 'housingStarts', seriesId: 'HOUST', label: 'Housing Starts', category: 'supply', modelUsage: 'historical-driver', typicalLagMonths: [3, 6], frequency: 'monthly' },
  { key: 'buildingPermits', seriesId: 'PERMIT', label: 'Building Permits', category: 'supply', modelUsage: 'historical-driver', typicalLagMonths: [3, 6], frequency: 'monthly' },
  { key: 'newHomesForSale', seriesId: 'NHSUSSPTQ', label: 'New Homes for Sale', category: 'supply', modelUsage: 'historical-driver', typicalLagMonths: [2, 6], frequency: 'quarterly' },
  { key: 'monthsSupply', seriesId: 'MSACSR', label: 'Months Supply of New Houses', category: 'supply', modelUsage: 'historical-driver', typicalLagMonths: [1, 4], frequency: 'monthly' },
  { key: 'caseShillerNational', seriesId: 'CSUSHPISA', label: 'Case-Shiller National Home Price Index', category: 'prices', modelUsage: 'historical-driver', typicalLagMonths: [2, 6], frequency: 'monthly' },
  { key: 'fhfaHousePriceIndex', seriesId: 'USSTHPI', label: 'FHFA House Price Index', category: 'prices', modelUsage: 'historical-driver', typicalLagMonths: [2, 6], frequency: 'quarterly' },
  { key: 'consumerSentiment', seriesId: 'UMCSENT', label: 'Michigan Consumer Sentiment', category: 'confidence', modelUsage: 'both-driver', typicalLagMonths: [1, 2], frequency: 'monthly' },
  { key: 'fedFundsRate', seriesId: 'FEDFUNDS', label: 'Federal Funds Rate', category: 'policy', modelUsage: 'both-driver', typicalLagMonths: [1, 3], frequency: 'monthly' },
  { key: 'financialConditionsIndex', seriesId: 'NFCI', label: 'National Financial Conditions Index', category: 'policy', modelUsage: 'both-driver', typicalLagMonths: [1, 3], frequency: 'weekly' },
  { key: 'expectedInflation1Year', seriesId: 'EXPINF1YR', label: '1-Year Expected Inflation', category: 'expectations', modelUsage: 'forecast-driver', typicalLagMonths: [0, 12], frequency: 'monthly' },
  { key: 'breakevenInflation10Year', seriesId: 'T10YIE', label: '10-Year Breakeven Inflation Rate', category: 'expectations', modelUsage: 'forecast-driver', typicalLagMonths: [0, 12], frequency: 'daily' },
  { key: 'forwardInflation5y5y', seriesId: 'T5YIFR', label: '5-Year, 5-Year Forward Inflation Expectation Rate', category: 'expectations', modelUsage: 'forecast-driver', typicalLagMonths: [0, 12], frequency: 'daily' },
];

const FRED_OBSERVATIONS_URL = 'https://api.stlouisfed.org/fred/series/observations';

function getFredApiKey() {
  return process.env.FRED_API_KEY || process.env.NEXT_PUBLIC_FRED_API_KEY || '';
}

function parseFredValue(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '.') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestValue(series: FredSeriesResult | undefined): number | null {
  if (!series) return null;
  for (let index = series.observations.length - 1; index >= 0; index -= 1) {
    const value = series.observations[index]?.value;
    if (value != null && Number.isFinite(value)) return value;
  }
  return null;
}

function valueByKey(series: FredSeriesResult[], key: FredSeriesKey): number | null {
  return latestValue(series.find((row) => row.key === key));
}

function subtract(left: number | null, right: number | null): number | null {
  if (left == null || right == null) return null;
  return Math.round((left - right) * 1000) / 1000;
}

export function getRealEstateFredSeriesDefinitions() {
  return REAL_ESTATE_FRED_SERIES;
}

export function getRealEstateFredHistoricalSeriesDefinitions() {
  return REAL_ESTATE_FRED_SERIES.filter((series) => series.modelUsage !== 'forecast-driver');
}

export function getRealEstateFredForecastSeriesDefinitions() {
  return REAL_ESTATE_FRED_SERIES.filter((series) => series.modelUsage === 'forecast-driver' || series.modelUsage === 'both-driver');
}

export async function fetchFredSeriesObservations(
  definition: FredSeriesDefinition,
  options: {
    observationStart?: string;
    observationEnd?: string;
    frequency?: 'm' | 'q' | 'a';
    aggregationMethod?: 'avg' | 'sum' | 'eop';
  } = {}
): Promise<FredSeriesResult> {
  const apiKey = getFredApiKey();
  if (!apiKey) {
    throw new Error('FRED_API_KEY is required to fetch real estate macro data.');
  }

  const params = new URLSearchParams({
    series_id: definition.seriesId,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'asc',
    ...(options.observationStart ? { observation_start: options.observationStart } : {}),
    ...(options.observationEnd ? { observation_end: options.observationEnd } : {}),
    ...(options.frequency ? { frequency: options.frequency } : {}),
    ...(options.aggregationMethod ? { aggregation_method: options.aggregationMethod } : {}),
  });

  const response = await fetch(`${FRED_OBSERVATIONS_URL}?${params.toString()}`, {
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch FRED series ${definition.seriesId}: ${response.status}`);
  }

  const data = await response.json();
  const observations = Array.isArray(data?.observations)
    ? data.observations.map((row: any) => ({
      date: String(row?.date || ''),
      value: parseFredValue(row?.value),
    })).filter((row: FredObservation) => row.date)
    : [];

  return {
    ...definition,
    observations,
  };
}

export async function fetchRealEstateMacroData(options: {
  observationStart?: string;
  observationEnd?: string;
  seriesKeys?: FredSeriesKey[];
} = {}) {
  const selectedKeys = new Set(options.seriesKeys || REAL_ESTATE_FRED_SERIES.map((series) => series.key));
  const selectedSeries = REAL_ESTATE_FRED_SERIES.filter((series) => selectedKeys.has(series.key));

  return Promise.all(
    selectedSeries.map((series) =>
      fetchFredSeriesObservations(series, {
        observationStart: options.observationStart,
        observationEnd: options.observationEnd,
        frequency: 'm',
        aggregationMethod: series.frequency === 'daily' || series.frequency === 'weekly' ? 'avg' : undefined,
      })
    )
  );
}

export function buildRealEstateMacroProjectionInputs(
  series: FredSeriesResult[],
  periods = 12
): RealEstateMacroProjectionInput[] {
  const mortgage30Year = valueByKey(series, 'mortgage30Year');
  const treasury10Year = valueByKey(series, 'treasury10Year');
  const treasury2Year = valueByKey(series, 'treasury2Year');
  const expectedInflation1Year = valueByKey(series, 'expectedInflation1Year');
  const breakevenInflation10Year = valueByKey(series, 'breakevenInflation10Year');
  const forwardInflation5y5y = valueByKey(series, 'forwardInflation5y5y');
  const fedFundsRate = valueByKey(series, 'fedFundsRate');
  const consumerSentiment = valueByKey(series, 'consumerSentiment');
  const financialConditionsIndex = valueByKey(series, 'financialConditionsIndex');
  const mortgageSpread = subtract(mortgage30Year, treasury10Year);
  const yieldCurve = subtract(treasury10Year, treasury2Year);

  return Array.from({ length: periods }, (_, index) => {
    // Near-term inflation expectations taper toward 10-year breakevens over the forecast horizon.
    const expectationBlend = periods <= 1 ? 0 : index / Math.max(periods - 1, 1);
    const inflationPath =
      expectedInflation1Year != null && breakevenInflation10Year != null
        ? expectedInflation1Year * (1 - expectationBlend) + breakevenInflation10Year * expectationBlend
        : expectedInflation1Year ?? breakevenInflation10Year;
    const impliedTreasury10Year =
      treasury10Year != null && inflationPath != null && expectedInflation1Year != null
        ? treasury10Year + (inflationPath - expectedInflation1Year) * 0.35
        : treasury10Year;

    return {
      monthOffset: index + 1,
      expectedInflation1Year: inflationPath == null ? null : Math.round(inflationPath * 1000) / 1000,
      breakevenInflation10Year,
      forwardInflation5y5y,
      treasury10Year: impliedTreasury10Year == null ? null : Math.round(impliedTreasury10Year * 1000) / 1000,
      treasury2Year,
      yieldCurve,
      latestMortgage30Year: mortgage30Year,
      mortgageSpread,
      impliedMortgage30Year:
        impliedTreasury10Year != null && mortgageSpread != null
          ? Math.round((impliedTreasury10Year + mortgageSpread) * 1000) / 1000
          : mortgage30Year,
      fedFundsRate,
      consumerSentiment,
      financialConditionsIndex,
    };
  });
}

export async function fetchRealEstateMacroForecastInputs(options: {
  observationStart?: string;
  observationEnd?: string;
  periods?: number;
} = {}) {
  const series = await fetchRealEstateMacroData({
    observationStart: options.observationStart,
    observationEnd: options.observationEnd,
    seriesKeys: getRealEstateFredForecastSeriesDefinitions().map((definition) => definition.key),
  });

  return {
    series,
    projectionInputs: buildRealEstateMacroProjectionInputs(series, options.periods || 12),
  };
}
