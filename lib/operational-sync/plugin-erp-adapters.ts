import type { AccountingConnection, AccountingPlatform } from '@prisma/client';
import prisma from '@/lib/prisma';
import vistaCloud, { type VistaCloudProgram, type VistaCloudSettings } from '@/lib/accounting-systems/vista-cloud';
import {
  buildProgramFilter,
  pageThrough as pageThroughVista,
  resolveCreds as resolveVistaCreds,
  VistaApiError,
} from '@/lib/accounting-systems/vista-cloud/client';
import sageIntacct, { type SageIntacctProgram, type SageIntacctSettings } from '@/lib/accounting-systems/sage-intacct';
import {
  getAPISession,
  pageThrough as pageThroughSage,
  type SageIntacctSession,
} from '@/lib/accounting-systems/sage-intacct/client';
import acumatica, { type AcumaticaProgram, type AcumaticaSettings } from '@/lib/accounting-systems/acumatica';
import odoo, { type OdooProgram, type OdooSettings } from '@/lib/accounting-systems/odoo';
import dynamics365, { type Dynamics365Program, type Dynamics365Settings } from '@/lib/accounting-systems/dynamics-365';
import type { OperationalSyncResult, SyncFrequency } from './runner';

type PluginConnection = Pick<
  AccountingConnection,
  'id' | 'companyId' | 'platform' | 'connectionMetadata'
>;

type ProgramOutcome = {
  key: string;
  module: string;
  resource: string;
  ok: boolean;
  recordCount: number;
  syncedAt: string;
  error?: string;
  warning?: string;
  truncated?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function defaultSince(metadata: Record<string, unknown>): string {
  const schedule = asRecord(metadata.sharedSchedule);
  const configured = asString(schedule.initialSyncStartDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(configured)) return configured;
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().slice(0, 10);
}

function intacctDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${month}/${day}/${year}`;
}

function summarizeResult(outcomes: ProgramOutcome[]): OperationalSyncResult {
  const recordsCreated = outcomes.reduce((sum, outcome) => sum + outcome.recordCount, 0);
  const errors = outcomes
    .filter((outcome) => !outcome.ok)
    .map((outcome) => `${outcome.key}: ${outcome.error || 'Unknown error'}`);
  const warnings = outcomes
    .filter((outcome) => outcome.warning)
    .map((outcome) => `${outcome.key}: ${outcome.warning}`);
  return {
    success: errors.length === 0,
    recordsCreated,
    errors: [...errors, ...warnings],
  };
}

async function persistPluginSyncSummary(
  connection: PluginConnection,
  metadata: Record<string, unknown>,
  outcomes: ProgramOutcome[],
  startedAt: number
): Promise<void> {
  const now = new Date();
  const existingLastSynced = asRecord(metadata.lastSyncedPerObject);
  const lastSyncedPerObject: Record<string, unknown> = { ...existingLastSynced };
  for (const outcome of outcomes) {
    if (outcome.ok) lastSyncedPerObject[outcome.key] = outcome.syncedAt;
  }

  const result = summarizeResult(outcomes);
  await prisma.accountingConnection.update({
    where: { id: connection.id },
    data: {
      status: result.success ? 'ACTIVE' : 'ERROR',
      lastSyncAt: now,
      errorMessage: result.success ? null : result.errors.join(' | ').slice(0, 900),
      connectionMetadata: {
        ...metadata,
        lastSyncedPerObject,
        lastSyncSummary: {
          mode: 'scheduled',
          startedAt: new Date(startedAt).toISOString(),
          finishedAt: now.toISOString(),
          durationMs: Date.now() - startedAt,
          programsRun: outcomes.length,
          programsFailed: outcomes.filter((outcome) => !outcome.ok).length,
          totalRows: result.recordsCreated,
          outcomes: outcomes.map((outcome) => ({
            key: outcome.key,
            module: outcome.module,
            resource: outcome.resource,
            ok: outcome.ok,
            recordCount: outcome.recordCount,
            error: outcome.error,
            warning: outcome.warning,
            truncated: outcome.truncated,
            syncedAt: outcome.syncedAt,
          })),
        },
        lastUpdatedAt: now.toISOString(),
      } as any,
    },
  });

  await prisma.apiSyncLog.create({
    data: {
      companyId: connection.companyId,
      platform: connection.platform,
      syncType: 'auto_operational_sync',
      status: result.success ? 'success' : 'partial',
      recordsImported: result.recordsCreated,
      errorCount: outcomes.filter((outcome) => !outcome.ok).length,
      errorDetails: result.success
        ? undefined
        : outcomes.filter((outcome) => !outcome.ok).map((outcome) => ({
            key: outcome.key,
            error: outcome.error,
          })),
      duration: Date.now() - startedAt,
    },
  });
}

function programSince(metadata: Record<string, unknown>, key: string): string {
  const lastSynced = asRecord(metadata.lastSyncedPerObject);
  const prior = asString(lastSynced[key]);
  if (prior) return prior.slice(0, 10);
  return defaultSince(metadata);
}

export async function syncVistaCloudConnection(
  connection: PluginConnection,
  _frequency: SyncFrequency
): Promise<OperationalSyncResult> {
  const startedAt = Date.now();
  const metadata = asRecord(connection.connectionMetadata);
  const settings = vistaCloud.sanitizeSettings(metadata.settings ?? vistaCloud.defaultSettings) as VistaCloudSettings;
  const programs = vistaCloud.sanitizePrograms(metadata.programs ?? vistaCloud.defaultPrograms) as VistaCloudProgram[];
  const creds = resolveVistaCreds(settings, null);
  const enabledPrograms = programs.filter((program) => program.enabled !== false && program.module && program.resourcePath);
  const outcomes: ProgramOutcome[] = [];

  for (const program of enabledPrograms) {
    const key = `${program.module}/${program.resourcePath}`;
    const syncedAt = new Date().toISOString();
    try {
      const since = programSince(metadata, key);
      const page = await pageThroughVista(
        {
          creds,
          module: program.module,
          resourcePath: program.resourcePath,
          filter: buildProgramFilter(program, { since }),
        },
        { maxRows: 5000 }
      );
      outcomes.push({
        key,
        module: program.module,
        resource: program.resource || program.resourcePath,
        ok: true,
        recordCount: page.rows.length,
        syncedAt,
        truncated: page.truncated,
        warning: !program.modifiedField
          ? `No modifiedField configured; relying on Vista's server-side history window.`
          : undefined,
      });
    } catch (error) {
      const message = error instanceof VistaApiError
        ? `${error.message}: ${error.body.slice(0, 300)}`
        : error instanceof Error
          ? error.message
          : 'Unknown Vista Cloud error';
      outcomes.push({
        key,
        module: program.module,
        resource: program.resource || program.resourcePath,
        ok: false,
        recordCount: 0,
        syncedAt,
        error: message,
      });
    }
  }

  await persistPluginSyncSummary(connection, metadata, outcomes, startedAt);
  return summarizeResult(outcomes);
}

