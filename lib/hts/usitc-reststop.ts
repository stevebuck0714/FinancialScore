const USITC_BASE = 'https://hts.usitc.gov/reststop';
const USER_AGENT = 'Corelytics-DutiesTariffs/1.0';

export type UsitcHtsLine = {
  htsno?: string;
  description?: string;
  indent?: string;
  general?: string;
  special?: string;
  other?: string;
  additionalDuties?: string | null;
  units?: string[] | null;
  footnotes?: Array<{ columns?: string[]; marker?: string; value?: string; type?: string }>;
};

export type UsitcRelease = {
  name: string;
  title: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
};

export type Chapter99Measure = {
  htsno: string;
  description: string;
  ratePct: number | null;
  rateText: string;
  bucket: 'section301' | 'section232' | 'ieepa' | 'additional';
};

async function usitcGet(path: string): Promise<unknown> {
  const response = await fetch(`${USITC_BASE}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`USITC ${response.status} for ${path}: ${body.slice(0, 180)}`);
  }
  return response.json();
}

function stripHtml(value: unknown): string {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function htsDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

export function formatHtsFromDigits(digits: string): string {
  const d = htsDigits(digits);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  if (d.length <= 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}.${d.slice(8, 10)}`;
}

export function heading8Digits(htsCode: string): string | null {
  const digits = htsDigits(htsCode);
  if (digits.length < 8) return null;
  return digits.slice(0, 8);
}

export function isChinaOrigin(origin: string | null | undefined): boolean {
  const code = String(origin || '').trim().toUpperCase();
  if (!code) return false;
  if (code === 'CN' || code === 'CHN' || code === 'PRC') return true;
  if (code === 'CH') return false;
  return /\bCHINA\b|\bCHINESE\b|PEOPLE'?S REPUBLIC OF CHINA/.test(code);
}

function parseUsitcMdY(raw: unknown): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(raw || '').trim());
  if (!match) return null;
  return `${match[3]}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
}

export function parseAdValoremPct(raw: unknown): number | null {
  const text = stripHtml(raw);
  if (!text) return null;
  if (/^free\b/i.test(text)) return 0;
  const percents = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((match) => Number(match[1]));
  const usable = percents.filter((value) => Number.isFinite(value));
  if (!usable.length) return null;
  return usable.reduce((sum, value) => sum + value, 0);
}

function hasScheduleRate(line: UsitcHtsLine | null | undefined): boolean {
  if (!line) return false;
  return Boolean(stripHtml(line.general) || stripHtml(line.special) || stripHtml(line.other));
}

export function parseSpecialPct(
  raw: unknown,
  program: 'none' | 'usmca' | 'other',
  fallback: number | null
): number | null {
  const text = stripHtml(raw);
  if (!text) return fallback;
  const grouped = text.match(/^([^()]*)\(([^)]*)\)\s*$/);
  const ratePart = (grouped ? grouped[1] : text).trim();
  const programs = grouped ? grouped[2] : '';
  const pct = parseAdValoremPct(ratePart);
  if (program !== 'usmca') return pct ?? fallback;
  if (!grouped) return pct ?? fallback;
  const tokens = programs.split(/[,;]/).map((token) => token.trim().toUpperCase());
  if (tokens.some((token) => ['S', 'MX', 'CA', 'USMCA'].includes(token))) return pct ?? 0;
  return fallback;
}

export function extract9903Codes(...texts: unknown[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    const matches = stripHtml(text).matchAll(/9903(?:\.\d{2}){1,3}/g);
    for (const match of matches) found.add(formatHtsFromDigits(htsDigits(match[0])));
  }
  return [...found];
}

export function classify9903(htsno: string, description: string): Chapter99Measure['bucket'] {
  const digits = htsDigits(htsno);
  const desc = description.toLowerCase();
  if (digits.startsWith('990388') || digits.startsWith('990391') || digits.startsWith('990392') || /section 301|\b301\b/.test(desc)) {
    return 'section301';
  }
  if (
    digits.startsWith('990380') ||
    digits.startsWith('990381') ||
    digits.startsWith('990385') ||
    digits.startsWith('990376') ||
    /section 232|\b232\b/.test(desc)
  ) {
    return 'section232';
  }
  if (digits.startsWith('990301') || digits.startsWith('990302') || /ieepa|international emergency/.test(desc)) {
    return 'ieepa';
  }
  return 'additional';
}

const ORIGIN_HINTS: Array<{ codes: string[]; hints: string[] }> = [
  { codes: ['CN'], hints: ['china', 'chinese', "people's republic of china", 'prc'] },
  { codes: ['HK'], hints: ['hong kong'] },
  { codes: ['TW'], hints: ['taiwan', 'chinese taipei'] },
  { codes: ['RU'], hints: ['russian federation', 'russia'] },
  { codes: ['CA'], hints: ['canada', 'canadian'] },
  { codes: ['MX'], hints: ['mexico', 'mexican'] },
  { codes: ['IN'], hints: ['india', 'indian'] },
  { codes: ['VN'], hints: ['vietnam', 'vietnamese'] },
  { codes: ['JP'], hints: ['japan', 'japanese'] },
  { codes: ['KR'], hints: ['korea', 'korean', 'republic of korea'] },
  { codes: ['ID'], hints: ['indonesia', 'indonesian'] },
  { codes: ['DE'], hints: ['germany', 'german'] },
];

function titleCaseHint(hint: string): string {
  return hint.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function originSearchKeyword(origin: string | null | undefined): string | null {
  const code = String(origin || '').trim().toUpperCase();
  if (!code) return null;
  const entry = ORIGIN_HINTS.find(
    (row) => row.codes.includes(code) || row.hints.some((hint) => code === hint.toUpperCase() || code.includes(hint.toUpperCase()))
  );
  if (entry) return titleCaseHint(entry.hints[0]);
  if (code.length > 3) return titleCaseHint(code.toLowerCase());
  return null;
}

function compilerNoteInactive(description: string): boolean {
  return /compiler'?s note:\s*provision\s+(terminated|suspended|expired)/i.test(description);
}

function isCountrywideIeepaHeading(line: UsitcHtsLine): boolean {
  const digits = htsDigits(line.htsno);
  if (!digits.startsWith('990301') && !digits.startsWith('990302')) return false;
  const description = stripHtml(line.description);
  const rateText = stripHtml(line.general);
  if (compilerNoteInactive(description)) return false;
  if (!/articles the product of/i.test(description)) return false;
  if (!/\+|plus/i.test(rateText)) return false;
  if (parseAdValoremPct(rateText) == null) return false;
  return true;
}

export function additionalAppliesToOrigin(origin: string | null | undefined, description: string): boolean {
  const desc = description.toLowerCase();
  const originCode = String(origin || '').trim().toUpperCase();
  const mentioned = ORIGIN_HINTS.filter((entry) => entry.hints.some((hint) => desc.includes(hint)));
  if (!mentioned.length) return true;
  if (!originCode) return false;
  return mentioned.some(
    (entry) => entry.codes.includes(originCode) || entry.hints.some((hint) => originCode.includes(hint.toUpperCase()))
  );
}

export async function fetchUsitcReleaseList(): Promise<UsitcRelease[]> {
  const payload = (await usitcGet('/releaseList')) as Array<Record<string, unknown>>;
  if (!Array.isArray(payload)) return [];
  return payload.map((row) => ({
    name: String(row.name || '').trim(),
    title: String(row.title || row.description || row.name || '').trim(),
    status: String(row.status || '').trim().toLowerCase(),
    startDate: parseUsitcMdY(row.releaseStartDate || row.target),
    endDate: parseUsitcMdY(row.releaseEndDate),
  })).filter((row) => row.name);
}

export function pickReleaseForDate(releases: UsitcRelease[], asOfDate: string): UsitcRelease | null {
  const current = releases.find((row) => row.status === 'current') || releases[0] || null;
  const dated = releases.filter((row) => row.startDate);
  const covering = dated.find((row) => {
    if (!row.startDate) return false;
    if (asOfDate < row.startDate) return false;
    if (row.endDate && asOfDate >= row.endDate) return false;
    return true;
  });
  return covering || current;
}

export async function searchUsitcHts(
  keyword: string,
  releaseName?: string | null,
  cache?: Map<string, UsitcHtsLine[]>
): Promise<UsitcHtsLine[]> {
  const cacheKey = `${releaseName || ''}::${keyword}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey) || [];
  const query = `?keyword=${encodeURIComponent(keyword)}${releaseName ? `&release=${encodeURIComponent(releaseName)}` : ''}`;
  const payload = await usitcGet(`/search${query}`);
  const lines = Array.isArray(payload) ? (payload as UsitcHtsLine[]) : [];
  cache?.set(cacheKey, lines);
  return lines;
}

