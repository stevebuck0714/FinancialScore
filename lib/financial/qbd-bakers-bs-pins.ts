export const BAKERS_COMPANY_ID = 'cmq6pjenb0001l5049udok08d';
export const BAKERS_LOC_RECLASS_DATE = '2026-01-01';
export const BAKERS_PIN_START = '2024-12-31';
export const BAKERS_WALK_START = '2024-01-01';

/** QBD ListIDs that were current LOCs through 2025 and term loans from 1/1/2026. */
export const BAKERS_RECLASS_ACCOUNT_IDS = new Set([
  '80000122-1750288253', // Idea Financial Loan (was Idea Financial LOC)
  '80000091-1401407413', // Huntington Bank term loan (was LOC Huntington Bank)
  '8000011D-1728336412', // Sampson LOC
  '8000011B-1703168615', // Libertas LOC
  '80000114-1678284601', // Balboa LOC
  '800000F6-1552923167', // Wesbanco LOC
]);

/** Remaining balances after the 2026-08-20 rename. Not year-end pins. */
export const BAKERS_CURRENT_RENAMED_LOANS = {
  asOf: '2026-08-20',
  ideaFinancialLoan: 223_644.9,
  huntingtonBankTermLoan: 236_326.91,
};

const BAKERS_RECLASS_NAME_PATTERNS = [
  /^idea financial (loan|loc)\b/i,
  /^huntington bank\s+term loan\b/i,
  /^loc huntington bank\b/i,
  /^sampson loc\b/i,
  /^libertas loc\b/i,
  /^balboa loc\b/i,
  /^wesbanco loc\b/i,
];

export const BAKERS_BS_ROLLUP_FIELDS = [
  'cash',
  'ar',
  'retainageReceivables',
  'contractAssets',
  'inventory',
  'otherCA',
  'fixedAssets',
  'constructionEquipment',
  'officeEquipment',
  'shopEquipment',
  'investments',
  'rightOfUseLeases',
  'otherAssets',
  'ap',
  'loc',
  'contractLiabilities',
  'otherCL',
  'ltd',
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
] as const;

export type BakersBsField = (typeof BAKERS_BS_ROLLUP_FIELDS)[number];
export type BakersBsBalances = Record<string, number>;

const EMPTY_PIN: BakersBsBalances = Object.fromEntries(BAKERS_BS_ROLLUP_FIELDS.map((field) => [field, 0]));

function pin(partial: Partial<BakersBsBalances>): BakersBsBalances {
  return { ...EMPTY_PIN, ...partial };
}

/** 5GB Balance Sheet Dec 31 2024.pdf rolled into Corelytics fields. LOCs stay in loc. */
export const BAKERS_PIN_2024_12_31: BakersBsBalances = pin({
  cash: 289_217.93,
  ar: 618_517.07,
  inventory: 0,
  otherCA: 6_885.0,
  fixedAssets: 2_256_169.56,
  otherAssets: 4_258.0,
  ap: 370_080.6,
  loc: 696_153.04,
  otherCL: 68_698.78,
  ltd: 4_214_391.72,
  ownersDraw: -383_396.24,
  commonStock: 358_254.22,
  preferredStock: 888_615.51,
  retainedEarnings: -2_760_299.98,
});

/** 5GB Balance Sheet Dec 31 2025.pdf. Idea / Sampson / Huntington LOC stay in loc. */
export const BAKERS_PIN_2025_12_31: BakersBsBalances = pin({
  cash: 168_118.91,
  ar: 726_791.48,
  inventory: 0,
  otherCA: 6_885.0,
  fixedAssets: 2_339_228.04,
  otherAssets: 40_852.0,
  ap: 468_493.46,
  loc: 554_801.95,
  otherCL: 130_982.22,
  ltd: 4_192_600.15,
  ownersDraw: -72_636.24,
  commonStock: -90_278.78,
  preferredStock: 891_927.51,
  retainedEarnings: -3_084_939.07,
});

export function isBakersCompany(companyId: string): boolean {
  return String(companyId || '').trim() === BAKERS_COMPANY_ID;
}

