import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { utcMidnightForEstDate } from '@/lib/time/eastern';

export type HtsRateQuoteRow = {
  id: string;
  htsCode: string;
  originCountry: string;
  tradeProgram: string;
  asOfDate: string;
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
  fetchedAt: string;
};

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

let ensureOnce: Promise<void> | null = null;

export async function ensureHtsRateQuoteTable(): Promise<void> {
  if (!ensureOnce) {
    ensureOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "HtsRateQuote" (
          "id" TEXT NOT NULL,
          "htsCode" TEXT NOT NULL,
          "originCountry" TEXT NOT NULL DEFAULT '',
          "tradeProgram" TEXT NOT NULL DEFAULT 'none',
          "asOfDate" TIMESTAMP(3) NOT NULL,
          "releaseName" TEXT,
          "dutyRatePct" DOUBLE PRECISION,
          "specialRatePct" DOUBLE PRECISION,
          "section301RatePct" DOUBLE PRECISION,
          "section232RatePct" DOUBLE PRECISION,
          "ieepaRatePct" DOUBLE PRECISION,
          "additionalRatePct" DOUBLE PRECISION,
          "tariffRatePct" DOUBLE PRECISION,
          "dutyRateText" TEXT,
          "specialRateText" TEXT,
          "additionalDutiesText" TEXT,
          "unit1" TEXT,
          "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "HtsRateQuote_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "HtsRateQuote_hts_origin_program_date_key"
          ON "HtsRateQuote"("htsCode", "originCountry", "tradeProgram", "asOfDate")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "HtsRateQuote_asOfDate_idx"
          ON "HtsRateQuote"("asOfDate")
      `);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "lastRateAsOfDate" TIMESTAMP(3)`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "CompanyItemDuty" ADD COLUMN IF NOT EXISTS "lastRateReleaseName" TEXT`);
    })().catch((error) => {
      ensureOnce = null;
      throw error;
    });
  }
  await ensureOnce;
}

function asYmd(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

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

export async function getHtsRateQuote(params: {
  htsCode: string;
  originCountry: string;
  tradeProgram: string;
  asOfDate: string;
}): Promise<HtsRateQuoteRow | null> {
  const asOf = utcMidnightForEstDate(params.asOfDate);
  const rows = await prisma.$queryRaw<QuoteDbRow[]>`
    SELECT
      "id", "htsCode", "originCountry", "tradeProgram", "asOfDate", "releaseName",
      "dutyRatePct", "specialRatePct", "section301RatePct", "section232RatePct", "ieepaRatePct",
      "additionalRatePct", "tariffRatePct", "dutyRateText", "specialRateText", "additionalDutiesText", "fetchedAt"
    FROM "HtsRateQuote"
    WHERE "htsCode" = ${params.htsCode}
      AND "originCountry" = ${params.originCountry}
      AND "tradeProgram" = ${params.tradeProgram}
      AND "asOfDate" = ${asOf}
    LIMIT 1
  `;
  return rows[0] ? serializeQuote(rows[0]) : null;
}

export async function upsertHtsRateQuote(input: {
  htsCode: string;
  originCountry: string;
  tradeProgram: string;
  asOfDate: string;
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
  unit1?: string | null;
}): Promise<HtsRateQuoteRow> {
  const asOf = utcMidnightForEstDate(input.asOfDate);
  const id = randomUUID();
  const rows = await prisma.$queryRaw<QuoteDbRow[]>`
    INSERT INTO "HtsRateQuote" (
      "id", "htsCode", "originCountry", "tradeProgram", "asOfDate", "releaseName",
      "dutyRatePct", "specialRatePct", "section301RatePct", "section232RatePct", "ieepaRatePct",
      "additionalRatePct", "tariffRatePct", "dutyRateText", "specialRateText", "additionalDutiesText",
      "unit1", "fetchedAt", "createdAt"
    ) VALUES (
      ${id}, ${input.htsCode}, ${input.originCountry}, ${input.tradeProgram}, ${asOf}, ${input.releaseName},
      ${input.dutyRatePct}, ${input.specialRatePct}, ${input.section301RatePct}, ${input.section232RatePct}, ${input.ieepaRatePct},
      ${input.additionalRatePct}, ${input.tariffRatePct}, ${input.dutyRateText}, ${input.specialRateText}, ${input.additionalDutiesText},
      ${input.unit1 || null}, NOW(), NOW()
    )
    ON CONFLICT ("htsCode", "originCountry", "tradeProgram", "asOfDate")
    DO UPDATE SET
      "releaseName" = EXCLUDED."releaseName",
      "dutyRatePct" = EXCLUDED."dutyRatePct",
      "specialRatePct" = EXCLUDED."specialRatePct",
      "section301RatePct" = EXCLUDED."section301RatePct",
      "section232RatePct" = EXCLUDED."section232RatePct",
      "ieepaRatePct" = EXCLUDED."ieepaRatePct",
      "additionalRatePct" = EXCLUDED."additionalRatePct",
      "tariffRatePct" = EXCLUDED."tariffRatePct",
      "dutyRateText" = EXCLUDED."dutyRateText",
      "specialRateText" = EXCLUDED."specialRateText",
      "additionalDutiesText" = EXCLUDED."additionalDutiesText",
      "unit1" = EXCLUDED."unit1",
      "fetchedAt" = NOW()
    RETURNING
      "id", "htsCode", "originCountry", "tradeProgram", "asOfDate", "releaseName",
      "dutyRatePct", "specialRatePct", "section301RatePct", "section232RatePct", "ieepaRatePct",
      "additionalRatePct", "tariffRatePct", "dutyRateText", "specialRateText", "additionalDutiesText", "fetchedAt"
  `;
  return serializeQuote(rows[0]);
}
