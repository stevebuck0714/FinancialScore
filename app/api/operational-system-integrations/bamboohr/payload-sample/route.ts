import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  getOperationalSystemConnection,
} from '@/lib/operational/operational-system-connections';
import {
  BAMBOOHR_SOURCE_CODE,
  assertBambooHrSettingsReady,
  type BambooHrSettings,
  defaultBambooHrSettings,
  fetchBambooHrJson,
  sanitizeBambooHrSettings,
  summarizeBambooHrJson,
} from '@/lib/bamboohr';

export const dynamic = 'force-dynamic';

const SAMPLE_LIMIT = 5;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readCompanyId(request: NextRequest, body: Record<string, unknown>): string {
  return asString(body.companyId) || asString(request.nextUrl.searchParams.get('companyId'));
}

function readLimit(request: NextRequest, body: Record<string, unknown>): number {
  const raw = typeof body.limit === 'number' ? String(body.limit) : asString(body.limit) || asString(request.nextUrl.searchParams.get('limit'));
  const parsed = raw ? Number.parseInt(raw, 10) : 25;
  if (!Number.isFinite(parsed) || parsed < 1) return 25;
  return Math.min(parsed, 126);
}

function assertDevOnly(request: NextRequest): void {
  const token = asString(request.headers.get('x-dev-bamboohr-probe'));
  if (process.env.NODE_ENV !== 'development' || token !== '1') {
    throw new Error('BambooHR payload sampling is only available in local development.');
  }
}

function redactedEmployee(employee: Record<string, unknown>): Record<string, unknown> {
  return {
    id: employee.id ?? null,
    displayName: employee.displayName ? '[redacted]' : null,
    firstName: employee.firstName ? '[redacted]' : null,
    lastName: employee.lastName ? '[redacted]' : null,
    status: employee.status ?? null,
    employeeNumberPresent: Boolean(employee.employeeNumber),
    jobTitle: employee.jobTitle ?? employee.title ?? null,
    department: employee.department ?? null,
    division: employee.division ?? null,
    location: employee.location ?? null,
    supervisorPresent: Boolean(employee.supervisor || employee.supervisorId),
    workEmailPresent: Boolean(employee.workEmail),
    hireDatePresent: Boolean(employee.hireDate),
    terminationDatePresent: Boolean(employee.terminationDate),
    keys: Object.keys(employee).sort(),
  };
}

function coverage(records: Record<string, unknown>[], fields: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const field of fields) {
    result[field] = records.filter((record) => {
      const value = record[field];
      return value !== null && value !== undefined && String(value).trim() !== '';
    }).length;
  }
  return result;
}

function uniqueValues(records: Record<string, unknown>[], field: string, limit = 20): string[] {
  const values = new Set<string>();
  for (const record of records) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) values.add(value.trim());
  }
  return Array.from(values).sort().slice(0, limit);
}

function readEmployees(json: unknown): Record<string, unknown>[] {
  const employees = asRecord(json).employees;
  return Array.isArray(employees)
    ? employees.filter((employee): employee is Record<string, unknown> => Boolean(employee) && typeof employee === 'object' && !Array.isArray(employee))
    : [];
}

function sampleArray(json: unknown): unknown[] {
  return Array.isArray(json) ? json.slice(0, SAMPLE_LIMIT) : [];
}

function redactedTimeOffRequest(request: unknown): Record<string, unknown> {
  const row = asRecord(request);
  return {
    id: row.id ?? null,
    status: row.status ?? null,
    type: row.type ?? null,
    amount: row.amount ?? null,
    start: row.start ?? row.startDate ?? null,
    end: row.end ?? row.endDate ?? null,
    employeeIdPresent: Boolean(row.employeeId || row.employee),
    employeeNamePresent: Boolean(row.name || row.employeeName),
    keys: Object.keys(row).sort(),
  };
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function fieldMatchesKeywords(row: Record<string, unknown>, keywords: string[]): boolean {
  const haystack = [
    row.name,
    row.alias,
    row.id,
    row.type,
    row.label,
    row.description,
  ]
    .map(normalizeSearchText)
    .join(' ');
  return keywords.some((keyword) => haystack.includes(keyword));
}

function extractMetadataFieldMatches(fieldsJson: unknown, keywords: string[]): Record<string, unknown>[] {
  const rows = Array.isArray(fieldsJson)
    ? fieldsJson.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
    : [];
  return rows
    .filter((row) => fieldMatchesKeywords(row, keywords))
    .slice(0, 80)
    .map((row) => ({
      id: row.id ?? null,
      name: row.name ?? null,
      alias: row.alias ?? null,
      type: row.type ?? null,
    }));
}

function extractTableCatalog(tablesJson: unknown): Array<{ alias: string; fields: Array<Record<string, unknown>> }> {
  const rows = Array.isArray(tablesJson)
    ? tablesJson.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
    : [];
  return rows.map((table) => ({
    alias: asString(table.alias) || asString(table.name) || 'unknown',
    fields: Array.isArray(table.fields)
      ? table.fields
          .filter((field): field is Record<string, unknown> => Boolean(field) && typeof field === 'object' && !Array.isArray(field))
          .map((field) => ({
            id: field.id ?? null,
            name: field.name ?? null,
            alias: field.alias ?? null,
            type: field.type ?? null,
          }))
      : [],
  }));
}

function extractTableMatches(
  tablesJson: unknown,
  keywords: string[]
): Array<{ alias: string; matchingFields: Array<Record<string, unknown>> }> {
  return extractTableCatalog(tablesJson)
    .map((table) => ({
      alias: table.alias,
      matchingFields: table.fields.filter((field) => fieldMatchesKeywords(field, keywords)),
    }))
    .filter((table) => table.matchingFields.length > 0);
}

function readTableRows(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) {
    return json.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
  }
  const record = asRecord(json);
  for (const key of ['rows', 'table', 'data']) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
    }
  }
  return [];
}