function parentKeywords(htsCode: string): string[] {
  const digits = htsDigits(htsCode);
  const lengths = [digits.length, 8, 6, 4].filter((len, index, all) => len >= 4 && all.indexOf(len) === index);
  return [...new Set(lengths.map((len) => formatHtsFromDigits(digits.slice(0, len))))];
}

function pickBestLine(lines: UsitcHtsLine[], targetDigits: string): UsitcHtsLine | null {
  const withRates = lines.filter((line) => hasScheduleRate(line) && targetDigits.startsWith(htsDigits(line.htsno)));
  withRates.sort((left, right) => htsDigits(right.htsno).length - htsDigits(left.htsno).length);
  if (withRates[0]) return withRates[0];
  return lines.find((line) => htsDigits(line.htsno) === targetDigits) || null;
}

export async function lookupUsitcScheduleLine(
  htsCode: string,
  releaseName?: string | null,
  cache?: Map<string, UsitcHtsLine[]>
): Promise<{ line: UsitcHtsLine | null; searched: string[] }> {
  const targetDigits = htsDigits(htsCode);
  const searched: string[] = [];
  const collected: UsitcHtsLine[] = [];
  for (const keyword of parentKeywords(htsCode)) {
    searched.push(keyword);
    const lines = await searchUsitcHts(keyword, releaseName, cache);
    collected.push(...lines);
    const best = pickBestLine(collected, targetDigits);
    if (best && hasScheduleRate(best)) return { line: best, searched };
  }
  return { line: pickBestLine(collected, targetDigits), searched };
}

