import { optionalNumber, optionalText, type Appraisal } from './deal-terms';

export const ASSET_LINES = [
  { key: 'cash', label: 'Cash' },
  { key: 'ar', label: 'Accounts receivable' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'otherCA', label: 'Other current assets' },
  { key: 'fixedAssets', label: 'Fixed assets, net' },
  { key: 'otherAssets', label: 'Other assets' },
] as const;

export const LIABILITY_LINES = [
  { key: 'ap', label: 'Accounts payable' },
  { key: 'loc', label: 'Line of credit' },
  { key: 'otherCL', label: 'Other current liabilities' },
  { key: 'ltd', label: 'Long-term debt' },
] as const;

export type BalanceLineKey = (typeof ASSET_LINES)[number]['key'] | (typeof LIABILITY_LINES)[number]['key'];
const LINE_KEYS: BalanceLineKey[] = [...ASSET_LINES.map((line) => line.key), ...LIABILITY_LINES.map((line) => line.key)];

export type LineAdjustment = { amount: number | null; note: string | null };
export type IdentifiedIntangible = { id: string; label: string; amount: number; note: string | null };

export type AssetApproach = {
  adjustments: Partial<Record<BalanceLineKey, LineAdjustment>>;
  /** Replace book fixed assets with the outside appraisals recorded on the Deal Terms tab. */
  useAppraisals: boolean;
  /** Real estate appraisals count only when the company itself owns the property. */
  realEstateOwnedByCompany: boolean;
  intangibles: IdentifiedIntangible[];
  notes: string | null;
};

export const DEFAULT_ASSET_APPROACH: AssetApproach = {
  adjustments: {},
  useAppraisals: true,
  realEstateOwnedByCompany: false,
  intangibles: [],
  notes: null,
};

