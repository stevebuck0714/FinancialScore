type JobType = 'Temp' | 'Perm' | 'Contract';

type RevenueBillablesRecord = {
  assignmentId: string;
  assignmentName: string;
  clientName: string;
  employeeName: string;
  role: string;
  jobType: JobType;
  billableHours: number;
  billRate: number;
  payRate: number;
  burdenCostPerHour: number;
  spreadPerHour: number;
  revenue: number;
  burdenCost: number;
  contributionMargin: number;
  grossMarginPct: number;
  compressionAlert: boolean;
  spreadChangePct: number;
};

type StaffingSummaryRow = {
  clientName: string;
  billableHours: number;
  revenue: number;
  avgBillRate: number;
  grossMarginPct: number;
  employeeCount: number;
};

type RoleRateRow = {
  role: string;
  avgBillRate: number;
  billableHours: number;
  revenue: number;
};

type JobTypeRevenueRow = {
  jobType: JobType;
  billableHours: number;
  revenue: number;
  avgBillRate: number;
};

type EmployeeRevenueRow = {
  employeeName: string;
  role: string;
  clientName: string;
  jobType: JobType;
  billableHours: number;
  revenue: number;
};

type UnitEconomicsClientRow = {
  clientName: string;
  spreadPerHour: number;
  grossMarginPct: number;
  burdenCostPerHour: number;
  contributionMargin: number;
  billableHours: number;
};

type UnitEconomicsAssignmentRow = {
  assignmentId: string;
  assignmentName: string;
  clientName: string;
  employeeName: string;
  role: string;
  jobType: JobType;
  billRate: number;
  payRate: number;
  spreadPerHour: number;
  burdenCostPerHour: number;
  contributionMargin: number;
  grossMarginPct: number;
  billableHours: number;
  compressionAlert: boolean;
  spreadChangePct: number;
};

type BuildRevenueBillablesPayload = {
  summary: {
    asOfDate: string;
    totalRevenue: number;
    totalBillableHours: number;
    avgBillRate: number;
    employeeCount: number;
  };
  clientRows: StaffingSummaryRow[];
  revenueByJobType: JobTypeRevenueRow[];
  billRateByRole: RoleRateRow[];
  revenuePerEmployee: EmployeeRevenueRow[];
  records: RevenueBillablesRecord[];
};

type BuildUnitEconomicsPayload = {
  summary: {
    asOfDate: string;
    avgSpreadPerHour: number;
    avgGrossMarginPct: number;
    avgBurdenCostPerHour: number;
    totalContributionMargin: number;
    alertCount: number;
  };
  spreadByClient: UnitEconomicsClientRow[];
  grossMarginByClient: UnitEconomicsClientRow[];
  payVsBillRate: UnitEconomicsAssignmentRow[];
  burdenCostPerHour: UnitEconomicsAssignmentRow[];
  contributionMarginByAssignment: UnitEconomicsAssignmentRow[];
  marginCompressionAlerts: UnitEconomicsAssignmentRow[];
  records: UnitEconomicsAssignmentRow[];
};

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