export async function lookupChapter99Measure(
  htsno: string,
  releaseName?: string | null,
  cache?: Map<string, UsitcHtsLine[]>
): Promise<Chapter99Measure | null> {
  const lines = await searchUsitcHts(htsno, releaseName, cache);
  const line = pickBestLine(lines, htsDigits(htsno));
  if (!line) return null;
  const description = stripHtml(line.description);
  const rateText = stripHtml(line.general) || stripHtml(line.other) || stripHtml(line.special);
  return {
    htsno: String(line.htsno || htsno),
    description,
    ratePct: parseAdValoremPct(rateText),
    rateText,
    bucket: classify9903(String(line.htsno || htsno), description),
  };
}

export async function lookupOriginChapter99Measures(
  origin: string | null | undefined,
  releaseName?: string | null,
  cache?: Map<string, UsitcHtsLine[]>
): Promise<Chapter99Measure[]> {
  const keyword = originSearchKeyword(origin);
  if (!keyword) return [];
  const lines = await searchUsitcHts(keyword, releaseName, cache);
  const measures: Chapter99Measure[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (!isCountrywideIeepaHeading(line)) continue;
    const description = stripHtml(line.description);
    if (!additionalAppliesToOrigin(origin, description)) continue;
    const htsno = String(line.htsno || '').trim();
    const digits = htsDigits(htsno);
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    const rateText = stripHtml(line.general);
    measures.push({
      htsno,
      description,
      ratePct: parseAdValoremPct(rateText),
      rateText,
      bucket: classify9903(htsno, description),
    });
  }
  return measures;
}
