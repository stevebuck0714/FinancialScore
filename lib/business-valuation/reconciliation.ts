import { computeDealBreakdown, optionalNumber, optionalText, type DealBreakdown, type SnapshotBalanceSheet } from './deal-terms';
import { ENGAGEMENT_OPTIONS } from './engagement';
import type { Indications } from './indications';

export const APPROACHES = [
  { key: 'MARKET', label: 'Market approach' },
  { key: 'INCOME', label: 'Income approach' },
  { key: 'ASSET', label: 'Asset approach' },
] as const;
export type ApproachKey = (typeof APPROACHES)[number]['key'];

export const ROUNDING_INCREMENTS = [1000, 5000, 10000, 25000, 50000] as const;
export const DEFAULT_ROUNDING = 5000;

export type Reconciliation = {
  weights: Partial<Record<ApproachKey, number>>;
  reasons: Partial<Record<ApproachKey, string>>;
  roundingIncrement: number;
  conclusionNote: string | null;
  concludedAt: string | null;
  concludedByName: string | null;
  /** Rounded value when concluded; a later recompute that differs means inputs changed. */
  concludedValue: number | null;
};

export const DEFAULT_RECONCILIATION: Reconciliation = {
  weights: {},
  reasons: {},
  roundingIncrement: DEFAULT_ROUNDING,
  conclusionNote: null,
  concludedAt: null,
  concludedByName: null,
  concludedValue: null,
};

const MAX_TEXT = 3000;
const LISTING_LANGUAGE = /\b(listing|asking|list)\s+price\b/i;

export function normalizeReconciliation(raw: unknown): Reconciliation {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rawWeights = source.weights && typeof source.weights === 'object' ? (source.weights as Record<string, unknown>) : {};
  const rawReasons = source.reasons && typeof source.reasons === 'object' ? (source.reasons as Record<string, unknown>) : {};
  const weights: Reconciliation['weights'] = {};
  const reasons: Reconciliation['reasons'] = {};
  for (const approach of APPROACHES) {
    const weight = optionalNumber(rawWeights[approach.key]);
    if (weight !== null) weights[approach.key] = weight;
    const reason = optionalText(rawReasons[approach.key]);
    if (reason) reasons[approach.key] = reason;
  }
  const increment = optionalNumber(source.roundingIncrement);
  return {
    weights,
    reasons,
    roundingIncrement: increment !== null && (ROUNDING_INCREMENTS as readonly number[]).includes(increment) ? increment : DEFAULT_ROUNDING,
    conclusionNote: optionalText(source.conclusionNote),
    concludedAt: optionalText(source.concludedAt),
    concludedByName: optionalText(source.concludedByName),
    concludedValue: optionalNumber(source.concludedValue),
  };
}

export function validateReconciliation(reconciliation: Reconciliation): string | null {
  if (Object.values(reconciliation.weights).some((weight) => weight < 0 || weight > 100)) return 'Each weight must be between 0% and 100%.';
  if (Object.values(reconciliation.reasons).some((reason) => reason.length > MAX_TEXT) || (reconciliation.conclusionNote || '').length > MAX_TEXT) {
    return `Reasons and notes are limited to ${MAX_TEXT} characters.`;
  }
  return null;
}

/** Inputs whose edits withdraw a conclusion. */
export function reconciliationInputsChanged(before: Reconciliation, after: Reconciliation): boolean {
  return (
    JSON.stringify(before.weights) !== JSON.stringify(after.weights) ||
    JSON.stringify(before.reasons) !== JSON.stringify(after.reasons) ||
    before.roundingIncrement !== after.roundingIncrement ||
    before.conclusionNote !== after.conclusionNote
  );
}

export type ApproachLine = { key: ApproachKey; label: string; value: number | null; basis: string; weight: number; weighted: number | null; reason: string | null };

export type ReconciliationResult = {
  lines: ApproachLine[];
  weightTotal: number;
  weightedValue: number | null;
  concludedValue: number | null;
  conclusionStatement: string | null;
  purchasePrice: number | null;
  priceSupported: boolean | null;
  priceDifference: number | null;
  priceDifferencePct: number | null;
  breakdownAtValue: DealBreakdown | null;
  breakdownAtPrice: DealBreakdown | null;
  stale: boolean;
  blockers: string[];
  warnings: string[];
};

const label = <K extends keyof typeof ENGAGEMENT_OPTIONS>(field: K, value: string | null | undefined) =>
  (ENGAGEMENT_OPTIONS[field] as ReadonlyArray<{ value: string; label: string }>).find((option) => option.value === value)?.label || null;

export function roundToIncrement(value: number, increment: number) {
  return Math.round(value / increment) * increment;
}

