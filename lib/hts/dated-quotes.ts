import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { ensureHtsRateQuoteTable, type HtsRateQuoteRow } from '@/lib/hts/rate-quotes';

export function htsQuoteIdentityKey(htsCode: string, originCountry: string, tradeProgram: string): string {
  return `${htsCode}|${String(originCountry || '').trim().toUpperCase()}|${tradeProgram || 'none'}`;
}

function asYmd(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

type QuoteDbRow = {
  id: string;
  htsCode: string;
  originCountry: string;
  tradeProgram: string;
  asOfDate: Date;
  releaseName: string | null;
  dutyRatePct: number | null;
  specialRatePct: number | null;
  section301RatePct: number | null;
  section232RatePct: number | null;
  ieepaRatePct: number | null;
  additionalRatePct: number | null;
  tariffRatePct: number | null;
  dutyRateText: string | null;
  specialRateText: string | null;
  additionalDutiesText: string | null;
  fetchedAt: Date;
};

function serializeQuote(row: QuoteDbRow): HtsRateQuoteRow {
  return {
    id: row.id,
    htsCode: row.htsCode,
    originCountry: row.originCountry,
    tradeProgram: row.tradeProgram,
    asOfDate: asYmd(row.asOfDate),
    releaseName: row.releaseName,
    dutyRatePct: row.dutyRatePct == null ? null : Number(row.dutyRatePct),
    specialRatePct: row.specialRatePct == null ? null : Number(row.specialRatePct),
    section301RatePct: row.section301RatePct == null ? null : Number(row.section301RatePct),
    section232RatePct: row.section232RatePct == null ? null : Number(row.section232RatePct),
    ieepaRatePct: row.ieepaRatePct == null ? null : Number(row.ieepaRatePct),
    additionalRatePct: row.additionalRatePct == null ? null : Number(row.additionalRatePct),
    tariffRatePct: row.tariffRatePct == null ? null : Number(row.tariffRatePct),
    dutyRateText: row.dutyRateText,
    specialRateText: row.specialRateText,
    additionalDutiesText: row.additionalDutiesText,
    fetchedAt: row.fetchedAt?.toISOString?.() || new Date().toISOString(),
  };
}

export function pickQuoteOnOrBefore(
  quotes: HtsRateQuoteRow[],
  asOfDate: string
): HtsRateQuoteRow | null {
  if (!asOfDate || !quotes.length) return null;
  let chosen: HtsRateQuoteRow | null = null;
  for (const quote of quotes) {
    if (quote.asOfDate <= asOfDate) chosen = quote;
    else break;
  }
  return chosen;
}

/** Prefer a quote dated on or before the event. If none was fetched yet, use the earliest stored snapshot. */
export function pickQuoteForEventDate(
  quotes: HtsRateQuoteRow[],
  eventDate: string | null
): HtsRateQuoteRow | null {
  if (!quotes.length) return null;
  if (!eventDate) return quotes[quotes.length - 1] || null;
  return pickQuoteOnOrBefore(quotes, eventDate) || quotes[0] || null;
}

export async function loadHtsQuotesByIdentity(
  htsCodes: string[]
): Promise<Map<string, HtsRateQuoteRow[]>> {
  await ensureHtsRateQuoteTable();
  const unique = Array.from(new Set(htsCodes.map((code) => String(code || '').trim()).filter(Boolean)));
  const byIdentity = new Map<string, HtsRateQuoteRow[]>();
  if (!unique.length) return byIdentity;

  const rows = await prisma.$queryRaw<QuoteDbRow[]>`
    SELECT
      "id", "htsCode", "originCountry", "tradeProgram", "asOfDate", "releaseName",
      "dutyRatePct", "specialRatePct", "section301RatePct", "section232RatePct", "ieepaRatePct",
      "additionalRatePct", "tariffRatePct", "dutyRateText", "specialRateText", "additionalDutiesText", "fetchedAt"
    FROM "HtsRateQuote"
    WHERE "htsCode" IN (${Prisma.join(unique)})
    ORDER BY "htsCode" ASC, "originCountry" ASC, "tradeProgram" ASC, "asOfDate" ASC
  `;

  for (const row of rows) {
    const quote = serializeQuote(row);
    const key = htsQuoteIdentityKey(quote.htsCode, quote.originCountry, quote.tradeProgram);
    const list = byIdentity.get(key);
    if (list) list.push(quote);
    else byIdentity.set(key, [quote]);
  }
  return byIdentity;
}
