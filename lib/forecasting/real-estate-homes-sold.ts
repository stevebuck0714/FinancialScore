export interface HomesSoldForecastInput {
  homesSoldValues: number[];
  mortgageRateValues: number[];
  periods?: number;
  monthlyRateChangePct?: number;
}

export interface HomesSoldForecastPoint {
  periodIndex: number;
  projectedHomesSold: number;
  projectedMortgageRate: number;
}

export interface HomesSoldForecastResult {
  model: 'sarimax-style-ridge';
  forecast: HomesSoldForecastPoint[];
}

const SEASONAL_PERIOD = 12;
const RIDGE_PENALTY = 0.75;

function sanitizeNumericSeries(values: unknown[], maxLength = 120): number[] {
  return values
    .slice(-maxLength)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivot = 0; pivot < n; pivot++) {
    let bestRow = pivot;
    for (let row = pivot + 1; row < n; row++) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[bestRow][pivot])) {
        bestRow = row;
      }
    }

    [augmented[pivot], augmented[bestRow]] = [augmented[bestRow], augmented[pivot]];
    const pivotValue = augmented[pivot][pivot];
    if (Math.abs(pivotValue) < 0.000001) return null;

    for (let column = pivot; column <= n; column++) {
      augmented[pivot][column] /= pivotValue;
    }

    for (let row = 0; row < n; row++) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let column = pivot; column <= n; column++) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }

  return augmented.map((row) => row[n]);
}

export function forecastRealEstateHomesSold(input: HomesSoldForecastInput): HomesSoldForecastResult {
  const homesSoldValues = sanitizeNumericSeries(input.homesSoldValues);
  const mortgageRateValues = sanitizeNumericSeries(input.mortgageRateValues);
  const periods = Math.min(Math.max(Math.round(Number(input.periods || 12)), 1), 24);
  const monthlyRateChangePct = Number.isFinite(Number(input.monthlyRateChangePct))
    ? Number(input.monthlyRateChangePct)
    : 0;
  const latestHomesSold = homesSoldValues[homesSoldValues.length - 1] || 0;
  const latestRate = mortgageRateValues[mortgageRateValues.length - 1] || 0;

  if (homesSoldValues.length <= SEASONAL_PERIOD + 6 || mortgageRateValues.length < homesSoldValues.length) {
    return {
      model: 'sarimax-style-ridge',
      forecast: Array.from({ length: periods }, (_, periodIndex) => ({
        periodIndex,
        projectedHomesSold: Math.max(0, Math.round(latestHomesSold)),
        projectedMortgageRate: Math.round(Math.max(0, latestRate + monthlyRateChangePct * (periodIndex + 1)) * 100) / 100,
      })),
    };
  }

  const featureRows: number[][] = [];
  const targets: number[] = [];
  const featureForIndex = (index: number, candidateHomesSold: number[], candidateRates: number[]) => {
    const rate = candidateRates[index] ?? candidateRates[candidateRates.length - 1] ?? 0;
    const priorRate = candidateRates[index - 1] ?? rate;
    const monthOfYear = index % SEASONAL_PERIOD;

    return [
      1,
      index,
      candidateHomesSold[index - 1] || 0,
      candidateHomesSold[index - SEASONAL_PERIOD] || 0,
      rate,
      rate - priorRate,
      priorRate,
      Math.sin((2 * Math.PI * monthOfYear) / SEASONAL_PERIOD),
      Math.cos((2 * Math.PI * monthOfYear) / SEASONAL_PERIOD),
    ];
  };

  for (let index = SEASONAL_PERIOD; index < homesSoldValues.length; index++) {
    featureRows.push(featureForIndex(index, homesSoldValues, mortgageRateValues));
    targets.push(homesSoldValues[index]);
  }

  const featureCount = featureRows[0]?.length || 0;
  const means = Array.from({ length: featureCount }, (_, column) => {
    if (column === 0) return 0;
    return featureRows.reduce((sum, row) => sum + row[column], 0) / Math.max(featureRows.length, 1);
  });
  const scales = Array.from({ length: featureCount }, (_, column) => {
    if (column === 0) return 1;
    const variance = featureRows.reduce((sum, row) => sum + (row[column] - means[column]) ** 2, 0) / Math.max(featureRows.length, 1);
    return Math.sqrt(variance) || 1;
  });
  const normalize = (row: number[]) => row.map((value, column) => (column === 0 ? 1 : (value - means[column]) / scales[column]));
  const normalizedRows = featureRows.map(normalize);
  const xtx = Array.from({ length: featureCount }, (_, row) =>
    Array.from({ length: featureCount }, (_, column) =>
      normalizedRows.reduce((sum, featureRow) => sum + featureRow[row] * featureRow[column], 0) + (row === column && row !== 0 ? RIDGE_PENALTY : 0)
    )
  );
  const xty = Array.from({ length: featureCount }, (_, row) =>
    normalizedRows.reduce((sum, featureRow, index) => sum + featureRow[row] * targets[index], 0)
  );
  const coefficients = solveLinearSystem(xtx, xty);

  if (!coefficients) {
    return {
      model: 'sarimax-style-ridge',
      forecast: Array.from({ length: periods }, (_, periodIndex) => ({
        periodIndex,
        projectedHomesSold: Math.max(0, Math.round(latestHomesSold)),
        projectedMortgageRate: Math.round(Math.max(0, latestRate + monthlyRateChangePct * (periodIndex + 1)) * 100) / 100,
      })),
    };
  }

  const forecastHomesSold = [...homesSoldValues];
  const forecastRates = [...mortgageRateValues];

  return {
    model: 'sarimax-style-ridge',
    forecast: Array.from({ length: periods }, (_, periodIndex) => {
      const forecastIndex = homesSoldValues.length + periodIndex;
      const projectedMortgageRate = Math.max(0, latestRate + monthlyRateChangePct * (periodIndex + 1));
      forecastRates[forecastIndex] = projectedMortgageRate;

      const normalizedFeatureRow = normalize(featureForIndex(forecastIndex, forecastHomesSold, forecastRates));
      const forecast = normalizedFeatureRow.reduce((sum, value, index) => sum + value * coefficients[index], 0);
      const projectedHomesSold = Math.max(0, Math.round(forecast));
      forecastHomesSold[forecastIndex] = projectedHomesSold;

      return {
        periodIndex,
        projectedHomesSold,
        projectedMortgageRate: Math.round(projectedMortgageRate * 100) / 100,
      };
    }),
  };
}
