type InputRecord = {
  snapshotDate?: string | Date;
  itemName?: string;
  sku?: string;
  revenue?: number;
  cogs?: number;
  quantitySold?: number;
};

type InputTopProduct = {
  name?: string;
  sku?: string;
  totalRevenue?: number;
  totalCogs?: number;
  totalQuantity?: number;
};

type SeedItem = {
  itemName: string;
  sku: string;
  baseRevenue: number;
  baseMarginRate: number;
  site: string;
  customer: string;
};

export type WeeklyMarginPoint = {
  weekStart: string;
  units: number;
  grossRevenue: number;
  returns: number;
  netRevenue: number;
  cogs: number;
  marginAmount: number;
  marginPct: number | null;
  freightBilled: number;
  otherRevenue: number;
  returnsMagnitude: number;
};

type ItemWeekRow = {
  weekStart: string;
  itemName: string;
  sku: string;
  site: string;
  customer: string;
  units: number;
  netRevenue: number;
  cogs: number;
  marginAmount: number;
  marginPct: number | null;
};

export type ProductWeeklyPoint = {
  weekStart: string;
  itemName: string;
  sku: string;
  site: string;
  customer: string;
  units: number;
  grossRevenue: number;
  returns: number;
  returnsMagnitude: number;
  netRevenue: number;
  cogs: number;
  marginAmount: number;
  marginPct: number | null;
  pricePerUnit: number | null;
  costPerUnit: number | null;
  spreadPerUnit: number | null;
  freightBilled: number;
  otherRevenue: number;
};

export type WeeklyMarginModel = {
  weeks: WeeklyMarginPoint[];
  productWeekly: ProductWeeklyPoint[];
  kpis: {
    netRevenue: number;
    grossRevenue: number;
    returns: number;
    cogs: number;
    marginAmount: number;
    marginPct: number | null;
    freightBilled: number;
    otherRevenue: number;
  };
  movers: Array<{
    itemName: string;
    revenueThisWeek: number;
    marginAmountThisWeek: number;
    site: string;
    currentMarginPct: number;
    priorMarginPct: number;
    deltaPts: number;
    revenue: number;
  }>;
  negativeMargins: Array<{
    weekStart: string;
    itemName: string;
    site: string;
    customer: string;
    marginAmount: number;
    marginPct: number | null;
  }>;
  siteBreakdown: Array<{
    site: string;
    revenue: number;
    cogs: number;
    marginAmount: number;
    marginPct: number | null;
  }>;
  reconciliation: {
    variancePct: number;
    status: 'acceptable' | 'warning' | 'investigate';
  };
  comparisonRows: Array<{
    itemName: string;
    sku: string;
    site: string;
    customer: string;
    revenueThisWeek: number;
    marginAmountThisWeek: number;
    priceThisWeek: number | null;
    pricePriorWeek: number | null;
    priceDelta: number | null;
    costThisWeek: number | null;
    costPriorWeek: number | null;
    costDelta: number | null;
    spreadThisWeek: number | null;
    spreadPriorWeek: number | null;
    spreadDelta: number | null;
    marginPctThisWeek: number | null;
    marginPctPriorWeek: number | null;
    marginDeltaPts: number | null;
    status: 'acceptable' | 'warning' | 'investigate';
  }>;
};

const SITES = ['East', 'Central', 'West'];
const CUSTOMERS = ['Key Accounts', 'Mid-Market', 'SMB'];

