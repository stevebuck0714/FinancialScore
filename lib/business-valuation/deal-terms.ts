export const INCLUDED_ASSET_KEYS = ['cash', 'accountsReceivable', 'inventory', 'otherCurrentAssets', 'equipment', 'realEstate'] as const;
export type IncludedAssetKey = (typeof INCLUDED_ASSET_KEYS)[number];

export const INCLUDED_ASSET_LABELS: Record<IncludedAssetKey, string> = {
  cash: 'Cash',
  accountsReceivable: 'Accounts receivable',
  inventory: 'Inventory',
  otherCurrentAssets: 'Other current assets',
  equipment: 'Furniture, fixtures & equipment',
  realEstate: 'Real estate',
};

export const DEAL_DOCUMENT_TYPES = [
  { value: 'LOI', label: 'Letter of intent' },
  { value: 'PURCHASE_AGREEMENT', label: 'Purchase agreement' },
] as const;

export const APPRAISAL_ASSET_TYPES = [
  { value: 'REAL_ESTATE', label: 'Real estate' },
  { value: 'EQUIPMENT', label: 'Furniture, fixtures & equipment' },
] as const;
export type AppraisalAssetType = (typeof APPRAISAL_ASSET_TYPES)[number]['value'];

export type DealTerms = {
  purchasePrice: number | null;
  included: Record<IncludedAssetKey, boolean>;
  /** Inventory value agreed in the deal; book inventory is used when blank. */
  inventoryAmount: number | null;
  workingCapitalTarget: number | null;
  sellerNoteAmount: number | null;
  sellerNoteRatePct: number | null;
  sellerNoteTermMonths: number | null;
  sellerNoteStandby: boolean;
  assumedLiabilities: number | null;
  assumedLiabilitiesNote: string | null;
  leasesAssumedNote: string | null;
  dealDocumentType: string | null;
  dealDocumentId: string | null;
  dealDocumentDate: string | null;
};

/** Typical SBA asset purchase: seller keeps cash and receivables and the real estate. */
export const DEFAULT_DEAL_TERMS: DealTerms = {
  purchasePrice: null,
  included: { cash: false, accountsReceivable: false, inventory: true, otherCurrentAssets: false, equipment: true, realEstate: false },
  inventoryAmount: null,
  workingCapitalTarget: null,
  sellerNoteAmount: null,
  sellerNoteRatePct: null,
  sellerNoteTermMonths: null,
  sellerNoteStandby: false,
  assumedLiabilities: null,
  assumedLiabilitiesNote: null,
  leasesAssumedNote: null,
  dealDocumentType: null,
  dealDocumentId: null,
  dealDocumentDate: null,
};

const NUMBER_FIELDS = [
  'purchasePrice', 'inventoryAmount', 'workingCapitalTarget', 'sellerNoteAmount',
  'sellerNoteRatePct', 'sellerNoteTermMonths', 'assumedLiabilities',
] as const;
const TEXT_FIELDS = ['assumedLiabilitiesNote', 'leasesAssumedNote', 'dealDocumentId'] as const;

