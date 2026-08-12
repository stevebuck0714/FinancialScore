/**
 * Multi-currency FX module.
 *
 * Separate from accounting adapters / UI: provider fetch, EST calendar dates,
 * rate cache, and conversion helpers live here. Company settings stay on
 * Profile / Import Financials pages.
 */

export { EST_TIME_ZONE, formatEstDate, previousEstCalendarDate, previousEstBusinessDate, utcMidnightForEstDate } from './est-dates';
export { fetchFrankfurterHistoricalRange, fetchFrankfurterRateForDate, FRANKFURTER_PROVIDER } from './frankfurter';
export { convertAmount, getRateForDate, type ConvertResult } from './convert';
export {
  backfillCurrencyPair,
  ensureCompanyReportingRates,
  syncLatestEstEodRates,
  listActiveCurrencyPairs,
} from './sync';
export { applyReportingCurrencyIfNeeded, convertMoneyTree } from './reporting';
export { getCompanyFxCoverage, type FxCoverageSummary } from './coverage';
