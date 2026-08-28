import { addEstCalendarDays, formatEstDate } from '@/lib/time/eastern';

export type BambooHrSettings = {
  subdomain: string;
  baseUrl: string;
  apiKey: string;
  authType: 'API_KEY' | 'OAUTH' | '';
  syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
  syncTime: string;
  initialSyncStartDate: string;
  incrementalSync: 'YES' | 'NO' | '';
};

export type BambooHrDataDomain = {
  dataDomain: string;
  bambooEntity: string;
  enabled: boolean;
};

export type BambooHrDomainTestResult = {
  dataDomain: string;
  bambooEntity: string;
  endpoint: string;
  ok: boolean;
  count: number;
  note?: string;
  error?: string;
};

export type BambooHrEndpointProbeResult = {
  label: string;
  endpoint: string;
  ok: boolean;
  summary?: string;
  status?: number;
  error?: string;
};

export const BAMBOOHR_SOURCE_CODE = 'BAMBOOHR_STANDARD';

export const defaultBambooHrSettings: BambooHrSettings = {
  subdomain: '',
  baseUrl: '',
  apiKey: '',
  authType: 'API_KEY',
  syncFrequency: 'daily',
  syncTime: '08:00',
  initialSyncStartDate: '',
  incrementalSync: 'YES',
};

export const defaultBambooHrDataDomains: BambooHrDataDomain[] = [
  { dataDomain: 'Employees', bambooEntity: 'employees/directory', enabled: true },
  { dataDomain: 'Departments', bambooEntity: 'meta/departments', enabled: true },
  { dataDomain: 'Locations', bambooEntity: 'meta/locations', enabled: true },
  { dataDomain: 'Job Information', bambooEntity: 'employees/job-info', enabled: true },
  { dataDomain: 'Hiring Jobs', bambooEntity: 'applicant_tracking/jobs', enabled: false },
  { dataDomain: 'Hiring Applications', bambooEntity: 'applicant_tracking/applications', enabled: false },
  { dataDomain: 'Time Off', bambooEntity: 'time_off/requests', enabled: false },
];

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractBambooHrSubdomain(value: string): string {
  return asString(value)
    .replace(/^https?:\/+/i, '')
    .replace(/\.bamboohr\.com.*$/i, '')
    .replace(/\/+$/, '');
}

export function normalizeBambooHrBaseUrl(subdomain: string, baseUrl: string): string {
  const trimmedBaseUrl = asString(baseUrl).replace(/\/+$/, '');
  if (trimmedBaseUrl) {
    if (/\.bamboohr\.com/i.test(trimmedBaseUrl) && !/api\/gateway\.php/i.test(trimmedBaseUrl)) {
      const baseUrlSubdomain = extractBambooHrSubdomain(trimmedBaseUrl);
      if (baseUrlSubdomain) return `https://api.bamboohr.com/api/gateway.php/${baseUrlSubdomain}/v1`;
    }
    return /^https?:\/\//i.test(trimmedBaseUrl) ? trimmedBaseUrl : `https://${trimmedBaseUrl}`;
  }
  const trimmedSubdomain = extractBambooHrSubdomain(subdomain);
  if (!trimmedSubdomain) return '';
  return `https://api.bamboohr.com/api/gateway.php/${trimmedSubdomain}/v1`;
}

export function sanitizeBambooHrSettings(value: unknown, existingApiKey = ''): BambooHrSettings {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const syncFrequency = asString(src.syncFrequency).toLowerCase();
  const authType = asString(src.authType).toUpperCase();
  const yesNo = (input: unknown): 'YES' | 'NO' | '' => {
    const normalized = asString(input).toUpperCase();
    if (normalized === 'YES') return 'YES';
    if (normalized === 'NO') return 'NO';
    return '';
  };
  const subdomain = asString(src.subdomain);
  const apiKey = asString(src.apiKey) || existingApiKey;

  return {
    subdomain,
    baseUrl: normalizeBambooHrBaseUrl(subdomain, asString(src.baseUrl)),
    apiKey,
    authType: authType === 'OAUTH' ? 'OAUTH' : authType === 'API_KEY' ? 'API_KEY' : 'API_KEY',
    syncFrequency:
      syncFrequency === 'daily' || syncFrequency === 'weekly' || syncFrequency === 'monthly' ? syncFrequency : '',
    syncTime: asString(src.syncTime) || '08:00',
    initialSyncStartDate: asString(src.initialSyncStartDate),
    incrementalSync: yesNo(src.incrementalSync),
  };
}