export function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(/[$,%\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function optionalText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

/** Stored deal terms merged over the defaults; tolerant of missing or malformed keys. */
export function normalizeDealTerms(raw: unknown): DealTerms {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const included = source.included && typeof source.included === 'object' ? (source.included as Record<string, unknown>) : {};
  const result: DealTerms = {
    ...DEFAULT_DEAL_TERMS,
    included: { ...DEFAULT_DEAL_TERMS.included },
  };
  for (const key of INCLUDED_ASSET_KEYS) {
    if (typeof included[key] === 'boolean') result.included[key] = included[key] as boolean;
  }
  for (const field of NUMBER_FIELDS) result[field] = optionalNumber(source[field]);
  for (const field of TEXT_FIELDS) result[field] = optionalText(source[field]);
  result.sellerNoteStandby = source.sellerNoteStandby === true;
  const docType = optionalText(source.dealDocumentType);
  result.dealDocumentType = DEAL_DOCUMENT_TYPES.some((type) => type.value === docType) ? docType : null;
  const docDate = optionalText(source.dealDocumentDate);
  result.dealDocumentDate = docDate && /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate : null;
  return result;
}

/** Returns an error message, or null when the terms are acceptable to save. */
export function validateDealTerms(terms: DealTerms): string | null {
  for (const field of ['purchasePrice', 'inventoryAmount', 'sellerNoteAmount', 'assumedLiabilities'] as const) {
    const value = terms[field];
    if (value !== null && value < 0) return 'Amounts cannot be negative.';
  }
  if (terms.sellerNoteRatePct !== null && (terms.sellerNoteRatePct < 0 || terms.sellerNoteRatePct > 50)) {
    return 'Seller note rate must be between 0% and 50%.';
  }
  if (terms.sellerNoteTermMonths !== null && (!Number.isInteger(terms.sellerNoteTermMonths) || terms.sellerNoteTermMonths <= 0)) {
    return 'Seller note term must be a whole number of months.';
  }
  if (terms.purchasePrice !== null && terms.sellerNoteAmount !== null && terms.sellerNoteAmount > terms.purchasePrice) {
    return 'The seller note cannot exceed the purchase price.';
  }
  return null;
}

export type Appraisal = {
  id: string;
  assetType: string;
  appraiserFirm: string | null;
  effectiveDate: string | null;
  value: number;
  includedInDeal: boolean;
  documentId: string | null;
  notes: string | null;
};

export type SnapshotBalanceSheet = Partial<Record<'cash' | 'ar' | 'inventory' | 'otherCA' | 'tca' | 'fixedAssets' | 'otherAssets' | 'totalAssets', number>> & {
  month?: string;
};

export type BreakdownLine = {
  key: 'realEstate' | 'equipment' | 'inventory' | 'workingCapital' | 'goodwill';
  label: string;
  amount: number;
  basis: string;
};

export type BuyerReceivesLine = {
  key: string;
  label: string;
  bookValue: number;
  included: boolean;
  dealValue: number;
  basis: string;
};

export type DealBreakdown = {
  purchasePrice: number | null;
  lines: BreakdownLine[];
  tangibleTotal: number;
  goodwill: number | null;
  buyerReceives: BuyerReceivesLine[];
  assumedLiabilities: number;
  netAssetsReceived: number;
  warnings: string[];
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Breakdown of the purchase price into tangible asset classes, with goodwill and other
 * intangibles as the remainder. Outside appraisals replace book values; book fixed assets are
 * only used for equipment when no equipment appraisal is included.
 */
export function computeDealBreakdown(terms: DealTerms, balanceSheet: SnapshotBalanceSheet | null, appraisals: Appraisal[]): DealBreakdown {
  const bs = balanceSheet || {};
  const warnings: string[] = [];
  const included = terms.included;
  const appraised = (type: AppraisalAssetType) => appraisals.filter((a) => a.assetType === type && a.includedInDeal);
  const realEstateAppraisals = appraised('REAL_ESTATE');
  const equipmentAppraisals = appraised('EQUIPMENT');

  const realEstate = included.realEstate ? sum(realEstateAppraisals.map((a) => num(a.value))) : 0;
  if (included.realEstate && realEstateAppraisals.length === 0) {
    warnings.push('Real estate is included in the deal but no real estate appraisal is recorded.');
  }

  let equipment = 0;
  let equipmentBasis = 'Excluded';
  if (included.equipment) {
    if (equipmentAppraisals.length > 0) {
      equipment = sum(equipmentAppraisals.map((a) => num(a.value)));
      equipmentBasis = 'Outside appraisal';
    } else {
      equipment = num(bs.fixedAssets);
      equipmentBasis = 'Book value (net fixed assets)';
      if (included.realEstate && realEstateAppraisals.length > 0) {
        warnings.push('Equipment uses book fixed assets while real estate uses an appraisal. If the books carry the building in fixed assets it is counted twice; record an equipment appraisal.');
      }
    }
  }

  const inventory = included.inventory ? (terms.inventoryAmount ?? num(bs.inventory)) : 0;
  const inventoryBasis = !included.inventory ? 'Excluded' : terms.inventoryAmount !== null ? 'Deal amount' : 'Book value';

  const workingCapitalAssets =
    (included.cash ? num(bs.cash) : 0) +
    (included.accountsReceivable ? num(bs.ar) : 0) +
    (included.otherCurrentAssets ? num(bs.otherCA) : 0);
  const assumedLiabilities = terms.assumedLiabilities ?? 0;
  const workingCapital = workingCapitalAssets - assumedLiabilities;

  const lines: BreakdownLine[] = [
    { key: 'realEstate', label: 'Real estate', amount: realEstate, basis: included.realEstate ? 'Outside appraisal' : 'Excluded' },
    { key: 'equipment', label: 'Furniture, fixtures & equipment', amount: equipment, basis: equipmentBasis },
    { key: 'inventory', label: 'Inventory', amount: inventory, basis: inventoryBasis },
    {
      key: 'workingCapital',
      label: 'Working capital (excluding inventory)',
      amount: workingCapital,
      basis: workingCapitalAssets === 0 && assumedLiabilities === 0 ? 'None delivered' : 'Book cash, receivables, other current assets less assumed liabilities',
    },
  ];
  const tangibleTotal = sum(lines.map((line) => line.amount));
  const goodwill = terms.purchasePrice === null ? null : terms.purchasePrice - tangibleTotal;
  if (goodwill !== null) {
    lines.push({ key: 'goodwill', label: 'Goodwill and other intangibles', amount: goodwill, basis: 'Purchase price less tangible assets' });
    if (goodwill < 0) warnings.push('The purchase price is below the tangible assets delivered, so goodwill is negative.');
  } else {
    warnings.push('Enter the purchase price to complete the breakdown of value.');
  }
  if (!balanceSheet) warnings.push('Freeze data on the Data Snapshot tab to bring in book values.');
  if (terms.workingCapitalTarget !== null && Math.abs(workingCapital - terms.workingCapitalTarget) > 0.5) {
    warnings.push('Working capital delivered differs from the working capital target in the deal.');
  }

  const buyerReceives: BuyerReceivesLine[] = [
    { key: 'cash', label: 'Cash', bookValue: num(bs.cash), included: included.cash, dealValue: included.cash ? num(bs.cash) : 0, basis: 'Book' },
    { key: 'accountsReceivable', label: 'Accounts receivable', bookValue: num(bs.ar), included: included.accountsReceivable, dealValue: included.accountsReceivable ? num(bs.ar) : 0, basis: 'Book' },
    { key: 'inventory', label: 'Inventory', bookValue: num(bs.inventory), included: included.inventory, dealValue: inventory, basis: inventoryBasis },
    { key: 'otherCurrentAssets', label: 'Other current assets', bookValue: num(bs.otherCA), included: included.otherCurrentAssets, dealValue: included.otherCurrentAssets ? num(bs.otherCA) : 0, basis: 'Book' },
    { key: 'equipment', label: 'Furniture, fixtures & equipment', bookValue: num(bs.fixedAssets), included: included.equipment, dealValue: equipment, basis: equipmentBasis },
    { key: 'realEstate', label: 'Real estate', bookValue: 0, included: included.realEstate, dealValue: realEstate, basis: included.realEstate ? 'Outside appraisal' : 'Excluded' },
  ];
  const netAssetsReceived = sum(buyerReceives.map((line) => line.dealValue)) - assumedLiabilities;

  return { purchasePrice: terms.purchasePrice, lines, tangibleTotal, goodwill, buyerReceives, assumedLiabilities, netAssetsReceived, warnings };
}
