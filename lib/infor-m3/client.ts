import type { InforM3Credentials } from '@/lib/infor-m3/credentials';

type TokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

export type InforTokenResult =
  | {
      ok: true;
      tokenEndpoint: string;
      accessToken: string;
      tokenType?: string;
      expiresIn?: number;
      scope?: string;
    }
  | {
      ok: false;
      tokenEndpoint: string;
      status: number;
      error?: string;
      errorDescription?: string;
      raw?: string;
    };

type InforTokenMeta = {
  tokenEndpoint: string;
  tokenType?: string;
  expiresIn?: number;
  scope?: string;
};

type CachedToken = {
  accessToken: string;
  tokenType?: string;
  expiresIn?: number;
  scope?: string;
  expiresAtMs: number;
};

export type InforIonApiRequestMeta = {
  programId?: string;
  sourcePath?: string;
  syncRunId?: string;
  businessDateIso?: string | null;
};

const tokenCache = new Map<string, CachedToken>();

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${normalizedBase}${normalizedPath}`;
}

function classifySlVchHdrsBookmarkShape(bookmark: string | null | undefined): 'empty' | 'legacy' | 'canonical' | 'unknown' {
  if (!bookmark) return 'empty';
  const raw = String(bookmark).trim();
  if (!raw) return 'empty';
  const hasRecordDate = /RecordDate/i.test(raw);
  const hasVoucher = /Voucher/i.test(raw);
  const hasVendNum = /VendNum/i.test(raw);
  const hasRowPointer = /RowPointer/i.test(raw);
  if (hasVoucher && hasVendNum && !hasRecordDate) return 'legacy';
  if (hasRecordDate && hasVoucher && hasRowPointer) return 'canonical';
  return 'unknown';
}

function assertNoLegacySlVchHdrsOutboundRequest(endpointPath: string, meta?: InforIonApiRequestMeta): void {
  const [path, queryString = ''] = String(endpointPath || '').split('?');
  if (!/\/IDORequestService\/ido\/load\/SLVchHdrs/i.test(path)) return;

  const params = new URLSearchParams(queryString);
  const filter = String(params.get('filter') || '');
  const orderBy = String(params.get('orderby') || params.get('orderBy') || '');
  const bookmark = String(params.get('bookmark') || '').trim() || null;
  const bookmarkShape = classifySlVchHdrsBookmarkShape(bookmark);
  const hasRecordDate = /RecordDate/i.test(filter);
  const hasOrderBy = /RecordDate/i.test(orderBy) && /Voucher/i.test(orderBy);
  const legacyBookmark = bookmarkShape === 'legacy';
  const debugSync = process.env.SYNC_DEBUG === '1';

  if (debugSync) {
    console.log(
      JSON.stringify({
        event: 'slvchhdrs_outbound_final',
        syncRunId: meta?.syncRunId || null,
        businessDateIso: meta?.businessDateIso || null,
        sourcePath: meta?.sourcePath || null,
        programId: meta?.programId || 'SLVCHHDRS',
        hasRecordDate,
        hasOrderBy,
        bookmarkShape,
        endpointPath,
      })
    );
  }

  if (!hasRecordDate || !hasOrderBy || legacyBookmark) {
    console.error(
      JSON.stringify({
        event: 'slvchhdrs_outbound_blocked',
        syncRunId: meta?.syncRunId || null,
        businessDateIso: meta?.businessDateIso || null,
        sourcePath: meta?.sourcePath || null,
        programId: meta?.programId || 'SLVCHHDRS',
        hasRecordDate,
        hasOrderBy,
        bookmarkShape,
        endpointPath,
      })
    );
    throw new Error(`Blocked legacy SLVCHHDRS outbound request: ${endpointPath}`);
  }
}

function parseJsonSafely(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function describeRequestError(error: unknown): { error: string; errorDescription?: string } {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return {
        error: 'request_aborted',
        errorDescription: 'The operation was aborted (request timeout exceeded).',
      };
    }
    return {
      error: 'request_failed',
      errorDescription: error.message,
    };
  }
  return {
    error: 'request_failed',
    errorDescription: 'Unknown request error',
  };
}

function buildTokenCacheKey(credentials: InforM3Credentials): string {
  return [
    credentials.ssoBaseUrl,
    credentials.oauthTokenPath || 'token.oauth2',
    credentials.ionApiBaseUrl,
    credentials.clientId,
    credentials.serviceAccountAccessKey,
  ]
    .map((v) => String(v || '').trim())
    .join('|');
}

function getCachedAccessToken(credentials: InforM3Credentials): CachedToken | null {
  const key = buildTokenCacheKey(credentials);
  const cached = tokenCache.get(key);
  if (!cached) return null;
  // Refresh a bit early to avoid edge-of-expiry request failures.
  if (Date.now() >= cached.expiresAtMs - 60_000) {
    tokenCache.delete(key);
    return null;
  }
  return cached;
}

function setCachedAccessToken(credentials: InforM3Credentials, token: TokenResponse): void {
  if (!token.access_token) return;
  const key = buildTokenCacheKey(credentials);
  const expiresInSec = Number(token.expires_in || 3600);
  tokenCache.set(key, {
    accessToken: token.access_token,
    tokenType: token.token_type,
    expiresIn: token.expires_in,
    scope: token.scope,
    expiresAtMs: Date.now() + Math.max(60, expiresInSec) * 1000,
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) return null;
  const asNumber = Number(retryAfterHeader);
  if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber * 1000;
  const asDate = new Date(retryAfterHeader);
  if (Number.isNaN(asDate.getTime())) return null;
  return Math.max(0, asDate.getTime() - Date.now());
}

export async function requestInforM3AccessToken(
  credentials: InforM3Credentials,
  timeoutMs = 12000
): Promise<InforTokenResult> {
  const cached = getCachedAccessToken(credentials);
  if (cached) {
    return {
      ok: true,
      tokenEndpoint: joinUrl(credentials.ssoBaseUrl, credentials.oauthTokenPath || 'token.oauth2'),
      accessToken: cached.accessToken,
      tokenType: cached.tokenType,
      expiresIn: cached.expiresIn,
      scope: cached.scope,
    };
  }

  const tokenUrl = joinUrl(credentials.ssoBaseUrl, credentials.oauthTokenPath || 'token.oauth2');
  const clientId = credentials.clientId;
  const clientSecret = credentials.clientSecret;
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const requestBody = new URLSearchParams({
    grant_type: 'password',
    username: credentials.serviceAccountAccessKey,
    password: credentials.serviceAccountSecretKey,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: requestBody.toString(),
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      const described = describeRequestError(error);
      return {
        ok: false,
        tokenEndpoint: tokenUrl,
        status: 0,
        error: described.error,
        errorDescription: described.errorDescription,
      };
    }

    const bodyText = await tokenResponse.text();
    const parsed = parseJsonSafely(bodyText) as TokenResponse;

    if (tokenResponse.ok && parsed.access_token) {
      clearTimeout(timeout);
      setCachedAccessToken(credentials, parsed);
      return {
        ok: true,
        tokenEndpoint: tokenUrl,
        accessToken: parsed.access_token,
        tokenType: parsed.token_type,
        expiresIn: parsed.expires_in,
        scope: parsed.scope,
      };
    }

    if (tokenResponse.status === 429 && attempt < maxAttempts - 1) {
      const retryAfterMs = parseRetryAfterMs(tokenResponse.headers.get('retry-after'));
      const jitterMs = Math.floor(Math.random() * 200);
      const backoffMs = retryAfterMs ?? (500 * Math.pow(2, attempt) + jitterMs);
      await sleep(backoffMs);
      continue;
    }

    clearTimeout(timeout);
    return {
      ok: false,
      tokenEndpoint: tokenUrl,
      status: tokenResponse.status,
      error: parsed.error,
      errorDescription: parsed.error_description,
      raw: typeof (parsed as { raw?: unknown }).raw === 'string' ? (parsed as { raw?: string }).raw : undefined,
    };
  }

  clearTimeout(timeout);
  return {
    ok: false,
    tokenEndpoint: tokenUrl,
    status: 429,
    error: 'rate_limited',
    errorDescription: 'Token request exceeded retry attempts due to rate limiting.',
  };
}

export async function callInforIonApi(
  credentials: InforM3Credentials,
  endpointPath: string,
  options?: { timeoutMs?: number; headers?: Record<string, string>; meta?: InforIonApiRequestMeta }
): Promise<{
  ok: boolean;
  status: number;
  url: string;
  body: Record<string, unknown> | string;
  token: InforTokenMeta;
}> {
  assertNoLegacySlVchHdrsOutboundRequest(endpointPath, options?.meta);
  const tokenResult = await requestInforM3AccessToken(credentials, options?.timeoutMs ?? 12000);
  if (!tokenResult.ok) {
    return {
      ok: false,
      status: tokenResult.status,
      url: tokenResult.tokenEndpoint,
      body: {
        stage: 'token',
        error: tokenResult.error,
        errorDescription: tokenResult.errorDescription,
        raw: tokenResult.raw,
      },
      token: {
        tokenEndpoint: tokenResult.tokenEndpoint,
      },
    };
  }

  const url = joinUrl(credentials.ionApiBaseUrl, endpointPath);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 12000);

  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          Accept: 'application/json',
          ...(options?.headers || {}),
        },
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      const described = describeRequestError(error);
      return {
        ok: false,
        status: 0,
        url,
        body: {
          stage: 'api',
          error: described.error,
          errorDescription: described.errorDescription,
        },
        token: {
          tokenEndpoint: tokenResult.tokenEndpoint,
          tokenType: tokenResult.tokenType,
          expiresIn: tokenResult.expiresIn,
          scope: tokenResult.scope,
        },
      };
    }

    const text = await response.text();
    const parsed = parseJsonSafely(text);

    if (response.status === 429 && attempt < maxAttempts - 1) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      const jitterMs = Math.floor(Math.random() * 200);
      const backoffMs = retryAfterMs ?? (500 * Math.pow(2, attempt) + jitterMs);
      await sleep(backoffMs);
      continue;
    }

    clearTimeout(timeout);
    return {
      ok: response.ok,
      status: response.status,
      url,
      body: parsed,
      token: {
        tokenEndpoint: tokenResult.tokenEndpoint,
        tokenType: tokenResult.tokenType,
        expiresIn: tokenResult.expiresIn,
        scope: tokenResult.scope,
      },
    };
  }

  clearTimeout(timeout);
  return {
    ok: false,
    status: 429,
    url,
    body: {
      stage: 'api',
      error: 'rate_limited',
      errorDescription: 'ION API request exceeded retry attempts due to rate limiting.',
    },
    token: {
      tokenEndpoint: tokenResult.tokenEndpoint,
      tokenType: tokenResult.tokenType,
      expiresIn: tokenResult.expiresIn,
      scope: tokenResult.scope,
    },
  };
}