export function isBakersReclassAccount(accountId?: string | null, accountName?: string | null): boolean {
  const id = String(accountId || '').trim();
  if (id && BAKERS_RECLASS_ACCOUNT_IDS.has(id)) return true;
  const name = String(accountName || '').trim();
  if (!name) return false;
  return BAKERS_RECLASS_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

export function resolveBakersLocTarget(opts: {
  companyId: string;
  dateKey?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  mappedTarget: string;
}): string {
  const mapped = String(opts.mappedTarget || '').trim();
  if (!isBakersCompany(opts.companyId)) return mapped;
  if (!isBakersReclassAccount(opts.accountId, opts.accountName)) return mapped;
  const dateKey = String(opts.dateKey || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return mapped;
  return dateKey < BAKERS_LOC_RECLASS_DATE ? 'loc' : 'ltd';
}

export function recomputeBakersBsTotals(row: BakersBsBalances): BakersBsBalances {
  const n = (field: string) => Number(row[field] || 0);
  const tca =
    n('cash') + n('ar') + n('retainageReceivables') + n('contractAssets') + n('inventory') + n('otherCA');
  const fixedAssets =
    n('fixedAssets') || n('constructionEquipment') + n('officeEquipment') + n('shopEquipment');
  const totalAssets = tca + fixedAssets + n('investments') + n('rightOfUseLeases') + n('otherAssets');
  const tcl = n('ap') + n('loc') + n('contractLiabilities') + n('otherCL');
  const totalLiab = tcl + n('ltd');
  const totalEquity =
    n('ownersCapital') +
    n('ownersDraw') +
    n('commonStock') +
    n('preferredStock') +
    n('retainedEarnings') +
    n('additionalPaidInCapital') +
    n('treasuryStock');
  return {
    ...row,
    tca,
    tcl,
    fixedAssets,
    totalAssets,
    totalLiab,
    totalEquity,
    totalLAndE: totalLiab + totalEquity,
  };
}

function clonePin(src: BakersBsBalances): BakersBsBalances {
  return recomputeBakersBsTotals({ ...src });
}

function addDays(dateKey: string, days: number): string | null {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function applyMovements(
  balances: BakersBsBalances,
  movements?: Map<string, number>,
  sign = 1,
): BakersBsBalances {
  if (!movements) return recomputeBakersBsTotals(balances);
  const next = { ...balances };
  for (const [field, amount] of movements.entries()) {
    if (field === 'totalAssets' || field === 'totalLiab' || field === 'totalEquity' || field === 'totalLAndE' || field === 'tca' || field === 'tcl') {
      continue;
    }
    next[field] = Number(next[field] || 0) + sign * Number(amount || 0);
  }
  return recomputeBakersBsTotals(next);
}

function reclassLocsToLtd(balances: BakersBsBalances): BakersBsBalances {
  const loc = Number(balances.loc || 0);
  return recomputeBakersBsTotals({
    ...balances,
    loc: 0,
    ltd: Number(balances.ltd || 0) + loc,
  });
}

/**
 * Trust the 12/31/2024 and 12/31/2025 PDFs. Walk 2024 backward from the 2024 pin,
 * walk 2025 GL as loc, reclass remaining LOC balances into ltd on 1/1/2026, then
 * walk 2026 GL as ltd.
 */
export function buildBakersAnchoredDailyBalances(
  glMovementsByDate: Map<string, Map<string, number>>,
  throughDate: string,
): Map<string, BakersBsBalances> {
  const out = new Map<string, BakersBsBalances>();
  const end = throughDate >= BAKERS_PIN_START ? throughDate : BAKERS_PIN_START;
  let cursor: string | null = BAKERS_PIN_START;
  let balances = clonePin(BAKERS_PIN_2024_12_31);
  out.set(BAKERS_PIN_START, balances);

  let backBalances = clonePin(BAKERS_PIN_2024_12_31);
  let backCursor: string | null = BAKERS_PIN_START;
  while (backCursor) {
    backBalances = applyMovements(backBalances, glMovementsByDate.get(backCursor), -1);
    backCursor = addDays(backCursor, -1);
    if (!backCursor || backCursor < BAKERS_WALK_START) break;
    out.set(backCursor, backBalances);
  }

  cursor = addDays(BAKERS_PIN_START, 1);
  while (cursor && cursor <= end && cursor < '2025-12-31') {
    balances = applyMovements(balances, glMovementsByDate.get(cursor));
    out.set(cursor, balances);
    cursor = addDays(cursor, 1);
  }

  if (end >= '2025-12-31') {
    balances = clonePin(BAKERS_PIN_2025_12_31);
    out.set('2025-12-31', balances);
  }

  if (end >= BAKERS_LOC_RECLASS_DATE) {
    balances = reclassLocsToLtd(clonePin(BAKERS_PIN_2025_12_31));
    balances = applyMovements(balances, glMovementsByDate.get(BAKERS_LOC_RECLASS_DATE));
    out.set(BAKERS_LOC_RECLASS_DATE, balances);
    cursor = addDays(BAKERS_LOC_RECLASS_DATE, 1);
    while (cursor && cursor <= end) {
      balances = applyMovements(balances, glMovementsByDate.get(cursor));
      out.set(cursor, balances);
      cursor = addDays(cursor, 1);
    }
  }

  return out;
}