async function ensureSageSession(
  settings: SageIntacctSettings,
  metadata: Record<string, unknown>
): Promise<SageIntacctSession> {
  const cached = asRecord(metadata.session);
  const sessionId = asString(cached.sessionId);
  const endpoint = asString(cached.endpoint);
  if (sessionId && endpoint) {
    return { sessionId, endpoint, companyId: settings.companyId, userId: settings.userId };
  }
  const fresh = await getAPISession(settings);
  if (!fresh.ok) {
    throw new Error(`Failed to authenticate with Sage Intacct: ${fresh.error}`);
  }
  return fresh.session;
}

export async function syncSageIntacctConnection(
  connection: PluginConnection,
  _frequency: SyncFrequency
): Promise<OperationalSyncResult> {
  const startedAt = Date.now();
  const metadata = asRecord(connection.connectionMetadata);
  const settings = sageIntacct.sanitizeSettings(metadata.settings ?? sageIntacct.defaultSettings) as SageIntacctSettings;
  const programs = sageIntacct.sanitizePrograms(metadata.programs ?? sageIntacct.defaultPrograms) as SageIntacctProgram[];
  let session = await ensureSageSession(settings, metadata);
  let refreshedSession = false;
  const outcomes: ProgramOutcome[] = [];

  for (const program of programs.filter((row) => row.enabled !== false && row.objectName)) {
    const key = program.objectName;
    const syncedAt = new Date().toISOString();
    const since = programSince(metadata, key);
    const query = `WHENMODIFIED > '${intacctDate(since)}'`;
    try {
      let page = await pageThroughSage({ session, object: program.objectName, query, fields: '*', pagesize: 200 }, { maxRows: 5000 });
      if (!page.ok && /session/i.test(page.error || '') && !refreshedSession) {
        const fresh = await getAPISession(settings);
        if (fresh.ok) {
          session = fresh.session;
          refreshedSession = true;
          page = await pageThroughSage({ session, object: program.objectName, query, fields: '*', pagesize: 200 }, { maxRows: 5000 });
        }
      }
      if (!page.ok) throw new Error(page.error || 'Unknown Sage Intacct error');
      outcomes.push({
        key,
        module: program.module,
        resource: program.objectName,
        ok: true,
        recordCount: page.rows.length,
        syncedAt,
        truncated: page.truncated,
      });
    } catch (error) {
      outcomes.push({
        key,
        module: program.module,
        resource: program.objectName,
        ok: false,
        recordCount: 0,
        syncedAt,
        error: error instanceof Error ? error.message : 'Unknown Sage Intacct error',
      });
    }
  }

  const metadataWithSession = {
    ...metadata,
    session: {
      sessionId: session.sessionId,
      endpoint: session.endpoint,
      cachedAt: new Date().toISOString(),
    },
  };
  await persistPluginSyncSummary(connection, metadataWithSession, outcomes, startedAt);
  return summarizeResult(outcomes);
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs = 30000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
    }
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