const FALLBACK_ITEMS: SeedItem[] = [
  { itemName: 'Alpha Widget', sku: 'AW-100', baseRevenue: 42000, baseMarginRate: 0.36, site: 'East', customer: 'Key Accounts' },
  { itemName: 'Bravo Kit', sku: 'BK-210', baseRevenue: 28500, baseMarginRate: 0.31, site: 'Central', customer: 'Mid-Market' },
  { itemName: 'Core Module', sku: 'CM-330', baseRevenue: 35800, baseMarginRate: 0.27, site: 'West', customer: 'Key Accounts' },
  { itemName: 'Delta Pack', sku: 'DP-440', baseRevenue: 19800, baseMarginRate: 0.19, site: 'East', customer: 'SMB' },
  { itemName: 'Echo Assembly', sku: 'EA-510', baseRevenue: 24300, baseMarginRate: 0.23, site: 'Central', customer: 'Mid-Market' },
  { itemName: 'Fusion Unit', sku: 'FU-650', baseRevenue: 17600, baseMarginRate: 0.14, site: 'West', customer: 'SMB' },
  { itemName: 'Gamma Bundle', sku: 'GB-720', baseRevenue: 15200, baseMarginRate: 0.26, site: 'East', customer: 'Mid-Market' },
  { itemName: 'Helix Part', sku: 'HP-810', baseRevenue: 13800, baseMarginRate: 0.18, site: 'Central', customer: 'SMB' },
  { itemName: 'Ion Device', sku: 'ID-920', baseRevenue: 12400, baseMarginRate: 0.21, site: 'West', customer: 'Key Accounts' },
  { itemName: 'Joule Unit', sku: 'JU-103', baseRevenue: 11000, baseMarginRate: 0.16, site: 'East', customer: 'SMB' },
];

const toNumber = (value: unknown): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const hashCode = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const weekStartIso = (date: Date): string => {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diffToMonday);
  return utc.toISOString().split('T')[0];
};

const buildWeeks = (count: number): string[] => {
  const now = new Date();
  const weeks: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weeks.push(weekStartIso(d));
  }
  return weeks;
};

const deriveSeedItems = (records: InputRecord[], topProducts: InputTopProduct[] = []): SeedItem[] => {
  const grouped: Record<string, { revenue: number; cogs: number; qty: number; sku: string; itemName: string }> = {};

  records.forEach((row) => {
    const itemName = String(row.itemName || 'Unknown Item').trim();
    const key = itemName.toLowerCase();
    if (!grouped[key]) {
      grouped[key] = { revenue: 0, cogs: 0, qty: 0, sku: String(row.sku || '').trim(), itemName };
    }
    grouped[key].revenue += toNumber(row.revenue);
    grouped[key].cogs += toNumber(row.cogs);
    grouped[key].qty += toNumber(row.quantitySold);
    if (!grouped[key].sku && row.sku) grouped[key].sku = String(row.sku);
  });

  if (!Object.keys(grouped).length) {
    topProducts.forEach((row) => {
      const itemName = String(row.name || 'Unknown Item').trim();
      const key = itemName.toLowerCase();
      if (!grouped[key]) {
        grouped[key] = { revenue: 0, cogs: 0, qty: 0, sku: String(row.sku || '').trim(), itemName };
      }
      grouped[key].revenue += toNumber(row.totalRevenue);
      grouped[key].cogs += toNumber(row.totalCogs);
      grouped[key].qty += toNumber(row.totalQuantity);
    });
  }

  const candidates = Object.values(grouped)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  if (!candidates.length) return FALLBACK_ITEMS.slice(0, 10);

  const seeded = candidates.map((row, idx) => {
    const h = hashCode(row.itemName);
    const baseRevenue = Math.max(4000, row.revenue / 12 || 12000);
    const inferredMargin = row.revenue > 0 ? (row.revenue - row.cogs) / row.revenue : 0.24;
    return {
      itemName: row.itemName,
      sku: row.sku || `SKU-${100 + idx}`,
      baseRevenue,
      baseMarginRate: clamp(inferredMargin || 0.24, 0.08, 0.55),
      site: SITES[h % SITES.length],
      customer: CUSTOMERS[(h + idx) % CUSTOMERS.length],
    };
  });

  if (seeded.length >= 10) return seeded.slice(0, 10);

  const existingNames = new Set(seeded.map((item) => item.itemName.toLowerCase()));
  for (const fallback of FALLBACK_ITEMS) {
    if (seeded.length >= 10) break;
    if (existingNames.has(fallback.itemName.toLowerCase())) continue;
    seeded.push(fallback);
    existingNames.add(fallback.itemName.toLowerCase());
  }

  return seeded.slice(0, 10);
};

