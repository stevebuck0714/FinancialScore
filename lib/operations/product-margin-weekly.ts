type InputRecord = {
  snapshotDate?: string | Date;
  itemName?: string;
  sku?: string;
  site?: string;
  customer?: string;
  revenue?: number;
  cogs?: number;
  quantitySold?: number;
  freightAllocated?: number;
  otherRevenueAllocated?: number;
  returnsAmount?: number;
};

type InputTopProduct = {
  name?: string;
  sku?: string;
  totalRevenue?: number;
  totalCogs?: number;
  totalQuantity?: number;
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
  freightAllocated: number;
  otherRevenueAllocated: number;
  returnsAmount: number;
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

const toNumber = (value: unknown): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const weekStartIso = (date: Date): string => {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diffToMonday);
  return utc.toISOString().split('T')[0];
};

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

export function buildWeeklyProductMarginModel(params: {
  records?: InputRecord[];
  topProducts?: InputTopProduct[];
  weeks?: number;
  rangeStart?: string | Date;
  rangeEnd?: string | Date;
}): WeeklyMarginModel {
  const records = Array.isArray(params.records) ? params.records : [];
  const maxWeeks = Math.max(8, params.weeks || 12);
  const keyedRows = new Map<string, ItemWeekRow>();

  for (const row of records) {
    const snapshotDate = toDate(row.snapshotDate);
    if (!snapshotDate) continue;
    const weekStart = weekStartIso(snapshotDate);
    const itemName = String(row.itemName || '').trim() || 'Unknown Item';
    const sku = String(row.sku || '').trim() || itemName;
    const site = String(row.site || '').trim() || 'N/A';
    const customer = String(row.customer || '').trim() || 'N/A';
    const netRevenue = toNumber(row.revenue);
    const cogs = toNumber(row.cogs);
    const units = toNumber(row.quantitySold);
    const freightAllocated = toNumber(row.freightAllocated);
    const otherRevenueAllocated = toNumber(row.otherRevenueAllocated);
    const returnsAmount = toNumber(row.returnsAmount);
    const key = [weekStart, itemName, sku, site, customer].join('||');
    const existing = keyedRows.get(key);
    if (!existing) {
      keyedRows.set(key, {
        weekStart,
        itemName,
        sku,
        site,
        customer,
        units,
        netRevenue,
        cogs,
        freightAllocated,
        otherRevenueAllocated,
        returnsAmount,
        marginAmount: netRevenue - cogs,
        marginPct: netRevenue === 0 ? null : ((netRevenue - cogs) / netRevenue) * 100,
      });
      continue;
    }
    existing.units += units;
    existing.netRevenue += netRevenue;
    existing.cogs += cogs;
    existing.freightAllocated += freightAllocated;
    existing.otherRevenueAllocated += otherRevenueAllocated;
    existing.returnsAmount += returnsAmount;
    existing.marginAmount = existing.netRevenue - existing.cogs;
    existing.marginPct = existing.netRevenue === 0 ? null : (existing.marginAmount / existing.netRevenue) * 100;
  }

  const itemRows = Array.from(keyedRows.values());
  const allWeekStarts = Array.from(new Set(itemRows.map((row) => row.weekStart))).sort((a, b) => a.localeCompare(b));
  const rangeStartDate = toDate(params.rangeStart);
  const rangeEndDate = toDate(params.rangeEnd);
  const hasValidRange =
    Boolean(rangeStartDate && rangeEndDate) &&
    (rangeEndDate as Date).getTime() >= (rangeStartDate as Date).getTime();

  let selectedWeeks: string[];
  if (hasValidRange) {
    const startWeekIso = weekStartIso(rangeStartDate as Date);
    const endWeekIso = weekStartIso(rangeEndDate as Date);
    const generatedWeeks: string[] = [];
    let cursor = new Date(`${startWeekIso}T00:00:00Z`);
    const end = new Date(`${endWeekIso}T00:00:00Z`);
    while (cursor.getTime() <= end.getTime()) {
      generatedWeeks.push(cursor.toISOString().split('T')[0]);
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    selectedWeeks = generatedWeeks;
  } else {
    selectedWeeks = allWeekStarts.slice(Math.max(0, allWeekStarts.length - maxWeeks));
  }

  const weeklyMap: Record<string, WeeklyMarginPoint> = {};
  const productWeeklyRows: ProductWeeklyPoint[] = [];
  itemRows.forEach((row) => {
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
    const returns = row.returnsAmount > 0 ? -1 * row.returnsAmount : 0;
    const grossRevenue = row.netRevenue + Math.abs(returns);
    const freight = row.freightAllocated;
    const otherRevenue = row.otherRevenueAllocated;

    const pricePerUnit =
      row.units > 0 ? row.netRevenue / row.units : row.netRevenue !== 0 ? row.netRevenue : null;
    const costPerUnit =
      row.units > 0 ? row.cogs / row.units : row.cogs !== 0 ? row.cogs : null;
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

  const weekly = selectedWeeks.map((weekStart) => {
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

  const entityKeyOf = (row: ItemWeekRow): string => {
    const sku = String(row.sku || '').trim();
    const site = String(row.site || '').trim();
    const item = String(row.itemName || '').trim();
    if (sku && site) return `${sku}||${site}`;
    if (sku) return sku;
    if (item && site) return `${item}||${site}`;
    return item || 'UNKNOWN_PRODUCT';
  };
  const byEntityWeek: Record<string, Record<string, ItemWeekRow>> = {};
  itemRows.forEach((row) => {
    const entityKey = entityKeyOf(row);
    byEntityWeek[entityKey] ||= {};
    if (!byEntityWeek[entityKey][row.weekStart]) {
      byEntityWeek[entityKey][row.weekStart] = {
        ...row,
        units: 0,
        netRevenue: 0,
        cogs: 0,
        freightAllocated: 0,
        otherRevenueAllocated: 0,
        returnsAmount: 0,
        marginAmount: 0,
        marginPct: null,
      };
    }
    const acc = byEntityWeek[entityKey][row.weekStart];
    acc.units += row.units;
    acc.netRevenue += row.netRevenue;
    acc.cogs += row.cogs;
    acc.freightAllocated += row.freightAllocated;
    acc.otherRevenueAllocated += row.otherRevenueAllocated;
    acc.returnsAmount += row.returnsAmount;
    acc.marginAmount = acc.netRevenue - acc.cogs;
    acc.marginPct = acc.netRevenue === 0 ? null : (acc.marginAmount / acc.netRevenue) * 100;
  });

  const hasEntitySignal = (row?: ItemWeekRow): boolean =>
    Boolean(
      row &&
        (Number(row.netRevenue || 0) !== 0 ||
          Number(row.cogs || 0) !== 0 ||
          Number(row.units || 0) !== 0 ||
          Number(row.freightAllocated || 0) !== 0 ||
          Number(row.otherRevenueAllocated || 0) !== 0)
    );
  const entityCountForWeek = (weekStart: string): number =>
    Object.values(byEntityWeek).reduce((count, rowsByWeek) => (hasEntitySignal(rowsByWeek[weekStart]) ? count + 1 : count), 0);
  const weeksWithEntities = selectedWeeks.filter((weekStart) => entityCountForWeek(weekStart) > 0);
  let latestWeek = weeksWithEntities[weeksWithEntities.length - 1] || selectedWeeks[selectedWeeks.length - 1];
  // If the newest week is extremely sparse, choose the densest recent week
  // so comparison tables/charts remain useful.
  if (latestWeek) {
    const sparseThreshold = 10;
    const latestCount = entityCountForWeek(latestWeek);
    if (latestCount > 0 && latestCount < sparseThreshold) {
      const recentCandidates = weeksWithEntities.slice(Math.max(0, weeksWithEntities.length - 8));
      if (recentCandidates.length > 0) {
        latestWeek = recentCandidates.reduce((best, candidate) =>
          entityCountForWeek(candidate) > entityCountForWeek(best) ? candidate : best
        , recentCandidates[0]);
      }
    }
  }
  const latestWeekIdx = selectedWeeks.indexOf(latestWeek);
  let priorWeek: string | undefined = undefined;
  for (let i = latestWeekIdx - 1; i >= 0; i -= 1) {
    const weekStart = selectedWeeks[i];
    if (entityCountForWeek(weekStart) > 0) {
      priorWeek = weekStart;
      break;
    }
  }
  if (!priorWeek) priorWeek = latestWeekIdx > 0 ? selectedWeeks[latestWeekIdx - 1] : selectedWeeks[selectedWeeks.length - 2];

  const movers = Object.entries(byEntityWeek)
    .map(([_, rowsByWeek]) => {
      const current = rowsByWeek[latestWeek];
      const previous = rowsByWeek[priorWeek];
      if (!current || !previous) return null;
      const currentPct = current.marginPct ?? 0;
      const priorPct = previous.marginPct ?? 0;
      return {
        itemName: current.itemName,
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

  const variancePct = 0;
  const status: 'acceptable' | 'warning' | 'investigate' = 'acceptable';

  const comparisonRows = Object.entries(byEntityWeek)
    .map(([_, rowsByWeek]) => {
      const current = rowsByWeek[latestWeek];
      const previous = rowsByWeek[priorWeek];
      if (!current) return null;

      const priceThisWeek =
        current.units > 0
          ? current.netRevenue / current.units
          : current.netRevenue !== 0
            ? current.netRevenue
            : null;
      const pricePriorWeek =
        previous && previous.units > 0
          ? previous.netRevenue / previous.units
          : previous && previous.netRevenue !== 0
            ? previous.netRevenue
            : null;
      const costThisWeek =
        current.units > 0 ? current.cogs / current.units : current.cogs !== 0 ? current.cogs : null;
      const costPriorWeek =
        previous && previous.units > 0
          ? previous.cogs / previous.units
          : previous && previous.cogs !== 0
            ? previous.cogs
            : null;
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
        itemName: current.itemName,
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
        marginPctPriorWeek: previous?.marginPct ?? null,
        marginDeltaPts:
          current.marginPct != null && previous?.marginPct != null
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
