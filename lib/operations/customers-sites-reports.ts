import { formatEstDate } from '@/lib/time/eastern';
import type { ParsedCogentRateCard } from '@/lib/operational/cogent-rate-card';

export type CustomersSitesSalesRow = {
  customerName: string;
  snapshotDate: Date | string;
  revenue?: number | null;
  cogs?: number | null;
  grossMargin?: number | null;
  invoiceCount?: number | null;
};

type CustomersSitesClientRow = {
  clientName: string;
  revenue: number;
  profit: number;
  marginPct: number;
  avgBillRate: number;
  retentionStatus: 'Retained' | 'At Risk' | 'Churned';
  lifetimeValueProxy: number;
  revenueDeltaPct: number;
  floorRate: number;
  premiumRate: number;
  primaryRateCard: string;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function asDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeClientName(value: string): string {
  return String(value || '').trim();
}

function clientMatchKey(value: string): string {
  return normalizeClientName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function rateCardMatchesClient(rateCardClient: string, customerName: string): boolean {
  const rateKey = clientMatchKey(rateCardClient);
  const customerKey = clientMatchKey(customerName);
  if (!rateKey || !customerKey) return false;
  return customerKey.includes(rateKey) || rateKey.includes(customerKey);
}

function rateStats(rows: Array<{ billRate?: number | null }>): { avg: number; min: number; max: number } {
  const rates = rows.map((row) => Number(row.billRate)).filter((value) => Number.isFinite(value) && value > 0);
  if (rates.length === 0) return { avg: 0, min: 0, max: 0 };
  return {
    avg: round2(rates.reduce((sum, value) => sum + value, 0) / rates.length),
    min: round2(Math.min(...rates)),
    max: round2(Math.max(...rates)),
  };
}

export function buildCustomersSitesFromSales(args: {
  salesRows: CustomersSitesSalesRow[];
  rangeStart: Date;
  rangeEnd: Date;
  rateCard?: Pick<ParsedCogentRateCard, 'clientName' | 'rows'> | null;
}) {
  const rangeStartMs = args.rangeStart.getTime();
  const rangeEndMs = args.rangeEnd.getTime();
  const grouped = new Map<
    string,
    {
      clientName: string;
      periodRevenue: number;
      periodProfit: number;
      lifetimeRevenue: number;
      latestDateMs: number;
      latestRevenue: number;
      priorRevenue: number;
    }
  >();

  for (const row of args.salesRows) {
    const clientName = normalizeClientName(row.customerName);
    if (!clientName) continue;
    const snapshot = asDate(row.snapshotDate);
    if (!snapshot) continue;
    const snapshotMs = snapshot.getTime();
    const revenue = Number(row.revenue || 0);
    const cogs = Number(row.cogs || 0);
    const profit = row.grossMargin == null ? revenue - cogs : Number(row.grossMargin || 0);
    const inRange = snapshotMs >= rangeStartMs && snapshotMs <= rangeEndMs;
    const current = grouped.get(clientName) || {
      clientName,
      periodRevenue: 0,
      periodProfit: 0,
      lifetimeRevenue: 0,
      latestDateMs: Number.NaN,
      latestRevenue: 0,
      priorRevenue: 0,
    };
    current.lifetimeRevenue += revenue;
    if (inRange) {
      current.periodRevenue += revenue;
      current.periodProfit += profit;
    }
    if (!Number.isFinite(current.latestDateMs) || snapshotMs >= current.latestDateMs) {
      if (Number.isFinite(current.latestDateMs) && snapshotMs > current.latestDateMs) {
        current.priorRevenue = current.latestRevenue;
      }
      current.latestDateMs = snapshotMs;
      current.latestRevenue = revenue;
    }
    grouped.set(clientName, current);
  }

  const rateCardRows = Array.isArray(args.rateCard?.rows) ? args.rateCard.rows : [];
  const records: CustomersSitesClientRow[] = Array.from(grouped.values())
    .filter((row) => row.periodRevenue !== 0)
    .map((row) => {
      const matchingRates = rateCardRows.filter((rateRow) =>
        rateCardMatchesClient(String(rateRow.clientName || args.rateCard?.clientName || ''), row.clientName)
      );
      const rates = rateStats(matchingRates);
      const revenueDeltaPct =
        row.priorRevenue > 0 ? round2(((row.latestRevenue - row.priorRevenue) / row.priorRevenue) * 100) : 0;
      const marginPct = row.periodRevenue > 0 ? round2((row.periodProfit / row.periodRevenue) * 100) : 0;
      return {
        clientName: row.clientName,
        revenue: round2(row.periodRevenue),
        profit: round2(row.periodProfit),
        marginPct,
        avgBillRate: rates.avg,
        retentionStatus: 'Retained',
        lifetimeValueProxy: round2(row.lifetimeRevenue),
        revenueDeltaPct,
        floorRate: rates.min,
        premiumRate: rates.max,
        primaryRateCard: matchingRates.length ? String(args.rateCard?.clientName || matchingRates[0]?.clientName || '') : '',
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = records.reduce((sum, row) => sum + row.revenue, 0);
  const totalProfit = records.reduce((sum, row) => sum + row.profit, 0);
  const top5Share =
    totalRevenue > 0 ? round2((records.slice(0, 5).reduce((sum, row) => sum + row.revenue, 0) / totalRevenue) * 100) : 0;
  const top10Share =
    totalRevenue > 0 ? round2((records.slice(0, 10).reduce((sum, row) => sum + row.revenue, 0) / totalRevenue) * 100) : 0;

  return {
    summary: {
      asOfDate: formatEstDate(args.rangeEnd),
      totalRevenue: round2(totalRevenue),
      totalProfit: round2(totalProfit),
      avgMarginPct: totalRevenue > 0 ? round2((totalProfit / totalRevenue) * 100) : 0,
      top5Share,
      top10Share,
    },
    revenueByClient: records,
    clientProfitability: [...records].sort((a, b) => b.profit - a.profit),
    revenueConcentration: {
      top5Share,
      top10Share,
      topClients: records.slice(0, 10),
    },
    contractRateCards: records
      .filter((row) => row.avgBillRate > 0)
      .map((row) => ({
        clientName: row.clientName,
        primaryRateCard: row.primaryRateCard || 'Rate card',
        avgBillRate: row.avgBillRate,
        floorRate: row.floorRate,
        premiumRate: row.premiumRate,
      })),
    retentionChurn: records.map((row) => ({
      clientName: row.clientName,
      retentionStatus: row.retentionStatus,
      revenueDeltaPct: row.revenueDeltaPct,
      revenue: row.revenue,
    })),
    lowMarginClients: records.filter((row) => row.profit !== 0 && row.marginPct < 16).sort((a, b) => a.marginPct - b.marginPct),
    lifetimeValueProxy: [...records].sort((a, b) => b.lifetimeValueProxy - a.lifetimeValueProxy),
    records,
    meta: {
      source: 'customer-sales-snapshot',
      generatedAt: new Date().toISOString(),
      note: records.length
        ? 'Live customer sales snapshots for the selected date range.'
        : 'No live customer sales snapshots in the selected date range.',
    },
  };
}

export function emptyCustomersSitesPayload(asOfDate: Date) {
  return {
    summary: {
      asOfDate: formatEstDate(asOfDate),
      totalRevenue: 0,
      totalProfit: 0,
      avgMarginPct: 0,
      top5Share: 0,
      top10Share: 0,
    },
    revenueByClient: [] as CustomersSitesClientRow[],
    clientProfitability: [] as CustomersSitesClientRow[],
    revenueConcentration: { top5Share: 0, top10Share: 0, topClients: [] as CustomersSitesClientRow[] },
    contractRateCards: [] as Array<{
      clientName: string;
      primaryRateCard: string;
      avgBillRate: number;
      floorRate: number;
      premiumRate: number;
    }>,
    retentionChurn: [] as Array<{ clientName: string; retentionStatus: string; revenueDeltaPct: number; revenue: number }>,
    lowMarginClients: [] as CustomersSitesClientRow[],
    lifetimeValueProxy: [] as CustomersSitesClientRow[],
    records: [] as CustomersSitesClientRow[],
    meta: {
      source: 'customer-sales-snapshot',
      generatedAt: new Date().toISOString(),
      note: 'No live customer sales snapshots in the selected date range.',
    },
  };
}
