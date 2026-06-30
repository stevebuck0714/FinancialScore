import {
  BAMBOOHR_SOURCE_CODE,
  type BambooHrSettings,
  assertBambooHrSettingsReady,
  defaultBambooHrSettings,
  fetchBambooHrJson,
  sanitizeBambooHrSettings,
} from '@/lib/bamboohr';
import {
  getOperationalSystemConnection,
  saveOperationalSystemConnection,
} from '@/lib/operational/operational-system-connections';
import {
  type ParsedCogentRateCard,
  findCogentRate,
  normalizeRateCardLevel,
  normalizeRateCardMarket,
  readCogentRateCard,
} from '@/lib/operational/cogent-rate-card';

type EmployeeRow = Record<string, unknown>;
type TableRow = Record<string, unknown>;

type HiringJobRow = {
  id: string;
  title: string;
  status: string;
  openJobs: number;
  clientName: string;
  division: string;
  department: string;
  location: string;
  postedDate: string | null;
  activeApplicantsCount: number;
  newApplicantsCount: number;
  totalApplicantsCount: number;
  postingUrl: string | null;
};

type HiringApplicationRow = {
  id: string;
  jobId: string;
  jobTitle: string;
  clientName: string;
  division: string;
  department: string;
  applicantName: string;
  email: string | null;
  phone: string | null;
  status: string;
  jobStage: string;
  applicationCount: number;
  jobPostedDate: string | null;
  acceptedOfferDate: string | null;
  appliedDate: string | null;
  hiredDate: string | null;
  startDate: string | null;
  lastUpdated: string | null;
  source: string | null;
  location: string | null;
  rating: number | null;
};

const HIRING_APPLICATION_PAGE_SAFETY_LIMIT = 1000;
const EXCLUDED_HIRING_JOB_TITLE_PHRASES = ['general consideration'];
const HIRED_APPLICATION_STATUS_QUERY = {
  applicationStatus: 'HIRED',
  jobStatusGroups: 'ALL',
};

type HiringPayloadOptions = {
  startDate?: Date | null;
  endDate?: Date | null;
};

type CurrentEmployee = {
  id: string;
  name: string;
  role: string;
  clientName: string;
  department: string;
  division: string;
  location: string;
  employmentStatus: string;
  employeeTaxType: string;
  billRateLevel: string;
  payType: string;
  paidPer: string;
  paySchedule: string;
  exempt: string;
  hourlyCost: number | null;
  annualCost: number | null;
  overtimeRatePresent: boolean;
};

type GroupRow = {
  key: string;
  headcount: number;
  hourlyCount: number;
  salaryCount: number;
  avgHourlyCost: number | null;
  avgAnnualCost: number | null;
  avgMonthlyCost: number | null;
  totalAnnualCost: number | null;
  minAnnualCost: number | null;
  maxAnnualCost: number | null;
  billRateLevelCoveragePct: number;
};

type BillRateLevelByMarketRow = {
  key: string;
  market: string;
  billRateLevel: string;
  headcount: number;
};

type EmployeeBillRateMatch = {
  employee: CurrentEmployee;
  market: string;
  normalizedBillRateLevel: string;
  billRate: number;
};

type EstimatedBillableEconomicsRow = {
  employeeId: string;
  employeeName: string;
  role: string;
  clientName: string;
  department: string;
  division: string;
  location: string;
  market: string;
  billRateLevel: string;
  normalizedBillRateLevel: string;
  payRate: number | null;
  annualPay: number | null;
  rateCardBillRate: number;
  billToPayRatio: number | null;
  estimatedAnnualBillings: number;
  estimatedAnnualPay: number | null;
  estimatedAnnualSpread: number | null;
};

type EmployeeCompensationRow = {
  employeeId: string;
  employeeName: string;
  role: string;
  clientName: string;
  department: string;
  division: string;
  location: string;
  employmentStatus: string;
  payType: string;
  paidPer: string;
  annualCost: number | null;
  monthlyCost: number | null;
  billRateLevel: string;
};

export type BambooHrWorkforceReportSnapshot = {
  source: 'BAMBOOHR_WORKFORCE';
  generatedAt: string;
  companyId: string;
  rateMatchVersion?: number;
  employeesSampled: number;
  summary: {
    asOfDate: string;
    headcount: number;
    activeOrCurrentHeadcount: number;
    billableHeadcount: number;
    billRateLevelCoveragePct: number;
    employeesWithPayRate: number;
    hourlyCount: number;
    salaryCount: number;
    avgHourlyCost: number | null;
    avgAnnualCost: number | null;
    avgMonthlyCost: number | null;
    totalAnnualCost: number | null;
    numericBillRatesAvailable: boolean;
    billableHoursAvailable: false;
    note: string;
  };
  dimensions: {
    headcountByRole: GroupRow[];
    headcountByDepartment: GroupRow[];
    headcountByLocation: GroupRow[];
    headcountByStatus: GroupRow[];
    headcountByBillRateLevel: GroupRow[];
    payTypeMix: Array<{ label: string; count: number; pct: number }>;
    exemptMix: Array<{ label: string; count: number; pct: number }>;
    billRateLevelCoverage: Array<{ label: string; count: number; pct: number }>;
    missingBillRateLevel: Array<{ employeeId: string; role: string; department: string; location: string }>;
    employeeCompensationRoster: EmployeeCompensationRow[];
  };
  revenueBillables: {
    summary: {
      asOfDate: string;
      employeeCount: number;
      billableEmployeeCount: number;
      billRateLevelCoveragePct: number;
      distinctBillRateLevels: number;
      numericBillRatesAvailable: boolean;
      avgBillRate: number | null;
      avgPayRate: number | null;
      overallBillToPayRate: number | null;
      billableHoursAvailable: false;
      note: string;
    };
    billRateLevelByRole: Array<{ role: string; headcount: number; covered: number; coveragePct: number; topLevels: string[] }>;
    billRateLevelRows: GroupRow[];
    billRateLevelByMarketRows: BillRateLevelByMarketRow[];
    estimatedBillableEconomicsByEmployee: EstimatedBillableEconomicsRow[];
    unavailableReports: string[];
  };
  unitEconomics: {
    summary: {
      asOfDate: string;
      avgHourlyCost: number | null;
      avgAnnualCost: number | null;
      avgMonthlyCost: number | null;
      totalAnnualCost: number | null;
      employeesWithPayRate: number;
      billRateLevelCoveragePct: number;
      note: string;
    };
    payCostByBillRateLevel: GroupRow[];
    payCostByRole: GroupRow[];
    payCostByLocation: GroupRow[];
    employeeCompensationRoster: EmployeeCompensationRow[];
    missingBillRateLevel: Array<{ employeeId: string; role: string; department: string; location: string }>;
    unavailableReports: string[];
  };
};

