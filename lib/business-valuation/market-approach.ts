import { optionalNumber, optionalText } from './deal-terms';
import type { EarningsBaseResult } from './earnings-base';

export const MULTIPLE_TYPES = [
  { key: 'PRICE_TO_SDE', label: 'Price to SDE', metric: 'sde', metricLabel: 'Seller\'s discretionary earnings' },
  { key: 'PRICE_TO_EBITDA', label: 'Price to EBITDA', metric: 'ebitda', metricLabel: 'Normalized EBITDA' },
  { key: 'PRICE_TO_REVENUE', label: 'Price to revenue', metric: 'revenue', metricLabel: 'Revenue, trailing twelve months' },
] as const;
export type MultipleKey = (typeof MULTIPLE_TYPES)[number]['key'];
type MetricKey = (typeof MULTIPLE_TYPES)[number]['metric'];

export type Comparable = {
  id: string;
  /** YYYY, YYYY-MM, or YYYY-MM-DD as reported by the data source. */
  saleDate: string | null;
  description: string;
  industryCode: string | null;
  location: string | null;
  revenue: number | null;
  sde: number | null;
  ebitda: number | null;
  price: number;
  /** Null means the sale follows the tab's "Sale prices exclude inventory" setting. */
  inventoryInPrice: boolean | null;
  inventoryAmount: number | null;
  realEstateInPrice: boolean;
  realEstateValue: number | null;
  saleStructure: SaleStructure | null;
  downPaymentPct: number | null;
  sellerFinancedPct: number | null;
  included: boolean;
  exclusionReason: string | null;
};

export type SaleStructure = 'ASSET' | 'STOCK';

export const EMPTY_COMPARABLE: Omit<Comparable, 'id'> = {
  saleDate: null,
  description: '',
  industryCode: null,
  location: null,
  revenue: null,
  sde: null,
  ebitda: null,
  price: 0,
  inventoryInPrice: null,
  inventoryAmount: null,
  realEstateInPrice: false,
  realEstateValue: null,
  saleStructure: null,
  downPaymentPct: null,
  sellerFinancedPct: null,
  included: true,
  exclusionReason: null,
};

export type MultipleSelection = { multiple: number | null; weight: number | null; reason: string | null };

export type MarketApproach = {
  dataSource: string | null;
  dataEdition: string | null;
  searchCriteria: string | null;
  /** Most small-business databases report prices without inventory; the company's inventory is then added. */
  priceExcludesInventory: boolean;
  selections: Partial<Record<MultipleKey, MultipleSelection>>;
  comparables: Comparable[];
  notes: string | null;
};

export const DEFAULT_MARKET_APPROACH: MarketApproach = {
  dataSource: null,
  dataEdition: null,
  searchCriteria: null,
  priceExcludesInventory: true,
  selections: {},
  comparables: [],
  notes: null,
};

