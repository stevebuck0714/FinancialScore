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
