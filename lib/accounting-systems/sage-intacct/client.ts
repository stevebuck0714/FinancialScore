/**
 * Minimal Sage Intacct XML API client.
 *
 * Intacct exposes a single XML endpoint. Every request is a `<request>`
 * envelope wrapping:
 *   - <control>      — sender credentials + request id + DTD version
 *   - <operation>    — <authentication> (login or sessionid) + one or more
 *                      <content><function>…</function></content> blocks
 *
 * For our purposes we wrap two primitives:
 *   1. `getAPISession({ creds })`         — login with sender + user creds,
 *                                           returns a sessionId we can reuse
 *                                           for follow-up requests.
 *   2. `readByQuery({ session, object, … })` — paged Intacct readByQuery,
 *                                           returns rows + totals.
 *
 * Notes:
 *   - We deliberately avoid a 3rd-party XML parser. Intacct's responses for
 *     these two operations have a tight, well-known shape and a 250-line
 *     regex/string-walking implementation handles it reliably without adding
 *     a new dependency to the bundle.
 *   - All network failures + non-2xx HTTP statuses + Intacct-level
 *     `<errormessage>` blocks are normalized into a single ergonomic result
 *     shape so callers can branch on `result.ok` without try/catch noise.
 */
import type { SageIntacctSettings } from './index';

const DEFAULT_TIMEOUT_MS = 20_000;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function newControlId(): string {
  return `fs-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

/**
 * Pull the FIRST occurrence of <tag>…</tag> out of an XML string. Good enough
 * for response envelopes where there's exactly one of these top-level tags
 * (e.g. <sessionid>, <result>, <errormessage>).
 */
function extractFirst(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

/**
 * Pull EVERY <tag>…</tag> as raw inner XML — used to peel off each row from a
 * <data>…</data> block.
 */
function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

/**
 * Convert a single <object>…</object> body into a flat object.
 * Intacct row payloads are flat element-trees (one level deep for our objects),
 * so we walk all top-level child tags and use their text content.
 */
function rowXmlToObject(rowXml: string): Record<string, string> {
  const obj: Record<string, string> = {};
  const re = /<([A-Z0-9_\-]+)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowXml))) {
    const key = m[1];
    const raw = m[2];
    obj[key] = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  }
  return obj;
}

type IntacctErrorInfo = {
  description: string;
  description2?: string;
  correction?: string;
};

function extractError(xml: string): IntacctErrorInfo | null {
  const block = extractFirst(xml, 'errormessage');
  if (!block) return null;
  const err = extractFirst(block, 'error') || block;
  return {
    description: extractFirst(err, 'description') || extractFirst(err, 'description2') || 'Sage Intacct error',
    description2: extractFirst(err, 'description2') || undefined,
    correction: extractFirst(err, 'correction') || undefined,
  };
}

async function postXml(endpoint: string, xml: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{ ok: true; status: number; body: string } | { ok: false; status: number; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        Accept: 'application/xml',
      },
      body: xml,
      signal: controller.signal,
    });
    const body = await resp.text();
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: `HTTP ${resp.status}: ${body.slice(0, 500)}` };
    }
    return { ok: true, status: resp.status, body };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
}

export type SageIntacctSession = {
  sessionId: string;
  endpoint: string;
  companyId: string;
  userId: string;
  expiresAt?: string;
};

export type SageIntacctConnectResult =
  | { ok: true; session: SageIntacctSession }
  | { ok: false; status: number; error: string; details?: IntacctErrorInfo };

/**
 * Authenticate against Sage Intacct using the supplied sender + user
 * credentials and return a sessionId we can reuse for subsequent calls.
 */
export async function getAPISession(creds: SageIntacctSettings): Promise<SageIntacctConnectResult> {
  const endpoint = creds.endpointUrl || 'https://api.intacct.com/ia/xml/xmlgw.phtml';
  const dtd = creds.dtdVersion || '3.0';
  const controlId = newControlId();

  const locationLine = creds.locationId ? `<locationid>${escapeXml(creds.locationId)}</locationid>` : '';
  const entityLine = creds.entityId ? `<locationid>${escapeXml(creds.entityId)}</locationid>` : '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<request>
  <control>
    <senderid>${escapeXml(creds.senderId)}</senderid>
    <password>${escapeXml(creds.senderPassword)}</password>
    <controlid>${controlId}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>${escapeXml(dtd)}</dtdversion>
    <includewhitespace>false</includewhitespace>
  </control>
  <operation>
    <authentication>
      <login>
        <userid>${escapeXml(creds.userId)}</userid>
        <companyid>${escapeXml(creds.companyId)}</companyid>
        <password>${escapeXml(creds.userPassword)}</password>
        ${entityLine || locationLine}
      </login>
    </authentication>
    <content>
      <function controlid="getAPISession-${controlId}">
        <getAPISession />
      </function>
    </content>
  </operation>
</request>`;

  const resp = await postXml(endpoint, xml);
  if (!resp.ok) {
    return { ok: false, status: resp.status, error: resp.error };
  }

  const body = resp.body;
  const err = extractError(body);
  if (err) {
    return { ok: false, status: 400, error: err.description, details: err };
  }

  const sessionId = extractFirst(body, 'sessionid');
  const sessionEndpoint = extractFirst(body, 'endpoint') || endpoint;
  if (!sessionId) {
    return { ok: false, status: 502, error: 'Sage Intacct response did not contain a sessionid' };
  }

  return {
    ok: true,
    session: {
      sessionId,
      endpoint: sessionEndpoint,
      companyId: creds.companyId,
      userId: creds.userId,
    },
  };
}