function makeRng(seedKey: string) {
  const seed = xmur3(seedKey)();
  const next = mulberry32(seed);
  return {
    next,
    int(min: number, max: number) {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick<T>(items: readonly T[]): T {
      return items[this.int(0, items.length - 1)];
    },
  };
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
const round0 = (value: number): number => Math.round(value);

const CLIENTS = [
  'Atlas Workforce',
  'Blue Ridge Logistics',
  'Crescent Distribution',
  'Delta Field Services',
  'Evergreen Support',
  'Frontline Retail Ops',
  'Granite Manufacturing',
  'Harbor Medical Staffing',
  'Ironwood Warehousing',
  'Keystone Facilities',
  'Lighthouse Hospitality',
  'Northstar Contact Center',
] as const;

const ROLES = [
  'Account Manager',
  'Forklift Operator',
  'Field Technician',
  'Project Coordinator',
  'Customer Support Rep',
  'Warehouse Associate',
  'Quality Inspector',
  'Maintenance Lead',
] as const;

const FIRST_NAMES = ['Avery', 'Jordan', 'Taylor', 'Morgan', 'Riley', 'Casey', 'Jamie', 'Cameron', 'Parker', 'Quinn'] as const;
const LAST_NAMES = ['Reed', 'Miller', 'Patel', 'Hayes', 'Brooks', 'Nguyen', 'Diaz', 'Wright', 'Turner', 'Cooper'] as const;
const JOB_TYPES: readonly JobType[] = ['Temp', 'Perm', 'Contract'] as const;

function latestAsOfDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function buildBaseRows(companyId: string): RevenueBillablesRecord[] {
  const rng = makeRng(`staffing:${companyId}`);
  const rows: RevenueBillablesRecord[] = [];
  for (let i = 0; i < 28; i += 1) {
    const clientName = rng.pick(CLIENTS);
    const role = rng.pick(ROLES);
    const employeeName = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    const jobType = rng.pick(JOB_TYPES);
    const billableHours = round0(rng.int(112, 188));
    const payRateBase = rng.int(18, 42) + rng.next();
    const payRate = round2(
      payRateBase +
        (role.includes('Manager') ? 8 : 0) +
        (role.includes('Lead') ? 5 : 0) +
        (jobType === 'Perm' ? 3 : jobType === 'Contract' ? 6 : 0)
    );
    const billRateMarkup =
      1.42 +
      (jobType === 'Contract' ? 0.06 : 0) +
      (jobType === 'Perm' ? 0.03 : 0) +
      (role.includes('Manager') ? 0.09 : 0);
    const billRate = round2(payRate * billRateMarkup + rng.int(1, 6));
    const burdenCostPerHour = round2(payRate * (0.14 + rng.next() * 0.1));
    const spreadPerHour = round2(billRate - payRate);
    const revenue = round2(billableHours * billRate);
    const burdenCost = round2(billableHours * burdenCostPerHour);
    const contributionMargin = round2(billableHours * (billRate - payRate - burdenCostPerHour));
    const grossMarginPct = revenue > 0 ? round2((contributionMargin / revenue) * 100) : 0;
    const spreadChangePct = round2((rng.next() * 32 - 18) + (grossMarginPct < 19 ? -8 : 0));
    const compressionAlert = spreadChangePct <= -8 || grossMarginPct < 18;
    rows.push({
      assignmentId: `ASG-${String(i + 1).padStart(3, '0')}`,
      assignmentName: `${clientName} - ${role}`,
      clientName,
      employeeName,
      role,
      jobType,
      billableHours,
      billRate,
      payRate,
      burdenCostPerHour,
      spreadPerHour,
      revenue,
      burdenCost,
      contributionMargin,
      grossMarginPct,
      compressionAlert,
      spreadChangePct,
    });
  }
  return rows;
}

function aggregateByClient(rows: RevenueBillablesRecord[]): StaffingSummaryRow[] {
  const grouped = new Map<string, StaffingSummaryRow>();
  for (const row of rows) {
    const current = grouped.get(row.clientName) || {
      clientName: row.clientName,
      billableHours: 0,
      revenue: 0,
      avgBillRate: 0,
      grossMarginPct: 0,
      employeeCount: 0,
    };
    current.billableHours += row.billableHours;
    current.revenue += row.revenue;
    current.grossMarginPct += row.grossMarginPct * row.revenue;
    current.employeeCount += 1;
    grouped.set(row.clientName, current);
  }
  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      avgBillRate: row.billableHours > 0 ? round2(row.revenue / row.billableHours) : 0,
      grossMarginPct: row.revenue > 0 ? round2(row.grossMarginPct / row.revenue) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function aggregateByJobType(rows: RevenueBillablesRecord[]): JobTypeRevenueRow[] {
  const grouped = new Map<JobType, JobTypeRevenueRow>();
  for (const row of rows) {
    const current = grouped.get(row.jobType) || {
      jobType: row.jobType,
      billableHours: 0,
      revenue: 0,
      avgBillRate: 0,
    };
    current.billableHours += row.billableHours;
    current.revenue += row.revenue;
    grouped.set(row.jobType, current);
  }
  return Array.from(grouped.values()).map((row) => ({
    ...row,
    avgBillRate: row.billableHours > 0 ? round2(row.revenue / row.billableHours) : 0,
  }));
}

function aggregateByRole(rows: RevenueBillablesRecord[]): RoleRateRow[] {
  const grouped = new Map<string, RoleRateRow>();
  for (const row of rows) {
    const current = grouped.get(row.role) || {
      role: row.role,
      avgBillRate: 0,
      billableHours: 0,
      revenue: 0,
    };
    current.billableHours += row.billableHours;
    current.revenue += row.revenue;
    grouped.set(row.role, current);
  }
  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      avgBillRate: row.billableHours > 0 ? round2(row.revenue / row.billableHours) : 0,
    }))
    .sort((a, b) => b.avgBillRate - a.avgBillRate);
}

