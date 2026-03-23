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

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${normalizedBase}${normalizedPath}`;
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

export async function requestInforM3AccessToken(
  credentials: InforM3Credentials,
  timeoutMs = 12000
): Promise<InforTokenResult> {
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
    const described = describeRequestError(error);
    return {
      ok: false,
      tokenEndpoint: tokenUrl,
      status: 0,
      error: described.error,
      errorDescription: described.errorDescription,
    };
  } finally {
    clearTimeout(timeout);
  }

  const bodyText = await tokenResponse.text();
  const parsed = parseJsonSafely(bodyText) as TokenResponse;

  if (!tokenResponse.ok || !parsed.access_token) {
    return {
      ok: false,
      tokenEndpoint: tokenUrl,
      status: tokenResponse.status,
      error: parsed.error,
      errorDescription: parsed.error_description,
      raw: typeof (parsed as { raw?: unknown }).raw === 'string' ? (parsed as { raw?: string }).raw : undefined,
    };
  }

  return {
    ok: true,
    tokenEndpoint: tokenUrl,
    accessToken: parsed.access_token,
    tokenType: parsed.token_type,
    expiresIn: parsed.expires_in,
    scope: parsed.scope,
  };
}

export async function callInforIonApi(
  credentials: InforM3Credentials,
  endpointPath: string,
  options?: { timeoutMs?: number; headers?: Record<string, string> }
): Promise<{
  ok: boolean;
  status: number;
  url: string;
  body: Record<string, unknown> | string;
  token: InforTokenMeta;
}> {
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
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  const parsed = parseJsonSafely(text);

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