export function sanitizeBambooHrDataDomains(value: unknown): BambooHrDataDomain[] {
  if (!Array.isArray(value)) return defaultBambooHrDataDomains;
  const cleaned = value
    .map((row) => {
      const src = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
      return {
        dataDomain: asString(src.dataDomain),
        bambooEntity: asString(src.bambooEntity),
        enabled: typeof src.enabled === 'boolean' ? src.enabled : true,
      };
    })
    .filter((row) => row.dataDomain || row.bambooEntity);
  if (cleaned.length === 0) return defaultBambooHrDataDomains;

  const existingKeys = new Set(cleaned.map((row) => `${row.dataDomain.toLowerCase()}|${row.bambooEntity.toLowerCase()}`));
  const missingDefaults = defaultBambooHrDataDomains.filter((row) => (
    !existingKeys.has(`${row.dataDomain.toLowerCase()}|${row.bambooEntity.toLowerCase()}`)
  ));
  return [...cleaned, ...missingDefaults];
}

export function assertBambooHrSettingsReady(settings: BambooHrSettings): void {
  if (!settings.subdomain && !settings.baseUrl) {
    throw new Error('BambooHR subdomain or base URL is required.');
  }
  if (!settings.apiKey) {
    throw new Error('BambooHR API key is required.');
  }
  if (settings.authType && settings.authType !== 'API_KEY') {
    throw new Error('BambooHR validation currently supports API key authentication only.');
  }
}

function getBambooHrAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:x`, 'utf8').toString('base64')}`;
}