export function buildRevenueBillablesMock(companyId: string): BuildRevenueBillablesPayload {
  const records = buildBaseRows(companyId);
  const clientRows = aggregateByClient(records);
  const totalRevenue = records.reduce((sum, row) => sum + row.revenue, 0);
  const totalBillableHours = records.reduce((sum, row) => sum + row.billableHours, 0);
  return {
    summary: {
      asOfDate: latestAsOfDate(),
      totalRevenue: round2(totalRevenue),
      totalBillableHours: round0(totalBillableHours),
      avgBillRate: totalBillableHours > 0 ? round2(totalRevenue / totalBillableHours) : 0,
      employeeCount: records.length,
    },
    clientRows,
    revenueByJobType: aggregateByJobType(records),
    billRateByRole: aggregateByRole(records),
    revenuePerEmployee: [...records]
      .map((row) => ({
        employeeName: row.employeeName,
        role: row.role,
        clientName: row.clientName,
        jobType: row.jobType,
        billableHours: row.billableHours,
        revenue: row.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    records,
  };
}

export function buildUnitEconomicsMock(companyId: string): BuildUnitEconomicsPayload {
  const records = buildBaseRows(companyId).map(
    (row): UnitEconomicsAssignmentRow => ({
      assignmentId: row.assignmentId,
      assignmentName: row.assignmentName,
      clientName: row.clientName,
      employeeName: row.employeeName,
      role: row.role,
      jobType: row.jobType,
      billRate: row.billRate,
      payRate: row.payRate,
      spreadPerHour: row.spreadPerHour,
      burdenCostPerHour: row.burdenCostPerHour,
      contributionMargin: row.contributionMargin,
      grossMarginPct: row.grossMarginPct,
      billableHours: row.billableHours,
      compressionAlert: row.compressionAlert,
      spreadChangePct: row.spreadChangePct,
    })
  );

  const byClient = new Map<string, UnitEconomicsClientRow>();
  for (const row of records) {
    const current = byClient.get(row.clientName) || {
      clientName: row.clientName,
      spreadPerHour: 0,
      grossMarginPct: 0,
      burdenCostPerHour: 0,
      contributionMargin: 0,
      billableHours: 0,
    };
    current.spreadPerHour += row.spreadPerHour * row.billableHours;
    current.grossMarginPct += row.grossMarginPct * row.billableHours;
    current.burdenCostPerHour += row.burdenCostPerHour * row.billableHours;
    current.contributionMargin += row.contributionMargin;
    current.billableHours += row.billableHours;
    byClient.set(row.clientName, current);
  }

  const clientRows = Array.from(byClient.values())
    .map((row) => ({
      ...row,
      spreadPerHour: row.billableHours > 0 ? round2(row.spreadPerHour / row.billableHours) : 0,
      grossMarginPct: row.billableHours > 0 ? round2(row.grossMarginPct / row.billableHours) : 0,
      burdenCostPerHour: row.billableHours > 0 ? round2(row.burdenCostPerHour / row.billableHours) : 0,
    }))
    .sort((a, b) => b.contributionMargin - a.contributionMargin);

  const totalContributionMargin = records.reduce((sum, row) => sum + row.contributionMargin, 0);
  const totalHours = records.reduce((sum, row) => sum + row.billableHours, 0);

  return {
    summary: {
      asOfDate: latestAsOfDate(),
      avgSpreadPerHour:
        totalHours > 0
          ? round2(records.reduce((sum, row) => sum + row.spreadPerHour * row.billableHours, 0) / totalHours)
          : 0,
      avgGrossMarginPct:
        totalHours > 0
          ? round2(records.reduce((sum, row) => sum + row.grossMarginPct * row.billableHours, 0) / totalHours)
          : 0,
      avgBurdenCostPerHour:
        totalHours > 0
          ? round2(records.reduce((sum, row) => sum + row.burdenCostPerHour * row.billableHours, 0) / totalHours)
          : 0,
      totalContributionMargin: round2(totalContributionMargin),
      alertCount: records.filter((row) => row.compressionAlert).length,
    },
    spreadByClient: [...clientRows].sort((a, b) => b.spreadPerHour - a.spreadPerHour),
    grossMarginByClient: [...clientRows].sort((a, b) => b.grossMarginPct - a.grossMarginPct),
    payVsBillRate: [...records].sort((a, b) => b.billRate - a.billRate),
    burdenCostPerHour: [...records].sort((a, b) => b.burdenCostPerHour - a.burdenCostPerHour),
    contributionMarginByAssignment: [...records].sort((a, b) => b.contributionMargin - a.contributionMargin),
    marginCompressionAlerts: records
      .filter((row) => row.compressionAlert)
      .sort((a, b) => a.spreadChangePct - b.spreadChangePct || a.grossMarginPct - b.grossMarginPct),
    records,
  };
}

type LaborSchedulingRecord = RevenueBillablesRecord & {
  paidHours: number;
  utilizationPct: number;
  overtimeHours: number;
  assignmentDurationDays: number;
  positionsRequested: number;
  positionsFilled: number;
  timeToFillDays: number;
  idleHours: number;
  idleWorkforceCost: number;
};

type LaborSchedulingRoleRow = {
  role: string;
  billableHours: number;
  paidHours: number;
  utilizationPct: number;
  positionsRequested: number;
  positionsFilled: number;
  fillRatePct: number;
  avgTimeToFillDays: number;
  avgAssignmentDurationDays: number;
  idleWorkforceCost: number;
  overtimeHours: number;
};

type CustomersSitesClientRow = {
  clientName: string;
  revenue: number;
  profit: number;
  marginPct: number;
  avgBillRate: number;
  retentionStatus: 'Retained' | 'At Risk' | 'Churned';
  lifetimeValueProxy: number;
};

function buildLaborSchedulingRows(companyId: string): LaborSchedulingRecord[] {
  const rng = makeRng(`labor:${companyId}`);
  return buildBaseRows(companyId).map((row) => {
    const overtimeHours = round2(Math.max(0, rng.int(-4, 18)));
    const paidHours = round2(row.billableHours + rng.int(6, 26) + overtimeHours);
    const utilizationPct = paidHours > 0 ? round2((row.billableHours / paidHours) * 100) : 0;
    const assignmentDurationDays = rng.int(28, 240);
    const positionsRequested = rng.int(1, 5);
    const positionsFilled = Math.min(positionsRequested, Math.max(0, positionsRequested - rng.int(0, 2)));
    const timeToFillDays = rng.int(5, 32);
    const idleHours = round2(Math.max(0, paidHours - row.billableHours));
    const idleWorkforceCost = round2(idleHours * row.payRate);
    return {
      ...row,
      paidHours,
      utilizationPct,
      overtimeHours,
      assignmentDurationDays,
      positionsRequested,
      positionsFilled,
      timeToFillDays,
      idleHours,
      idleWorkforceCost,
    };
  });
}

function aggregateLaborRoles(rows: LaborSchedulingRecord[]): LaborSchedulingRoleRow[] {
  const grouped = new Map<string, LaborSchedulingRoleRow>();
  for (const row of rows) {
    const current = grouped.get(row.role) || {
      role: row.role,
      billableHours: 0,
      paidHours: 0,
      utilizationPct: 0,
      positionsRequested: 0,
      positionsFilled: 0,
      fillRatePct: 0,
      avgTimeToFillDays: 0,
      avgAssignmentDurationDays: 0,
      idleWorkforceCost: 0,
      overtimeHours: 0,
    };
    current.billableHours += row.billableHours;
    current.paidHours += row.paidHours;
    current.positionsRequested += row.positionsRequested;
    current.positionsFilled += row.positionsFilled;
    current.avgTimeToFillDays += row.timeToFillDays;
    current.avgAssignmentDurationDays += row.assignmentDurationDays;
    current.idleWorkforceCost += row.idleWorkforceCost;
    current.overtimeHours += row.overtimeHours;
    grouped.set(row.role, current);
  }
  return Array.from(grouped.values()).map((row) => {
    const count = rows.filter((entry) => entry.role === row.role).length || 1;
    return {
      ...row,
      utilizationPct: row.paidHours > 0 ? round2((row.billableHours / row.paidHours) * 100) : 0,
      fillRatePct: row.positionsRequested > 0 ? round2((row.positionsFilled / row.positionsRequested) * 100) : 0,
      avgTimeToFillDays: round2(row.avgTimeToFillDays / count),
      avgAssignmentDurationDays: round2(row.avgAssignmentDurationDays / count),
    };
  });
}

export function buildLaborSchedulingMock(companyId: string) {
  const records = buildLaborSchedulingRows(companyId);
  const roleRows = aggregateLaborRoles(records);
  const totalBillableHours = records.reduce((sum, row) => sum + row.billableHours, 0);
  const totalPaidHours = records.reduce((sum, row) => sum + row.paidHours, 0);
  const totalRequested = records.reduce((sum, row) => sum + row.positionsRequested, 0);
  const totalFilled = records.reduce((sum, row) => sum + row.positionsFilled, 0);
  return {
    summary: {
      asOfDate: latestAsOfDate(),
      utilizationPct: totalPaidHours > 0 ? round2((totalBillableHours / totalPaidHours) * 100) : 0,
      fillRatePct: totalRequested > 0 ? round2((totalFilled / totalRequested) * 100) : 0,
      totalIdleWorkforceCost: round2(records.reduce((sum, row) => sum + row.idleWorkforceCost, 0)),
      totalOvertimeHours: round2(records.reduce((sum, row) => sum + row.overtimeHours, 0)),
      avgTimeToFillDays:
        records.length > 0 ? round2(records.reduce((sum, row) => sum + row.timeToFillDays, 0) / records.length) : 0,
    },
    utilizationByRole: roleRows.sort((a, b) => b.utilizationPct - a.utilizationPct),
    fillRateByRole: roleRows.sort((a, b) => b.fillRatePct - a.fillRatePct),
    timeToFillByRole: roleRows.sort((a, b) => a.avgTimeToFillDays - b.avgTimeToFillDays),
    assignmentDuration: [...records].sort((a, b) => b.assignmentDurationDays - a.assignmentDurationDays),
    idleWorkforceCost: [...records].sort((a, b) => b.idleWorkforceCost - a.idleWorkforceCost),
    overtimeAnalysis: [...records].sort((a, b) => b.overtimeHours - a.overtimeHours),
    records,
  };
}

function buildCustomersSitesRows(companyId: string): CustomersSitesClientRow[] {
  const rng = makeRng(`customers-sites:${companyId}`);
  return aggregateByClient(buildBaseRows(companyId)).map((row) => {
    const marginPct = round2(Math.max(6, row.grossMarginPct - rng.int(0, 9)));
    const profit = round2(row.revenue * (marginPct / 100));
    const retentionStatus =
      marginPct < 14 ? 'At Risk' : rng.int(0, 10) > 8 ? 'Churned' : 'Retained';
    const lifetimeValueProxy = round2(row.revenue * (2.2 + rng.next() * 1.6));
    return {
      clientName: row.clientName,
      revenue: row.revenue,
      profit,
      marginPct,
      avgBillRate: row.avgBillRate,
      retentionStatus,
      lifetimeValueProxy,
    };
  });
}

export function buildCustomersSitesMock(companyId: string) {
  const records = buildCustomersSitesRows(companyId).sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = records.reduce((sum, row) => sum + row.revenue, 0);
  const totalProfit = records.reduce((sum, row) => sum + row.profit, 0);
  const top5Share =
    totalRevenue > 0 ? round2((records.slice(0, 5).reduce((sum, row) => sum + row.revenue, 0) / totalRevenue) * 100) : 0;
  const top10Share =
    totalRevenue > 0 ? round2((records.slice(0, 10).reduce((sum, row) => sum + row.revenue, 0) / totalRevenue) * 100) : 0;
  return {
    summary: {
      asOfDate: latestAsOfDate(),
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
    contractRateCards: records.map((row, index) => ({
      clientName: row.clientName,
      primaryRateCard: `RC-${String(index + 1).padStart(3, '0')}`,
      avgBillRate: row.avgBillRate,
      floorRate: round2(row.avgBillRate * 0.9),
      premiumRate: round2(row.avgBillRate * 1.12),
    })),
    retentionChurn: records.map((row) => ({
      clientName: row.clientName,
      retentionStatus: row.retentionStatus,
      revenueDeltaPct: row.retentionStatus === 'Churned' ? -100 : row.retentionStatus === 'At Risk' ? -12 : 8,
      revenue: row.revenue,
    })),
    lowMarginClients: records.filter((row) => row.marginPct < 16).sort((a, b) => a.marginPct - b.marginPct),
    lifetimeValueProxy: [...records].sort((a, b) => b.lifetimeValueProxy - a.lifetimeValueProxy),
    records,
  };
}