function extractArrayRows(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const obj = asRecord(body);
  for (const key of ['value', 'items', 'data', 'results', 'records', 'rows']) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

export async function syncAcumaticaConnection(
  connection: PluginConnection,
  _frequency: SyncFrequency
): Promise<OperationalSyncResult> {
  const startedAt = Date.now();
  const metadata = asRecord(connection.connectionMetadata);
  const settings = acumatica.sanitizeSettings(metadata.settings ?? acumatica.defaultSettings) as AcumaticaSettings;
  const programs = acumatica.sanitizePrograms(metadata.programs ?? acumatica.defaultPrograms) as AcumaticaProgram[];
  const baseUrl = normalizeBaseUrl(settings.instanceUrl);
  const outcomes: ProgramOutcome[] = [];

  if (!baseUrl || !settings.username || !settings.password || !settings.tenantId) {
    throw new Error('Acumatica credentials incomplete: instanceUrl, tenantId, username, and password are required.');
  }

  const loginResponse = await fetch(`${baseUrl}/entity/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      name: settings.username,
      password: settings.password,
      company: settings.companyCode || settings.tenantId,
      branch: settings.branch || undefined,
    }),
  });
  const loginText = await loginResponse.text();
  if (!loginResponse.ok) {
    throw new Error(`Acumatica login failed (${loginResponse.status}): ${loginText.slice(0, 500)}`);
  }
  const cookie = loginResponse.headers.get('set-cookie') || '';
  const apiPath = settings.contractBasedApiPath || `/entity/${settings.endpointName || 'Default'}/${settings.endpointVersion || '20.200.001'}`;

  try {
    for (const program of programs.filter((row) => row.endpointOrEntity)) {
      const key = program.endpointOrEntity;
      const syncedAt = new Date().toISOString();
      try {
        const url = new URL(`${baseUrl}${apiPath}/${program.endpointOrEntity}`);
        url.searchParams.set('$top', '200');
        const body = await fetchJsonWithTimeout(url.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json', Cookie: cookie },
        });
        outcomes.push({
          key,
          module: program.module,
          resource: program.endpointOrEntity,
          ok: true,
          recordCount: extractArrayRows(body).length,
          syncedAt,
        });
      } catch (error) {
        outcomes.push({
          key,
          module: program.module,
          resource: program.endpointOrEntity,
          ok: false,
          recordCount: 0,
          syncedAt,
          error: error instanceof Error ? error.message : 'Unknown Acumatica error',
        });
      }
    }
  } finally {
    await fetch(`${baseUrl}/entity/auth/logout`, { method: 'POST', headers: { Cookie: cookie } }).catch(() => undefined);
  }

  await persistPluginSyncSummary(connection, metadata, outcomes, startedAt);
  return summarizeResult(outcomes);
}

async function odooJsonRpc(baseUrl: string, payload: unknown): Promise<unknown> {
  const response = await fetchJsonWithTimeout(`${normalizeBaseUrl(baseUrl)}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), ...asRecord(payload) }),
  });
  const body = asRecord(response);
  if (body.error) {
    const err = asRecord(body.error);
    throw new Error(asString(err.message) || JSON.stringify(err).slice(0, 500));
  }
  return body.result;
}

function normalizeOdooModel(value: string): string {
  return value.split(/\s|\(/)[0].trim();
}

export async function syncOdooConnection(
  connection: PluginConnection,
  _frequency: SyncFrequency
): Promise<OperationalSyncResult> {
  const startedAt = Date.now();
  const metadata = asRecord(connection.connectionMetadata);
  const settings = odoo.sanitizeSettings(metadata.settings ?? odoo.defaultSettings) as OdooSettings;
  const programs = odoo.sanitizePrograms(metadata.programs ?? odoo.defaultPrograms) as OdooProgram[];
  const password = settings.authMethod === 'API_KEY' ? settings.apiKey : settings.password;
  const outcomes: ProgramOutcome[] = [];

  if (!settings.baseUrl || !settings.database || !settings.username || !password) {
    throw new Error('Odoo credentials incomplete: baseUrl, database, username, and password/API key are required.');
  }

  const uid = await odooJsonRpc(settings.baseUrl, {
    method: 'call',
    params: {
      service: 'common',
      method: 'authenticate',
      args: [settings.database, settings.username, password, {}],
    },
  });
  if (!uid) throw new Error('Odoo authentication failed: no uid returned.');

  for (const program of programs.filter((row) => row.modelOrEndpoint)) {
    const model = normalizeOdooModel(program.modelOrEndpoint);
    const syncedAt = new Date().toISOString();
    try {
      const rows = await odooJsonRpc(settings.baseUrl, {
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            settings.database,
            uid,
            password,
            model,
            'search_read',
            [[]],
            { limit: 200 },
          ],
        },
      });
      outcomes.push({
        key: program.modelOrEndpoint,
        module: program.module,
        resource: model,
        ok: true,
        recordCount: Array.isArray(rows) ? rows.length : 0,
        syncedAt,
      });
    } catch (error) {
      outcomes.push({
        key: program.modelOrEndpoint,
        module: program.module,
        resource: model,
        ok: false,
        recordCount: 0,
        syncedAt,
        error: error instanceof Error ? error.message : 'Unknown Odoo error',
      });
    }
  }

  await persistPluginSyncSummary(connection, metadata, outcomes, startedAt);
  return summarizeResult(outcomes);
}

