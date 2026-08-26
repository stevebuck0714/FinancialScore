/**
 * Phase 1 payroll-bureau Cost-to-Serve.
 *
 * isolved supplies workload drivers. QBD/QBE (or another ERP) supplies
 * invoiced revenue, credits, tagged direct costs, and company-level expense
 * pools. Processor hours, support tickets, and implementation labor are
 * allocated until a capture process exists.
 */

export type CostToServePoolSource = 'qbd-gl' | 'estimated';

export type CostToServeOperatingClient = {
  clientName: string;
  ein?: string;
  accountManager: string;
  processor: string;
  clientType: string;
  sizeBand: string;
  employeeCount: number;
  payFrequency: string;
  stateCount: number;
  locationCount: number;
  payrolls: number;
  offCycleRuns: number;
  adjustments: number;
  liveChecks: number;
  directDeposits: number;
  garnishments?: number;
  jobCosting?: boolean;
  union?: boolean;
};

export type CostToServeRevenueInput = {
  clientName: string;
  grossBilled: number;
  credits: number;
  directCosts: number;
  mappedToQbd: boolean;
  itemizedInvoices: boolean;
};

export type CostToServeExpensePools = {
  payrollLabor: number;
  isolved: number;
  ach: number;
  checks: number;
  support: number;
  overhead: number;
  source: CostToServePoolSource;
};

export type CostToServeRow = CostToServeOperatingClient & {
  weightedUnits: number;
  grossBilled: number;
  credits: number;
  netRevenue: number;
  directCosts: number;
  allocatedIsolved: number;
  allocatedAch: number;
  allocatedChecks: number;
  allocatedProcessor: number;
  allocatedSupport: number;
  allocatedOverhead: number;
  allocatedTotal: number;
  costToServe: number;
  contribution: number;
  marginPct: number;
  revenuePerPayroll: number;
  revenuePerEmployee: number;
  mappedToQbd: boolean;
  itemizedInvoices: boolean;
  taggedDirectCosts: boolean;
  timeCaptured: boolean;
  ticketsCaptured: boolean;
  dataQuality: string;
};

export type CostToServeImplementationRow = {
  clientName: string;
  accountManager: string;
  processor: string;
  sizeBand: string;
  employeeCount: number;
  estimatedHours: number;
  loadedHourlyCost: number;
  laborCost: number;
  thirdPartyCost: number;
  implementationCost: number;
  implementationFee: number;
  paybackMonths: number | null;
  excludedFromMonthlyCts: true;
};

export type CostToServeSummary = {
  clients: number;
  employees: number;
  payrolls: number;
  weightedUnits: number;
  grossBilled: number;
  credits: number;
  netRevenue: number;
  directCosts: number;
  allocatedTotal: number;
  costToServe: number;
  contribution: number;
  avgMarginPct: number;
  mappedQbdClients: number;
  taggedDirectCostClients: number;
  unmappedQbdRevenue: number;
};

export type CostToServeReport = {
  phase: 1;
  period: 'month' | 'ytd' | 'annual';
  pools: CostToServeExpensePools;
  rows: CostToServeRow[];
  implementation: CostToServeImplementationRow[];
  summary: CostToServeSummary;
  notes: string[];
};

export const DEFAULT_LOADED_HOURLY_COST = 68;

const round2 = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;

function pct(part: number, total: number): number {
  return total > 0 ? round2((part / total) * 100) : 0;
}

