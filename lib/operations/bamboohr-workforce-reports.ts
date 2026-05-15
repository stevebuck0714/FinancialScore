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

type EmployeeRow = Record<string, unknown>;
type TableRow = Record<string, unknown>;

type CurrentEmployee = {
  id: string;
  name: string;
  role: string;
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

type EmployeeCompensationRow = {
  employeeId: string;
  employeeName: string;
  role: string;
  department: string;
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
  employeesSampled: number;
  summary: {
    asOfDate: string;
    headcount: number;
    activeOrCurrentHeadcount: number;
    billRateLevelCoveragePct: number;
    employeesWithPayRate: number;
    hourlyCount: number;
    salaryCount: number;
    avgHourlyCost: number | null;
    avgAnnualCost: number | null;
    avgMonthlyCost: number | null;
    totalAnnualCost: number | null;
    numericBillRatesAvailable: false;
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
      billRateLevelCoveragePct: number;
      distinctBillRateLevels: number;
      numericBillRatesAvailable: false;
      billableHoursAvailable: false;
      note: string;
    };
    billRateLevelByRole: Array<{ role: string; headcount: number; covered: number; coveragePct: number; topLevels: string[] }>;
    billRateLevelRows: GroupRow[];
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
const MAX_CONCURRENCY = 8;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
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

  return {
    id: employeeId,
    name: asString(employee.displayName) || [firstName, lastName].filter(Boolean).join(' ') || employeeId,
    role: asString(job.jobTitle) || asString(employee.jobTitle) || 'Unassigned',
    department: asString(job.department) || asString(employee.department) || 'Unassigned',
    division: asString(job.division) || asString(employee.division) || 'Unassigned',
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
      department: employee.department,
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

function buildPayload(companyId: string, employees: CurrentEmployee[], generatedAt: string): BambooHrWorkforceReportSnapshot {
  const coveredBillRateLevels = employees.filter((employee) => employee.billRateLevel !== 'Missing bill rate level').length;
  const employeesWithPayRate = employees.filter((employee) => employee.hourlyCost != null || employee.annualCost != null).length;
  const annualCosts = finiteNumbers(employees.map((employee) => employee.annualCost));
  const totalAnnualCost = annualCosts.length ? round2(annualCosts.reduce((sum, value) => sum + value, 0)) : null;
  const missingBillRateLevel = employees
    .filter((employee) => employee.billRateLevel === 'Missing bill rate level')
    .map((employee) => ({
      employeeId: employee.id,
      role: employee.role,
      department: employee.department,
      location: employee.location,
    }));
  const note =
    'Employee compensation and bill-rate levels are available. Customer billed compensation rates or a client rate-card mapping are needed to unlock customer revenue and margin reports.';

  return {
    source: 'BAMBOOHR_WORKFORCE',
    generatedAt,
    companyId,
    employeesSampled: employees.length,
    summary: {
      asOfDate: generatedAt.slice(0, 10),
      headcount: employees.length,
      activeOrCurrentHeadcount: employees.filter((employee) => !/terminated/i.test(employee.employmentStatus)).length,
      billRateLevelCoveragePct: pct(coveredBillRateLevels, employees.length),
      employeesWithPayRate,
      hourlyCount: employees.filter((employee) => employee.paidPer.toLowerCase() === 'hour').length,
      salaryCount: employees.filter((employee) => employee.paidPer.toLowerCase() === 'year').length,
      avgHourlyCost: average(employees.map((employee) => employee.hourlyCost)),
      avgAnnualCost: average(employees.map((employee) => employee.annualCost)),
      avgMonthlyCost: average(employees.map((employee) => (employee.annualCost == null ? null : round2(employee.annualCost / 12)))),
      totalAnnualCost,
      numericBillRatesAvailable: false,
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
        billRateLevelCoveragePct: pct(coveredBillRateLevels, employees.length),
        distinctBillRateLevels: groupEmployees(employees, (employee) => employee.billRateLevel).filter((row) => row.key !== 'Missing bill rate level').length,
        numericBillRatesAvailable: false,
        billableHoursAvailable: false,
        note,
      },
      billRateLevelByRole: buildBillRateLevelByRole(employees),
      billRateLevelRows: groupEmployees(employees, (employee) => employee.billRateLevel),
      unavailableReports: [
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
      unavailableReports: [
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

  const snapshot = buildPayload(companyId, currentEmployees, new Date().toISOString());
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
