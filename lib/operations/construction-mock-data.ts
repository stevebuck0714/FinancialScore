/**
 * Mock data for Construction sector ('23') operational tabs.
 *
 * Used by /api/operational-data?type=job-cost-control|project-portfolio|
 * commitments-forecast|billing-cash for any company that does not yet have a
 * live Vista Cloud connection (M6).
 *
 * Determinism: seeded by companyId. Same companyId → same data so tests,
 * screenshots, and demos are stable.
 *
 * See docs/CONSTRUCTION_SECTOR_DASHBOARD_DESIGN.md for the design contract.
 */

// ──────────────────────────────────────────────────────────────────────────
// Seeded RNG (deterministic per companyId).
// xmur3 string-hash → mulberry32 PRNG. ~50 LOC, no deps.
// ──────────────────────────────────────────────────────────────────────────

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seedKey: string): {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: ReadonlyArray<T>) => T;
  norm: (mean: number, stdev: number) => number;
} {
  const seed = xmur3(seedKey)();
  const rng = mulberry32(seed);
  const next = () => rng();
  const int = (min: number, max: number) => Math.floor(min + next() * (max - min + 1));
  const pick = <T>(items: ReadonlyArray<T>): T => items[int(0, items.length - 1)];
  const norm = (mean: number, stdev: number) => {
    // Box-Muller: 2 uniforms → 1 normal.
    const u = Math.max(1e-9, next());
    const v = next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + stdev * z;
  };
  return { next, int, pick, norm };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round0 = (n: number): number => Math.round(n);

// ──────────────────────────────────────────────────────────────────────────
// Domain catalogs
// ──────────────────────────────────────────────────────────────────────────

const PM_NAMES = [
  'D. Reyes', 'M. O\'Brien', 'L. Patel', 'C. Nakamura', 'A. Schultz',
  'J. Thompson', 'R. Bonilla', 'S. Whitaker',
] as const;

const JOB_PREFIXES = [
  'Highland Plaza', 'Riverwalk Tower', 'Westgate Logistics',
  'North Park Bridge', 'Maple Heights School', 'Summit Medical Center',
  'Lakeshore Apartments', 'Industrial Park Phase II', 'Oakwood Civic Center',
  'Crestview Hospital Wing', 'Eastside Distribution Hub', 'Pinecrest Retail',
] as const;

const JOB_PHASES = ['Phase I', 'Building A', 'Site Work', 'Renovation', 'Expansion', 'Tenant Fit-Out'] as const;

const COST_TYPES = [
  { type: 'Labor', subTypes: ['Regular', 'Overtime', 'Apprentice'] },
  { type: 'Materials', subTypes: ['Concrete', 'Steel', 'Drywall', 'MEP Materials', 'Finishes'] },
  { type: 'Subcontract', subTypes: ['Electrical', 'Mechanical', 'Plumbing', 'Roofing', 'Glazing'] },
  { type: 'Equipment', subTypes: ['Owned', 'Rental', 'Fuel & Maintenance'] },
  { type: 'Other', subTypes: ['Permits', 'Travel', 'Site Office', 'Insurance'] },
] as const;

const COST_TYPE_BUDGET_MIX: Record<string, number> = {
  Labor: 0.32,
  Materials: 0.28,
  Subcontract: 0.27,
  Equipment: 0.08,
  Other: 0.05,
};

const COST_CODES: ReadonlyArray<{ code: string; description: string; type: string }> = [
  { code: '01-100', description: 'General Conditions', type: 'Other' },
  { code: '02-200', description: 'Sitework / Excavation', type: 'Subcontract' },
  { code: '03-300', description: 'Concrete – Foundations', type: 'Materials' },
  { code: '03-310', description: 'Concrete – Slab on Grade', type: 'Materials' },
  { code: '04-200', description: 'Masonry', type: 'Subcontract' },
  { code: '05-100', description: 'Structural Steel', type: 'Subcontract' },
  { code: '06-100', description: 'Rough Carpentry', type: 'Labor' },
  { code: '07-500', description: 'Roofing', type: 'Subcontract' },
  { code: '08-400', description: 'Glazing', type: 'Subcontract' },
  { code: '09-250', description: 'Drywall & Framing', type: 'Subcontract' },
  { code: '15-400', description: 'Plumbing', type: 'Subcontract' },
  { code: '15-500', description: 'HVAC', type: 'Subcontract' },
  { code: '16-100', description: 'Electrical', type: 'Subcontract' },
  { code: '01-500', description: 'Equipment Rental', type: 'Equipment' },
  { code: '01-700', description: 'Project Mgmt Labor', type: 'Labor' },
];

const LABOR_TYPES = ['Carpenter', 'Laborer', 'Foreman', 'Operator', 'Iron Worker', 'Apprentice'] as const;

const VENDORS_PO = [
  'Allied Building Products', 'Bay State Concrete', 'Crescent Steel Supply',
  'Dakota Lumber', 'Empire Roofing Supply', 'FastTrack MEP Wholesale',
  'Granite Glazing Supply', 'Heartland Drywall Co.', 'Independence Hardware',
  'Jefferson Industrial Rentals', 'Keystone Equipment Leasing', 'Liberty Aggregates',
] as const;

const VENDORS_SUB = [
  'Apex Mechanical', 'Bedrock Excavation', 'Capitol Electric', 'DuraSeal Roofing',
  'Eastern Glazing & Curtain Wall', 'Fortis Plumbing', 'Greenline Site Concrete',
  'Hawthorne Carpentry', 'Ironclad Steel Erectors', 'JT Masonry & Stone',
  'Kingfisher HVAC', 'Lighthouse Fire Protection',
] as const;

const CUSTOMERS = [
  'City of Riverside', 'County of Hampton', 'Highland Real Estate Trust',
  'Pinnacle Health System', 'Summit Public Schools', 'Eastside Industrial REIT',
  'Crestview Hospitality Group', 'Northgate Logistics', 'Lakeshore Properties LLC',
  'Civic Capital Partners', 'Westgate Development Co.', 'Maple Heights Board of Ed',
] as const;

// ──────────────────────────────────────────────────────────────────────────
// Types — exported so the API + UI share the contract
// ──────────────────────────────────────────────────────────────────────────

export type JccJob = {
  jobId: string;
  jobName: string;
  pmName: string;
  status: 'in_progress' | 'closing_out' | 'just_started';
  revisedContractValue: number;
  costToDate: number;
  remainingCommitted: number;
  eac: number;
  projectedProfit: number;
  marginPct: number;
  pctComplete: number;
  startDate: string;
  estCompletionDate: string;
};

export type JccDailyCostRow = {
  date: string;
  jobId: string;
  costType: string;
  subType: string;
  dailyCost: number;
  dailyBudget: number;
  variance: number;
  variancePct: number;
  status: 'on_budget' | 'over' | 'under';
};

export type JccCostCodeRow = {
  jobId: string;
  costCode: string;
  description: string;
  budget: number;
  actual: number;
  committed: number;
  totalExposure: number;
  variance: number;
};

export type JccCostByTypeRow = {
  jobId: string;
  costType: string;
  budget: number;
  actual: number;
  committed: number;
  variance: number;
  pctOfTotal: number;
};

export type JccLaborDetailRow = {
  date: string;
  jobId: string;
  laborType: string;
  hours: number;
  cost: number;
  budget: number;
  variance: number;
  otHours: number;
  equipmentHours: number;
  equipmentCost: number;
};

export type JobCostControlPayload = {
  jobs: JccJob[];
  dailyCost: JccDailyCostRow[];
  costCode: JccCostCodeRow[];
  costByType: JccCostByTypeRow[];
  laborDetail: JccLaborDetailRow[];
  summary: {
    totalRevisedContract: number;
    totalCostToDate: number;
    totalRemainingCommitted: number;
    totalEac: number;
    totalProjectedProfit: number;
    avgMarginPct: number;
    jobCount: number;
    asOfDate: string;
  };
  meta: {
    source: 'mock';
    seed: string;
    generatedAt: string;
    coverageDays: number;
  };
};

// ──────────────────────────────────────────────────────────────────────────
// Builder
// ──────────────────────────────────────────────────────────────────────────

function dateMinusDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type BuildJobCostControlMockOptions = {
  jobCount?: number;       // default 10
  coverageDays?: number;   // default 60 business days of daily cost rows
  asOf?: Date;             // default = today UTC
};

export function buildJobCostControlMock(
  companyId: string,
  options: BuildJobCostControlMockOptions = {}
): JobCostControlPayload {
  const seedKey = `jcc::${companyId || 'anonymous'}::v1`;
  const rng = makeRng(seedKey);
  const jobCount = Math.max(3, Math.min(20, options.jobCount ?? 10));
  const coverageDays = Math.max(15, Math.min(120, options.coverageDays ?? 60));
  const asOf = options.asOf ?? new Date();

  // ── Jobs ────────────────────────────────────────────────────────────────
  const usedNames = new Set<string>();
  const jobs: JccJob[] = [];

  for (let i = 0; i < jobCount; i += 1) {
    let baseName = rng.pick(JOB_PREFIXES);
    let attempt = 0;
    while (usedNames.has(baseName) && attempt < 10) {
      baseName = `${rng.pick(JOB_PREFIXES)} – ${rng.pick(JOB_PHASES)}`;
      attempt += 1;
    }
    usedNames.add(baseName);

    const revisedContractValue = round0(rng.norm(2_400_000, 1_200_000));
    const safeContract = Math.max(450_000, revisedContractValue);
    const pctComplete = Math.max(0.05, Math.min(0.98, rng.next() * 0.95 + 0.03));
    // Margin drift: most jobs land near 8-15%, some get into trouble (negative).
    const targetMarginPct = round2(rng.norm(11, 6));
    const projectedProfit = round0(safeContract * (targetMarginPct / 100));
    const eac = round0(safeContract - projectedProfit);
    const costToDate = round0(eac * pctComplete);
    const remainingCommitted = round0(eac * (1 - pctComplete) * (0.55 + rng.next() * 0.4));
    const marginPct = round2((projectedProfit / safeContract) * 100);

    const status: JccJob['status'] =
      pctComplete > 0.85 ? 'closing_out' : pctComplete < 0.15 ? 'just_started' : 'in_progress';
    const startOffsetDays = rng.int(120, 540);
    const completionOffsetDays = rng.int(30, 240);

    jobs.push({
      jobId: `JC-${(1000 + i).toString()}`,
      jobName: baseName,
      pmName: rng.pick(PM_NAMES),
      status,
      revisedContractValue: safeContract,
      costToDate,
      remainingCommitted,
      eac,
      projectedProfit,
      marginPct,
      pctComplete: round2(pctComplete * 100),
      startDate: ymd(dateMinusDays(asOf, startOffsetDays)),
      estCompletionDate: ymd(dateMinusDays(asOf, -completionOffsetDays)),
    });
  }

  // ── Daily cost vs budget ────────────────────────────────────────────────
  const dailyCost: JccDailyCostRow[] = [];
  const businessDates: Date[] = [];
  let cursor = new Date(asOf.getTime());
  cursor.setUTCHours(0, 0, 0, 0);
  let pulled = 0;
  while (businessDates.length < coverageDays && pulled < coverageDays * 2) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) businessDates.push(new Date(cursor.getTime()));
    cursor = dateMinusDays(cursor, 1);
    pulled += 1;
  }
  businessDates.reverse();

  for (const date of businessDates) {
    // Pick 1-3 active cost lines per day across the active jobs.
    const linesToday = rng.int(2, 5);
    for (let l = 0; l < linesToday; l += 1) {
      const job = rng.pick(jobs.filter((j) => j.status !== 'just_started').length > 0 ? jobs.filter((j) => j.status !== 'just_started') : jobs);
      const ct = rng.pick(COST_TYPES);
      const baseDailyBudget = (job.eac / coverageDays) * (COST_TYPE_BUDGET_MIX[ct.type] || 0.1);
      const dailyBudget = round0(Math.max(500, baseDailyBudget * (0.7 + rng.next() * 0.6)));
      // Cost can run hot or cold; cluster around budget.
      const dailyCostAmt = round0(dailyBudget * Math.max(0.5, rng.norm(1.04, 0.18)));
      const variance = dailyCostAmt - dailyBudget;
      const variancePct = round2((variance / Math.max(1, dailyBudget)) * 100);
      const status: JccDailyCostRow['status'] =
        Math.abs(variancePct) <= 5 ? 'on_budget' : variance > 0 ? 'over' : 'under';
      dailyCost.push({
        date: ymd(date),
        jobId: job.jobId,
        costType: ct.type,
        subType: rng.pick(ct.subTypes),
        dailyCost: dailyCostAmt,
        dailyBudget,
        variance,
        variancePct,
        status,
      });
    }
  }

  // ── Cost code variance (per job) ────────────────────────────────────────
  const costCode: JccCostCodeRow[] = [];
  for (const job of jobs) {
    const codeCount = rng.int(8, 13);
    const shuffled = [...COST_CODES].sort(() => rng.next() - 0.5).slice(0, codeCount);
    for (const cc of shuffled) {
      const codeBudgetShare = (COST_TYPE_BUDGET_MIX[cc.type] || 0.1) * (0.4 + rng.next() * 0.8);
      const budget = round0(job.eac * codeBudgetShare * (0.8 + rng.next() * 0.4));
      const actualPct = job.pctComplete / 100;
      const actual = round0(budget * actualPct * Math.max(0.6, rng.norm(1.05, 0.15)));
      const committed = round0(budget * (1 - actualPct) * (0.35 + rng.next() * 0.5));
      const totalExposure = actual + committed;
      const variance = totalExposure - budget;
      costCode.push({
        jobId: job.jobId,
        costCode: cc.code,
        description: cc.description,
        budget,
        actual,
        committed,
        totalExposure,
        variance,
      });
    }
  }

  // ── Cost by type (per job) ──────────────────────────────────────────────
  const costByType: JccCostByTypeRow[] = [];
  for (const job of jobs) {
    let runningTotal = 0;
    const rowsForJob: JccCostByTypeRow[] = [];
    for (const ct of COST_TYPES) {
      const mix = COST_TYPE_BUDGET_MIX[ct.type] || 0.1;
      const budget = round0(job.eac * mix);
      const actualPct = job.pctComplete / 100;
      const actual = round0(budget * actualPct * Math.max(0.7, rng.norm(1.03, 0.12)));
      const committed = round0(budget * (1 - actualPct) * (0.4 + rng.next() * 0.4));
      const variance = actual + committed - budget;
      runningTotal += actual + committed;
      rowsForJob.push({
        jobId: job.jobId,
        costType: ct.type,
        budget,
        actual,
        committed,
        variance,
        pctOfTotal: 0,
      });
    }
    for (const row of rowsForJob) {
      row.pctOfTotal = round2(((row.actual + row.committed) / Math.max(1, runningTotal)) * 100);
    }
    costByType.push(...rowsForJob);
  }

  // ── Labor detail (with equipment columns per M2 decision) ───────────────
  const laborDetail: JccLaborDetailRow[] = [];
  // Last 30 business days of labor entries, 2-4 entries per day across active jobs.
  const laborDates = businessDates.slice(-30);
  for (const date of laborDates) {
    const entriesToday = rng.int(2, 4);
    for (let e = 0; e < entriesToday; e += 1) {
      const job = rng.pick(jobs.filter((j) => j.status !== 'just_started'));
      if (!job) continue;
      const laborType = rng.pick(LABOR_TYPES);
      const hours = round2(Math.max(2, rng.norm(8, 2.5)));
      const otHours = hours > 8 ? round2(hours - 8) : 0;
      const ratePerHour = laborType === 'Foreman' ? 78 : laborType === 'Iron Worker' ? 68 : laborType === 'Operator' ? 64 : laborType === 'Carpenter' ? 58 : laborType === 'Apprentice' ? 32 : 48;
      const otRate = ratePerHour * 1.5;
      const cost = round0((hours - otHours) * ratePerHour + otHours * otRate);
      const budget = round0(8 * ratePerHour);
      const variance = cost - budget;
      const equipmentHours = laborType === 'Operator' || laborType === 'Iron Worker'
        ? round2(Math.max(0, rng.norm(6, 2.5)))
        : 0;
      const equipmentCost = equipmentHours > 0
        ? round0(equipmentHours * (laborType === 'Operator' ? 145 : 95))
        : 0;
      laborDetail.push({
        date: ymd(date),
        jobId: job.jobId,
        laborType,
        hours,
        cost,
        budget,
        variance,
        otHours,
        equipmentHours,
        equipmentCost,
      });
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  const totalRevisedContract = jobs.reduce((acc, j) => acc + j.revisedContractValue, 0);
  const totalCostToDate = jobs.reduce((acc, j) => acc + j.costToDate, 0);
  const totalRemainingCommitted = jobs.reduce((acc, j) => acc + j.remainingCommitted, 0);
  const totalEac = jobs.reduce((acc, j) => acc + j.eac, 0);
  const totalProjectedProfit = jobs.reduce((acc, j) => acc + j.projectedProfit, 0);
  const avgMarginPct = round2(jobs.reduce((acc, j) => acc + j.marginPct, 0) / Math.max(1, jobs.length));

  return {
    jobs,
    dailyCost,
    costCode,
    costByType,
    laborDetail,
    summary: {
      totalRevisedContract: round0(totalRevisedContract),
      totalCostToDate: round0(totalCostToDate),
      totalRemainingCommitted: round0(totalRemainingCommitted),
      totalEac: round0(totalEac),
      totalProjectedProfit: round0(totalProjectedProfit),
      avgMarginPct,
      jobCount: jobs.length,
      asOfDate: ymd(asOf),
    },
    meta: {
      source: 'mock',
      seed: seedKey,
      generatedAt: new Date().toISOString(),
      coverageDays,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// M3: Project Portfolio
// ──────────────────────────────────────────────────────────────────────────

export type PpJobProfitabilityRow = {
  jobId: string;
  jobName: string;
  pmName: string;
  status: JccJob['status'];
  pctComplete: number;
  revisedContractValue: number;
  costToDate: number;
  remainingCommitted: number;
  eac: number;
  projectedProfit: number;
  marginPct: number;
  costVariancePct: number;     // (eac vs original baseline)
  commitmentExposure: number;  // remainingCommitted / revisedContractValue
};

export type PpRiskFlagRow = {
  jobId: string;
  jobName: string;
  pmName: string;
  marginPct: number;
  costVariancePct: number;
  commitmentExposurePct: number;
  flags: string[];                 // e.g. ['Negative Margin', 'High Commitment Exposure']
  severity: 'critical' | 'high' | 'medium' | 'low';
};

export type PpScheduleRow = {
  jobId: string;
  jobName: string;
  pmName: string;
  plannedEndDate: string;
  projectedEndDate: string;
  slippageDays: number;            // positive = slipping behind, negative = ahead
  remainingContractValue: number;
  slippageImpact: number;          // dollar exposure attributable to slippage
  status: 'on_track' | 'minor_slip' | 'major_slip' | 'critical_slip' | 'ahead';
};

export type PpTopBottomRow = {
  jobId: string;
  jobName: string;
  pmName: string;
  marginPct: number;
  projectedProfit: number;
  revisedContractValue: number;
};

export type ProjectPortfolioPayload = {
  summary: {
    totalRevisedContract: number;
    totalCostToDate: number;
    totalRemainingCommitted: number;
    totalEac: number;
    totalProjectedProfit: number;
    avgMarginPct: number;
    jobCount: number;
    asOfDate: string;
  };
  jobProfitability: PpJobProfitabilityRow[];
  riskFlags: PpRiskFlagRow[];
  schedule: PpScheduleRow[];
  scheduleSlippageImpact: {
    jobsOnTrack: number;
    jobsMinorSlip: number;
    jobsMajorSlip: number;
    jobsCriticalSlip: number;
    jobsAhead: number;
    avgSlippageDays: number;
    maxSlippageDays: number;
    totalSlippageImpact: number;
    topSlippingJobs: PpScheduleRow[];   // top 5 by absolute impact
  };
  topJobs: PpTopBottomRow[];
  bottomJobs: PpTopBottomRow[];
  meta: {
    source: 'mock';
    seed: string;
    generatedAt: string;
  };
};

export type BuildProjectPortfolioMockOptions = {
  jobCount?: number;
  asOf?: Date;
};

export function buildProjectPortfolioMock(
  companyId: string,
  options: BuildProjectPortfolioMockOptions = {}
): ProjectPortfolioPayload {
  // Reuse the Job Cost Control jobs so the same companyId presents the same
  // portfolio across both tabs (they're really the same set of jobs viewed
  // through two different lenses).
  const jcc = buildJobCostControlMock(companyId, {
    jobCount: options.jobCount,
    asOf: options.asOf,
  });
  const asOf = options.asOf ?? new Date();
  const seedKey = `pp::${companyId || 'anonymous'}::v1`;
  const rng = makeRng(seedKey);

  // ── Job profitability rows (extends JccJob with derived metrics) ────────
  const jobProfitability: PpJobProfitabilityRow[] = jcc.jobs.map((j) => {
    // costVariancePct: how far the EAC has drifted from the original baseline
    // (revisedContractValue × target margin). Mock as a small Gaussian.
    const costVariancePct = round2(rng.norm(2.5, 4.5));
    const commitmentExposure = j.revisedContractValue > 0
      ? round2((j.remainingCommitted / j.revisedContractValue) * 100)
      : 0;
    return {
      jobId: j.jobId,
      jobName: j.jobName,
      pmName: j.pmName,
      status: j.status,
      pctComplete: j.pctComplete,
      revisedContractValue: j.revisedContractValue,
      costToDate: j.costToDate,
      remainingCommitted: j.remainingCommitted,
      eac: j.eac,
      projectedProfit: j.projectedProfit,
      marginPct: j.marginPct,
      costVariancePct,
      commitmentExposure,
    };
  });

  // ── Risk flags (only jobs with at least one flag are returned) ──────────
  const riskFlags: PpRiskFlagRow[] = [];
  for (const row of jobProfitability) {
    const flags: string[] = [];
    if (row.marginPct < 0) flags.push('Negative Margin');
    else if (row.marginPct < 5) flags.push('Thin Margin');
    if (row.costVariancePct > 8) flags.push('Cost Drift');
    if (row.commitmentExposure > 35) flags.push('High Commitment Exposure');
    if (row.pctComplete > 80 && row.marginPct < 6) flags.push('Late-Stage Margin Risk');
    if (row.pctComplete < 20 && row.costVariancePct > 5) flags.push('Early Cost Drift');
    if (flags.length === 0) continue;

    let severity: PpRiskFlagRow['severity'] = 'low';
    if (row.marginPct < 0 || flags.length >= 3) severity = 'critical';
    else if (row.marginPct < 3 || row.costVariancePct > 12) severity = 'high';
    else if (flags.length >= 2 || row.marginPct < 6) severity = 'medium';

    riskFlags.push({
      jobId: row.jobId,
      jobName: row.jobName,
      pmName: row.pmName,
      marginPct: row.marginPct,
      costVariancePct: row.costVariancePct,
      commitmentExposurePct: row.commitmentExposure,
      flags,
      severity,
    });
  }
  // Sort: critical > high > medium > low; within tier, worst margin first.
  const severityOrder: Record<PpRiskFlagRow['severity'], number> = {
    critical: 0, high: 1, medium: 2, low: 3,
  };
  riskFlags.sort((a, b) => {
    const sev = severityOrder[a.severity] - severityOrder[b.severity];
    if (sev !== 0) return sev;
    return a.marginPct - b.marginPct;
  });

  // ── Schedule + slippage impact ──────────────────────────────────────────
  const schedule: PpScheduleRow[] = jcc.jobs.map((j) => {
    // Mix: ~55% on track / minor, ~25% medium slip, ~12% major, ~5% critical, ~3% ahead
    const r = rng.next();
    let slippageDays: number;
    if (r < 0.55) slippageDays = Math.round(rng.norm(2, 4));      // typical small drift
    else if (r < 0.80) slippageDays = Math.round(rng.norm(15, 6)); // medium slip
    else if (r < 0.92) slippageDays = Math.round(rng.norm(35, 10)); // major slip
    else if (r < 0.97) slippageDays = Math.round(rng.norm(60, 15)); // critical
    else slippageDays = -Math.round(Math.abs(rng.norm(7, 4)));     // ahead of schedule

    const plannedEnd = new Date(`${j.estCompletionDate}T00:00:00.000Z`);
    const projectedEnd = new Date(plannedEnd.getTime());
    projectedEnd.setUTCDate(projectedEnd.getUTCDate() + slippageDays);

    const remainingContractValue = Math.max(
      0,
      Math.round(j.revisedContractValue * (1 - j.pctComplete / 100))
    );
    // Daily burn proxy = EAC / total project days (ballpark).
    const projectDays = Math.max(60, Math.round(j.revisedContractValue / 18000));
    const dailyBurn = j.eac / projectDays;
    const slippageImpact = Math.round(dailyBurn * Math.max(0, slippageDays) * 0.45);

    let status: PpScheduleRow['status'];
    if (slippageDays < 0) status = 'ahead';
    else if (slippageDays <= 5) status = 'on_track';
    else if (slippageDays <= 20) status = 'minor_slip';
    else if (slippageDays <= 45) status = 'major_slip';
    else status = 'critical_slip';

    return {
      jobId: j.jobId,
      jobName: j.jobName,
      pmName: j.pmName,
      plannedEndDate: ymd(plannedEnd),
      projectedEndDate: ymd(projectedEnd),
      slippageDays,
      remainingContractValue,
      slippageImpact,
      status,
    };
  });

  const slippingJobs = schedule.filter((s) => s.slippageDays > 5);
  const aheadJobs = schedule.filter((s) => s.slippageDays < 0);
  const onTrackJobs = schedule.filter((s) => s.slippageDays >= 0 && s.slippageDays <= 5);
  const totalSlippageImpact = schedule.reduce((acc, s) => acc + s.slippageImpact, 0);
  const slippageDaysSum = slippingJobs.reduce((acc, s) => acc + s.slippageDays, 0);
  const avgSlippageDays = slippingJobs.length > 0
    ? round2(slippageDaysSum / slippingJobs.length)
    : 0;
  const maxSlippageDays = schedule.reduce((acc, s) => Math.max(acc, s.slippageDays), 0);
  const topSlippingJobs = [...schedule]
    .sort((a, b) => b.slippageImpact - a.slippageImpact)
    .slice(0, 5);

  // ── Top / bottom jobs (by margin %) ─────────────────────────────────────
  const sortedByMargin = [...jobProfitability].sort((a, b) => b.marginPct - a.marginPct);
  const toTopBottom = (rows: PpJobProfitabilityRow[]): PpTopBottomRow[] =>
    rows.map((r) => ({
      jobId: r.jobId,
      jobName: r.jobName,
      pmName: r.pmName,
      marginPct: r.marginPct,
      projectedProfit: r.projectedProfit,
      revisedContractValue: r.revisedContractValue,
    }));
  const topJobs = toTopBottom(sortedByMargin.slice(0, 5));
  const bottomJobs = toTopBottom(sortedByMargin.slice(-5).reverse());

  return {
    summary: jcc.summary,
    jobProfitability,
    riskFlags,
    schedule,
    scheduleSlippageImpact: {
      jobsOnTrack: onTrackJobs.length,
      jobsMinorSlip: schedule.filter((s) => s.status === 'minor_slip').length,
      jobsMajorSlip: schedule.filter((s) => s.status === 'major_slip').length,
      jobsCriticalSlip: schedule.filter((s) => s.status === 'critical_slip').length,
      jobsAhead: aheadJobs.length,
      avgSlippageDays,
      maxSlippageDays,
      totalSlippageImpact: round0(totalSlippageImpact),
      topSlippingJobs,
    },
    topJobs,
    bottomJobs,
    meta: {
      source: 'mock',
      seed: seedKey,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// M4: Commitments & Forecast
// ──────────────────────────────────────────────────────────────────────────

export type CfEacForecastRow = {
  jobId: string;
  jobName: string;
  pmName: string;
  revisedContractValue: number;
  costToDate: number;
  remainingCommitted: number;
  eac: number;
  projectedProfit: number;
  marginPct: number;
};

export type CfCommitmentExposureRow = {
  jobId: string;
  jobName: string;
  budget: number;
  actual: number;
  committed: number;
  remainingCommitted: number;
  pctCommitted: number;        // (actual + committed) / budget * 100
};

export type CfChangeOrderRow = {
  jobId: string;
  jobName: string;
  originalContract: number;
  approvedCOs: number;
  pendingCOs: number;
  revisedContractValue: number;
  approvedCount: number;
  pendingCount: number;
};

export type CfOpenCommitmentRow = {
  commitmentId: string;
  commitmentType: 'Purchase Order' | 'Subcontract';
  vendor: string;
  jobId: string;
  jobName: string;
  refNo: string;
  original: number;
  incurred: number;
  remaining: number;
  pctIncurred: number;
  dueDate: string;
  status: 'open' | 'past_due' | 'closing_soon';
};

export type CommitmentsForecastPayload = {
  summary: {
    totalRevisedContract: number;
    totalEac: number;
    totalRemainingCommitted: number;
    totalProjectedProfit: number;
    avgMarginPct: number;
    totalApprovedCOs: number;
    totalPendingCOs: number;
    totalOpenCommitmentValue: number;
    openCommitmentCount: number;
    pastDueCommitmentCount: number;
    asOfDate: string;
    jobCount: number;
  };
  eacForecast: CfEacForecastRow[];
  commitmentExposure: CfCommitmentExposureRow[];
  changeOrders: CfChangeOrderRow[];
  openCommitments: CfOpenCommitmentRow[];
  meta: {
    source: 'mock';
    seed: string;
    generatedAt: string;
  };
};

export type BuildCommitmentsForecastMockOptions = {
  jobCount?: number;
  asOf?: Date;
};

export function buildCommitmentsForecastMock(
  companyId: string,
  options: BuildCommitmentsForecastMockOptions = {}
): CommitmentsForecastPayload {
  // Reuse JCC jobs so the same companyId presents consistent jobs across all
  // construction tabs.
  const jcc = buildJobCostControlMock(companyId, {
    jobCount: options.jobCount,
    asOf: options.asOf,
  });
  const asOf = options.asOf ?? new Date();
  const seedKey = `cf::${companyId || 'anonymous'}::v1`;
  const rng = makeRng(seedKey);

  // ── EAC / Forecast (mirrors job profitability, simpler shape) ───────────
  const eacForecast: CfEacForecastRow[] = jcc.jobs.map((j) => ({
    jobId: j.jobId,
    jobName: j.jobName,
    pmName: j.pmName,
    revisedContractValue: j.revisedContractValue,
    costToDate: j.costToDate,
    remainingCommitted: j.remainingCommitted,
    eac: j.eac,
    projectedProfit: j.projectedProfit,
    marginPct: j.marginPct,
  }));

  // ── Commitment exposure (per job — budget vs actual+committed) ──────────
  const commitmentExposure: CfCommitmentExposureRow[] = jcc.jobs.map((j) => {
    const budget = j.eac;
    const actual = j.costToDate;
    const committed = j.remainingCommitted;
    const remainingCommitted = j.remainingCommitted;
    const pctCommitted = budget > 0 ? round2(((actual + committed) / budget) * 100) : 0;
    return {
      jobId: j.jobId,
      jobName: j.jobName,
      budget,
      actual,
      committed,
      remainingCommitted,
      pctCommitted,
    };
  });

  // ── Change orders (per job — most jobs have COs, some don't) ────────────
  const changeOrders: CfChangeOrderRow[] = [];
  for (const j of jcc.jobs) {
    // ~80% of jobs have at least one CO. We DO emit a row for those without
    // CO activity too — the user wants "Change Order Impact" to always
    // render with rows or the "No data" fallback handled in UI.
    const hasActivity = rng.next() < 0.8;
    if (!hasActivity) {
      // For jobs with no CO activity, the revised contract == original.
      changeOrders.push({
        jobId: j.jobId,
        jobName: j.jobName,
        originalContract: j.revisedContractValue,
        approvedCOs: 0,
        pendingCOs: 0,
        revisedContractValue: j.revisedContractValue,
        approvedCount: 0,
        pendingCount: 0,
      });
      continue;
    }
    // Approved COs: typically 2-8% of contract value, mostly positive.
    const approvedPct = Math.max(-0.04, rng.norm(0.045, 0.035));
    const approvedCOs = round0(j.revisedContractValue * approvedPct);
    const approvedCount = approvedCOs !== 0 ? rng.int(1, 6) : 0;

    // Pending COs: 0-4% of contract value, smaller magnitude.
    const pendingPct = Math.max(0, rng.norm(0.012, 0.014));
    const pendingCOs = round0(j.revisedContractValue * pendingPct);
    const pendingCount = pendingCOs > 0 ? rng.int(1, 4) : 0;

    // Original contract is what the revised value would be without approved COs.
    const originalContract = round0(j.revisedContractValue - approvedCOs);

    changeOrders.push({
      jobId: j.jobId,
      jobName: j.jobName,
      originalContract,
      approvedCOs,
      pendingCOs,
      revisedContractValue: j.revisedContractValue,
      approvedCount,
      pendingCount,
    });
  }

  // ── Open commitments (POs and Subcontracts across the active jobs) ──────
  const openCommitments: CfOpenCommitmentRow[] = [];
  let poCounter = 1000;
  let scCounter = 500;
  for (const j of jcc.jobs) {
    if (j.status === 'just_started') continue;
    // Each job carries 3-9 open commitments (mix of POs and subs).
    const commitCount = rng.int(3, 9);
    const baseRemaining = j.remainingCommitted / Math.max(1, commitCount);
    for (let c = 0; c < commitCount; c += 1) {
      const isSubcontract = rng.next() < 0.45;
      const original = round0(Math.max(2_500, baseRemaining * (0.6 + rng.next() * 1.5)));
      const incurredPct = isSubcontract
        ? Math.max(0.05, Math.min(0.95, rng.norm(0.55, 0.22)))
        : Math.max(0.1, Math.min(0.95, rng.norm(0.65, 0.18)));
      const incurred = round0(original * incurredPct);
      const remaining = original - incurred;
      const dueOffsetDays = rng.int(-21, 75); // some past-due
      const dueDate = new Date(asOf.getTime());
      dueDate.setUTCDate(dueDate.getUTCDate() + dueOffsetDays);
      let status: CfOpenCommitmentRow['status'] = 'open';
      if (dueOffsetDays < 0) status = 'past_due';
      else if (incurredPct > 0.85) status = 'closing_soon';
      const refNo = isSubcontract ? `SC-${scCounter}` : `PO-${poCounter}`;
      const commitmentId = `${j.jobId}-${refNo}`;
      if (isSubcontract) scCounter += 1; else poCounter += 1;

      openCommitments.push({
        commitmentId,
        commitmentType: isSubcontract ? 'Subcontract' : 'Purchase Order',
        vendor: rng.pick(isSubcontract ? VENDORS_SUB : VENDORS_PO),
        jobId: j.jobId,
        jobName: j.jobName,
        refNo,
        original,
        incurred,
        remaining,
        pctIncurred: round2(incurredPct * 100),
        dueDate: ymd(dueDate),
        status,
      });
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  const totalRevisedContract = jcc.summary.totalRevisedContract;
  const totalEac = jcc.summary.totalEac;
  const totalRemainingCommitted = jcc.summary.totalRemainingCommitted;
  const totalProjectedProfit = jcc.summary.totalProjectedProfit;
  const avgMarginPct = jcc.summary.avgMarginPct;
  const totalApprovedCOs = changeOrders.reduce((acc, r) => acc + r.approvedCOs, 0);
  const totalPendingCOs = changeOrders.reduce((acc, r) => acc + r.pendingCOs, 0);
  const totalOpenCommitmentValue = openCommitments.reduce((acc, r) => acc + r.remaining, 0);
  const pastDueCommitmentCount = openCommitments.filter((r) => r.status === 'past_due').length;

  return {
    summary: {
      totalRevisedContract,
      totalEac,
      totalRemainingCommitted,
      totalProjectedProfit,
      avgMarginPct,
      totalApprovedCOs: round0(totalApprovedCOs),
      totalPendingCOs: round0(totalPendingCOs),
      totalOpenCommitmentValue: round0(totalOpenCommitmentValue),
      openCommitmentCount: openCommitments.length,
      pastDueCommitmentCount,
      asOfDate: ymd(asOf),
      jobCount: jcc.jobs.length,
    },
    eacForecast,
    commitmentExposure,
    changeOrders,
    openCommitments,
    meta: {
      source: 'mock',
      seed: seedKey,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// M5: Billing & Cash
// ──────────────────────────────────────────────────────────────────────────

export type BcBillingCashRow = {
  jobId: string;
  jobName: string;
  customer: string;
  costToDate: number;
  billedToDate: number;
  cashCollected: number;
  apOutstanding: number;
  netCashPosition: number;       // cashCollected - costToDate - apOutstanding
  billingPctOfCost: number;      // billedToDate / costToDate * 100
};

export type BcArByJobRow = {
  jobId: string;
  jobName: string;
  customer: string;
  totalAR: number;
  current: number;
  bucket30: number;
  bucket60: number;
  bucket90Plus: number;
  pctOver60: number;
};

export type BcApByJobRow = {
  jobId: string;
  jobName: string;
  vendor: string;
  totalAP: number;
  current: number;
  bucket30: number;
  bucket60: number;
  bucket90Plus: number;
  pctOver60: number;
};

export type BcPriorityRow = {
  id: string;
  type: 'collect' | 'pay';
  party: string;                 // customer name (collect) or vendor name (pay)
  jobId: string;
  jobName: string;
  balance: number;
  oldestAgeDays: number;
  priorityScore: number;         // higher = more urgent
  reason: string;                // e.g. "Past due 90+", "Largest open"
};

export type BillingCashPayload = {
  summary: {
    totalCostToDate: number;
    totalBilledToDate: number;
    totalCashCollected: number;
    totalAR: number;
    totalAROver60: number;
    totalAP: number;
    totalAPOver60: number;
    netCashPosition: number;     // sum across jobs
    underBilledAmount: number;   // sum where billed < cost
    overBilledAmount: number;    // sum where billed > cost
    asOfDate: string;
    jobCount: number;
  };
  billingCash: BcBillingCashRow[];
  arByJob: BcArByJobRow[];
  apByJob: BcApByJobRow[];
  priority: BcPriorityRow[];
  meta: {
    source: 'mock';
    seed: string;
    generatedAt: string;
  };
};

export type BuildBillingCashMockOptions = {
  jobCount?: number;
  asOf?: Date;
};

export function buildBillingCashMock(
  companyId: string,
  options: BuildBillingCashMockOptions = {}
): BillingCashPayload {
  const jcc = buildJobCostControlMock(companyId, {
    jobCount: options.jobCount,
    asOf: options.asOf,
  });
  const cf = buildCommitmentsForecastMock(companyId, {
    jobCount: options.jobCount,
    asOf: options.asOf,
  });
  const asOf = options.asOf ?? new Date();
  const seedKey = `bc::${companyId || 'anonymous'}::v1`;
  const rng = makeRng(seedKey);

  // ── Customer per job (deterministic based on jobId hash) ────────────────
  const customerByJob = new Map<string, string>();
  for (const j of jcc.jobs) {
    customerByJob.set(j.jobId, rng.pick(CUSTOMERS));
  }

  // ── Billing & Cash summary (per job) ────────────────────────────────────
  const billingCash: BcBillingCashRow[] = jcc.jobs.map((j) => {
    const customer = customerByJob.get(j.jobId) || rng.pick(CUSTOMERS);
    // Billed to date ≈ cost to date × billing factor (1.0 ± 0.15) reflecting
    // a mix of under-/over-billed jobs.
    const billingFactor = Math.max(0.65, Math.min(1.35, rng.norm(1.02, 0.15)));
    const billedToDate = round0(j.costToDate * billingFactor);
    // Cash collected ≈ 75-95% of billed (some open AR).
    const collectionFactor = Math.max(0.55, Math.min(0.97, rng.norm(0.85, 0.08)));
    const cashCollected = round0(billedToDate * collectionFactor);
    // AP outstanding ≈ 12-30% of cost-to-date (vendor invoices not yet paid).
    const apFactor = Math.max(0.05, Math.min(0.45, rng.norm(0.20, 0.07)));
    const apOutstanding = round0(j.costToDate * apFactor);
    // Net cash position from this job: cash we've collected from the customer
    // minus what we still owe vendors. (Costs already paid net out.)
    const netCash = cashCollected - apOutstanding;
    const billingPctOfCost = j.costToDate > 0
      ? round2((billedToDate / j.costToDate) * 100)
      : 0;
    return {
      jobId: j.jobId,
      jobName: j.jobName,
      customer,
      costToDate: j.costToDate,
      billedToDate,
      cashCollected,
      apOutstanding,
      netCashPosition: round0(netCash),
      billingPctOfCost,
    };
  });

  // ── AR by job (use billing - cash collected as the AR amount, then split by age) ──
  const arByJob: BcArByJobRow[] = billingCash.map((b) => {
    const totalAR = Math.max(0, b.billedToDate - b.cashCollected);
    if (totalAR === 0) {
      return {
        jobId: b.jobId,
        jobName: b.jobName,
        customer: b.customer,
        totalAR: 0,
        current: 0,
        bucket30: 0,
        bucket60: 0,
        bucket90Plus: 0,
        pctOver60: 0,
      };
    }
    // Age distribution: most current/30, smaller chunks in 60/90+.
    const r1 = Math.max(0.30, Math.min(0.85, rng.norm(0.55, 0.18))); // current
    const r2 = Math.max(0.05, Math.min(0.40, rng.norm(0.25, 0.10))); // 30
    const r3 = Math.max(0.0, Math.min(0.25, rng.norm(0.10, 0.06))); // 60
    const r4 = Math.max(0.0, Math.min(0.30, rng.norm(0.10, 0.07))); // 90+
    const total = r1 + r2 + r3 + r4;
    const current = round0(totalAR * (r1 / total));
    const bucket30 = round0(totalAR * (r2 / total));
    const bucket60 = round0(totalAR * (r3 / total));
    const bucket90Plus = totalAR - current - bucket30 - bucket60;
    const over60 = bucket60 + bucket90Plus;
    const pctOver60 = totalAR > 0 ? round2((over60 / totalAR) * 100) : 0;
    return {
      jobId: b.jobId,
      jobName: b.jobName,
      customer: b.customer,
      totalAR,
      current,
      bucket30,
      bucket60,
      bucket90Plus,
      pctOver60,
    };
  });

  // ── AP by job (group open commitments by job → primary vendor) ──────────
  // Reuse open commitments from M4 to keep vendors consistent across tabs.
  const apByJob: BcApByJobRow[] = (() => {
    // Aggregate AP per (jobId, vendor) using the largest vendor per job for the headline.
    const byJobVendor = new Map<string, { vendor: string; total: number }>();
    for (const c of cf.openCommitments) {
      // Treat the "incurred but not yet paid" portion as AP outstanding.
      // Use a fraction (~35%) of the incurred to simulate not-yet-paid.
      const apShare = round0(c.incurred * 0.35);
      if (apShare <= 0) continue;
      const k = `${c.jobId}::${c.vendor}`;
      const e = byJobVendor.get(k) || { vendor: c.vendor, total: 0 };
      e.total += apShare;
      byJobVendor.set(k, e);
    }
    // Pick top vendor per job
    const topByJob = new Map<string, { vendor: string; total: number }>();
    for (const [k, v] of byJobVendor.entries()) {
      const jobId = k.split('::')[0];
      const cur = topByJob.get(jobId);
      if (!cur || v.total > cur.total) topByJob.set(jobId, v);
    }
    const rows: BcApByJobRow[] = [];
    for (const j of jcc.jobs) {
      const top = topByJob.get(j.jobId);
      // Sum total AP across vendors for this job
      let totalAP = 0;
      for (const [k, v] of byJobVendor.entries()) {
        if (k.startsWith(`${j.jobId}::`)) totalAP += v.total;
      }
      if (totalAP === 0) {
        rows.push({
          jobId: j.jobId,
          jobName: j.jobName,
          vendor: top?.vendor || '—',
          totalAP: 0,
          current: 0,
          bucket30: 0,
          bucket60: 0,
          bucket90Plus: 0,
          pctOver60: 0,
        });
        continue;
      }
      const r1 = Math.max(0.40, Math.min(0.85, rng.norm(0.62, 0.12)));
      const r2 = Math.max(0.05, Math.min(0.35, rng.norm(0.22, 0.08)));
      const r3 = Math.max(0.0, Math.min(0.25, rng.norm(0.10, 0.06)));
      const r4 = Math.max(0.0, Math.min(0.20, rng.norm(0.06, 0.05)));
      const total = r1 + r2 + r3 + r4;
      const current = round0(totalAP * (r1 / total));
      const bucket30 = round0(totalAP * (r2 / total));
      const bucket60 = round0(totalAP * (r3 / total));
      const bucket90Plus = totalAP - current - bucket30 - bucket60;
      const over60 = bucket60 + bucket90Plus;
      const pctOver60 = totalAP > 0 ? round2((over60 / totalAP) * 100) : 0;
      rows.push({
        jobId: j.jobId,
        jobName: j.jobName,
        vendor: top?.vendor || '—',
        totalAP: round0(totalAP),
        current,
        bucket30,
        bucket60,
        bucket90Plus,
        pctOver60,
      });
    }
    return rows;
  })();

  // ── Priority action list (collect + pay) ────────────────────────────────
  const priority: BcPriorityRow[] = [];
  // Collections: AR rows with significant aged buckets
  for (const ar of arByJob) {
    if (ar.totalAR <= 0) continue;
    const oldestAge = ar.bucket90Plus > 0 ? 95 : ar.bucket60 > 0 ? 65 : ar.bucket30 > 0 ? 35 : 10;
    // Score: weight oldest aging × $ amount
    const score = (ar.bucket90Plus * 4) + (ar.bucket60 * 2.5) + (ar.bucket30 * 1.25) + ar.current;
    let reason = 'Largest open';
    if (ar.bucket90Plus > 0) reason = 'Past due 90+';
    else if (ar.bucket60 > 0) reason = 'Past due 60';
    else if (ar.bucket30 > 0) reason = 'Past due 30';
    priority.push({
      id: `collect::${ar.jobId}`,
      type: 'collect',
      party: ar.customer,
      jobId: ar.jobId,
      jobName: ar.jobName,
      balance: ar.totalAR,
      oldestAgeDays: oldestAge,
      priorityScore: round0(score),
      reason,
    });
  }
  // Payments: AP rows with significant aged buckets (we owe vendors)
  for (const ap of apByJob) {
    if (ap.totalAP <= 0) continue;
    const oldestAge = ap.bucket90Plus > 0 ? 95 : ap.bucket60 > 0 ? 65 : ap.bucket30 > 0 ? 35 : 10;
    const score = (ap.bucket90Plus * 4) + (ap.bucket60 * 2.5) + (ap.bucket30 * 1.25) + ap.current;
    let reason = 'Largest open';
    if (ap.bucket90Plus > 0) reason = 'Vendor 90+ past due';
    else if (ap.bucket60 > 0) reason = 'Vendor 60 past due';
    else if (ap.bucket30 > 0) reason = 'Vendor 30 past due';
    priority.push({
      id: `pay::${ap.jobId}`,
      type: 'pay',
      party: ap.vendor,
      jobId: ap.jobId,
      jobName: ap.jobName,
      balance: ap.totalAP,
      oldestAgeDays: oldestAge,
      priorityScore: round0(score),
      reason,
    });
  }
  // Sort priority by score desc, then trim to top 25
  priority.sort((a, b) => b.priorityScore - a.priorityScore);
  const priorityTrimmed = priority.slice(0, 25);

  // ── Summary ─────────────────────────────────────────────────────────────
  const totalCostToDate = jcc.summary.totalCostToDate;
  const totalBilledToDate = billingCash.reduce((acc, r) => acc + r.billedToDate, 0);
  const totalCashCollected = billingCash.reduce((acc, r) => acc + r.cashCollected, 0);
  const totalAR = arByJob.reduce((acc, r) => acc + r.totalAR, 0);
  const totalAROver60 = arByJob.reduce((acc, r) => acc + r.bucket60 + r.bucket90Plus, 0);
  const totalAP = apByJob.reduce((acc, r) => acc + r.totalAP, 0);
  const totalAPOver60 = apByJob.reduce((acc, r) => acc + r.bucket60 + r.bucket90Plus, 0);
  const netCashPosition = billingCash.reduce((acc, r) => acc + r.netCashPosition, 0);
  const underBilledAmount = billingCash.reduce(
    (acc, r) => (r.costToDate > r.billedToDate ? acc + (r.costToDate - r.billedToDate) : acc),
    0
  );
  const overBilledAmount = billingCash.reduce(
    (acc, r) => (r.billedToDate > r.costToDate ? acc + (r.billedToDate - r.costToDate) : acc),
    0
  );

  return {
    summary: {
      totalCostToDate: round0(totalCostToDate),
      totalBilledToDate: round0(totalBilledToDate),
      totalCashCollected: round0(totalCashCollected),
      totalAR: round0(totalAR),
      totalAROver60: round0(totalAROver60),
      totalAP: round0(totalAP),
      totalAPOver60: round0(totalAPOver60),
      netCashPosition: round0(netCashPosition),
      underBilledAmount: round0(underBilledAmount),
      overBilledAmount: round0(overBilledAmount),
      asOfDate: ymd(asOf),
      jobCount: jcc.jobs.length,
    },
    billingCash,
    arByJob,
    apByJob,
    priority: priorityTrimmed,
    meta: {
      source: 'mock',
      seed: seedKey,
      generatedAt: new Date().toISOString(),
    },
  };
}