const MAX_INTANGIBLES = 20;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `i${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

export function normalizeAssetApproach(raw: unknown): AssetApproach {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rawAdjustments = source.adjustments && typeof source.adjustments === 'object' ? (source.adjustments as Record<string, unknown>) : {};
  const adjustments: AssetApproach['adjustments'] = {};
  for (const key of LINE_KEYS) {
    const item = rawAdjustments[key];
    if (!item || typeof item !== 'object') continue;
    const amount = optionalNumber((item as Record<string, unknown>).amount);
    const note = optionalText((item as Record<string, unknown>).note);
    if (amount !== null || note !== null) adjustments[key] = { amount, note };
  }
  return {
    adjustments,
    useAppraisals: source.useAppraisals !== false,
    realEstateOwnedByCompany: source.realEstateOwnedByCompany === true,
    intangibles: (Array.isArray(source.intangibles) ? source.intangibles : [])
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        id: optionalText(item.id) || newId(),
        label: optionalText(item.label) || '',
        amount: optionalNumber(item.amount) ?? 0,
        note: optionalText(item.note),
      })),
    notes: optionalText(source.notes),
  };
}

/** Returns an error message, or null when the inputs are acceptable to save. */
export function validateAssetApproach(asset: AssetApproach): string | null {
  if (asset.intangibles.length > MAX_INTANGIBLES) return `No more than ${MAX_INTANGIBLES} identified intangibles.`;
  if (asset.intangibles.some((item) => !item.label)) return 'Every identified intangible needs a description.';
  if (asset.intangibles.some((item) => item.amount < 0)) return 'Identified intangibles cannot be negative.';
  return null;
}

export type AssetBalanceSheet = (Partial<Record<BalanceLineKey | 'totalAssets' | 'totalLiab' | 'totalEquity', number>> & { month?: string }) | null;

export type AssetRow = {
  key: BalanceLineKey;
  label: string;
  book: number;
  adjustment: number;
  fairValue: number;
  basis: string;
  note: string | null;
  fromAppraisal: boolean;
};

export type AssetApproachResult = {
  month: string | null;
  assets: AssetRow[];
  liabilities: AssetRow[];
  bookAssets: number;
  bookLiabilities: number;
  fairAssets: number;
  fairLiabilities: number;
  adjustedNetTangibleAssets: number | null;
  intangiblesTotal: number;
  indicatedValue: number | null;
  /** Net tangible assets on the same basis as the income approach (cash-free, debt-free for an asset sale). */
  comparableNetAssets: number | null;
  comparableBasis: string;
  impliedUnidentifiedIntangibles: number | null;
  storedEquityDifference: number | null;
  warnings: string[];
};

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function computeAssetApproach(
  asset: AssetApproach,
  balanceSheet: AssetBalanceSheet,
  appraisals: Appraisal[],
  options: { transactionStructure: string | null; incomeValue: number | null },
): AssetApproachResult {
  const warnings: string[] = [];
  const bs = balanceSheet || {};
  const equipment = appraisals.filter((a) => a.assetType === 'EQUIPMENT');
  const realEstate = asset.realEstateOwnedByCompany ? appraisals.filter((a) => a.assetType === 'REAL_ESTATE') : [];
  const appraisedFixed = [...equipment, ...realEstate];
  const useAppraisals = asset.useAppraisals && appraisedFixed.length > 0;

  const buildRow = (key: BalanceLineKey, label: string): AssetRow => {
    const book = num(bs[key]);
    const manual = asset.adjustments[key];
    if (key === 'fixedAssets' && useAppraisals) {
      const appraised = appraisedFixed.reduce((total, a) => total + num(a.value), 0);
      const parts = [equipment.length ? 'equipment' : '', realEstate.length ? 'real estate' : ''].filter(Boolean).join(' and ');
      return { key, label, book, adjustment: appraised - book, fairValue: appraised, basis: `Outside appraisal (${parts})`, note: manual?.note ?? null, fromAppraisal: true };
    }
    const adjustment = manual?.amount ?? 0;
    return { key, label, book, adjustment, fairValue: book + adjustment, basis: adjustment ? 'Appraiser adjustment' : 'Book value', note: manual?.note ?? null, fromAppraisal: false };
  };

  const assets = ASSET_LINES.map((line) => buildRow(line.key, line.label));
  const liabilities = LIABILITY_LINES.map((line) => buildRow(line.key, line.label));
  const sum = (rows: AssetRow[], field: 'book' | 'fairValue') => rows.reduce((total, row) => total + row[field], 0);
  const fairAssets = sum(assets, 'fairValue');
  const fairLiabilities = sum(liabilities, 'fairValue');
  const adjustedNetTangibleAssets = balanceSheet ? fairAssets - fairLiabilities : null;
  const intangiblesTotal = asset.intangibles.reduce((total, item) => total + item.amount, 0);
  const indicatedValue = adjustedNetTangibleAssets === null ? null : adjustedNetTangibleAssets + intangiblesTotal;

  const fair = (rows: AssetRow[], key: BalanceLineKey) => rows.find((row) => row.key === key)?.fairValue ?? 0;
  const isStock = options.transactionStructure === 'STOCK';
  const comparableNetAssets =
    indicatedValue === null
      ? null
      : isStock
        ? indicatedValue
        : indicatedValue - fair(assets, 'cash') + fair(liabilities, 'loc') + fair(liabilities, 'ltd');
  const comparableBasis = isStock ? 'Adjusted net assets (stock sale)' : 'Adjusted net assets excluding cash and interest-bearing debt (asset sale)';
  const impliedUnidentifiedIntangibles = options.incomeValue !== null && comparableNetAssets !== null ? options.incomeValue - comparableNetAssets : null;

  const bookAssets = sum(assets, 'book');
  const bookLiabilities = sum(liabilities, 'book');
  const storedEquity = bs.totalEquity;
  const storedEquityDifference = balanceSheet && typeof storedEquity === 'number' ? storedEquity - (bookAssets - bookLiabilities) : null;

  if (!balanceSheet) warnings.push('Freeze data on the Data Snapshot tab to bring in the balance sheet.');
  if (storedEquityDifference !== null && Math.abs(storedEquityDifference) > 1) {
    warnings.push(`Stored equity differs from assets less liabilities by ${Math.round(storedEquityDifference).toLocaleString('en-US')}. The asset approach uses assets less liabilities; review the balance sheet mapping.`);
  }
  if (typeof bs.totalAssets === 'number' && Math.abs(bs.totalAssets - bookAssets) > 1) {
    warnings.push('Stored total assets differ from the sum of the asset lines; some balances may not be mapped to a line.');
  }
  if (asset.useAppraisals && appraisedFixed.length === 0 && appraisals.some((a) => a.assetType === 'REAL_ESTATE')) {
    warnings.push('A real estate appraisal is recorded but not used. Check "Real estate owned by the company" if the company holds title.');
  }
  for (const row of [...assets, ...liabilities]) {
    if (!row.fromAppraisal && row.adjustment !== 0 && !row.note) warnings.push(`Support the ${row.label.toLowerCase()} adjustment.`);
  }
  if (impliedUnidentifiedIntangibles !== null && impliedUnidentifiedIntangibles < 0) {
    warnings.push('The income approach is below adjusted net assets, which suggests the business is worth more liquidated than operated. Reconsider the earnings, the rates, or the premise of value.');
  }

  return {
    month: (bs as { month?: string }).month || null,
    assets,
    liabilities,
    bookAssets,
    bookLiabilities,
    fairAssets,
    fairLiabilities,
    adjustedNetTangibleAssets,
    intangiblesTotal,
    indicatedValue,
    comparableNetAssets,
    comparableBasis,
    impliedUnidentifiedIntangibles,
    storedEquityDifference,
    warnings,
  };
}