export const MAX_COMPARABLES = 300;
const MAX_TEXT = 3000;
const LISTING_LANGUAGE = /\b(listing|asking|list)\s+price\b/i;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `c${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

function saleDateText(value: unknown): string | null {
  const text = optionalText(value);
  return text && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(text) ? text : null;
}

export function normalizeMarketApproach(raw: unknown): MarketApproach {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rawSelections = source.selections && typeof source.selections === 'object' ? (source.selections as Record<string, unknown>) : {};
  const selections: MarketApproach['selections'] = {};
  for (const type of MULTIPLE_TYPES) {
    const item = rawSelections[type.key];
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const selection = { multiple: optionalNumber(record.multiple), weight: optionalNumber(record.weight), reason: optionalText(record.reason) };
    if (selection.multiple !== null || selection.weight !== null || selection.reason !== null) selections[type.key] = selection;
  }
  return {
    dataSource: optionalText(source.dataSource),
    dataEdition: optionalText(source.dataEdition),
    searchCriteria: optionalText(source.searchCriteria),
    priceExcludesInventory: source.priceExcludesInventory !== false,
    selections,
    comparables: (Array.isArray(source.comparables) ? source.comparables : [])
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        id: optionalText(item.id) || newId(),
        saleDate: saleDateText(item.saleDate),
        description: optionalText(item.description) || '',
        industryCode: optionalText(item.industryCode),
        location: optionalText(item.location),
        revenue: optionalNumber(item.revenue),
        sde: optionalNumber(item.sde),
        ebitda: optionalNumber(item.ebitda),
        price: optionalNumber(item.price) ?? 0,
        inventoryInPrice: typeof item.inventoryInPrice === 'boolean' ? item.inventoryInPrice : null,
        inventoryAmount: optionalNumber(item.inventoryAmount),
        realEstateInPrice: item.realEstateInPrice === true,
        realEstateValue: optionalNumber(item.realEstateValue),
        saleStructure: item.saleStructure === 'ASSET' || item.saleStructure === 'STOCK' ? item.saleStructure : null,
        downPaymentPct: optionalNumber(item.downPaymentPct),
        sellerFinancedPct: optionalNumber(item.sellerFinancedPct),
        included: item.included !== false,
        exclusionReason: optionalText(item.exclusionReason),
      })),
    notes: optionalText(source.notes),
  };
}

/** Returns an error message, or null when the inputs are acceptable to save. */
export function validateMarketApproach(market: MarketApproach): string | null {
  if (market.comparables.length > MAX_COMPARABLES) return `No more than ${MAX_COMPARABLES} comparable sales.`;
  if (market.comparables.some((item) => !(item.price > 0))) return 'Every comparable sale needs a sale price above zero.';
  if (market.comparables.some((item) => [item.revenue, item.sde, item.ebitda, item.inventoryAmount, item.realEstateValue].some((value) => value !== null && !Number.isFinite(value)))) return 'Comparable figures must be numbers.';
  if (market.comparables.some((item) => [item.inventoryAmount, item.realEstateValue].some((value) => value !== null && value < 0))) return 'Inventory and real estate amounts cannot be negative.';
  if (market.comparables.some((item) => [item.downPaymentPct, item.sellerFinancedPct].some((value) => value !== null && (value < 0 || value > 100)))) return 'Down payment and seller financing must be between 0% and 100%.';
  for (const selection of Object.values(market.selections)) {
    if (selection.multiple !== null && (selection.multiple < 0 || selection.multiple > 100)) return 'Selected multiples must be between 0 and 100.';
    if (selection.weight !== null && (selection.weight < 0 || selection.weight > 100)) return 'Each weight must be between 0% and 100%.';
  }
  const texts = [market.notes, market.searchCriteria, ...Object.values(market.selections).map((item) => item.reason), ...market.comparables.map((item) => item.exclusionReason)];
  if (texts.some((text) => (text || '').length > MAX_TEXT)) return `Notes and reasons are limited to ${MAX_TEXT} characters.`;
  return null;
}

export type MultipleStats = { count: number; min: number; q1: number; median: number; q3: number; max: number; mean: number };

export function quantile(sorted: number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function multipleStats(values: number[]): MultipleStats | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    min: sorted[0],
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1],
    mean: sorted.reduce((total, value) => total + value, 0) / sorted.length,
  };
}

export type PriceAdjustment = { price: number | null; inventory: number; realEstate: number; problem: 'INVENTORY_AMOUNT' | 'REAL_ESTATE_VALUE' | 'NOT_POSITIVE' | null };

/** Puts a sale price on the same basis as the others: inventory treated per the tab setting, real estate removed. */
export function adjustedPrice(comparable: Comparable, priceExcludesInventory: boolean): PriceAdjustment {
  let inventory = 0;
  let realEstate = 0;
  const inventoryDiffers = comparable.inventoryInPrice !== null && comparable.inventoryInPrice === priceExcludesInventory;
  if (inventoryDiffers) {
    if (comparable.inventoryAmount === null) return { price: null, inventory, realEstate, problem: 'INVENTORY_AMOUNT' };
    inventory = priceExcludesInventory ? -comparable.inventoryAmount : comparable.inventoryAmount;
  }
  if (comparable.realEstateInPrice) {
    if (comparable.realEstateValue === null) return { price: null, inventory, realEstate, problem: 'REAL_ESTATE_VALUE' };
    realEstate = -comparable.realEstateValue;
  }
  const price = comparable.price + inventory + realEstate;
  return price > 0 ? { price, inventory, realEstate, problem: null } : { price: null, inventory, realEstate, problem: 'NOT_POSITIVE' };
}

export function comparableMultiple(comparable: Comparable, metric: MetricKey, priceExcludesInventory: boolean): number | null {
  const base = comparable[metric];
  const price = adjustedPrice(comparable, priceExcludesInventory).price;
  return base !== null && base > 0 && price !== null ? price / base : null;
}

export type MultipleLine = {
  key: MultipleKey;
  label: string;
  metricLabel: string;
  stats: MultipleStats | null;
  companyMetric: number | null;
  selected: number | null;
  weight: number;
  reason: string | null;
  indication: number | null;
};

export type MarketBalanceSheet = Partial<Record<'cash' | 'inventory' | 'loc' | 'ltd', number>> | null;

export type MarketApproachResult = {
  includedCount: number;
  lines: MultipleLine[];
  weightTotal: number;
  operatingValue: number | null;
  inventory: number | null;
  debt: number | null;
  cash: number | null;
  indicatedValue: number | null;
  basis: string;
  warnings: string[];
};

export function computeMarketApproach(
  market: MarketApproach,
  earnings: Pick<EarningsBaseResult, 'sde' | 'normalizedEbitda' | 'workingCapital'>,
  balanceSheet: MarketBalanceSheet,
  options: { transactionStructure: string | null; valuationDate: string | null },
): MarketApproachResult {
  const included = market.comparables.filter((item) => item.included);
  const companyMetrics: Record<MetricKey, number | null> = { sde: earnings.sde, ebitda: earnings.normalizedEbitda, revenue: earnings.workingCapital.revenue };
  const selectedKeys = MULTIPLE_TYPES.filter((type) => market.selections[type.key]?.multiple != null).map((type) => type.key);

  const lines: MultipleLine[] = MULTIPLE_TYPES.map((type) => {
    const values = included.map((item) => comparableMultiple(item, type.metric, market.priceExcludesInventory)).filter((value): value is number => value !== null);
    const selection = market.selections[type.key];
    const selected = selection?.multiple ?? null;
    const companyMetric = companyMetrics[type.metric];
    const indication = selected !== null && companyMetric !== null && companyMetric > 0 ? selected * companyMetric : null;
    const weight = selection?.weight ?? (selected !== null && selectedKeys.length === 1 ? 100 : 0);
    return { key: type.key, label: type.label, metricLabel: type.metricLabel, stats: multipleStats(values), companyMetric, selected, weight, reason: selection?.reason ?? null, indication };
  });

  const weightTotal = lines.reduce((total, line) => total + (line.selected !== null ? line.weight : 0), 0);
  const weightedLines = lines.filter((line) => line.selected !== null && line.weight > 0);
  const weightsValid = weightedLines.length > 0 && Math.abs(weightTotal - 100) <= 0.001 && weightedLines.every((line) => line.indication !== null);
  const operatingValue = weightsValid ? weightedLines.reduce((total, line) => total + ((line.indication as number) * line.weight) / 100, 0) : null;

  const bs = balanceSheet || {};
  const isStock = options.transactionStructure === 'STOCK';
  const inventory = market.priceExcludesInventory ? Number(bs.inventory || 0) : null;
  const debt = isStock ? Number(bs.loc || 0) + Number(bs.ltd || 0) : null;
  const cash = isStock ? Number(bs.cash || 0) : null;
  const indicatedValue = operatingValue === null ? null : operatingValue + (inventory ?? 0) - (debt ?? 0) + (cash ?? 0);

  const warnings: string[] = [];
  if (market.comparables.length === 0) warnings.push('Import or enter comparable sales.');
  else if (included.length < 5) warnings.push(`Only ${included.length} comparable sale${included.length === 1 ? ' is' : 's are'} included; five or more are customary.`);
  if (market.comparables.length > 0 && !market.dataSource) warnings.push('Record the data source and edition for attribution.');
  const valuationDate = options.valuationDate;
  if (valuationDate) {
    const late = included.filter((item) => item.saleDate && item.saleDate > valuationDate.slice(0, item.saleDate.length));
    if (late.length) warnings.push(`${late.length} included sale${late.length === 1 ? ' is' : 's are'} dated after the valuation date; exclude ${late.length === 1 ? 'it' : 'them'}.`);
  }
  if (market.comparables.some((item) => !item.included && !item.exclusionReason)) warnings.push('Give the reason for each excluded sale.');
  const sales = (count: number) => `${count} included sale${count === 1 ? '' : 's'}`;
  const verb = (count: number, singular: string, plural: string) => (count === 1 ? singular : plural);
  const problems = included.map((item) => adjustedPrice(item, market.priceExcludesInventory).problem);
  const inventoryMissing = problems.filter((problem) => problem === 'INVENTORY_AMOUNT').length;
  if (inventoryMissing) {
    const action = market.priceExcludesInventory ? verb(inventoryMissing, 'includes', 'include') : verb(inventoryMissing, 'excludes', 'exclude');
    warnings.push(`${sales(inventoryMissing)} ${action} inventory unlike the others but ${verb(inventoryMissing, 'has', 'have')} no inventory amount, so ${verb(inventoryMissing, 'it is', 'they are')} left out of the multiples. Enter the amount or exclude the sale.`);
  }
  const realEstateMissing = problems.filter((problem) => problem === 'REAL_ESTATE_VALUE').length;
  if (realEstateMissing) warnings.push(`${sales(realEstateMissing)} ${verb(realEstateMissing, 'includes', 'include')} real estate with no value given, so ${verb(realEstateMissing, 'it is', 'they are')} left out of the multiples. Enter the real estate value or exclude the sale.`);
  const notPositive = problems.filter((problem) => problem === 'NOT_POSITIVE').length;
  if (notPositive) warnings.push(`${sales(notPositive)} ${verb(notPositive, 'has', 'have')} an adjusted price of zero or less after removing inventory or real estate; check the amounts.`);
  const otherStructure = included.filter((item) => item.saleStructure && item.saleStructure !== (isStock ? 'STOCK' : 'ASSET')).length;
  if (otherStructure) warnings.push(`${sales(otherStructure)} ${otherStructure === 1 ? 'was a' : 'were'} ${isStock ? 'asset' : 'stock'} sale${otherStructure === 1 ? '' : 's'}, while this engagement values ${isStock ? 'the stock' : 'the assets'}; support their comparability or exclude them.`);
  if (selectedKeys.length === 0 && included.length > 0) warnings.push('Select at least one multiple.');
  if (selectedKeys.length > 0 && !weightsValid) {
    if (Math.abs(weightTotal - 100) > 0.001) warnings.push(`Weights of the selected multiples total ${weightTotal}%; they must total 100%.`);
  }
  for (const line of lines) {
    if (line.selected === null) continue;
    if (line.indication === null) warnings.push(`${line.label} needs a positive company ${line.metricLabel.toLowerCase()}.`);
    if (!line.reason) warnings.push(`Explain the selected ${line.label.toLowerCase()} multiple.`);
    if (line.stats && line.stats.count >= 4 && (line.selected < line.stats.q1 || line.selected > line.stats.q3)) {
      warnings.push(`The selected ${line.label.toLowerCase()} multiple is outside the middle half of the comparables (${line.stats.q1.toFixed(2)} to ${line.stats.q3.toFixed(2)}); support the adjustment.`);
    }
  }
  const texts = [market.notes, market.searchCriteria, ...lines.map((line) => line.reason)];
  if (texts.some((text) => LISTING_LANGUAGE.test(text || ''))) warnings.push('Remove listing or asking price language; comparables must be completed sales.');

  return {
    includedCount: included.length,
    lines,
    weightTotal,
    operatingValue,
    inventory,
    debt,
    cash,
    indicatedValue,
    basis: isStock ? 'Equity value' : 'Value of the operating assets, cash-free and debt-free',
    warnings,
  };
}

const HEADER_ALIASES: Record<keyof Omit<Comparable, 'id' | 'included' | 'exclusionReason'>, string[]> = {  saleDate: ['sale date', 'date of sale', 'date sold', 'sold date', 'close date', 'closing date', 'transaction date', 'date'],
  description: ['description', 'business description', 'business type', 'type of business', 'naics description', 'sic description', 'company', 'business'],
  industryCode: ['naics', 'naics code', 'sic', 'sic code', 'industry code'],
  location: ['location', 'state', 'city', 'region', 'area', 'geographic area'],
  revenue: ['revenue', 'revenues', 'annual revenue', 'gross sales', 'annual gross sales', 'net sales', 'sales'],
  sde: ['sde', 'seller s discretionary earnings', 'sellers discretionary earnings', 'discretionary earnings', 'sde cash flow', 'cash flow'],
  ebitda: ['ebitda'],
  price: ['price', 'sale price', 'selling price', 'deal price', 'purchase price', 'total price', 'mvic'],
  inventoryInPrice: ['inventory included', 'inventory included in price', 'price includes inventory', 'includes inventory', 'inventory in price'],
  inventoryAmount: ['inventory', 'inventory amount', 'inventory value', 'inventory at sale'],
  realEstateInPrice: ['real estate included', 'real estate included in price', 'price includes real estate', 'includes real estate', 'real estate in price'],
  realEstateValue: ['real estate value', 'real estate amount', 'real estate price', 'real estate'],
  saleStructure: ['asset or stock', 'asset or stock sale', 'asset stock', 'sale type', 'transaction type', 'deal structure', 'structure'],
  downPaymentPct: ['down payment', 'down payment pct', 'down payment percent', 'percent down', 'pct down', 'down', 'cash down'],
  sellerFinancedPct: ['seller financing', 'seller financed', 'seller financing pct', 'seller financing percent', 'percent seller financed', 'seller note pct', 'seller note'],
};

export function parseYesNo(value: string): boolean | null {
  const text = value.trim().toLowerCase();
  if (/^(y|yes|true|1|x|included|incl)$/.test(text)) return true;
  if (/^(n|no|false|0|excluded|excl|not included)$/.test(text)) return false;
  return null;
}

/** Accepts "20%", "20", or a fraction such as 0.2. */
export function parsePercent(value: string): number | null {
  const amount = parseAmount(value);
  if (amount === null) return null;
  return !value.includes('%') && amount > 0 && amount <= 1 ? amount * 100 : amount;
}

export function parseSaleStructure(value: string): SaleStructure | null {
  const text = value.trim().toLowerCase();
  if (/stock|share|equity/.test(text)) return 'STOCK';
  return /asset/.test(text) ? 'ASSET' : null;
}

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Parses CSV text, honoring quoted fields with commas, quotes, and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

export function parseAmount(value: string): number | null {
  const text = value.trim();
  if (!text || /^(n\/?a|-+|—)$/i.test(text)) return null;
  const negative = /^\(.*\)$/.test(text) || text.startsWith('-');
  const match = /([\d,]*\.?\d+)\s*([kmb])?/i.exec(text.replace(/[$\s]/g, ''));
  if (!match) return null;
  const scale = { k: 1e3, m: 1e6, b: 1e9 }[(match[2] || '').toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
  const amount = Number(match[1].replace(/,/g, '')) * scale;
  return Number.isFinite(amount) ? (negative ? -amount : amount) : null;
}

export function parseSaleDate(value: string): string | null {
  const text = value.trim();
  let match = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(text);
  if (match) return match[3] ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : `${match[1]}-${match[2].padStart(2, '0')}`;
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  match = /^(\d{1,2})\/(\d{4})$/.exec(text);
  if (match) return `${match[2]}-${match[1].padStart(2, '0')}`;
  match = /^(\d{4})$/.exec(text);
  return match ? match[1] : null;
}

export type ComparableImport = { comparables: Comparable[]; matchedColumns: string[]; ignoredColumns: string[]; skippedRows: number; error: string | null };

/** Maps a provider's CSV export onto comparables by column name. Rows without a sale price are skipped. */
export function importComparablesCsv(text: string): ComparableImport {
  const rows = parseCsv(text);
  if (rows.length < 2) return { comparables: [], matchedColumns: [], ignoredColumns: [], skippedRows: 0, error: 'The file has no data rows.' };
  const headers = rows[0].map(normalizeHeader);
  const columnFor: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[keyof typeof HEADER_ALIASES, string[]]>) {
    const index = aliases.map((alias) => headers.indexOf(alias)).find((position) => position >= 0);
    if (index !== undefined) columnFor[field] = index;
  }
  if (columnFor.price === undefined) return { comparables: [], matchedColumns: [], ignoredColumns: rows[0], skippedRows: 0, error: 'No sale price column was found. Name it "Sale price".' };
  const used = new Set(Object.values(columnFor));
  const cell = (cells: string[], field: keyof typeof HEADER_ALIASES) => (columnFor[field] === undefined ? '' : (cells[columnFor[field] as number] || '').trim());
  let skippedRows = 0;
  const comparables: Comparable[] = [];
  for (const cells of rows.slice(1)) {
    const price = parseAmount(cell(cells, 'price'));
    if (price === null || price <= 0) {
      skippedRows += 1;
      continue;
    }
    const realEstateValue = parseAmount(cell(cells, 'realEstateValue'));
    comparables.push({
      ...EMPTY_COMPARABLE,
      id: newId(),
      saleDate: parseSaleDate(cell(cells, 'saleDate')),
      description: cell(cells, 'description'),
      industryCode: cell(cells, 'industryCode') || null,
      location: cell(cells, 'location') || null,
      revenue: parseAmount(cell(cells, 'revenue')),
      sde: parseAmount(cell(cells, 'sde')),
      ebitda: parseAmount(cell(cells, 'ebitda')),
      price,
      inventoryInPrice: parseYesNo(cell(cells, 'inventoryInPrice')),
      inventoryAmount: parseAmount(cell(cells, 'inventoryAmount')),
      realEstateInPrice: parseYesNo(cell(cells, 'realEstateInPrice')) ?? (columnFor.realEstateInPrice === undefined && realEstateValue !== null && realEstateValue > 0),
      realEstateValue,
      saleStructure: parseSaleStructure(cell(cells, 'saleStructure')),
      downPaymentPct: parsePercent(cell(cells, 'downPaymentPct')),
      sellerFinancedPct: parsePercent(cell(cells, 'sellerFinancedPct')),
    });
  }
  return {
    comparables,
    matchedColumns: rows[0].filter((_, index) => used.has(index)),
    ignoredColumns: rows[0].filter((_, index) => !used.has(index)),
    skippedRows,
    error: comparables.length ? null : 'No rows had a sale price above zero.',
  };
}
