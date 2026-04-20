import prisma from '@/lib/prisma';

/**
 * True DSO/DPO/DIO derived from DailyFinancialSnapshot (DFS).
 *
 * This module is the single source of truth for working-capital cycle days
 * across the app. Both Working Capital tab and Company Pulse alerts/previews
 * should use the same series so the numbers reconcile by construction.
 *
 * Formulas (matching textbook working-capital definitions):
 *   trailing daily revenue = sum(DFS.revenue, last `lookbackDays`) / lookbackDays
 *   trailing daily cogs    = sum(|DFS.cogsTotal|, last `lookbackDays`) / lookbackDays
 *   DSO = AR        / trailing daily revenue
 *   DPO = |AP|      / trailing daily cogs
 *   DIO = inventory / trailing daily cogs
 *
 * AR/AP/Inventory are point-in-time balances on the snapshot date.
 * Revenue/COGS are summed over the trailing window ending on that date.
 *
 * If the trailing-window denominator is 0 (e.g. brand-new company, gap in
 * activity), the corresponding cycle metric is returned as 0 — same fallback
 * the legacy Working Capital tab uses.
 */

export type DsoSeriesPoint = {
  snapshotDate: string; // ISO date (YYYY-MM-DD)
  ar: number;
  ap: number;
  inventory: number;
  trailingRevenue: number;
  trailingCogs: number;
  dailyRevenue: number;
  dailyCogs: number;
  dso: number;
  dpo: number;
  dio: number;
  ccc: number;
};

function dateKeyUtc(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type ComputeDsoSeriesArgs = {
  companyId: string;
  startDate: Date;
  endDate: Date;
  lookbackDays?: number; // trailing window for revenue/cogs averaging; default 90
  frequency?: 'daily' | 'weekly' | 'monthly';
};

/**
 * Build a per-day series of working-capital cycle metrics over [startDate, endDate].
 * Loads `lookbackDays` of additional history before startDate so the trailing
 * window is fully populated for the first day in the output.
 */
export async function computeDsoSeriesFromDaily(
  args: ComputeDsoSeriesArgs,
): Promise<DsoSeriesPoint[]> {
  const lookbackDays = Math.max(1, args.lookbackDays ?? 90);
  const frequency = args.frequency ?? 'daily';
  const start = startOfUtcDay(args.startDate);
  const end = startOfUtcDay(args.endDate);
  if (end.getTime() < start.getTime()) return [];

  const fetchStart = new Date(start.getTime() - lookbackDays * DAY_MS);

  const rows: any[] = await prisma.dailyFinancialSnapshot.findMany({
    where: {
      companyId: args.companyId,
      frequency,
      snapshotDate: { gte: fetchStart, lte: end },
    },
    orderBy: { snapshotDate: 'asc' },
    select: {
      snapshotDate: true,
      revenue: true,
      cogsTotal: true,
      ar: true,
      ap: true,
      inventory: true,
    },
  });
  if (rows.length === 0) return [];

  // Index by UTC day key for O(1) lookup. DFS is unique per (company, date,
  // frequency) so each key has one row.
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    byKey.set(dateKeyUtc(new Date(r.snapshotDate)), r);
  }

  // Carry-forward state for balance fields (AR, AP, inventory) so weekend /
  // gap days reflect the most recent known balance instead of dropping to 0.
  let lastAr = 0;
  let lastAp = 0;
  let lastInventory = 0;

  // Sliding-window sum buffers for revenue / cogs.
  const revWindow: number[] = [];
  const cogsWindow: number[] = [];
  let revSum = 0;
  let cogsSum = 0;

  // Walk every calendar day from fetchStart through end so the sliding window
  // is contiguous even when DFS has gaps (e.g. weekends w/o activity rows).
  const out: DsoSeriesPoint[] = [];
  for (let cursor = new Date(fetchStart); cursor.getTime() <= end.getTime(); cursor = new Date(cursor.getTime() + DAY_MS)) {
    const key = dateKeyUtc(cursor);
    const row = byKey.get(key);
    const dayRevenue = row ? Number(row.revenue || 0) : 0;
    const dayCogs = row ? Math.abs(Number(row.cogsTotal || 0)) : 0;

    revWindow.push(dayRevenue);
    cogsWindow.push(dayCogs);
    revSum += dayRevenue;
    cogsSum += dayCogs;
    if (revWindow.length > lookbackDays) {
      revSum -= revWindow.shift() as number;
      cogsSum -= cogsWindow.shift() as number;
    }

    if (row) {
      lastAr = Number(row.ar || 0);
      lastAp = Math.abs(Number(row.ap || 0));
      lastInventory = Number(row.inventory || 0);
    }

    if (cursor.getTime() < start.getTime()) continue;

    const dailyRevenue = revWindow.length > 0 ? revSum / revWindow.length : 0;
    const dailyCogs = cogsWindow.length > 0 ? cogsSum / cogsWindow.length : 0;
    const dso = dailyRevenue > 0 && lastAr > 0 ? lastAr / dailyRevenue : 0;
    const dpo = dailyCogs > 0 && lastAp > 0 ? lastAp / dailyCogs : 0;
    const dio = dailyCogs > 0 && lastInventory > 0 ? lastInventory / dailyCogs : 0;
    out.push({
      snapshotDate: key,
      ar: lastAr,
      ap: lastAp,
      inventory: lastInventory,
      trailingRevenue: revSum,
      trailingCogs: cogsSum,
      dailyRevenue,
      dailyCogs,
      dso,
      dpo,
      dio,
      ccc: dio + dso - dpo,
    });
  }

  return out;
}

/**
 * Convenience: just the DSO value for a single as-of date (latest DFS row at
 * or before `asOfDate`). Returns 0 if no DFS data is available.
 */
export async function computeDsoForDate(
  companyId: string,
  asOfDate: Date,
  lookbackDays = 90,
): Promise<number> {
  const series = await computeDsoSeriesFromDaily({
    companyId,
    startDate: asOfDate,
    endDate: asOfDate,
    lookbackDays,
  });
  return series.length > 0 ? series[series.length - 1].dso : 0;
}