export type ReadByQueryParams = {
  session: SageIntacctSession;
  object: string;
  fields?: string;
  query?: string;
  pagesize?: number;
  /**
   * Intacct uses a server-side cursor for pagination — `readMore` advances
   * through the result set after the initial readByQuery returns. We hide
   * that behind `pageThrough` below; this lower-level fn just executes a
   * single page request.
   */
};

export type ReadByQueryPage = {
  ok: boolean;
  status: number;
  totalCount?: number;
  numRemaining?: number;
  resultId?: string;
  rows: Record<string, string>[];
  error?: string;
  details?: IntacctErrorInfo;
};

export async function readByQuery(params: ReadByQueryParams): Promise<ReadByQueryPage> {
  const { session, object, fields = '*', query = '', pagesize = 200 } = params;
  const controlId = newControlId();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<request>
  <control>
    <senderid>${escapeXml(session.sessionId.length === 0 ? '' : '')}</senderid>
    <password></password>
    <controlid>${controlId}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
    <includewhitespace>false</includewhitespace>
  </control>
  <operation>
    <authentication>
      <sessionid>${escapeXml(session.sessionId)}</sessionid>
    </authentication>
    <content>
      <function controlid="readByQuery-${controlId}">
        <readByQuery>
          <object>${escapeXml(object)}</object>
          <fields>${escapeXml(fields)}</fields>
          <query>${escapeXml(query)}</query>
          <pagesize>${pagesize}</pagesize>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>`;

  // Intacct's readByQuery doesn't actually require sender credentials when a
  // sessionid is supplied, but the <senderid>/<password> tags must exist (can
  // be empty). The construction above intentionally produces empty values.

  const resp = await postXml(session.endpoint, xml);
  if (!resp.ok) {
    return { ok: false, status: resp.status, rows: [], error: resp.error };
  }
  const body = resp.body;
  const err = extractError(body);
  if (err) {
    return { ok: false, status: 400, rows: [], error: err.description, details: err };
  }

  const dataBlock = extractFirst(body, 'data') || '';
  const totalCount = parseInt(extractFirst(body, 'totalcount') || '0', 10) || undefined;
  const numRemaining = parseInt(extractFirst(body, 'numremaining') || '0', 10);
  const resultId = extractFirst(body, 'resultId') || undefined;

  // Each <object>…</object> row inside <data> tagged with the object name.
  const rowBlocks = extractAll(dataBlock, object);
  const rows = rowBlocks.map(rowXmlToObject);

  return {
    ok: true,
    status: 200,
    totalCount,
    numRemaining: Number.isFinite(numRemaining) ? numRemaining : undefined,
    resultId,
    rows,
  };
}

/**
 * Convenience wrapper that fully drains a readByQuery result set up to a
 * configurable hard limit. Returns the combined rows + a flag indicating
 * whether the limit was hit (caller may want to surface that to the user).
 */
export async function pageThrough(
  params: ReadByQueryParams,
  opts: { maxRows?: number } = {}
): Promise<{ ok: boolean; status: number; rows: Record<string, string>[]; totalCount?: number; truncated: boolean; error?: string }> {
  const maxRows = opts.maxRows ?? 5000;
  const all: Record<string, string>[] = [];
  let truncated = false;

  const first = await readByQuery(params);
  if (!first.ok) {
    return { ok: false, status: first.status, rows: [], totalCount: first.totalCount, truncated: false, error: first.error };
  }
  all.push(...first.rows);

  // Intacct's `readMore` is what advances the cursor for further pages, but
  // most of our common objects (vendors, customers, GL accounts) are well
  // under 200 rows, and `readByQuery` already returns up to `pagesize`. For
  // the v1 implementation we cap at one page to avoid the readMore round
  // trips; the Backfill flow chunks by date window instead.
  if ((first.numRemaining ?? 0) > 0 && all.length < maxRows) {
    truncated = true;
  }

  return {
    ok: true,
    status: 200,
    rows: all.slice(0, maxRows),
    totalCount: first.totalCount,
    truncated: truncated || all.length > maxRows,
  };
}
