import prisma from '@/lib/prisma';
import { formatEstDate, utcMidnightForEstDate } from '@/lib/time/eastern';
import { ensureCompanyItemDutyTable, normalizeHtsCode, type TradeProgram } from '@/lib/hts/item-duty-overlay';
import {
  additionalAppliesToOrigin,
  extract9903Codes,
  fetchUsitcReleaseList,
  isChinaOrigin,
  lookupChapter99Measure,
  lookupOriginChapter99Measures,
  lookupUsitcScheduleLine,
  parseAdValoremPct,
  parseSpecialPct,
  pickReleaseForDate,
  type Chapter99Measure,
  type UsitcHtsLine,
} from '@/lib/hts/usitc-reststop';
import { fetchUstrSection301Index, lookupUstrSection301, type UstrSection301Hit } from '@/lib/hts/ustr-section-301';
import {
  ensureHtsRateQuoteTable,
  getHtsRateQuote,
  upsertHtsRateQuote,
  type HtsRateQuoteRow,
} from '@/lib/hts/rate-quotes';

const ORIGIN_SCAN_MARK = 'origin-scan';

export type RefreshDutyRatesResult = {
  asOfDate: string;
  releaseName: string | null;
  releaseTitle: string | null;
  lookedUp: number;
  reused: number;
  fetched: number;
  updated: number;
  skipped: number;
  failed: Array<{ htsCode: string; error: string }>;
};

function quoteKey(htsCode: string, originCountry: string, tradeProgram: string): string {
  return `${htsCode}|${originCountry}|${tradeProgram}`;
}

function extrasWereResolved(quote: HtsRateQuoteRow): boolean {
  const text = String(quote.additionalDutiesText || '').trim().toLowerCase();
  return text.includes(ORIGIN_SCAN_MARK);
}

function quoteLooksPopulated(quote: HtsRateQuoteRow, expectedReleaseName: string | null): boolean {
  const hasColumn1 =
    quote.dutyRatePct != null || quote.specialRatePct != null || Boolean(quote.dutyRateText) || Boolean(quote.specialRateText);
  // A tariff revision can change after a quote was cached for the same
  // calendar date. Never reuse an older release when USITC has identified
  // the release that applies to the selected as-of date.
  const matchesRelease = !expectedReleaseName || quote.releaseName === expectedReleaseName;
  return matchesRelease && hasColumn1 && Boolean(quote.htsDescription) && extrasWereResolved(quote);
}

function originKey(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase();
}

function sumPct(...values: Array<number | null | undefined>): number {
  return values.reduce<number>((sum, value) => sum + (value == null || !Number.isFinite(value) ? 0 : Number(value)), 0);
}