const SNAPSHOT_METADATA_KEY = 'bambooHrWorkforceReportSnapshot';
export const BAMBOOHR_WORKFORCE_RATE_MATCH_VERSION = 3;
const MAX_CONCURRENCY = 8;
const CURRENT_BAMBOOHR_CLIENT_NAME = 'Eli Lilly';
const ESTIMATED_ANNUAL_BILLABLE_HOURS = 1920;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return asNumber(record.value ?? record.amount ?? record.rate);
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,]/g, '').trim();
    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    const parsed = Number.parseFloat(match ? match[0] : cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function readEmployees(json: unknown): EmployeeRow[] {
  const employees = asRecord(json).employees;
  return Array.isArray(employees)
    ? employees.filter((employee): employee is EmployeeRow => Boolean(employee) && typeof employee === 'object' && !Array.isArray(employee))
    : [];
}

function readTableRows(json: unknown): TableRow[] {
  if (Array.isArray(json)) {
    return json.filter((row): row is TableRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
  }
  const record = asRecord(json);
  for (const key of ['rows', 'table', 'data']) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((row): row is TableRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
    }
  }
  return [];
}

function readCollection(json: unknown, keys: string[]): TableRow[] {
  if (Array.isArray(json)) {
    return json.filter((row): row is TableRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
  }
  const record = asRecord(json);
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((row): row is TableRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
    }
  }
  return [];
}

function sortByDateDesc(rows: TableRow[], field: string): TableRow[] {
  return [...rows].sort((a, b) => Date.parse(asString(b[field])) - Date.parse(asString(a[field])));
}

function latestRow(rows: TableRow[], field: string): TableRow {
  return sortByDateDesc(rows, field)[0] || {};
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function readBambooHrSettings(companyId: string): Promise<{
  settings: BambooHrSettings;
  metadata: Record<string, unknown>;
  connection: NonNullable<Awaited<ReturnType<typeof getOperationalSystemConnection>>>;
}> {
  const connection = await getOperationalSystemConnection(companyId, 'BAMBOOHR', BAMBOOHR_SOURCE_CODE);
  if (!connection) throw new Error('BambooHR connection is not configured for this company.');
  const metadata = asRecord(connection.connectionMetadata);
  const existingSettings = asRecord(metadata.bambooHrSettings);
  const settings = sanitizeBambooHrSettings(
    {
      ...defaultBambooHrSettings,
      ...existingSettings,
      syncFrequency: connection.syncFrequency || existingSettings.syncFrequency || defaultBambooHrSettings.syncFrequency,
      authType: connection.authType || existingSettings.authType || defaultBambooHrSettings.authType,
      baseUrl: connection.baseUrl || existingSettings.baseUrl || '',
      apiKey: connection.accessToken || existingSettings.apiKey || '',
    },
    connection.accessToken || ''
  );
  assertBambooHrSettingsReady(settings);
  return { settings, metadata, connection };
}

async function fetchEmployeeTable(settings: BambooHrSettings, employeeId: string, alias: string): Promise<TableRow[]> {
  const response = await fetchBambooHrJson(settings, `employees/${encodeURIComponent(employeeId)}/tables/${alias}`);
  return readTableRows(response.json);
}

async function fetchEmployeeDetail(settings: BambooHrSettings, employeeId: string): Promise<Record<string, unknown>> {
  const response = await fetchBambooHrJson(settings, `employees/${encodeURIComponent(employeeId)}`, {
    fields: 'customBillRateLevel',
  });
  return asRecord(response.json);
}

function normalizeCurrentEmployee(employee: EmployeeRow, detail: Record<string, unknown>, tables: Record<string, TableRow[]>): CurrentEmployee {
  const job = latestRow(tables.jobInfo || [], 'date');
  const status = latestRow(tables.employmentStatus || [], 'date');
  const compensation = latestRow(tables.compensation || [], 'startDate');
  const paidPer = asString(compensation.paidPer);
  const rate = asNumber(compensation.rate);
  const hourlyCost = rate == null ? null : paidPer.toLowerCase() === 'year' ? round2(rate / 2080) : rate;
  const annualCost = rate == null ? null : paidPer.toLowerCase() === 'hour' ? round2(rate * 2080) : rate;
  const firstName = asString(employee.firstName);
  const lastName = asString(employee.lastName);
  const employeeId = asString(employee.id);
  const department = asString(job.department) || asString(employee.department) || 'Unassigned';
  const division = asString(job.division) || asString(employee.division) || 'Unassigned';

  return {
    id: employeeId,
    name: asString(employee.displayName) || [firstName, lastName].filter(Boolean).join(' ') || employeeId,
    role: asString(job.jobTitle) || asString(employee.jobTitle) || 'Unassigned',
    clientName: currentBambooHrClientName(),
    department,
    division,
    location: asString(job.location) || asString(employee.location) || 'Unassigned',
    employmentStatus: asString(status.employmentStatus) || asString(employee.status) || 'Current',
    employeeTaxType: asString(status.employeeTaxType) || 'Unassigned',
    billRateLevel: asString(detail.customBillRateLevel) || 'Missing bill rate level',
    payType: asString(compensation.type) || 'Unassigned',
    paidPer: paidPer || 'Unassigned',
    paySchedule: asString(compensation.paySchedule) || 'Unassigned',
    exempt: asString(compensation.exempt) || 'Unassigned',
    hourlyCost,
    annualCost,
    overtimeRatePresent: asString(compensation.overtimeRate).length > 0,
  };
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? round2((numerator / denominator) * 100) : 0;
}

function average(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return finite.length ? round2(finite.reduce((sum, value) => sum + value, 0) / finite.length) : null;
}

function finiteNumbers(values: Array<number | null>): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function groupEmployees(employees: CurrentEmployee[], keyGetter: (employee: CurrentEmployee) => string): GroupRow[] {
  const grouped = new Map<string, CurrentEmployee[]>();
  for (const employee of employees) {
    const key = keyGetter(employee) || 'Unassigned';
    grouped.set(key, [...(grouped.get(key) || []), employee]);
  }
  return Array.from(grouped.entries())
    .map(([key, rows]) => {
      const annualCosts = finiteNumbers(rows.map((row) => row.annualCost));
      const totalAnnualCost = annualCosts.length ? round2(annualCosts.reduce((sum, value) => sum + value, 0)) : null;
      return {
        key,
        headcount: rows.length,
        hourlyCount: rows.filter((row) => row.paidPer.toLowerCase() === 'hour').length,
        salaryCount: rows.filter((row) => row.paidPer.toLowerCase() === 'year').length,
        avgHourlyCost: average(rows.map((row) => row.hourlyCost)),
        avgAnnualCost: average(rows.map((row) => row.annualCost)),
        avgMonthlyCost: average(rows.map((row) => (row.annualCost == null ? null : round2(row.annualCost / 12)))),
        totalAnnualCost,
        minAnnualCost: annualCosts.length ? Math.min(...annualCosts) : null,
        maxAnnualCost: annualCosts.length ? Math.max(...annualCosts) : null,
        billRateLevelCoveragePct: pct(rows.filter((row) => row.billRateLevel !== 'Missing bill rate level').length, rows.length),
      };
    })
    .sort((a, b) => b.headcount - a.headcount || a.key.localeCompare(b.key));
}

function buildEmployeeCompensationRoster(employees: CurrentEmployee[]): EmployeeCompensationRow[] {
  return [...employees]
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((employee) => ({
      employeeId: employee.id,
      employeeName: employee.name,
      role: employee.role,
      clientName: employee.clientName,
      department: employee.department,
      division: employee.division,
      location: employee.location,
      employmentStatus: employee.employmentStatus,
      payType: employee.payType,
      paidPer: employee.paidPer,
      annualCost: employee.annualCost,
      monthlyCost: employee.annualCost == null ? null : round2(employee.annualCost / 12),
      billRateLevel: employee.billRateLevel,
    }));
}

function mixRows(employees: CurrentEmployee[], keyGetter: (employee: CurrentEmployee) => string): Array<{ label: string; count: number; pct: number }> {
  return groupEmployees(employees, keyGetter).map((row) => ({
    label: row.key,
    count: row.headcount,
    pct: pct(row.headcount, employees.length),
  }));
}

function buildBillRateLevelByRole(employees: CurrentEmployee[]) {
  return groupEmployees(employees, (employee) => employee.role).map((roleRow) => {
    const rows = employees.filter((employee) => employee.role === roleRow.key);
    const levelCounts = groupEmployees(rows, (employee) => employee.billRateLevel)
      .filter((row) => row.key !== 'Missing bill rate level')
      .slice(0, 3)
      .map((row) => row.key);
    return {
      role: roleRow.key,
      headcount: roleRow.headcount,
      covered: rows.filter((employee) => employee.billRateLevel !== 'Missing bill rate level').length,
      coveragePct: roleRow.billRateLevelCoveragePct,
      topLevels: levelCounts,
    };
  });
}

function normalizeBillRateMarket(location: string): string {
  return normalizeRateCardMarket(location);
}

function buildBillRateLevelByMarketRows(employees: CurrentEmployee[]): BillRateLevelByMarketRow[] {
  const rows = employees.filter((employee) => employee.billRateLevel !== 'Missing bill rate level');
  const groups = new Map<string, BillRateLevelByMarketRow>();
  for (const employee of rows) {
    const market = normalizeBillRateMarket(employee.location);
    const billRateLevel = employee.billRateLevel || 'Unassigned';
    const key = `${market} / ${billRateLevel}`;
    const group = groups.get(key) || { key, market, billRateLevel, headcount: 0 };
    group.headcount += 1;
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .sort((a, b) => a.market.localeCompare(b.market) || a.billRateLevel.localeCompare(b.billRateLevel));
}

function buildEmployeeBillRateMatches(
  employees: CurrentEmployee[],
  rateCard: ParsedCogentRateCard | null,
  generatedAt: string
): EmployeeBillRateMatch[] {
  if (!rateCard?.rows?.length) return [];
  const snapshotYear = Number.parseInt(generatedAt.slice(0, 4), 10) || new Date().getFullYear();
  return employees
    .map((employee) => {
      const marketCandidates = Array.from(new Set([
        normalizeBillRateMarket(employee.location),
        normalizeBillRateMarket(employee.billRateLevel),
      ].filter((market) => market && market !== 'Unassigned')));
      const normalizedBillRateLevel = normalizeRateCardLevel(employee.billRateLevel);
      const matched = marketCandidates
        .map((market) => ({
          market,
          rate: findCogentRate(rateCard.rows, {
            year: snapshotYear,
            market,
            billRateLevel: normalizedBillRateLevel,
          }),
        }))
        .find((candidate) => candidate.rate);
      const rate = matched?.rate || null;
      if (!rate) return null;
      return {
        employee,
        market: matched?.market || normalizeBillRateMarket(employee.location),
        normalizedBillRateLevel,
        billRate: rate.billRate,
      };
    })
    .filter((row): row is EmployeeBillRateMatch => Boolean(row));
}

function buildEstimatedBillableEconomicsRows(matches: EmployeeBillRateMatch[]): EstimatedBillableEconomicsRow[] {
  return matches
    .map((match) => {
      const employee = match.employee;
      const payRate = employee.hourlyCost == null ? null : Number(employee.hourlyCost);
      const annualPay = employee.annualCost == null ? null : Number(employee.annualCost);
      const estimatedAnnualBillings = round2(match.billRate * ESTIMATED_ANNUAL_BILLABLE_HOURS);
      const estimatedAnnualPay = annualPay == null ? null : round2(annualPay);
      const estimatedAnnualSpread = estimatedAnnualPay == null ? null : round2(estimatedAnnualBillings - estimatedAnnualPay);
      const billToPayRatio = payRate != null && match.billRate > 0 ? round2(payRate / match.billRate) : null;
      return {
        employeeId: employee.id,
        employeeName: employee.name,
        role: employee.role,
        clientName: employee.clientName,
        department: employee.department,
        division: employee.division,
        location: employee.location,
        market: match.market,
        billRateLevel: employee.billRateLevel,
        normalizedBillRateLevel: match.normalizedBillRateLevel,
        payRate: payRate == null ? null : round2(payRate),
        annualPay: estimatedAnnualPay,
        rateCardBillRate: round2(match.billRate),
        billToPayRatio,
        estimatedAnnualBillings,
        estimatedAnnualPay,
        estimatedAnnualSpread,
      };
    })
    .sort((a, b) => (
      (b.estimatedAnnualSpread ?? -Infinity) - (a.estimatedAnnualSpread ?? -Infinity) ||
      a.employeeName.localeCompare(b.employeeName)
    ));
}

function labelValue(value: unknown): string {
  const record = asRecord(value);
  return asString(record.label) || asString(record.name) || asString(record.title) || asString(value);
}

function idValue(value: unknown): string {
  const record = asRecord(value);
  return asString(record.id) || asString(value);
}

function departmentMapKey(value: unknown): string {
  return asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function hiringLookupKey(value: unknown): string {
  return asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function addHiringLookupKey(keys: Set<string>, prefix: 'id' | 'title', value: unknown) {
  const key = hiringLookupKey(value);
  if (key) keys.add(`${prefix}:${key}`);
}

function hiringJobLookupKeys(row: TableRow): Set<string> {
  const keys = new Set<string>();
  const job = asRecord(row.job);
  const jobOpening = asRecord(row.jobOpening);
  const posting = asRecord(row.posting);
  const requisition = asRecord(row.requisition);
  const title = asRecord(row.title);
  [
    row.id,
    row.jobId,
    row.job_id,
    row.requisitionId,
    row.requisition_id,
    row.jobOpeningId,
    row.openingId,
    row.postingId,
    job.id,
    job.jobId,
    job.requisitionId,
    jobOpening.id,
    jobOpening.jobId,
    jobOpening.requisitionId,
    posting.id,
    posting.jobId,
    requisition.id,
    requisition.jobId,
    title.id,
  ].forEach((value) => addHiringLookupKey(keys, 'id', value));
  [
    labelValue(row.title),
    asString(row.jobTitle),
    labelValue(row.job),
    asString(job.title),
    labelValue(job.title),
    asString(job.name),
    labelValue(jobOpening.title),
    asString(jobOpening.title),
    asString(jobOpening.name),
    labelValue(posting.title),
    asString(posting.title),
    labelValue(requisition.title),
    asString(requisition.title),
  ].forEach((value) => addHiringLookupKey(keys, 'title', value));
  return keys;
}

function buildDepartmentDivisionMap(metadata: Record<string, unknown>): Map<string, string> {
  const snapshot = asRecord(metadata[SNAPSHOT_METADATA_KEY]);
  const dimensions = asRecord(snapshot.dimensions);
  const roster = Array.isArray(dimensions.employeeCompensationRoster) ? dimensions.employeeCompensationRoster : [];
  const counts = new Map<string, Map<string, number>>();
  roster.forEach((item) => {
    const row = asRecord(item);
    const department = asString(row.department);
    const division = asString(row.division);
    if (!department || !division) return;
    const departmentKey = departmentMapKey(department);
    if (!departmentKey) return;
    const divisionCounts = counts.get(departmentKey) || new Map<string, number>();
    divisionCounts.set(division, (divisionCounts.get(division) || 0) + 1);
    counts.set(departmentKey, divisionCounts);
  });
  return new Map(
    Array.from(counts.entries()).map(([departmentKey, divisionCounts]) => {
      const [division] = Array.from(divisionCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      return [departmentKey, division];
    })
  );
}

function divisionForDepartment(department: string, departmentDivisionMap: Map<string, string>): string {
  return departmentDivisionMap.get(departmentMapKey(department)) || 'Unassigned';
}

function currentBambooHrClientName(): string {
  return CURRENT_BAMBOOHR_CLIENT_NAME;
}

function normalizedHiringTitleForExclusion(value: unknown): string {
  return String(value || '').trim().replace(/[^a-z0-9]+/gi, ' ').replace(/\s+/g, ' ').toLowerCase();
}

function isExcludedHiringRollupTitle(value: unknown): boolean {
  const normalized = normalizedHiringTitleForExclusion(value);
  return normalized ? EXCLUDED_HIRING_JOB_TITLE_PHRASES.some((phrase) => normalized.includes(phrase)) : false;
}

function normalizeHiringJob(row: TableRow, departmentDivisionMap: Map<string, string> = new Map()): HiringJobRow {
  const titleRecord = asRecord(row.title);
  const status = labelValue(row.status) || 'Unknown';
  const department = labelValue(row.department) || 'Unassigned';
  const division = divisionForDepartment(department, departmentDivisionMap);
  const clientName = currentBambooHrClientName();
  return {
    id: asString(row.id) || idValue(row.job) || asString(titleRecord.id),
    title: labelValue(row.title) || asString(row.jobTitle) || 'Untitled Job',
    status,
    openJobs: status.toLowerCase() === 'open' ? 1 : 0,
    clientName,
    division,
    department,
    location: labelValue(row.location) || 'Unassigned',
    postedDate: asString(row.postedDate) || asString(row.createdDate) || null,
    activeApplicantsCount: asNumber(row.activeApplicantsCount) || 0,
    newApplicantsCount: asNumber(row.newApplicantsCount) || 0,
    totalApplicantsCount: asNumber(row.totalApplicantsCount) || 0,
    postingUrl: asString(row.postingUrl) || null,
  };
}

function normalizeHiringApplication(
  row: TableRow,
  jobsByKey: Map<string, HiringJobRow> = new Map(),
  jobs: HiringJobRow[] = [],
  departmentDivisionMap: Map<string, string> = new Map()
): HiringApplicationRow {
  const job = asRecord(row.job);
  const jobOpening = asRecord(row.jobOpening);
  const posting = asRecord(row.posting);
  const requisition = asRecord(row.requisition);
  const jobId = (
    idValue(row.job) ||
    asString(row.jobId) ||
    asString(row.job_id) ||
    asString(row.requisitionId) ||
    asString(row.requisition_id)
  );
  const rawJobTitle =
    labelValue(row.job) ||
    labelValue(job.title) ||
    asString(job.title) ||
    asString(row.jobTitle) ||
    labelValue(jobOpening.title) ||
    asString(jobOpening.title) ||
    labelValue(posting.title) ||
    asString(posting.title) ||
    labelValue(requisition.title) ||
    asString(requisition.title);
  const matchedJob = Array.from(hiringJobLookupKeys(row))
    .map((key) => jobsByKey.get(key))
    .find((item): item is HiringJobRow => Boolean(item)) ||
    (() => {
      const applicationTitleKey = hiringLookupKey(rawJobTitle);
      if (!applicationTitleKey) return null;
      return jobs.find((jobRow) => {
        const jobTitleKey = hiringLookupKey(jobRow.title);
        return jobTitleKey && (
          jobTitleKey === applicationTitleKey ||
          jobTitleKey.includes(applicationTitleKey) ||
          applicationTitleKey.includes(jobTitleKey)
        );
      }) || null;
    })();
  const applicant = asRecord(row.applicant);
  const statusRecord = asRecord(row.status);
  const normalizedStatus = labelValue(row.status) || 'Unknown';
  const hiredStatusDate = normalizedStatus.toLowerCase() === 'hired' ? asString(statusRecord.dateChanged) : '';
  const firstName = asString(row.firstName) || asString(applicant.firstName);
  const lastName = asString(row.lastName) || asString(applicant.lastName);
  const applicantName = (
    asString(row.applicantName) ||
    asString(row.name) ||
    asString(applicant.name) ||
    [firstName, lastName].filter(Boolean).join(' ')
  ).trim();
  const department =
    matchedJob?.department ||
    labelValue(row.department) ||
    labelValue(job.department) ||
    asString(job.department) ||
    labelValue(jobOpening.department) ||
    asString(jobOpening.department) ||
    labelValue(posting.department) ||
    asString(posting.department) ||
    labelValue(requisition.department) ||
    asString(requisition.department) ||
    'Unassigned';
  const division = divisionForDepartment(department, departmentDivisionMap);
  const clientName = currentBambooHrClientName();
  return {
    id: asString(row.id),
    jobId,
    jobTitle: rawJobTitle || matchedJob?.title || 'Unassigned Job',
    clientName,
    division,
    department,
    applicantName: applicantName || 'Applicant',
    email: asString(row.email) || asString(row.emailAddress) || asString(applicant.email) || null,
    phone: asString(row.phone) || asString(row.phoneNumber) || asString(applicant.phone) || null,
    status: normalizedStatus,
    jobStage: labelValue(row.jobStage) || labelValue(row.stage) || labelValue(row.applicationStage) || labelValue(row.workflowStage) || labelValue(row.status) || 'Unknown',
    applicationCount: 1,
    jobPostedDate: matchedJob?.postedDate || null,
    acceptedOfferDate: asString(row.acceptedOfferDate) || asString(row.offerAcceptedDate) || asString(row.offerAcceptanceDate) || asString(row.acceptedDate) || null,
    appliedDate: asString(row.appliedDate) || asString(row.createdDate) || null,
    hiredDate: asString(row.hiredDate) || asString(row.hireDate) || hiredStatusDate || null,
    startDate: asString(row.startDate) || asString(row.employeeStartDate) || asString(row.hireStartDate) || asString(applicant.availableStartDate) || null,
    lastUpdated: asString(row.lastUpdated) || asString(row.updatedDate) || asString(row.updatedAt) || null,
    source: labelValue(row.source) || asString(row.referralSource) || asString(row.applicationSource) || asString(row.sourceName) || null,
    location: labelValue(row.location) || labelValue(job.location) || matchedJob?.location || null,
    rating: asNumber(row.rating),
  };
}

function countRows<T extends Record<string, unknown>>(rows: T[], key: keyof T, labelKey: string) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const label = asString(row[key]) || 'Unknown';
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, count]) => ({ [labelKey]: label, count }))
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
}

function formatBambooHrNewSince(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return '';
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day} 00:00:00`;
}

function parseHiringDateMs(value: unknown): number | null {
  const raw = asString(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function isHiringApplicationAppliedInRange(application: HiringApplicationRow, options: HiringPayloadOptions): boolean {
  const appliedTime = parseHiringDateMs(application.appliedDate);
  if (appliedTime == null) return !options.startDate && !options.endDate;
  if (options.startDate && appliedTime < options.startDate.getTime()) return false;
  if (options.endDate && appliedTime > options.endDate.getTime()) return false;
  return true;
}

async function fetchBambooHrHiringApplicationPages(
  settings: BambooHrSettings,
  query: Record<string, string> = {},
  options: HiringPayloadOptions = {}
): Promise<TableRow[]> {
  const rows: TableRow[] = [];
  const endTime = options.endDate?.getTime() ?? null;
  for (let page = 1; page <= HIRING_APPLICATION_PAGE_SAFETY_LIMIT; page += 1) {
    const response = await fetchBambooHrJson(settings, 'applicant_tracking/applications', { ...query, page: String(page) });
    const pageRows = readCollection(response.json, ['applications']);
    if (pageRows.length === 0) break;
    rows.push(...pageRows);
    if (endTime != null) {
      const pageTimes = pageRows
        .map((row) => parseHiringDateMs(asString(row.appliedDate) || asString(row.createdDate)))
        .filter((time): time is number => time != null);
      if (pageTimes.some((time) => time > endTime)) break;
    }
  }
  return rows;
}

async function fetchBambooHrApplicationDetail(settings: BambooHrSettings, application: TableRow): Promise<TableRow> {
  const applicationId = asString(application.id) || asString(application.applicationId);
  if (!applicationId) return application;
  try {
    const response = await fetchBambooHrJson(settings, `applicant_tracking/applications/${encodeURIComponent(applicationId)}`);
    const detail = asRecord(asRecord(response.json).application || response.json);
    return {
      ...application,
      ...detail,
      applicant: {
        ...asRecord(application.applicant),
        ...asRecord(detail.applicant),
      },
      job: {
        ...asRecord(application.job),
        ...asRecord(detail.job),
      },
      status: detail.status || application.status,
    };
  } catch {
    return application;
  }
}

async function fetchBambooHrHiringApplications(settings: BambooHrSettings, options: HiringPayloadOptions = {}): Promise<TableRow[]> {
  const newSince = formatBambooHrNewSince(options.startDate);
  const dateQuery = newSince ? { newSince, sortBy: 'created_date', sortOrder: 'ASC' } : {};
  const [defaultRows, hiredRows] = await Promise.all([
    fetchBambooHrHiringApplicationPages(settings, dateQuery, options),
    fetchBambooHrHiringApplicationPages(settings, { ...HIRED_APPLICATION_STATUS_QUERY, ...dateQuery }, options),
  ]);
  const enrichedHiredRows = await mapWithConcurrency(
    hiredRows,
    MAX_CONCURRENCY,
    (row) => fetchBambooHrApplicationDetail(settings, row)
  );
  return Array.from(
    new Map(
      [...defaultRows, ...enrichedHiredRows].map((row) => [
        asString(row.id) || asString(row.applicationId) || JSON.stringify(row),
        row,
      ])
    ).values()
  );
}

export async function getBambooHrHiringPayload(companyId: string, options: HiringPayloadOptions = {}) {
  const { settings, metadata } = await readBambooHrSettings(companyId);
  const departmentDivisionMap = buildDepartmentDivisionMap(metadata);
  const [jobsResponse, applicationRows] = await Promise.all([
    fetchBambooHrJson(settings, 'applicant_tracking/jobs'),
    fetchBambooHrHiringApplications(settings, options),
  ]);
  const jobRows = readCollection(jobsResponse.json, ['jobs']);
  const normalizedJobPairs = jobRows.map((row) => ({
    raw: row,
    job: normalizeHiringJob(row, departmentDivisionMap),
  }));
  const excludedJobIds = new Set(
    normalizedJobPairs
      .filter(({ job }) => isExcludedHiringRollupTitle(job.title))
      .map(({ job }) => String(job.id || '').trim())
      .filter(Boolean)
  );
  const includedJobPairs = normalizedJobPairs.filter(({ job }) => !isExcludedHiringRollupTitle(job.title));
  const jobs = includedJobPairs.map(({ job }) => job);
  const jobsByKey = new Map<string, HiringJobRow>();
  jobs.forEach((job, index) => {
    hiringJobLookupKeys(includedJobPairs[index]?.raw || {}).forEach((key) => jobsByKey.set(key, job));
    const normalizedJobId = hiringLookupKey(job.id);
    if (normalizedJobId) jobsByKey.set(`id:${normalizedJobId}`, job);
    const normalizedTitle = hiringLookupKey(job.title);
    if (normalizedTitle) jobsByKey.set(`title:${normalizedTitle}`, job);
  });
  const applications = applicationRows
    .map((row) => normalizeHiringApplication(row, jobsByKey, jobs, departmentDivisionMap))
    .filter((application) => (
      !isExcludedHiringRollupTitle(application.jobTitle) &&
      !excludedJobIds.has(String(application.jobId || '').trim()) &&
      isHiringApplicationAppliedInRange(application, options)
    ));
  const applicationsByStatus = countRows(applications, 'status', 'status');
  const applicantsByJob = jobs
    .map((job) => ({
      jobId: job.id,
      title: job.title,
      status: job.status,
      clientName: job.clientName,
      division: job.division,
      department: job.department,
      activeApplicantsCount: job.activeApplicantsCount,
      newApplicantsCount: job.newApplicantsCount,
      totalApplicantsCount: job.totalApplicantsCount,
    }))
    .sort((a, b) => b.activeApplicantsCount - a.activeApplicantsCount);
  const jobsByDivisionDepartment = jobs.reduce((groups: Map<string, {
    clientName: string;
    openJobs: number;
    totalJobs: number;
  }>, job) => {
    const clientName = job.clientName || 'Unassigned';
    const division = job.division || 'Unassigned';
    const department = job.department || 'Unassigned';
    const key = `${clientName}||${division}||${department}`;
    const group = groups.get(key) || { clientName, openJobs: 0, totalJobs: 0 };
    group.openJobs += job.openJobs;
    group.totalJobs += 1;
    groups.set(key, group);
    return groups;
  }, new Map());
  const applicantsByDivisionDepartment = Array.from(
    applications.reduce((groups: Map<string, {
      clientName: string;
      division: string;
      department: string;
      openJobs: number;
      totalJobs: number;
      activeApplicantsCount: number;
      newApplicantsCount: number;
      totalApplicantsCount: number;
    }>, application) => {
      const clientName = application.clientName || 'Unassigned';
      const division = application.division || 'Unassigned';
      const department = application.department || 'Unassigned';
      const key = `${clientName}||${division}||${department}`;
      const jobGroup = jobsByDivisionDepartment.get(key);
      const normalizedStatus = String(application.status || '').toLowerCase().replace(/[_-]+/g, ' ');
      const group = groups.get(key) || {
        clientName,
        division,
        department,
        openJobs: jobGroup?.openJobs || 0,
        totalJobs: jobGroup?.totalJobs || 0,
        activeApplicantsCount: 0,
        newApplicantsCount: 0,
        totalApplicantsCount: 0,
      };
      if (normalizedStatus === 'new' || normalizedStatus.includes('new applicant')) group.newApplicantsCount += 1;
      if (!normalizedStatus.includes('reject') && !normalizedStatus.includes('decline') && !normalizedStatus.includes('hire')) {
        group.activeApplicantsCount += 1;
      }
      group.totalApplicantsCount += 1;
      groups.set(key, group);
      return groups;
    }, new Map()).values()
  ).sort((a, b) => a.division.localeCompare(b.division) || a.department.localeCompare(b.department));

  return {
    meta: {
      source: 'BAMBOOHR_HIRING',
      generatedAt: new Date().toISOString(),
      applicationsPageSafetyLimit: HIRING_APPLICATION_PAGE_SAFETY_LIMIT,
    },
    summary: {
      asOfDate: todayIso(),
      openJobs: jobs.filter((job) => job.status.toLowerCase() === 'open').length,
      totalJobs: jobs.length,
      totalApplicants: jobs.reduce((sum, job) => sum + job.totalApplicantsCount, 0),
      activeApplicants: jobs.reduce((sum, job) => sum + job.activeApplicantsCount, 0),
      newApplicants: jobs.reduce((sum, job) => sum + job.newApplicantsCount, 0),
      applicationsSampled: applications.length,
    },
    jobs,
    applications,
    applicationsByStatus,
    applicantsByJob,
    applicantsByDivisionDepartment,
    newApplicantsByJob: applicantsByJob.filter((row) => row.newApplicantsCount > 0),
    postingPerformance: applicantsByJob,
    records: jobs,
  };
}

function buildPayload(
  companyId: string,
  employees: CurrentEmployee[],
  generatedAt: string,
  rateCard: ParsedCogentRateCard | null = null
): BambooHrWorkforceReportSnapshot {
  const coveredBillRateLevels = employees.filter((employee) => employee.billRateLevel !== 'Missing bill rate level').length;
  const employeesWithPayRate = employees.filter((employee) => employee.hourlyCost != null || employee.annualCost != null).length;
  const annualCosts = finiteNumbers(employees.map((employee) => employee.annualCost));
  const totalAnnualCost = annualCosts.length ? round2(annualCosts.reduce((sum, value) => sum + value, 0)) : null;
  const billRateMatches = buildEmployeeBillRateMatches(employees, rateCard, generatedAt);
  const billRateMatchesWithPay = billRateMatches.filter((match) => match.employee.hourlyCost != null && Number(match.employee.hourlyCost) > 0);
  const avgBillRate = average(billRateMatches.map((match) => match.billRate));
  const avgPayRate = average(billRateMatchesWithPay.map((match) => match.employee.hourlyCost));
  const overallBillToPayRate = avgBillRate != null && avgPayRate != null && avgPayRate > 0 ? round2(avgBillRate / avgPayRate) : null;
  const numericBillRatesAvailable = billRateMatches.length > 0;
  const estimatedBillableEconomicsByEmployee = buildEstimatedBillableEconomicsRows(billRateMatches);
  const missingBillRateLevel = employees
    .filter((employee) => employee.billRateLevel === 'Missing bill rate level')
    .map((employee) => ({
      employeeId: employee.id,
      role: employee.role,
      department: employee.department,
      location: employee.location,
    }));
  const note = numericBillRatesAvailable
    ? `Employee compensation, bill-rate levels, and the active ${rateCard?.sourceName || 'client rate card'} are available for bill-to-pay analysis.`
    : 'Employee compensation and bill-rate levels are available. Customer billed compensation rates or a client rate-card mapping are needed to unlock customer revenue and margin reports.';

  return {
    source: 'BAMBOOHR_WORKFORCE',
    generatedAt,
    companyId,
    rateMatchVersion: BAMBOOHR_WORKFORCE_RATE_MATCH_VERSION,
    employeesSampled: employees.length,
    summary: {
      asOfDate: generatedAt.slice(0, 10),
      headcount: employees.length,
      activeOrCurrentHeadcount: employees.filter((employee) => !/terminated/i.test(employee.employmentStatus)).length,
      billableHeadcount: coveredBillRateLevels,
      billRateLevelCoveragePct: pct(coveredBillRateLevels, employees.length),
      employeesWithPayRate,
      hourlyCount: employees.filter((employee) => employee.paidPer.toLowerCase() === 'hour').length,
      salaryCount: employees.filter((employee) => employee.paidPer.toLowerCase() === 'year').length,
      avgHourlyCost: average(employees.map((employee) => employee.hourlyCost)),
      avgAnnualCost: average(employees.map((employee) => employee.annualCost)),
      avgMonthlyCost: average(employees.map((employee) => (employee.annualCost == null ? null : round2(employee.annualCost / 12)))),
      totalAnnualCost,
      numericBillRatesAvailable,
      billableHoursAvailable: false,
      note,
    },
    dimensions: {
      headcountByRole: groupEmployees(employees, (employee) => employee.role),
      headcountByDepartment: groupEmployees(employees, (employee) => employee.department),
      headcountByLocation: groupEmployees(employees, (employee) => employee.location),
      headcountByStatus: groupEmployees(employees, (employee) => employee.employmentStatus),
      headcountByBillRateLevel: groupEmployees(employees, (employee) => employee.billRateLevel),
      payTypeMix: mixRows(employees, (employee) => employee.payType),
      exemptMix: mixRows(employees, (employee) => employee.exempt),
      billRateLevelCoverage: [
        { label: 'Has Bill Rate Level', count: coveredBillRateLevels, pct: pct(coveredBillRateLevels, employees.length) },
        { label: 'Missing Bill Rate Level', count: employees.length - coveredBillRateLevels, pct: pct(employees.length - coveredBillRateLevels, employees.length) },
      ],
      missingBillRateLevel,
      employeeCompensationRoster: buildEmployeeCompensationRoster(employees),
    },
    revenueBillables: {
      summary: {
        asOfDate: generatedAt.slice(0, 10),
        employeeCount: employees.length,
        billableEmployeeCount: numericBillRatesAvailable ? billRateMatches.length : coveredBillRateLevels,
        billRateLevelCoveragePct: pct(coveredBillRateLevels, employees.length),
        distinctBillRateLevels: groupEmployees(employees, (employee) => employee.billRateLevel).filter((row) => row.key !== 'Missing bill rate level').length,
        numericBillRatesAvailable,
        avgBillRate,
        avgPayRate,
        overallBillToPayRate,
        billableHoursAvailable: false,
        note,
      },
      billRateLevelByRole: buildBillRateLevelByRole(employees),
      billRateLevelRows: groupEmployees(employees, (employee) => employee.billRateLevel),
      billRateLevelByMarketRows: buildBillRateLevelByMarketRows(employees),
      estimatedBillableEconomicsByEmployee,
      unavailableReports: numericBillRatesAvailable
        ? []
        : [
            'Customer revenue by employee requires customer billed compensation rates or recognized revenue by employee.',
            'Customer revenue rollups require a client rate-card mapping for each compensation / bill-rate level.',
            'Customer profitability requires billed compensation rates plus employee compensation costs.',
          ],
    },
    unitEconomics: {
      summary: {
        asOfDate: generatedAt.slice(0, 10),
        avgHourlyCost: average(employees.map((employee) => employee.hourlyCost)),
        avgAnnualCost: average(employees.map((employee) => employee.annualCost)),
        avgMonthlyCost: average(employees.map((employee) => (employee.annualCost == null ? null : round2(employee.annualCost / 12)))),
        totalAnnualCost,
        employeesWithPayRate,
        billRateLevelCoveragePct: pct(coveredBillRateLevels, employees.length),
        note,
      },
      payCostByBillRateLevel: groupEmployees(employees, (employee) => employee.billRateLevel),
      payCostByRole: groupEmployees(employees, (employee) => employee.role),
      payCostByLocation: groupEmployees(employees, (employee) => employee.location),
      employeeCompensationRoster: buildEmployeeCompensationRoster(employees),
      missingBillRateLevel,
      unavailableReports: numericBillRatesAvailable
        ? [
            'Contribution margin requires billable hours or recognized assignment revenue.',
          ]
        : [
            'Compensation spread requires customer billed compensation rates.',
            'Pay vs billed compensation analysis requires a bill-rate-level rate card.',
            'Contribution margin requires customer billed compensation rates or recognized assignment revenue.',
          ],
    },
  };
}

export async function buildAndSaveBambooHrWorkforceReportSnapshot(companyId: string): Promise<BambooHrWorkforceReportSnapshot> {
  const { settings, metadata, connection } = await readBambooHrSettings(companyId);
  const directory = await fetchBambooHrJson(settings, 'employees/directory');
  const employees = readEmployees(directory.json).filter((employee) => asString(employee.id));

  const currentEmployees = await mapWithConcurrency(employees, MAX_CONCURRENCY, async (employee) => {
    const employeeId = asString(employee.id);
    const [detail, jobInfo, employmentStatus, compensation] = await Promise.all([
      fetchEmployeeDetail(settings, employeeId).catch(() => ({})),
      fetchEmployeeTable(settings, employeeId, 'jobInfo').catch(() => []),
      fetchEmployeeTable(settings, employeeId, 'employmentStatus').catch(() => []),
      fetchEmployeeTable(settings, employeeId, 'compensation').catch(() => []),
    ]);
    return normalizeCurrentEmployee(employee, detail, { jobInfo, employmentStatus, compensation });
  });

  const generatedAt = new Date().toISOString();
  const rateCard = await readCogentRateCard(companyId).catch(() => null);
  const snapshot = buildPayload(companyId, currentEmployees, generatedAt, rateCard);
  await saveOperationalSystemConnection({
    companyId,
    provider: 'BAMBOOHR',
    sourceCode: BAMBOOHR_SOURCE_CODE,
    authType: connection.authType || 'API_KEY',
    status: 'ACTIVE',
    accessToken: connection.accessToken,
    baseUrl: connection.baseUrl,
    lastSyncAt: new Date(snapshot.generatedAt),
    autoSync: connection.autoSync,
    syncFrequency: connection.syncFrequency || 'daily',
    connectionMetadata: {
      ...metadata,
      [SNAPSHOT_METADATA_KEY]: snapshot,
    },
    errorMessage: null,
  });
  return snapshot;
}

export async function readBambooHrWorkforceReportSnapshot(companyId: string): Promise<BambooHrWorkforceReportSnapshot | null> {
  const connection = await getOperationalSystemConnection(companyId, 'BAMBOOHR', BAMBOOHR_SOURCE_CODE);
  const snapshot = asRecord(connection?.connectionMetadata)[SNAPSHOT_METADATA_KEY];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  if ((snapshot as Record<string, unknown>).source !== 'BAMBOOHR_WORKFORCE') return null;
  return snapshot as BambooHrWorkforceReportSnapshot;
}

export function getBambooHrLaborSchedulingPayload(snapshot: BambooHrWorkforceReportSnapshot) {
  return {
    meta: { source: snapshot.source, generatedAt: snapshot.generatedAt, note: snapshot.summary.note },
    summary: snapshot.summary,
    headcountByRole: snapshot.dimensions.headcountByRole,
    headcountByDepartment: snapshot.dimensions.headcountByDepartment,
    headcountByLocation: snapshot.dimensions.headcountByLocation,
    headcountByStatus: snapshot.dimensions.headcountByStatus,
    payTypeMix: snapshot.dimensions.payTypeMix,
    exemptMix: snapshot.dimensions.exemptMix,
    billRateLevelCoverage: snapshot.dimensions.billRateLevelCoverage,
    missingBillRateLevel: snapshot.dimensions.missingBillRateLevel,
    employeeCompensationRoster: snapshot.dimensions.employeeCompensationRoster,
    records: snapshot.dimensions.headcountByRole,
  };
}

export function getBambooHrRevenueBillablesPayload(snapshot: BambooHrWorkforceReportSnapshot) {
  return {
    meta: { source: snapshot.source, generatedAt: snapshot.generatedAt, note: snapshot.revenueBillables.summary.note },
    summary: snapshot.revenueBillables.summary,
    billRateLevelByRole: snapshot.revenueBillables.billRateLevelByRole,
    billRateLevelRows: snapshot.revenueBillables.billRateLevelRows,
    billRateLevelByMarketRows: snapshot.revenueBillables.billRateLevelByMarketRows,
    estimatedBillableEconomicsByEmployee: snapshot.revenueBillables.estimatedBillableEconomicsByEmployee,
    unavailableReports: snapshot.revenueBillables.unavailableReports,
    records: snapshot.revenueBillables.billRateLevelRows,
  };
}

export function getBambooHrUnitEconomicsPayload(snapshot: BambooHrWorkforceReportSnapshot) {
  return {
    meta: { source: snapshot.source, generatedAt: snapshot.generatedAt, note: snapshot.unitEconomics.summary.note },
    summary: snapshot.unitEconomics.summary,
    payCostByBillRateLevel: snapshot.unitEconomics.payCostByBillRateLevel,
    payCostByRole: snapshot.unitEconomics.payCostByRole,
    payCostByLocation: snapshot.unitEconomics.payCostByLocation,
    employeeCompensationRoster: snapshot.unitEconomics.employeeCompensationRoster,
    missingBillRateLevel: snapshot.unitEconomics.missingBillRateLevel,
    unavailableReports: snapshot.unitEconomics.unavailableReports,
    records: snapshot.unitEconomics.payCostByBillRateLevel,
  };
}
