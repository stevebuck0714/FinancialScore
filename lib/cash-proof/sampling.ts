export type SampleSelectionReason =
  | 'RANDOM'
  | 'LATEST'
  | 'FISCAL_YEAR_END'
  | 'UNUSUAL_ACTIVITY'
  | 'EXPANSION'
  | 'MANUAL';

export const SAMPLE_SELECTION_LABELS: Record<SampleSelectionReason, string> = {
  RANDOM: 'Random',
  LATEST: 'Latest month',
  FISCAL_YEAR_END: 'Fiscal year-end',
  UNUSUAL_ACTIVITY: 'Unusual activity',
  EXPANSION: 'Expanded sample',
  MANUAL: 'Added manually',
};

export const DEFAULT_RANDOM_MONTHS = 4;
export const EXPANSION_MONTHS = 3;
const UNUSUAL_Z_SCORE = 2;

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic pick of `count` items: the same seed always yields the same months. */
export function seededPick<T>(items: T[], count: number, seed: string): T[] {
  const rand = mulberry32(hashSeed(seed));
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, count));
}

/** Month with the largest balance swing for one account, when it is a >2σ outlier. */
export function findUnusualMonth(months: string[], balances: Map<string, number> | undefined): string | null {
  if (!balances) return null;
  const changes: Array<{ month: string; change: number }> = [];
  for (let i = 1; i < months.length; i++) {
    const prev = balances.get(months[i - 1]);
    const cur = balances.get(months[i]);
    if (prev === undefined || cur === undefined) continue;
    changes.push({ month: months[i], change: cur - prev });
  }
  if (changes.length < 6) return null;
  const mean = changes.reduce((s, c) => s + c.change, 0) / changes.length;
  const variance = changes.reduce((s, c) => s + (c.change - mean) ** 2, 0) / changes.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return null;
  let best: { month: string; z: number } | null = null;
  for (const c of changes) {
    const z = Math.abs(c.change - mean) / sd;
    if (z > UNUSUAL_Z_SCORE && (!best || z > best.z)) best = { month: c.month, z };
  }
  return best?.month ?? null;
}

/**
 * Months to request statements for. Applied to every included account so
 * the client pulls one consistent set of months from each bank.
 */
export function selectSampleMonths(input: {
  months: string[];
  fiscalYearEndMonth: number;
  balancesByAccount: Array<Map<string, number> | undefined>;
  seed: string;
  randomCount?: number;
}): Array<{ month: string; reason: SampleSelectionReason }> {
  const { months, fiscalYearEndMonth, balancesByAccount, seed } = input;
  const picked = new Map<string, SampleSelectionReason>();
  if (months.length === 0) return [];

  picked.set(months[months.length - 1], 'LATEST');
  const fyeSuffix = `-${String(fiscalYearEndMonth).padStart(2, '0')}`;
  for (const month of months) {
    if (month.endsWith(fyeSuffix) && !picked.has(month)) picked.set(month, 'FISCAL_YEAR_END');
  }
  for (const balances of balancesByAccount) {
    const unusual = findUnusualMonth(months, balances);
    if (unusual && !picked.has(unusual)) picked.set(unusual, 'UNUSUAL_ACTIVITY');
  }
  const remaining = months.filter((m) => !picked.has(m));
  for (const month of seededPick(remaining, input.randomCount ?? DEFAULT_RANDOM_MONTHS, seed)) {
    picked.set(month, 'RANDOM');
  }
  return [...picked.entries()]
    .map(([month, reason]) => ({ month, reason }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Additional months after an exception: 3 more, or everything left if fewer remain. */
export function selectExpansionMonths(months: string[], alreadySampled: Set<string>, seed: string): string[] {
  const remaining = months.filter((m) => !alreadySampled.has(m));
  return seededPick(remaining, EXPANSION_MONTHS, `${seed}:expand:${alreadySampled.size}`).sort();
}