function redactedTableRow(row: Record<string, unknown>, alias: string): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (['rate', 'overtimeRate'].includes(key)) {
      copy[key] = value == null || String(value).trim() === '' ? null : '[redacted-present]';
    } else if (key === 'comment') {
      copy[key] = value == null || String(value).trim() === '' ? null : '[redacted-present]';
    } else if (key === 'reportsTo') {
      copy[key] = value ? '[redacted-present]' : null;
    } else {
      copy[key] = value;
    }
  }
  copy.tableAlias = alias;
  copy.keys = Object.keys(row).sort();
  return copy;
}

function tableFieldSet(rows: Record<string, unknown>[]): string[] {
  const fields = new Set<string>();
  for (const row of rows) {
    Object.keys(row).forEach((key) => fields.add(key));
  }
  return Array.from(fields).sort();
}

async function sampleEmployeeTable(
  settings: BambooHrSettings,
  employees: Record<string, unknown>[],
  alias: string,
  limit: number
) {
  const sampledEmployees = employees.slice(0, limit);
  const rows: Record<string, unknown>[] = [];
  const errors: string[] = [];
  let employeesWithRows = 0;

  for (const employee of sampledEmployees) {
    const employeeId = asString(employee.id);
    if (!employeeId) continue;
    try {
      const response = await fetchBambooHrJson(settings, `employees/${encodeURIComponent(employeeId)}/tables/${alias}`);
      const tableRows = readTableRows(response.json);
      if (tableRows.length > 0) employeesWithRows += 1;
      rows.push(...tableRows);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Failed to fetch ${alias}`);
      if (errors.length >= 3) break;
    }
  }

  const fieldNames = tableFieldSet(rows);
  return {
    alias,
    sampledEmployeeCount: sampledEmployees.length,
    employeesWithRows,
    rowCount: rows.length,
    fields: fieldNames,
    coverage: coverage(rows, fieldNames),
    uniqueEmploymentStatuses: uniqueValues(rows, 'employmentStatus'),
    uniquePayTypes: uniqueValues(rows, 'type'),
    uniquePaidPer: uniqueValues(rows, 'paidPer'),
    uniquePaySchedules: uniqueValues(rows, 'paySchedule'),
    uniqueOvertimeStatuses: uniqueValues(rows, 'exempt'),
    payRatePresentRows: rows.filter((row) => row.rate != null && String(row.rate).trim() !== '').length,
    overtimeRatePresentRows: rows.filter((row) => row.overtimeRate != null && String(row.overtimeRate).trim() !== '').length,
    sample: rows.slice(0, SAMPLE_LIMIT).map((row) => redactedTableRow(row, alias)),
    errors: Array.from(new Set(errors)),
  };
}

async function sampleEmployeeDetailFields(
  settings: BambooHrSettings,
  employees: Record<string, unknown>[],
  fields: string[],
  limit: number
) {
  const sampledEmployees = employees.slice(0, limit);
  const rows: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const fieldList = fields.join(',');

  for (const employee of sampledEmployees) {
    const employeeId = asString(employee.id);
    if (!employeeId) continue;
    try {
      const response = await fetchBambooHrJson(settings, `employees/${encodeURIComponent(employeeId)}`, { fields: fieldList });
      const record = asRecord(response.json);
      rows.push({
        id: employeeId,
        ...Object.fromEntries(fields.map((field) => [field, record[field] ?? null])),
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Failed to fetch employee detail fields');
      if (errors.length >= 3) break;
    }
  }

  return {
    sampledEmployeeCount: sampledEmployees.length,
    fields,
    coverage: coverage(rows, fields),
    uniqueValues: Object.fromEntries(fields.map((field) => [field, uniqueValues(rows, field, 50)])),
    sample: rows.slice(0, SAMPLE_LIMIT).map((row) => ({
      id: row.id,
      ...Object.fromEntries(fields.map((field) => [field, row[field] ? '[present]' : null])),
    })),
    errors: Array.from(new Set(errors)),
  };
}

export async function POST(request: NextRequest) {
  try {
    assertDevOnly(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = readCompanyId(request, body);
    const limit = readLimit(request, body);
    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }
    const connection = await getOperationalSystemConnection(companyId, 'BAMBOOHR', BAMBOOHR_SOURCE_CODE);
    const metadata = asRecord(connection?.connectionMetadata);
    const existingSettings = asRecord(metadata.bambooHrSettings);
    const settings = sanitizeBambooHrSettings(
      {
        ...defaultBambooHrSettings,
        ...existingSettings,
        syncFrequency: connection?.syncFrequency || existingSettings.syncFrequency || defaultBambooHrSettings.syncFrequency,
        authType: connection?.authType || existingSettings.authType || defaultBambooHrSettings.authType,
        baseUrl: connection?.baseUrl || existingSettings.baseUrl || '',
        apiKey: connection?.accessToken || existingSettings.apiKey || '',
      },
      connection?.accessToken || ''
    );
    assertBambooHrSettingsReady(settings);

    const directory = await fetchBambooHrJson(settings, 'employees/directory');
    const employees = readEmployees(directory.json);
    const fields = await fetchBambooHrJson(settings, 'meta/fields').catch((error) => ({ error }));
    const tables = await fetchBambooHrJson(settings, 'meta/tables').catch((error) => ({ error }));
    const timeOffTypes = await fetchBambooHrJson(settings, 'meta/time_off/types').catch((error) => ({ error }));
    const today = new Date().toISOString().slice(0, 10);
    const start = settings.initialSyncStartDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const timeOffRequests = await fetchBambooHrJson(settings, 'time_off/requests', { start, end: today }).catch((error) => ({ error }));
    const employeeTables = {
      jobInfo: await sampleEmployeeTable(settings, employees, 'jobInfo', limit),
      employmentStatus: await sampleEmployeeTable(settings, employees, 'employmentStatus', limit),
      compensation: await sampleEmployeeTable(settings, employees, 'compensation', limit),
      employeeProjectPayRates: await sampleEmployeeTable(settings, employees, 'employeeProjectPayRates', limit),
    };
    const employeeDetailFields = await sampleEmployeeDetailFields(settings, employees, ['customBillRateLevel'], limit);
    const commercialKeywords = [
      'bill',
      'billing',
      'billable',
      'client',
      'customer',
      'assignment',
      'placement',
      'project',
      'engagement',
      'markup',
      'margin',
      'revenue',
      'rate',
      'cost',
      'pay',
      'salary',
      'hour',
      'hourly',
    ];

    return NextResponse.json({
      ok: true,
      companyId,
      companyName: company.name,
      sampledAt: new Date().toISOString(),
      employeeTableSampleLimit: limit,
      employees: {
        summary: summarizeBambooHrJson(directory.json),
        count: employees.length,
        coverage: coverage(employees, [
          'id',
          'status',
          'employeeNumber',
          'jobTitle',
          'department',
          'division',
          'location',
          'supervisor',
          'supervisorId',
          'workEmail',
          'hireDate',
          'terminationDate',
        ]),
        uniqueDepartments: uniqueValues(employees, 'department'),
        uniqueDivisions: uniqueValues(employees, 'division'),
        uniqueLocations: uniqueValues(employees, 'location'),
        uniqueJobTitles: uniqueValues(employees, 'jobTitle'),
        sample: employees.slice(0, SAMPLE_LIMIT).map(redactedEmployee),
      },
      fields:
        'json' in fields
          ? {
              summary: summarizeBambooHrJson(fields.json),
              sample: sampleArray(fields.json),
              commercialFieldMatches: extractMetadataFieldMatches(fields.json, commercialKeywords),
            }
          : { error: fields.error instanceof Error ? fields.error.message : 'Failed to fetch fields metadata' },
      tables:
        'json' in tables
          ? {
              summary: summarizeBambooHrJson(tables.json),
              sample: sampleArray(tables.json),
              tableCatalog: extractTableCatalog(tables.json),
              commercialTableMatches: extractTableMatches(tables.json, commercialKeywords),
            }
          : { error: tables.error instanceof Error ? tables.error.message : 'Failed to fetch tables metadata' },
      timeOffTypes:
        'json' in timeOffTypes
          ? { summary: summarizeBambooHrJson(timeOffTypes.json), keys: Object.keys(asRecord(timeOffTypes.json)).sort() }
          : { error: timeOffTypes.error instanceof Error ? timeOffTypes.error.message : 'Failed to fetch time off types' },
      timeOffRequests:
        'json' in timeOffRequests
          ? {
              summary: summarizeBambooHrJson(timeOffRequests.json),
              sample: sampleArray(timeOffRequests.json).map(redactedTimeOffRequest),
            }
          : {
              error:
                timeOffRequests.error instanceof Error
                  ? timeOffRequests.error.message
                  : 'Failed to fetch time off requests',
            },
      employeeTables,
      employeeDetailFields,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sample BambooHR payloads';
    const status = message.includes('only available in local development') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