function bambooHrUrl(settings: BambooHrSettings, endpoint: string, query?: Record<string, string>): string {
  const baseUrl = normalizeBambooHrBaseUrl(settings.subdomain, settings.baseUrl);
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  const url = new URL(`${baseUrl}/${cleanEndpoint}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
}

function previewText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 500);
}

export async function fetchBambooHrJson(
  settings: BambooHrSettings,
  endpoint: string,
  query?: Record<string, string>
): Promise<{ status: number; json: unknown }> {
  assertBambooHrSettingsReady(settings);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(bambooHrUrl(settings, endpoint, query), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: getBambooHrAuthHeader(settings.apiKey),
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
    }

    if (!response.ok) {
      const preview = previewText(text);
      throw new Error(`BambooHR API returned HTTP ${response.status}${preview ? `: ${preview}` : ''}`);
    }

    return { status: response.status, json };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('BambooHR API request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function postBambooHrJson(
  settings: BambooHrSettings,
  endpoint: string,
  body: Record<string, unknown>,
  query?: Record<string, string>
): Promise<{ status: number; json: unknown }> {
  assertBambooHrSettingsReady(settings);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(bambooHrUrl(settings, endpoint, query), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: getBambooHrAuthHeader(settings.apiKey),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
    }
    if (!response.ok) {
      const preview = previewText(text);
      throw new Error(`BambooHR API returned HTTP ${response.status}${preview ? `: ${preview}` : ''}`);
    }
    return { status: response.status, json };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('BambooHR API request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function countBambooHrRecords(json: unknown): number {
  if (Array.isArray(json)) return json.length;
  if (!json || typeof json !== 'object') return 0;
  const record = json as Record<string, unknown>;
  for (const key of ['employees', 'requests', 'departments', 'locations', 'jobs', 'applications']) {
    if (Array.isArray(record[key])) return record[key].length;
  }
  return Object.keys(record).length;
}

export function summarizeBambooHrJson(json: unknown): string {
  if (Array.isArray(json)) return `${json.length} array rows`;
  if (!json || typeof json !== 'object') return typeof json;
  const record = json as Record<string, unknown>;
  const keys = Object.keys(record);
  const arrayCounts = keys
    .map((key) => (Array.isArray(record[key]) ? `${key}: ${(record[key] as unknown[]).length}` : null))
    .filter(Boolean)
    .join(', ');
  return arrayCounts || `${keys.length} object keys${keys.length ? `: ${keys.slice(0, 8).join(', ')}` : ''}`;
}

function readEmployees(json: unknown): Record<string, unknown>[] {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return [];
  const employees = (json as Record<string, unknown>).employees;
  return Array.isArray(employees)
    ? employees.filter((employee): employee is Record<string, unknown> => Boolean(employee) && typeof employee === 'object' && !Array.isArray(employee))
    : [];
}

function countUniqueEmployeeField(json: unknown, fieldNames: string[]): number {
  const values = new Set<string>();
  for (const employee of readEmployees(json)) {
    for (const fieldName of fieldNames) {
      const value = employee[fieldName];
      if (typeof value === 'string' && value.trim()) {
        values.add(value.trim());
        break;
      }
    }
  }
  return values.size;
}

function countBambooHrDomainRecords(domain: BambooHrDataDomain, json: unknown): number {
  const entity = asString(domain.bambooEntity).replace(/^\/+/, '');
  const label = asString(domain.dataDomain).toLowerCase();

  if (entity === 'meta/departments' || label.includes('department')) {
    return countUniqueEmployeeField(json, ['department', 'division']);
  }
  if (entity === 'meta/locations' || label.includes('location')) {
    return countUniqueEmployeeField(json, ['location']);
  }
  if (entity === 'employees/job-info' || label.includes('job information')) {
    return countUniqueEmployeeField(json, ['jobTitle', 'job_title', 'title']);
  }

  return countBambooHrRecords(json);
}

function isoDateDaysAgo(days: number): string {
  return addEstCalendarDays(formatEstDate(), -days);
}

function todayIsoDate(): string {
  return formatEstDate();
}

function resolveDomainEndpoint(
  domain: BambooHrDataDomain,
  settings: BambooHrSettings
): { endpoint: string; query?: Record<string, string>; note?: string } {
  const entity = asString(domain.bambooEntity).replace(/^\/+/, '');
  const label = asString(domain.dataDomain).toLowerCase();

  if (entity === 'meta/departments' || label.includes('department')) {
    return {
      endpoint: 'employees/directory',
      note: 'BambooHR metadata departments endpoint is tenant-dependent; counted unique departments from employee directory.',
    };
  }

  if (entity === 'meta/locations' || label.includes('location')) {
    return {
      endpoint: 'employees/directory',
      note: 'BambooHR metadata locations endpoint is tenant-dependent; counted unique locations from employee directory.',
    };
  }

  if (entity === 'employees/job-info' || label.includes('job information')) {
    return {
      endpoint: 'employees/directory',
      note: 'Validated job information through the employee directory response.',
    };
  }

  if (entity === 'time_off/requests' || label.includes('time off')) {
    const start = settings.initialSyncStartDate || isoDateDaysAgo(30);
    return {
      endpoint: 'time_off/requests',
      query: { start, end: todayIsoDate() },
    };
  }

  if (entity === 'applicant_tracking/jobs' || label.includes('hiring jobs')) {
    return { endpoint: 'applicant_tracking/jobs' };
  }

  if (entity === 'applicant_tracking/applications' || label.includes('hiring applications')) {
    return { endpoint: 'applicant_tracking/applications', query: { page: '1' } };
  }

  return { endpoint: entity || 'employees/directory' };
}

export async function testBambooHrDataDomain(
  settings: BambooHrSettings,
  domain: BambooHrDataDomain
): Promise<BambooHrDomainTestResult> {
  const resolved = resolveDomainEndpoint(domain, settings);
  try {
    const response = await fetchBambooHrJson(settings, resolved.endpoint, resolved.query);
    return {
      dataDomain: domain.dataDomain,
      bambooEntity: domain.bambooEntity,
      endpoint: resolved.endpoint,
      ok: true,
      count: countBambooHrDomainRecords(domain, response.json),
      note: resolved.note,
    };
  } catch (error) {
    return {
      dataDomain: domain.dataDomain,
      bambooEntity: domain.bambooEntity,
      endpoint: resolved.endpoint,
      ok: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown BambooHR API error',
      note: resolved.note,
    };
  }
}

export async function probeBambooHrEndpoints(settings: BambooHrSettings): Promise<BambooHrEndpointProbeResult[]> {
  const today = todayIsoDate();
  const start = settings.initialSyncStartDate || isoDateDaysAgo(30);
  const endpoints: Array<{ label: string; endpoint: string; query?: Record<string, string> }> = [
    { label: 'Employee directory', endpoint: 'employees/directory' },
    { label: 'Fields metadata', endpoint: 'meta/fields' },
    { label: 'Lists metadata', endpoint: 'meta/lists' },
    { label: 'Tables metadata', endpoint: 'meta/tables' },
    { label: 'Users metadata', endpoint: 'meta/users' },
    { label: 'Time off types', endpoint: 'meta/time_off/types' },
    { label: 'Who is out', endpoint: 'time_off/whos_out' },
    { label: 'Time off requests', endpoint: 'time_off/requests', query: { start, end: today } },
    { label: 'Departments metadata', endpoint: 'meta/departments' },
    { label: 'Locations metadata', endpoint: 'meta/locations' },
    { label: 'Hiring jobs', endpoint: 'applicant_tracking/jobs' },
    { label: 'Hiring applications', endpoint: 'applicant_tracking/applications' },
    { label: 'Hiring applications page 1', endpoint: 'applicant_tracking/applications', query: { page: '1' } },
  ];

  const results: BambooHrEndpointProbeResult[] = [];
  for (const item of endpoints) {
    try {
      const response = await fetchBambooHrJson(settings, item.endpoint, item.query);
      results.push({
        label: item.label,
        endpoint: item.endpoint,
        ok: true,
        status: response.status,
        summary: summarizeBambooHrJson(response.json),
      });
    } catch (error) {
      results.push({
        label: item.label,
        endpoint: item.endpoint,
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown BambooHR API error',
      });
    }
  }

  return results;
}
