import prisma from '@/lib/prisma';
import { ensureCompanyItemDutyTable } from '@/lib/hts/item-duty-overlay';
import { loadForecastFactsByItem } from '@/lib/operations/vendor-pricing-db';
import { estYear } from '@/lib/time/eastern';

export type TariffRateComponent = 'duty' | 'special' | 'section301' | 'section232' | 'ieepa' | 'additional';

export type TariffChange = {
  itemSku: string;
  description: string | null;
  htsCode: string | null;
  countryOfOrigin: string | null;
  changedComponents: TariffRateComponent[];
  previousRatePct: number;
  currentRatePct: number;
  deltaPts: number;
  annualQty: number;
  /** Units sold in the last 365 days, or this year's Monthly Forecast for items with no sales. */
  qtySource: 'sales' | 'forecast' | null;
  valuePerPiece: number;
  annualImpact: number;
};

export type TariffChangeSummary = {
  currentDate: string;
  previousDate: string;
  releaseName: string | null;
  changes: TariffChange[];
};

type SnapshotRow = {
  itemSku: string;
  itemDescription: string | null;
  htsCode: string | null;
  countryOfOrigin: string | null;
  codesKey: string;
  rated: boolean;
  dutyPct: number | null;
  specialRatePct: number | null;
  section301RatePct: number | null;
  section232RatePct: number | null;
  ieepaRatePct: number | null;
  additionalRatePct: number | null;
  totalRatePct: number | null;
  enteredValuePerPiece: number | null;
  releaseName: string | null;
};

const COMPONENT_COLUMNS: Array<[TariffRateComponent, keyof SnapshotRow]> = [
  ['duty', 'dutyPct'],
  ['special', 'specialRatePct'],
  ['section301', 'section301RatePct'],
  ['section232', 'section232RatePct'],
  ['ieepa', 'ieepaRatePct'],
  ['additional', 'additionalRatePct'],
];

const RATE_EPSILON = 0.0001;

let ensureOnce: Promise<void> | null = null;

