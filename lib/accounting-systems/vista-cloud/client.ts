/**
 * Minimal Trimble Vista Direct API client.
 *
 * Endpoint shape (per Trimble's onboarding docs and the dashboard design doc):
 *
 *   GET {baseUrl}/subscribers/{subscriberCode}/vista/{module}/{apiVersion}
 *       /data/{resourcePath}/cache/search?<filter+paging>
 *
 *   Headers:
 *     X-Application-Key: <subscriber's prod or test key>
 *     Accept: application/json
 *
 * Important caveats — these are the parts most likely to need adjustment once
 * we hook up a real tenant:
 *
 *   1. Date filter operator. Trimble historically uses a few syntaxes
 *      depending on resource:
 *         ?<field>=gt:<iso>
 *         ?modifiedSince=<iso>
 *         ?<field>From=<iso>&<field>To=<iso>
 *      We default to the `gt:`/`ge:`/`le:` colon operator and let callers
 *      override `modifiedField` per resource. If a tenant returns 400, the
 *      first thing to try is switching to one of the alternatives above.
 *
 *   2. Pagination. Trimble's Direct API responses commonly include
 *      `nextPageToken` (or a `Next-Page-Token` response header). We follow
 *      the body-token convention; if the live API uses headers we'll add
 *      that branch in `fetchPage`.
 *
 *   3. Page size. Trimble caps the page size per resource (often 200 or
 *      500). We default to 200 and clamp to a sensible upper bound.
 *
 *   4. Several Vista GET endpoints **default to 12 months of history** when
 *      no date parameters are provided (see the dashboard design doc, §7).
 *      Always pass an explicit window for resources that support one.
 */

import type { VistaCloudSettings } from './settings';
import type { VistaCloudProgram } from './programs';

const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;
const DEFAULT_TIMEOUT_MS = 60_000;

export type VistaEnvironment = 'PROD' | 'TEST';

export type ResolvedVistaCreds = {
  baseUrl: string;
  subscriberCode: string;
  apiVersion: string;
  applicationKey: string;
  environment: VistaEnvironment;
};

export class VistaApiError extends Error {
  status: number;
  body: string;
  url: string;

  constructor(message: string, opts: { status: number; body: string; url: string }) {
    super(message);
    this.name = 'VistaApiError';
    this.status = opts.status;
    this.body = opts.body;
    this.url = opts.url;
  }
}

/**
 * Resolve which API key + environment to use for a given action. Falls back
 * to whichever key is populated if `defaultEnvironment` is empty.
 */
export function resolveCreds(
  settings: VistaCloudSettings,
  override?: VistaEnvironment | null,
): ResolvedVistaCreds {
  const env: VistaEnvironment =
    override ??
    (settings.defaultEnvironment === 'TEST'
      ? 'TEST'
      : settings.defaultEnvironment === 'PROD'
      ? 'PROD'
      : settings.applicationKeyProd
      ? 'PROD'
      : 'TEST');

  const applicationKey =
    env === 'PROD' ? settings.applicationKeyProd : settings.applicationKeyTest;

  return {
    baseUrl: settings.baseUrl.replace(/\/+$/, ''),
    subscriberCode: settings.subscriberCode,
    apiVersion: settings.apiVersion || 'v1',
    applicationKey,
    environment: env,
  };
}

export function assertCredsUsable(creds: ResolvedVistaCreds): void {
  const missing: string[] = [];
  if (!creds.baseUrl) missing.push('baseUrl');
  if (!creds.subscriberCode) missing.push('subscriberCode');
  if (!creds.applicationKey) missing.push(`applicationKey (${creds.environment})`);
  if (missing.length > 0) {
    throw new Error(`Vista Cloud credentials incomplete: missing ${missing.join(', ')}`);
  }
}