export function computeReconciliation(
  reconciliation: Reconciliation,
  indications: Indications,
  context: {
    companyName: string;
    valuationDateLabel: string | null;
    standardOfValue: string | null;
    premiseOfValue: string | null;
    ownershipBasis: string | null;
    transactionStructure: string | null;
    interestPercent: number | null;
    balanceSheet: SnapshotBalanceSheet | null;
    formatMoney: (value: number) => string;
  },
): ReconciliationResult {
  const isStock = context.transactionStructure === 'STOCK';
  const values: Record<ApproachKey, { value: number | null; basis: string }> = {
    MARKET: { value: null, basis: 'Not performed (comparable sales data is not yet licensed)' },
    INCOME: { value: indications.income.indicatedValue, basis: isStock ? 'Equity value' : 'Value of the operating assets, cash-free and debt-free' },
    ASSET: { value: indications.asset.comparableNetAssets, basis: indications.asset.comparableBasis },
  };
  const lines: ApproachLine[] = APPROACHES.map((approach) => {
    const weight = reconciliation.weights[approach.key] ?? 0;
    const value = values[approach.key].value;
    return {
      key: approach.key,
      label: approach.label,
      value,
      basis: values[approach.key].basis,
      weight,
      weighted: value !== null ? (value * weight) / 100 : null,
      reason: reconciliation.reasons[approach.key] ?? null,
    };
  });
  const weightTotal = lines.reduce((total, line) => total + line.weight, 0);

  const blockers: string[] = [];
  if (Math.abs(weightTotal - 100) > 0.001) blockers.push(`Weights total ${weightTotal}%; they must total 100%.`);
  for (const line of lines) {
    if (line.weight > 0 && line.value === null) blockers.push(`The ${line.label.toLowerCase()} has no value, so it cannot carry weight.`);
    if (!line.reason) blockers.push(`Give the reason for the ${line.label.toLowerCase()} weight${line.weight === 0 ? ', including why it was given no weight' : ''}.`);
  }
  const weightedValue = blockers.some((blocker) => blocker.startsWith('Weights') || blocker.includes('cannot carry weight'))
    ? null
    : lines.reduce((total, line) => total + (line.weighted ?? 0), 0);
  const concludedValue = weightedValue === null ? null : roundToIncrement(weightedValue, reconciliation.roundingIncrement);

  const standard = label('standardOfValue', context.standardOfValue)?.toLowerCase() || 'value';
  const premise = label('premiseOfValue', context.premiseOfValue)?.toLowerCase() || 'going concern';
  const interest = context.interestPercent ?? 100;
  const conclusionStatement = concludedValue === null
    ? null
    : `The ${standard} of ${interest}% of the ${isStock ? 'equity' : 'assets'} of ${context.companyName}, on a ${premise} basis, as of ${context.valuationDateLabel || '[valuation date]'}, is ${context.formatMoney(concludedValue)}.`;

  const purchasePrice = indications.deal.purchasePrice;
  const priceSupported = concludedValue !== null && purchasePrice !== null ? purchasePrice <= concludedValue : null;
  const priceDifference = concludedValue !== null && purchasePrice !== null ? concludedValue - purchasePrice : null;
  const priceDifferencePct = priceDifference !== null && purchasePrice ? (priceDifference / purchasePrice) * 100 : null;
  const breakdownAtValue = concludedValue !== null ? computeDealBreakdown({ ...indications.deal, purchasePrice: concludedValue }, context.balanceSheet, indications.appraisals) : null;
  const breakdownAtPrice = purchasePrice !== null ? computeDealBreakdown(indications.deal, context.balanceSheet, indications.appraisals) : null;
  const stale = Boolean(reconciliation.concludedAt) && reconciliation.concludedValue !== concludedValue;

  const warnings: string[] = [];
  if (stale) warnings.push(`The concluded value was ${reconciliation.concludedValue === null ? 'not recorded' : context.formatMoney(reconciliation.concludedValue)}; the inputs now give ${concludedValue === null ? 'no value' : context.formatMoney(concludedValue)}. Conclude again.`);
  if ((reconciliation.weights.INCOME ?? 0) > 0 && indications.income.capRateOutOfRange) warnings.push('The income approach carries weight but its capitalization rate is flagged as not reliable.');
  if (interest < 100 || context.ownershipBasis === 'MINORITY') warnings.push('This valuation does not apply discounts for lack of control or marketability.');
  if (priceSupported === false) warnings.push('The purchase price exceeds the concluded value.');
  if (breakdownAtValue?.goodwill !== null && breakdownAtValue?.goodwill !== undefined && breakdownAtValue.goodwill < 0) warnings.push('The concluded value is below the tangible assets in the deal, so goodwill is negative.');
  const texts = [...Object.values(reconciliation.reasons), reconciliation.conclusionNote || ''];
  if (texts.some((text) => LISTING_LANGUAGE.test(text))) warnings.push('Remove listing or asking price language; the report concludes value, not a listing price.');
  if (context.premiseOfValue === 'GOING_CONCERN' && values.ASSET.value !== null && values.INCOME.value !== null && values.ASSET.value > values.INCOME.value) {
    warnings.push('The asset approach exceeds the income approach under a going-concern premise; explain why the business is valued as a going concern.');
  }

  return {
    lines,
    weightTotal,
    weightedValue,
    concludedValue,
    conclusionStatement,
    purchasePrice,
    priceSupported,
    priceDifference,
    priceDifferencePct,
    breakdownAtValue,
    breakdownAtPrice,
    stale,
    blockers,
    warnings,
  };
}
