import { heading8Digits, htsDigits, parseAdValoremPct } from '@/lib/hts/usitc-reststop';

const USTR_301_JSON_URL = 'https://ustr.gov/themes/custom/ustr2021/tariff/hts_new.json';
const USER_AGENT = 'Corelytics-DutiesTariffs/1.0';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type UstrSection301Hit = {
  heading8: string;
  description: string;
  actionDescription: string;
  note: string;
  ratePct: number | null;
  chapter99Codes: string[];
  source: 'four_year_review' | 'list_modification' | 'list_action';
};

type UstrJsonRow = {
  HTS_id?: unknown;
  description?: unknown;
  action_description?: unknown;
  note?: unknown;
};

let cached: { fetchedAt: number; byHeading8: Map<string, UstrSection301Hit> } | null = null;
let inflight: Promise<Map<string, UstrSection301Hit>> | null = null;

export function parseUstrActionRate(actionDescription: string): number | null {
  return parseAdValoremPct(actionDescription);
}

export function ustrListTo9903Codes(actionDescription: string): string[] {
  const text = String(actionDescription || '').toLowerCase();
  if (text.includes('four-year')) return [];
  if (/\blist\s*1\b/.test(text)) return ['9903.88.01'];
  if (/\blist\s*2\b/.test(text)) return ['9903.88.02'];
  if (/\blist\s*3\b/.test(text)) return ['9903.88.03'];
  if (/\blist\s*4\b/.test(text)) return ['9903.88.15'];
  return [];
}

function actionSource(actionDescription: string): UstrSection301Hit['source'] {
  const text = String(actionDescription || '').toLowerCase();
  if (text.includes('four-year')) return 'four_year_review';
  if (text.includes('modification')) return 'list_modification';
  return 'list_action';
}

function sourceScore(source: UstrSection301Hit['source']): number {
  if (source === 'four_year_review') return 3;
  if (source === 'list_modification') return 2;
  return 1;
}

function isDeletedNote(note: string): boolean {
  return /deleted from the hts/i.test(note);
}

export function pickUstrSection301Record(rows: UstrSection301Hit[]): UstrSection301Hit | null {
  const usable = rows.filter((row) => !isDeletedNote(row.note) && row.ratePct != null);
  const pool = usable.length ? usable : rows.filter((row) => row.ratePct != null);
  if (!pool.length) return null;
  return pool.slice().sort((left, right) => sourceScore(right.source) - sourceScore(left.source))[0] || null;
}

function toHit(row: UstrJsonRow): UstrSection301Hit | null {
  const heading8 = heading8Digits(String(row.HTS_id ?? '')) || htsDigits(row.HTS_id);
  if (heading8.length !== 8) return null;
  const actionDescription = String(row.action_description || '').trim();
  if (!actionDescription) return null;
  return {
    heading8,
    description: String(row.description || '').trim(),
    actionDescription,
    note: String(row.note || '').trim(),
    ratePct: parseUstrActionRate(actionDescription),
    chapter99Codes: ustrListTo9903Codes(actionDescription),
    source: actionSource(actionDescription),
  };
}

async function loadUstrSection301Index(): Promise<Map<string, UstrSection301Hit>> {
  const response = await fetch(USTR_301_JSON_URL, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`USTR 301 list ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  const rows = Array.isArray(payload) ? payload : [];
  const grouped = new Map<string, UstrSection301Hit[]>();
  for (const row of rows) {
    const hit = toHit(row as UstrJsonRow);
    if (!hit) continue;
    const list = grouped.get(hit.heading8) || [];
    list.push(hit);
    grouped.set(hit.heading8, list);
  }
  const byHeading8 = new Map<string, UstrSection301Hit>();
  for (const [heading8, hits] of grouped) {
    const picked = pickUstrSection301Record(hits);
    if (picked) byHeading8.set(heading8, picked);
  }
  return byHeading8;
}

export async function fetchUstrSection301Index(): Promise<Map<string, UstrSection301Hit>> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.byHeading8;
  if (!inflight) {
    inflight = loadUstrSection301Index()
      .then((byHeading8) => {
        cached = { fetchedAt: Date.now(), byHeading8 };
        return byHeading8;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function lookupUstrSection301(
  htsCode: string,
  index: Map<string, UstrSection301Hit> | null | undefined
): UstrSection301Hit | null {
  const heading8 = heading8Digits(htsCode);
  if (!heading8 || !index) return null;
  return index.get(heading8) || null;
}