async function resolveQuoteFromUsitc(params: {
  htsCode: string;
  originCountry: string;
  tradeProgram: TradeProgram;
  asOfDate: string;
  releaseName: string | null;
  chapter99Cache: Map<string, Chapter99Measure | null>;
  searchCache: Map<string, UsitcHtsLine[]>;
  originMeasureCache: Map<string, Chapter99Measure[]>;
  ustrIndex: Map<string, UstrSection301Hit> | null;
}): Promise<HtsRateQuoteRow> {
  const lookup = await lookupUsitcScheduleLine(params.htsCode, params.releaseName, params.searchCache);
  const line = lookup.line;
  if (!line) {
    throw new Error(`No USITC schedule line for ${params.htsCode}`);
  }

  const dutyRateText = String(line.general || '').trim() || null;
  const specialRateText = String(line.special || '').trim() || null;
  const htsDescription = String(line.description || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null;
  const footnoteText = (line.footnotes || []).map((note) => note.value).join(' ');
  const dutyRatePct = parseAdValoremPct(dutyRateText);
  const specialRatePct = parseSpecialPct(specialRateText, params.tradeProgram, dutyRatePct);

  const extraCodes = new Set(
    extract9903Codes(line.additionalDuties, footnoteText, dutyRateText, specialRateText, line.other)
  );
  const chinaOrigin = isChinaOrigin(params.originCountry);
  const ustrHit = chinaOrigin ? lookupUstrSection301(params.htsCode, params.ustrIndex) : null;
  for (const code of ustrHit?.chapter99Codes || []) extraCodes.add(code);

  const buckets: Record<Chapter99Measure['bucket'], number | null> = {
    section301: null,
    section232: null,
    ieepa: null,
    additional: null,
  };

  for (const code of extraCodes) {
    const cacheKey = `${params.releaseName || ''}::${code}`;
    if (!params.chapter99Cache.has(cacheKey)) {
      params.chapter99Cache.set(cacheKey, await lookupChapter99Measure(code, params.releaseName, params.searchCache));
    }
    const measure = params.chapter99Cache.get(cacheKey) || null;
    if (!measure || measure.ratePct == null) continue;
    if (measure.bucket === 'section301' && !chinaOrigin) continue;
    if (!additionalAppliesToOrigin(params.originCountry, measure.description)) continue;
    buckets[measure.bucket] = (buckets[measure.bucket] || 0) + measure.ratePct;
  }

  const originCacheKey = `${params.releaseName || ''}::${params.originCountry || ''}`;
  if (!params.originMeasureCache.has(originCacheKey)) {
    params.originMeasureCache.set(
      originCacheKey,
      await lookupOriginChapter99Measures(params.originCountry, params.releaseName, params.searchCache)
    );
  }
  const appliedDigits = new Set([...extraCodes].map((code) => String(code).replace(/\D/g, '')));
  for (const measure of params.originMeasureCache.get(originCacheKey) || []) {
    if (!measure.ratePct || measure.ratePct <= 0) continue;
    if (measure.bucket === 'section301' && !chinaOrigin) continue;
    const digits = String(measure.htsno || '').replace(/\D/g, '');
    if (digits && appliedDigits.has(digits)) continue;
    extraCodes.add(measure.htsno);
    appliedDigits.add(digits);
    buckets[measure.bucket] = (buckets[measure.bucket] || 0) + measure.ratePct;
  }

  if (ustrHit && ustrHit.ratePct != null && chinaOrigin) {
    if (ustrHit.source === 'four_year_review' || buckets.section301 == null) {
      buckets.section301 = ustrHit.ratePct;
    }
  }

  const tariffRatePct = sumPct(buckets.section301, buckets.section232, buckets.ieepa, buckets.additional);
  const extraNotes = [
    line.additionalDuties,
    footnoteText,
    ustrHit
      ? `USTR ${ustrHit.actionDescription}${ustrHit.chapter99Codes.length ? ` (${ustrHit.chapter99Codes.join(', ')})` : ''}`
      : null,
    extraCodes.size ? [...extraCodes].join(', ') : null,
    ORIGIN_SCAN_MARK,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const additionalDutiesText = extraNotes.join(' ').trim();

  return upsertHtsRateQuote({
    htsCode: params.htsCode,
    originCountry: params.originCountry,
    tradeProgram: params.tradeProgram,
    asOfDate: params.asOfDate,
    releaseName: params.releaseName,
    htsDescription,
    dutyRatePct,
    specialRatePct,
    section301RatePct: buckets.section301,
    section232RatePct: buckets.section232,
    ieepaRatePct: buckets.ieepa,
    additionalRatePct: buckets.additional,
    tariffRatePct,
    dutyRateText,
    specialRateText,
    additionalDutiesText,
    unit1: Array.isArray(line.units) ? line.units[0] || null : null,
  });
}

export async function refreshCompanyItemDutyRates(
  companyId: string,
  asOfDateInput?: string | null
): Promise<RefreshDutyRatesResult> {
  await ensureCompanyItemDutyTable();
  await ensureHtsRateQuoteTable();
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(String(asOfDateInput || '').trim())
    ? String(asOfDateInput).trim()
    : formatEstDate();

  let release: Awaited<ReturnType<typeof pickReleaseForDate>> = null;
  try {
    const releases = await fetchUsitcReleaseList();
    release = pickReleaseForDate(releases, asOfDate);
  } catch (error) {
    console.warn('USITC release list unavailable; searching current schedule.', error);
  }
  const items = await prisma.$queryRaw<
    Array<{
      id: string;
      htsCode: string | null;
      specialHtsCode: string | null;
      section301HtsCode: string | null;
      section232HtsCode: string | null;
      ieepaHtsCode: string | null;
      additionalHtsCode: string | null;
      countryOfOrigin: string | null;
      tradeProgram: string | null;
      enteredValuePerPiece: number | null;
    }>
  >`
    SELECT "id", "htsCode", "specialHtsCode", "section301HtsCode", "section232HtsCode", "ieepaHtsCode", "additionalHtsCode", "countryOfOrigin", "tradeProgram", "enteredValuePerPiece"
    FROM "CompanyItemDuty"
    WHERE "companyId" = ${companyId}
      AND (
        COALESCE(NULLIF("htsCode", ''), '') <> ''
        OR COALESCE(NULLIF("specialHtsCode", ''), '') <> ''
        OR COALESCE(NULLIF("section301HtsCode", ''), '') <> ''
        OR COALESCE(NULLIF("section232HtsCode", ''), '') <> ''
        OR COALESCE(NULLIF("ieepaHtsCode", ''), '') <> ''
        OR COALESCE(NULLIF("additionalHtsCode", ''), '') <> ''
      )
  `;

  const unique = new Map<string, { htsCode: string; originCountry: string; tradeProgram: TradeProgram }>();
  for (const item of items) {
    const originCountry = originKey(item.countryOfOrigin);
    const tradeProgram = (item.tradeProgram === 'usmca' || item.tradeProgram === 'other' ? item.tradeProgram : 'none') as TradeProgram;
    for (const rawCode of [
      item.htsCode,
      item.specialHtsCode,
      item.section301HtsCode,
      item.section232HtsCode,
      item.ieepaHtsCode,
      item.additionalHtsCode,
    ]) {
      const htsCode = normalizeHtsCode(rawCode);
      if (htsCode) unique.set(quoteKey(htsCode, originCountry, tradeProgram), { htsCode, originCountry, tradeProgram });
    }
  }

  const quotes = new Map<string, HtsRateQuoteRow>();
  const failed: RefreshDutyRatesResult['failed'] = [];
  const chapter99Cache = new Map<string, Chapter99Measure | null>();
  const searchCache = new Map<string, UsitcHtsLine[]>();
  const originMeasureCache = new Map<string, Chapter99Measure[]>();
  let ustrIndex: Map<string, UstrSection301Hit> | null = null;
  try {
    ustrIndex = await fetchUstrSection301Index();
  } catch (error) {
    console.warn('USTR Section 301 list unavailable; Column 1 rates will still refresh.', error);
  }
  let reused = 0;
  let fetched = 0;

  for (const [key, identity] of unique) {
    try {
      const existing = await getHtsRateQuote({
        htsCode: identity.htsCode,
        originCountry: identity.originCountry,
        tradeProgram: identity.tradeProgram,
        asOfDate,
      });
      if (existing && quoteLooksPopulated(existing, release?.name || null)) {
        quotes.set(key, existing);
        reused += 1;
        continue;
      }
      const quote = await resolveQuoteFromUsitc({
        ...identity,
        asOfDate,
        releaseName: release?.name || null,
        chapter99Cache,
        searchCache,
        originMeasureCache,
        ustrIndex,
      });
      quotes.set(key, quote);
      fetched += 1;
    } catch (error) {
      failed.push({
        htsCode: identity.htsCode,
        error: error instanceof Error ? error.message : 'USITC lookup failed',
      });
    }
  }

  let updated = 0;
  const asOfTimestamp = utcMidnightForEstDate(asOfDate);
  for (const item of items) {
    const originCountry = originKey(item.countryOfOrigin);
    const tradeProgram = (item.tradeProgram === 'usmca' || item.tradeProgram === 'other' ? item.tradeProgram : 'none') as TradeProgram;
    const quoteFor = (rawCode: string | null, fallbackCode: string | null) => {
      const htsCode = normalizeHtsCode(rawCode || fallbackCode);
      return htsCode ? quotes.get(quoteKey(htsCode, originCountry, tradeProgram)) || null : null;
    };
    const dutyQuote = quoteFor(item.htsCode, null);
    const specialQuote = quoteFor(item.specialHtsCode, item.htsCode);
    const section301Quote = quoteFor(item.section301HtsCode, item.htsCode);
    const section232Quote = quoteFor(item.section232HtsCode, item.htsCode);
    const ieepaQuote = quoteFor(item.ieepaHtsCode, item.htsCode);
    const additionalQuote = quoteFor(item.additionalHtsCode, item.htsCode);
    if (!dutyQuote && !specialQuote && !section301Quote && !section232Quote && !ieepaQuote && !additionalQuote) continue;
    const tariffHtsCode = Array.from(new Set([
      ...extract9903Codes(dutyQuote?.additionalDutiesText),
      item.section301HtsCode,
      item.section232HtsCode,
      item.ieepaHtsCode,
      item.additionalHtsCode,
    ].map((code) => String(code || '').trim()).filter(Boolean))).join(', ') || null;
    const dutyPct = tradeProgram === 'usmca' ? dutyQuote?.specialRatePct : dutyQuote?.dutyRatePct;
    const specialPct = specialQuote?.specialRatePct ?? null;
    const section301Pct = section301Quote?.section301RatePct ?? null;
    const section232Pct = section232Quote?.section232RatePct ?? null;
    const ieepaPct = ieepaQuote?.ieepaRatePct ?? null;
    const additionalPct = additionalQuote?.additionalRatePct ?? null;
    const tariffPct = sumPct(section301Pct, section232Pct, ieepaPct, additionalPct);
    const value = item.enteredValuePerPiece == null ? null : Number(item.enteredValuePerPiece);
    const dutyPerPiece = value == null || dutyPct == null ? null : Number((value * dutyPct) / 100);
    const tariffPerPiece = value == null || tariffPct == null ? null : Number((value * tariffPct) / 100);
    await prisma.$executeRaw`
      UPDATE "CompanyItemDuty"
      SET
        "dutyRatePct" = ${dutyQuote?.dutyRatePct ?? null},
        "specialRatePct" = ${specialPct},
        "section301RatePct" = ${section301Pct},
        "section232RatePct" = ${section232Pct},
        "ieepaRatePct" = ${ieepaPct},
        "additionalRatePct" = ${additionalPct},
        "tariffRatePct" = ${tariffPct},
        "tariffHtsCode" = ${tariffHtsCode},
        "dutyDescription" = ${dutyQuote?.htsDescription ?? null},
        "dutyPerPiece" = ${dutyPerPiece},
        "tariffPerPiece" = ${tariffPerPiece},
        "rateSource" = 'hts',
        "lastRateFetchedAt" = NOW(),
        "lastRateAsOfDate" = ${asOfTimestamp},
        "lastRateReleaseName" = ${release?.name || null},
        "updatedAt" = NOW()
      WHERE "id" = ${item.id}
    `;
    updated += 1;
  }

  return {
    asOfDate,
    releaseName: release?.name || null,
    releaseTitle: release?.title || null,
    lookedUp: unique.size,
    reused,
    fetched,
    updated,
    skipped: items.length - updated,
    failed,
  };
}