function buildResourceUrl(
  creds: ResolvedVistaCreds,
  module: string,
  resourcePath: string,
): string {
  const mod = encodeURIComponent(module);
  const ver = encodeURIComponent(creds.apiVersion);
  const sub = encodeURIComponent(creds.subscriberCode);
  const res = encodeURIComponent(resourcePath);
  return `${creds.baseUrl}/subscribers/${sub}/vista/${mod}/${ver}/data/${res}/cache/search`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type SearchFilter = {
  /** Field name on the resource — e.g. 'last_modified' or 'transaction_date'. */
  field: string;
  /** Lower bound (inclusive). ISO 8601 date or datetime. */
  gte?: string;
  /** Upper bound (inclusive). ISO 8601 date or datetime. */
  lte?: string;
};

export type SearchParams = {
  creds: ResolvedVistaCreds;
  module: string;
  resourcePath: string;
  /** Optional date filter (only sent when `field` is provided). */
  filter?: SearchFilter | null;
  pageSize?: number;
  pageToken?: string | null;
  /**
   * Extra query params to merge in last (overrides any built-in keys).
   * Useful for resource-specific shapes encountered in the wild.
   */
  extraQuery?: Record<string, string> | null;
  timeoutMs?: number;
};

export type SearchPage = {
  rows: unknown[];
  nextPageToken: string | null;
  rawBody: unknown;
};

/**
 * Fetch a single page of results from a Vista resource.
 *
 * The response shape varies; we accept any of:
 *   { items: [...], nextPageToken: '...' }
 *   { data:  [...], nextPageToken: '...' }
 *   { results: [...], pageToken: '...' }
 *   [ ... ]                         // bare array, no pagination
 */
export async function fetchPage(params: SearchParams): Promise<SearchPage> {
  assertCredsUsable(params.creds);

  const url = new URL(buildResourceUrl(params.creds, params.module, params.resourcePath));
  const pageSize = Math.min(Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  url.searchParams.set('pageSize', String(pageSize));
  if (params.pageToken) {
    url.searchParams.set('pageToken', params.pageToken);
  }

  if (params.filter && params.filter.field) {
    if (params.filter.gte) {
      url.searchParams.append(params.filter.field, `ge:${params.filter.gte}`);
    }
    if (params.filter.lte) {
      url.searchParams.append(params.filter.field, `le:${params.filter.lte}`);
    }
  }

  if (params.extraQuery) {
    for (const [key, value] of Object.entries(params.extraQuery)) {
      url.searchParams.set(key, value);
    }
  }

  const finalUrl = url.toString();
  const res = await fetchWithTimeout(
    finalUrl,
    {
      method: 'GET',
      headers: {
        'X-Application-Key': params.creds.applicationKey,
        Accept: 'application/json',
      },
    },
    params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  const text = await res.text();

  if (!res.ok) {
    throw new VistaApiError(
      `Vista API ${res.status} ${res.statusText} for ${params.module}/${params.resourcePath}`,
      { status: res.status, body: text.slice(0, 2000), url: finalUrl },
    );
  }

  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new VistaApiError(
        `Vista API returned non-JSON for ${params.module}/${params.resourcePath}`,
        { status: res.status, body: text.slice(0, 2000), url: finalUrl },
      );
    }
  }

  const rows = extractRows(parsed);
  const nextPageToken = extractNextPageToken(parsed);

  return { rows, nextPageToken, rawBody: parsed };
}

function extractRows(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  const obj = body as Record<string, unknown>;
  const candidates = ['items', 'data', 'results', 'records', 'rows'];
  for (const key of candidates) {
    const val = obj[key];
    if (Array.isArray(val)) return val;
  }
  return [];
}

function extractNextPageToken(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  const candidates = ['nextPageToken', 'pageToken', 'next_page_token'];
  for (const key of candidates) {
    const val = obj[key];
    if (typeof val === 'string' && val.length > 0) return val;
  }
  return null;
}

/**
 * Drain pages until `nextPageToken` is null or `maxRows` is reached.
 */
export async function pageThrough(
  params: Omit<SearchParams, 'pageToken'>,
  opts: { maxRows?: number } = {},
): Promise<{ rows: unknown[]; pages: number; truncated: boolean }> {
  const maxRows = opts.maxRows ?? 5000;
  const all: unknown[] = [];
  let pageToken: string | null = null;
  let pages = 0;
  let truncated = false;

  do {
    const page = await fetchPage({ ...params, pageToken });
    pages += 1;
    for (const row of page.rows) {
      all.push(row);
      if (all.length >= maxRows) {
        truncated = page.nextPageToken !== null || page.rows.length > all.length;
        return { rows: all, pages, truncated };
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return { rows: all, pages, truncated };
}

/**
 * Lightweight credential check used by the Connect button.
 *
 * Strategy: hit a tiny, near-universally-enabled resource (GL Chart of
 * Accounts) with `pageSize=1`. A 200 means the key + subscriber + base URL
 * are good. A 401/403 means bad key. A 404 likely means the resource is
 * not enabled for this subscriber — which is still a valid "credentials
 * work, just no access to that resource" signal, so we treat 404 as OK.
 *
 * Returns a short human-readable detail string useful for the UI.
 */
export async function validateConnection(
  settings: VistaCloudSettings,
  override?: VistaEnvironment | null,
): Promise<{ ok: true; environment: VistaEnvironment; detail: string }> {
  const creds = resolveCreds(settings, override);
  assertCredsUsable(creds);

  try {
    await fetchPage({
      creds,
      module: 'gl',
      resourcePath: 'chart_of_accounts',
      pageSize: 1,
      timeoutMs: 20_000,
    });
    return {
      ok: true,
      environment: creds.environment,
      detail: `Authenticated against subscriber "${creds.subscriberCode}" (${creds.environment}).`,
    };
  } catch (err) {
    if (err instanceof VistaApiError && err.status === 404) {
      // Credentials worked; the probe resource just isn't enabled.
      return {
        ok: true,
        environment: creds.environment,
        detail: `Authenticated against subscriber "${creds.subscriberCode}" (${creds.environment}). (GL Chart of Accounts not enabled — that's OK.)`,
      };
    }
    if (err instanceof VistaApiError) {
      throw new Error(
        `Vista Cloud connection failed (${err.status}): ${err.body || err.message}`,
      );
    }
    throw err;
  }
}

/**
 * Build the date-window filter for a given program. Returns null if the
 * program has no `modifiedField` or the bounds are missing.
 */
export function buildProgramFilter(
  program: VistaCloudProgram,
  bounds: { since?: string | null; until?: string | null } | null,
): SearchFilter | null {
  if (!program.modifiedField) return null;
  if (!bounds) return null;
  const filter: SearchFilter = { field: program.modifiedField };
  if (bounds.since) filter.gte = bounds.since;
  if (bounds.until) filter.lte = bounds.until;
  if (!filter.gte && !filter.lte) return null;
  return filter;
}