async function getDynamicsAccessToken(settings: Dynamics365Settings): Promise<string> {
  if (!settings.tenantId || !settings.clientId || !settings.clientSecret || !settings.environmentUrl) {
    throw new Error('Dynamics 365 credentials incomplete: tenantId, environmentUrl, clientId, and clientSecret are required.');
  }
  const authority = normalizeBaseUrl(settings.authorityUrl || 'https://login.microsoftonline.com');
  const tokenUrl = `${authority}/${encodeURIComponent(settings.tenantId)}/oauth2/v2.0/token`;
  const scope = settings.scope && settings.scope !== '.default'
    ? settings.scope
    : `${normalizeBaseUrl(settings.environmentUrl)}/.default`;
  const body = new URLSearchParams({
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    grant_type: 'client_credentials',
    scope,
  });
  const result = asRecord(await fetchJsonWithTimeout(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  }));
  const token = asString(result.access_token);
  if (!token) throw new Error('Dynamics 365 token response did not include access_token.');
  return token;
}

function buildDynamicsUrl(settings: Dynamics365Settings, endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const base = normalizeBaseUrl(settings.environmentUrl);
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  if (settings.legalEntity && !cleanEndpoint.includes('companies(')) {
    return `${base}/api/v2.0/companies(${encodeURIComponent(settings.legalEntity)})/${cleanEndpoint}`;
  }
  return `${base}/${cleanEndpoint}`;
}

export async function syncDynamics365Connection(
  connection: PluginConnection,
  _frequency: SyncFrequency
): Promise<OperationalSyncResult> {
  const startedAt = Date.now();
  const metadata = asRecord(connection.connectionMetadata);
  const settings = dynamics365.sanitizeSettings(metadata.settings ?? dynamics365.defaultSettings) as Dynamics365Settings;
  const programs = dynamics365.sanitizePrograms(metadata.programs ?? dynamics365.defaultPrograms) as Dynamics365Program[];
  const token = await getDynamicsAccessToken(settings);
  const outcomes: ProgramOutcome[] = [];

  for (const program of programs.filter((row) => row.entityOrEndpoint)) {
    const syncedAt = new Date().toISOString();
    try {
      const url = new URL(buildDynamicsUrl(settings, program.entityOrEndpoint));
      url.searchParams.set('$top', '200');
      const body = await fetchJsonWithTimeout(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      outcomes.push({
        key: program.entityOrEndpoint,
        module: program.module,
        resource: program.entityOrEndpoint,
        ok: true,
        recordCount: extractArrayRows(body).length,
        syncedAt,
      });
    } catch (error) {
      outcomes.push({
        key: program.entityOrEndpoint,
        module: program.module,
        resource: program.entityOrEndpoint,
        ok: false,
        recordCount: 0,
        syncedAt,
        error: error instanceof Error ? error.message : 'Unknown Dynamics 365 error',
      });
    }
  }

  await persistPluginSyncSummary(connection, metadata, outcomes, startedAt);
  return summarizeResult(outcomes);
}

export async function syncPluginErpConnection(
  connection: PluginConnection,
  frequency: SyncFrequency
): Promise<OperationalSyncResult | null> {
  const platform = String(connection.platform) as AccountingPlatform;
  if (platform === 'VISTA_CLOUD') return syncVistaCloudConnection(connection, frequency);
  if (platform === 'SAGE_INTACCT') return syncSageIntacctConnection(connection, frequency);
  if (platform === 'ACUMATICA') return syncAcumaticaConnection(connection, frequency);
  if (platform === 'ODOO') return syncOdooConnection(connection, frequency);
  if (platform === 'DYNAMICS365') return syncDynamics365Connection(connection, frequency);
  return null;
}