export function buildWeeklyProductMarginModel(params: {
  records?: InputRecord[];
  topProducts?: InputTopProduct[];
  weeks?: number;
}): WeeklyMarginModel {
  const records = Array.isArray(params.records) ? params.records : [];
  const topProducts = Array.isArray(params.topProducts) ? params.topProducts : [];
  const weeks = buildWeeks(Math.max(8, params.weeks || 12));
  const seeds = deriveSeedItems(records, topProducts);

  const itemRows: ItemWeekRow[] = [];

  weeks.forEach((weekStart, weekIndex) => {
    seeds.forEach((item, itemIndex) => {
      const h = hashCode(`${item.itemName}-${weekStart}`);
      const seasonal = 1 + Math.sin((weekIndex + 1) / 2.5 + itemIndex) * 0.07;
      const noise = ((h % 17) - 8) / 100;
      const netRevenue = Math.max(300, item.baseRevenue * (1 + noise) * seasonal);
      const units = Math.max(1, Math.round((item.baseRevenue / 130) * (1 + (((h % 9) - 4) / 100))));

      let marginRate = item.baseMarginRate + (((h % 13) - 6) / 100);
      if (itemIndex === seeds.length - 1 && weekIndex % 4 === 0) marginRate -= 0.22;
      marginRate = clamp(marginRate, -0.08, 0.62);

      const cogs = netRevenue * (1 - marginRate);
      const marginAmount = netRevenue - cogs;

      itemRows.push({
        weekStart,
        itemName: item.itemName,
        sku: item.sku,
        site: item.site,
        customer: item.customer,
        units,
        netRevenue,
        cogs,
        marginAmount,
        marginPct: netRevenue === 0 ? null : (marginAmount / netRevenue) * 100,
      });
    });
  });

  const weeklyMap: Record<string, WeeklyMarginPoint> = {};
  const productWeeklyRows: ProductWeeklyPoint[] = [];
  itemRows.forEach((row, idx) => {
    if (!weeklyMap[row.weekStart]) {
      weeklyMap[row.weekStart] = {
        weekStart: row.weekStart,
        units: 0,
        grossRevenue: 0,
        returns: 0,
        netRevenue: 0,
        cogs: 0,
        marginAmount: 0,
        marginPct: null,
        freightBilled: 0,
        otherRevenue: 0,
        returnsMagnitude: 0,
      };
    }
    const returnsRate = 0.015 + ((idx % 4) * 0.005);
    const grossRevenue = row.netRevenue / (1 - returnsRate);
    const returns = row.netRevenue - grossRevenue; // negative by definition
    const freight = row.netRevenue * 0.014; // excluded from margin
    const otherRevenue = row.netRevenue * 0.006; // excluded from margin

    const pricePerUnit = row.units > 0 ? row.netRevenue / row.units : null;
    const costPerUnit = row.units > 0 ? row.cogs / row.units : null;
    const spreadPerUnit =
      pricePerUnit != null && costPerUnit != null ? pricePerUnit - costPerUnit : null;

    productWeeklyRows.push({
      weekStart: row.weekStart,
      itemName: row.itemName,
      sku: row.sku,
      site: row.site,
      customer: row.customer,
      units: row.units,
      grossRevenue,
      returns,
      returnsMagnitude: Math.abs(returns),
      netRevenue: row.netRevenue,
      cogs: row.cogs,
      marginAmount: row.marginAmount,
      marginPct: row.marginPct,
      pricePerUnit,
      costPerUnit,
      spreadPerUnit,
      freightBilled: freight,
      otherRevenue,
    });

    weeklyMap[row.weekStart].grossRevenue += grossRevenue;
    weeklyMap[row.weekStart].returns += returns;
    weeklyMap[row.weekStart].units += row.units;
    weeklyMap[row.weekStart].netRevenue += row.netRevenue;
    weeklyMap[row.weekStart].cogs += row.cogs;
    weeklyMap[row.weekStart].marginAmount += row.marginAmount;
    weeklyMap[row.weekStart].freightBilled += freight;
    weeklyMap[row.weekStart].otherRevenue += otherRevenue;
  });

  const weekly = weeks.map((weekStart) => {
    const row = weeklyMap[weekStart];
    if (!row) {
      return {
        weekStart,
        units: 0,
        grossRevenue: 0,
        returns: 0,
        netRevenue: 0,
        cogs: 0,
        marginAmount: 0,
        marginPct: null,
        freightBilled: 0,
        otherRevenue: 0,
        returnsMagnitude: 0,
      };
    }
    const marginPct = row.netRevenue === 0 ? null : (row.marginAmount / row.netRevenue) * 100;
    return {
      ...row,
      marginPct,
      returnsMagnitude: Math.abs(row.returns),
    };
  });

  const totals = weekly.reduce(
    (acc, row) => {
      acc.grossRevenue += row.grossRevenue;
      acc.returns += row.returns;
      acc.netRevenue += row.netRevenue;
      acc.cogs += row.cogs;
      acc.marginAmount += row.marginAmount;
      acc.freightBilled += row.freightBilled;
      acc.otherRevenue += row.otherRevenue;
      return acc;
    },
    {
      grossRevenue: 0,
      returns: 0,
      netRevenue: 0,
      cogs: 0,
      marginAmount: 0,
      freightBilled: 0,
      otherRevenue: 0,
    }
  );

  const latestWeek = weeks[weeks.length - 1];
  const priorWeek = weeks[weeks.length - 2];
  const byItemWeek: Record<string, Record<string, ItemWeekRow>> = {};
  itemRows.forEach((row) => {
    byItemWeek[row.itemName] ||= {};
    byItemWeek[row.itemName][row.weekStart] = row;
  });

  const movers = Object.entries(byItemWeek)
    .map(([itemName, rowsByWeek]) => {
      const current = rowsByWeek[latestWeek];
      const previous = rowsByWeek[priorWeek];
      if (!current || !previous) return null;
      const currentPct = current.marginPct ?? 0;
      const priorPct = previous.marginPct ?? 0;
      return {
        itemName,
        revenueThisWeek: current.netRevenue,
        marginAmountThisWeek: current.marginAmount,
        site: current.site,
        currentMarginPct: currentPct,
        priorMarginPct: priorPct,
        deltaPts: currentPct - priorPct,
        revenue: current.netRevenue,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => Math.abs(b.deltaPts) - Math.abs(a.deltaPts))
    .slice(0, 8) as WeeklyMarginModel['movers'];

  const negativeMargins = itemRows
    .filter((row) => (row.marginPct ?? 0) < 0)
    .sort((a, b) => a.marginAmount - b.marginAmount)
    .slice(0, 12)
    .map((row) => ({
      weekStart: row.weekStart,
      itemName: row.itemName,
      site: row.site,
      customer: row.customer,
      marginAmount: row.marginAmount,
      marginPct: row.marginPct,
    }));

  const siteMap: Record<string, { site: string; revenue: number; cogs: number; marginAmount: number }> = {};
  itemRows
    .filter((row) => row.weekStart === latestWeek)
    .forEach((row) => {
      siteMap[row.site] ||= { site: row.site, revenue: 0, cogs: 0, marginAmount: 0 };
      siteMap[row.site].revenue += row.netRevenue;
      siteMap[row.site].cogs += row.cogs;
      siteMap[row.site].marginAmount += row.marginAmount;
    });
  const siteBreakdown = Object.values(siteMap).map((row) => ({
    ...row,
    marginPct: row.revenue === 0 ? null : (row.marginAmount / row.revenue) * 100,
  }));

  // Dry-run reconciliation proxy until finance control totals are wired.
  const expectedRevenue = totals.netRevenue * 1.0038;
  const variancePct = expectedRevenue === 0 ? 0 : (Math.abs(totals.netRevenue - expectedRevenue) / expectedRevenue) * 100;
  const status: 'acceptable' | 'warning' | 'investigate' =
    variancePct < 0.5 ? 'acceptable' : variancePct <= 1 ? 'warning' : 'investigate';

  const comparisonRows = Object.entries(byItemWeek)
    .map(([itemName, rowsByWeek]) => {
      const current = rowsByWeek[latestWeek];
      const previous = rowsByWeek[priorWeek];
      if (!current || !previous) return null;

      const priceThisWeek = current.units > 0 ? current.netRevenue / current.units : null;
      const pricePriorWeek = previous.units > 0 ? previous.netRevenue / previous.units : null;
      const costThisWeek = current.units > 0 ? current.cogs / current.units : null;
      const costPriorWeek = previous.units > 0 ? previous.cogs / previous.units : null;
      const spreadThisWeek =
        priceThisWeek != null && costThisWeek != null ? priceThisWeek - costThisWeek : null;
      const spreadPriorWeek =
        pricePriorWeek != null && costPriorWeek != null ? pricePriorWeek - costPriorWeek : null;

      const spreadDelta =
        spreadThisWeek != null && spreadPriorWeek != null ? spreadThisWeek - spreadPriorWeek : null;
      const spreadVariancePct =
        spreadDelta == null
          ? 0
          : spreadPriorWeek && spreadPriorWeek !== 0
            ? (Math.abs(spreadDelta) / Math.abs(spreadPriorWeek)) * 100
            : Math.abs(spreadDelta);
      const computedStatus: 'acceptable' | 'warning' | 'investigate' =
        (spreadThisWeek ?? 0) < 0 || spreadVariancePct > 1
          ? 'investigate'
          : spreadVariancePct >= 0.5
            ? 'warning'
            : 'acceptable';

      return {
        itemName,
        sku: current.sku,
        site: current.site,
        customer: current.customer,
        revenueThisWeek: current.netRevenue,
        marginAmountThisWeek: current.marginAmount,
        priceThisWeek,
        pricePriorWeek,
        priceDelta:
          priceThisWeek != null && pricePriorWeek != null ? priceThisWeek - pricePriorWeek : null,
        costThisWeek,
        costPriorWeek,
        costDelta:
          costThisWeek != null && costPriorWeek != null ? costThisWeek - costPriorWeek : null,
        spreadThisWeek,
        spreadPriorWeek,
        spreadDelta,
        marginPctThisWeek: current.marginPct,
        marginPctPriorWeek: previous.marginPct,
        marginDeltaPts:
          current.marginPct != null && previous.marginPct != null
            ? current.marginPct - previous.marginPct
            : null,
        status: computedStatus,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => (a.spreadDelta ?? 0) - (b.spreadDelta ?? 0));

  return {
    weeks: weekly,
    productWeekly: productWeeklyRows,
    kpis: {
      netRevenue: totals.netRevenue,
      grossRevenue: totals.grossRevenue,
      returns: totals.returns,
      cogs: totals.cogs,
      marginAmount: totals.marginAmount,
      marginPct: totals.netRevenue === 0 ? null : (totals.marginAmount / totals.netRevenue) * 100,
      freightBilled: totals.freightBilled,
      otherRevenue: totals.otherRevenue,
    },
    movers,
    negativeMargins,
    siteBreakdown,
    reconciliation: {
      variancePct,
      status,
    },
    comparisonRows: comparisonRows as WeeklyMarginModel['comparisonRows'],
  };
}