export async function ensureCompanyItemDutyDailySnapshotTable(): Promise<void> {
  if (!ensureOnce) {
    ensureOnce = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CompanyItemDutyDailySnapshot" (
          "companyId" TEXT NOT NULL,
          "itemSku" TEXT NOT NULL,
          "snapshotDate" TEXT NOT NULL,
          "itemDescription" TEXT,
          "htsCode" TEXT,
          "countryOfOrigin" TEXT,
          "codesKey" TEXT NOT NULL,
          "rated" BOOLEAN NOT NULL DEFAULT FALSE,
          "dutyPct" DOUBLE PRECISION,
          "specialRatePct" DOUBLE PRECISION,
          "section301RatePct" DOUBLE PRECISION,
          "section232RatePct" DOUBLE PRECISION,
          "ieepaRatePct" DOUBLE PRECISION,
          "additionalRatePct" DOUBLE PRECISION,
          "totalRatePct" DOUBLE PRECISION,
          "enteredValuePerPiece" DOUBLE PRECISION,
          "releaseName" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY ("companyId", "snapshotDate", "itemSku")
        )
      `);
    })().catch((error) => {
      ensureOnce = null;
      throw error;
    });
  }
  return ensureOnce;
}

/**
 * Records today's rates for every item. Repeated refreshes on the same EST day
 * overwrite that day's row, so the snapshot reflects the last refresh of the day.
 * `dutyPct` is the duty actually applied (USMCA uses the special column), derived
 * from the stored per-piece duty when a value per piece is known.
 */
export async function recordCompanyItemDutySnapshot(companyId: string, snapshotDate: string): Promise<number> {
  await ensureCompanyItemDutyTable();
  await ensureCompanyItemDutyDailySnapshotTable();
  return prisma.$executeRaw`
    INSERT INTO "CompanyItemDutyDailySnapshot" (
      "companyId", "itemSku", "snapshotDate", "itemDescription", "htsCode", "countryOfOrigin", "codesKey", "rated",
      "dutyPct", "specialRatePct", "section301RatePct", "section232RatePct", "ieepaRatePct", "additionalRatePct",
      "totalRatePct", "enteredValuePerPiece", "releaseName", "createdAt"
    )
    SELECT
      d."companyId",
      d."itemSku",
      ${snapshotDate},
      d."itemDescription",
      d."htsCode",
      d."countryOfOrigin",
      CONCAT_WS('|',
        COALESCE(d."htsCode", ''), COALESCE(d."specialHtsCode", ''), COALESCE(d."section301HtsCode", ''),
        COALESCE(d."section232HtsCode", ''), COALESCE(d."ieepaHtsCode", ''), COALESCE(d."additionalHtsCode", ''),
        UPPER(TRIM(COALESCE(d."countryOfOrigin", ''))), COALESCE(d."tradeProgram", 'none')
      ),
      d."lastRateAsOfDate" IS NOT NULL,
      r."dutyPct",
      d."specialRatePct",
      d."section301RatePct",
      d."section232RatePct",
      d."ieepaRatePct",
      d."additionalRatePct",
      COALESCE(r."dutyPct", 0) + COALESCE(d."specialRatePct", 0) + COALESCE(d."tariffRatePct", 0),
      d."enteredValuePerPiece",
      d."lastRateReleaseName",
      NOW()
    FROM "CompanyItemDuty" d
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN d."enteredValuePerPiece" > 0 AND d."dutyPerPiece" IS NOT NULL
          THEN d."dutyPerPiece" / d."enteredValuePerPiece" * 100
        ELSE d."dutyRatePct"
      END AS "dutyPct"
    ) r
    WHERE d."companyId" = ${companyId}
    ON CONFLICT ("companyId", "snapshotDate", "itemSku") DO UPDATE SET
      "itemDescription" = EXCLUDED."itemDescription",
      "htsCode" = EXCLUDED."htsCode",
      "countryOfOrigin" = EXCLUDED."countryOfOrigin",
      "codesKey" = EXCLUDED."codesKey",
      "rated" = EXCLUDED."rated",
      "dutyPct" = EXCLUDED."dutyPct",
      "specialRatePct" = EXCLUDED."specialRatePct",
      "section301RatePct" = EXCLUDED."section301RatePct",
      "section232RatePct" = EXCLUDED."section232RatePct",
      "ieepaRatePct" = EXCLUDED."ieepaRatePct",
      "additionalRatePct" = EXCLUDED."additionalRatePct",
      "totalRatePct" = EXCLUDED."totalRatePct",
      "enteredValuePerPiece" = EXCLUDED."enteredValuePerPiece",
      "releaseName" = EXCLUDED."releaseName",
      "createdAt" = NOW()
  `;
}

async function loadSnapshot(companyId: string, snapshotDate: string): Promise<Map<string, SnapshotRow>> {
  const rows = await prisma.$queryRaw<SnapshotRow[]>`
    SELECT "itemSku", "itemDescription", "htsCode", "countryOfOrigin", "codesKey", "rated",
           "dutyPct", "specialRatePct", "section301RatePct", "section232RatePct", "ieepaRatePct",
           "additionalRatePct", "totalRatePct", "enteredValuePerPiece", "releaseName"
    FROM "CompanyItemDutyDailySnapshot"
    WHERE "companyId" = ${companyId} AND "snapshotDate" = ${snapshotDate}
  `;
  return new Map(rows.map((row) => [row.itemSku, row]));
}

async function loadTrailingYearQuantities(companyId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ itemSku: string; quantity: number | null }>>`
    SELECT "itemSku", SUM("quantity")::double precision AS "quantity"
    FROM "CompanyItemDutyApplication"
    WHERE "companyId" = ${companyId}
      AND "eventDate" >= NOW() - INTERVAL '365 days'
    GROUP BY "itemSku"
  `.catch((): Array<{ itemSku: string; quantity: number | null }> => []);
  return new Map(rows.map((row): [string, number] => [row.itemSku, Number(row.quantity) || 0]));
}

/**
 * Compares the two newest daily snapshots. Items whose HTS codes, origin, or
 * trade program changed are skipped (an identity edit, not a tariff change), as
 * are items that could not be rated on either day.
 */
export async function loadLatestTariffChanges(
  companyId: string,
  minAnnualImpact: number
): Promise<TariffChangeSummary | null> {
  await ensureCompanyItemDutyDailySnapshotTable();
  const dates = await prisma.$queryRaw<Array<{ snapshotDate: string }>>`
    SELECT DISTINCT "snapshotDate"
    FROM "CompanyItemDutyDailySnapshot"
    WHERE "companyId" = ${companyId}
    ORDER BY "snapshotDate" DESC
    LIMIT 2
  `;
  if (dates.length < 2) return null;
  const [currentDate, previousDate] = [dates[0].snapshotDate, dates[1].snapshotDate];
  const [current, previous, quantities, forecast] = await Promise.all([
    loadSnapshot(companyId, currentDate),
    loadSnapshot(companyId, previousDate),
    loadTrailingYearQuantities(companyId),
    loadForecastFactsByItem(companyId, estYear()),
  ]);

  const changes: TariffChange[] = [];
  let releaseName: string | null = null;
  for (const [itemSku, now] of current) {
    releaseName = releaseName || now.releaseName;
    const before = previous.get(itemSku);
    if (!before || !now.rated || !before.rated || now.codesKey !== before.codesKey) continue;
    const changedComponents = COMPONENT_COLUMNS
      .filter(([, column]) => Math.abs(Number(now[column] ?? 0) - Number(before[column] ?? 0)) > RATE_EPSILON)
      .map(([component]) => component);
    if (changedComponents.length === 0) continue;
    const previousRatePct = Number(before.totalRatePct ?? 0);
    const currentRatePct = Number(now.totalRatePct ?? 0);
    const deltaPts = currentRatePct - previousRatePct;
    const valuePerPiece = Number(now.enteredValuePerPiece ?? 0);
    const soldQty = quantities.get(itemSku) || 0;
    const forecastQty = forecast.get(itemSku.trim().toUpperCase())?.qty || 0;
    const qtySource = soldQty > 0 ? 'sales' : forecastQty > 0 ? 'forecast' : null;
    const annualQty = soldQty > 0 ? soldQty : forecastQty;
    const annualImpact = (deltaPts / 100) * valuePerPiece * annualQty;
    if (Math.abs(annualImpact) < minAnnualImpact) continue;
    changes.push({
      itemSku,
      description: now.itemDescription,
      htsCode: now.htsCode,
      countryOfOrigin: now.countryOfOrigin,
      changedComponents,
      previousRatePct,
      currentRatePct,
      deltaPts,
      annualQty,
      qtySource,
      valuePerPiece,
      annualImpact,
    });
  }
  changes.sort((a, b) => Math.abs(b.annualImpact) - Math.abs(a.annualImpact));
  return { currentDate, previousDate, releaseName, changes };
}