function share(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

export function normalizeClientMatchKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(llc|inc|ltd|co|corp|company|companies|mfg|manufacturing|the)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function payrollsPerYear(payFrequency: string): number {
  const freq = String(payFrequency || '').trim();
  if (freq === 'Weekly') return 52;
  if (freq === 'Semimonthly') return 24;
  return 26;
}

export function scaleAmount(annualAmount: number, period: 'month' | 'ytd' | 'annual', monthIndex: number): number {
  const amount = Number(annualAmount) || 0;
  if (period === 'annual') return round2(amount);
  if (period === 'month') return round2(amount / 12);
  const months = Math.min(12, Math.max(1, monthIndex));
  return round2((amount * months) / 12);
}

export function scaleCount(annualCount: number, period: 'month' | 'ytd' | 'annual', monthIndex: number): number {
  return scaleAmount(annualCount, period, monthIndex);
}

export function scalePools(pools: CostToServeExpensePools, factor: number): CostToServeExpensePools {
  return {
    payrollLabor: round2(pools.payrollLabor * factor),
    isolved: round2(pools.isolved * factor),
    ach: round2(pools.ach * factor),
    checks: round2(pools.checks * factor),
    support: round2(pools.support * factor),
    overhead: round2(pools.overhead * factor),
    source: pools.source,
  };
}

export function estimateExpensePools(totalNetRevenue: number): CostToServeExpensePools {
  const revenue = Math.max(0, Number(totalNetRevenue) || 0);
  return {
    payrollLabor: round2(revenue * 0.38),
    isolved: round2(revenue * 0.06),
    ach: round2(revenue * 0.03),
    checks: round2(revenue * 0.015),
    support: round2(revenue * 0.08),
    overhead: round2(revenue * 0.1),
    source: 'estimated',
  };
}

export function expensePoolsFromFinancialTotals(input: {
  payroll?: number;
  benefits?: number;
  cogsPayroll?: number;
  professionalFees?: number;
  infrastructure?: number;
  phoneComm?: number;
  insurance?: number;
  rent?: number;
  otherExpense?: number;
}): CostToServeExpensePools {
  const payrollLabor = round2(
    Number(input.payroll || 0) + Number(input.benefits || 0) + Number(input.cogsPayroll || 0)
  );
  const isolved = round2(Number(input.professionalFees || 0) * 0.35 + Number(input.infrastructure || 0) * 0.25);
  const bankAndDelivery = round2(Number(input.phoneComm || 0) + Number(input.otherExpense || 0) * 0.15);
  const ach = round2(bankAndDelivery * 0.65);
  const checks = round2(bankAndDelivery * 0.35);
  const support = round2(payrollLabor * 0.18);
  const overhead = round2(
    Number(input.rent || 0) + Number(input.insurance || 0) + Number(input.otherExpense || 0) * 0.55
  );
  return {
    payrollLabor: round2(payrollLabor * 0.82),
    isolved,
    ach,
    checks,
    support,
    overhead,
    source: 'qbd-gl',
  };
}

export function costToServeWeightedUnits(client: CostToServeOperatingClient): number {
  return round2(
    Math.max(0, client.payrolls) * 1 +
      Math.max(0, client.employeeCount) * 0.02 +
      Math.max(0, client.offCycleRuns) * 1.5 +
      Math.max(0, client.stateCount - 1) * 0.4 +
      Math.max(0, client.adjustments) * 0.75 +
      Math.max(0, client.garnishments || 0) * 0.3 +
      Math.max(0, client.liveChecks) * 0.05
  );
}

export function estimatedImplementationHours(client: Pick<CostToServeOperatingClient, 'employeeCount' | 'stateCount' | 'jobCosting' | 'union'>): number {
  return round2(
    10 +
      Math.max(0, client.employeeCount) * 0.08 +
      Math.max(0, client.stateCount) * 2 +
      (client.jobCosting ? 6 : 0) +
      (client.union ? 8 : 0)
  );
}

function allocate(pool: number, weight: number, totalWeight: number): number {
  return round2(pool * share(weight, totalWeight));
}

function dataQualityLabel(row: {
  mappedToQbd: boolean;
  itemizedInvoices: boolean;
  taggedDirectCosts: boolean;
}): string {
  return [
    row.mappedToQbd ? (row.itemizedInvoices ? 'QBD itemized revenue' : 'QBD revenue') : 'Est. revenue',
    row.taggedDirectCosts ? 'Tagged direct costs' : 'Allocated shared costs',
    'No processor time',
    'No tickets',
  ].join(' · ');
}

export function unmappedAccountingRevenue(
  accountingMap: { entries(): IterableIterator<[string, { grossBilled?: number }]> } | undefined | null,
  clientNames: string[]
): number {
  if (!accountingMap) return 0;
  const known = new Set(clientNames.map((name) => normalizeClientMatchKey(name)).filter(Boolean));
  let total = 0;
  let hasRows = false;
  for (const [key, row] of accountingMap.entries()) {
    hasRows = true;
    if (!known.has(key)) total += Number(row.grossBilled || 0);
  }
  return hasRows ? round2(total) : 0;
}

export function buildCostToServeReport(options: {
  period: 'month' | 'ytd' | 'annual';
  clients: CostToServeOperatingClient[];
  revenueByClientName?: Map<string, CostToServeRevenueInput>;
  estimatedGrossByClientName?: Map<string, number>;
  pools?: CostToServeExpensePools | null;
  unmappedQbdRevenue?: number;
  loadedHourlyCost?: number;
  monthIndex?: number;
}): CostToServeReport {
  const period = options.period;
  const revenueByName = options.revenueByClientName || new Map<string, CostToServeRevenueInput>();
  const estimatedGross = options.estimatedGrossByClientName || new Map<string, number>();
  const loadedHourlyCost = options.loadedHourlyCost || DEFAULT_LOADED_HOURLY_COST;

  const prepared = options.clients.map((client) => {
    const matchKey = normalizeClientMatchKey(client.clientName);
    const accounting = revenueByName.get(matchKey) || revenueByName.get(client.clientName);
    const grossBilled = accounting
      ? round2(accounting.grossBilled)
      : round2(estimatedGross.get(matchKey) || estimatedGross.get(client.clientName) || 0);
    const credits = accounting
      ? round2(accounting.credits)
      : round2(grossBilled * (0.004 + client.adjustments * 0.002 + (client.offCycleRuns > 0 ? 0.006 : 0)));
    const directCosts = accounting ? round2(accounting.directCosts) : 0;
    const netRevenue = round2(grossBilled - credits);
    return {
      client,
      matchKey,
      accounting,
      grossBilled,
      credits,
      directCosts,
      netRevenue,
      weightedUnits: costToServeWeightedUnits(client),
    };
  });

  const totalNetRevenue = round2(prepared.reduce((sum, row) => sum + row.netRevenue, 0));
  const pools = options.pools?.source
    ? options.pools
    : estimateExpensePools(totalNetRevenue);

  const totalUnits = prepared.reduce((sum, row) => sum + row.weightedUnits, 0);
  const totalEmployees = prepared.reduce((sum, row) => sum + row.client.employeeCount, 0);
  const totalAch = prepared.reduce((sum, row) => sum + row.client.directDeposits, 0);
  const totalChecks = prepared.reduce((sum, row) => sum + row.client.liveChecks, 0);

  const rows: CostToServeRow[] = prepared
    .map((row) => {
      const allocatedIsolved = allocate(pools.isolved, row.client.employeeCount, totalEmployees);
      const allocatedAch = allocate(pools.ach, row.client.directDeposits, totalAch);
      const allocatedChecks = allocate(pools.checks, row.client.liveChecks, totalChecks);
      const allocatedProcessor = allocate(pools.payrollLabor, row.weightedUnits, totalUnits);
      const allocatedSupport = allocate(pools.support, row.client.employeeCount, totalEmployees);
      const allocatedOverhead = allocate(pools.overhead, row.netRevenue, totalNetRevenue);
      const allocatedTotal = round2(
        allocatedIsolved + allocatedAch + allocatedChecks + allocatedProcessor + allocatedSupport + allocatedOverhead
      );
      const costToServe = round2(row.directCosts + allocatedTotal);
      const contribution = round2(row.netRevenue - costToServe);
      const mappedToQbd = Boolean(row.accounting?.mappedToQbd);
      const itemizedInvoices = Boolean(row.accounting?.itemizedInvoices);
      const taggedDirectCosts = row.directCosts > 0;
      const qualityInput = { mappedToQbd, itemizedInvoices, taggedDirectCosts };
      return {
        ...row.client,
        weightedUnits: row.weightedUnits,
        grossBilled: row.grossBilled,
        credits: row.credits,
        netRevenue: row.netRevenue,
        directCosts: row.directCosts,
        allocatedIsolved,
        allocatedAch,
        allocatedChecks,
        allocatedProcessor,
        allocatedSupport,
        allocatedOverhead,
        allocatedTotal,
        costToServe,
        contribution,
        marginPct: pct(contribution, row.netRevenue),
        revenuePerPayroll: row.client.payrolls > 0 ? round2(row.netRevenue / row.client.payrolls) : 0,
        revenuePerEmployee: row.client.employeeCount > 0 ? round2(row.netRevenue / row.client.employeeCount) : 0,
        mappedToQbd,
        itemizedInvoices,
        taggedDirectCosts,
        timeCaptured: false,
        ticketsCaptured: false,
        dataQuality: dataQualityLabel(qualityInput),
      };
    })
    .sort((a, b) => b.costToServe - a.costToServe || b.netRevenue - a.netRevenue);

  const implementation: CostToServeImplementationRow[] = prepared
    .map((row) => {
      const hours = estimatedImplementationHours(row.client);
      const laborCost = round2(hours * loadedHourlyCost);
      const thirdPartyCost = hours >= 40 ? 750 : hours >= 22 ? 350 : 0;
      const implementationCost = round2(laborCost + thirdPartyCost);
      const implementationFee = round2(implementationCost * (row.client.sizeBand === 'Enterprise' ? 0.85 : 0.7));
      const contribution = rows.find((item) => item.clientName === row.client.clientName)?.contribution || 0;
      const monthIndex = Math.min(12, Math.max(1, options.monthIndex || 1));
      const monthlyContribution =
        period === 'month' ? contribution :
        period === 'ytd' ? contribution / monthIndex :
        contribution / 12;
      const paybackMonths =
        implementationFee > 0 && monthlyContribution > 0
          ? round2(implementationCost / Math.max(monthlyContribution, 1))
          : null;
      return {
        clientName: row.client.clientName,
        accountManager: row.client.accountManager,
        processor: row.client.processor,
        sizeBand: row.client.sizeBand,
        employeeCount: row.client.employeeCount,
        estimatedHours: hours,
        loadedHourlyCost,
        laborCost,
        thirdPartyCost,
        implementationCost,
        implementationFee,
        paybackMonths,
        excludedFromMonthlyCts: true as const,
      };
    })
    .sort((a, b) => b.implementationCost - a.implementationCost);

  const summary: CostToServeSummary = {
    clients: rows.length,
    employees: totalEmployees,
    payrolls: round2(rows.reduce((sum, row) => sum + row.payrolls, 0)),
    weightedUnits: round2(totalUnits),
    grossBilled: round2(rows.reduce((sum, row) => sum + row.grossBilled, 0)),
    credits: round2(rows.reduce((sum, row) => sum + row.credits, 0)),
    netRevenue: totalNetRevenue,
    directCosts: round2(rows.reduce((sum, row) => sum + row.directCosts, 0)),
    allocatedTotal: round2(rows.reduce((sum, row) => sum + row.allocatedTotal, 0)),
    costToServe: round2(rows.reduce((sum, row) => sum + row.costToServe, 0)),
    contribution: round2(rows.reduce((sum, row) => sum + row.contribution, 0)),
    avgMarginPct: 0,
    mappedQbdClients: rows.filter((row) => row.mappedToQbd).length,
    taggedDirectCostClients: rows.filter((row) => row.taggedDirectCosts).length,
    unmappedQbdRevenue: round2(options.unmappedQbdRevenue || 0),
  };
  summary.avgMarginPct = pct(summary.contribution, summary.netRevenue);

  const notes = [
    'Phase 1 estimate: isolved volume and complexity plus invoiced revenue and allocated shared costs.',
    pools.source === 'qbd-gl'
      ? 'Shared cost pools come from QBD/QBE general-ledger expense totals.'
      : 'Shared cost pools are estimated from typical payroll-bureau cost ratios until QBD P&L accounts are mapped.',
    'Processor time, support tickets, and implementation labor are allocated, not actual hours.',
    'Implementation cost is reported separately and is excluded from recurring monthly cost-to-serve.',
    'Do not match isolved and QBD solely by client name in production; a crosswalk table is required.',
  ];

  return { phase: 1, period, pools, rows, implementation, summary, notes };
}
