/**
 * Intuit OAuth 2.0 for QuickBooks Online. Endpoints are the same for sandbox
 * and production; the realm decides which company data the token reaches.
 */
const AUTHORIZE_ENDPOINT = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const DEFAULT_REDIRECT_URI = 'http://localhost:3000/api/quickbooks/callback';

export const QUICKBOOKS_ACCOUNTING_SCOPE = 'com.intuit.quickbooks.accounting';

export type QuickBooksTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  token_type?: string;
};

function clientConfig() {
  return {
    clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
    redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || DEFAULT_REDIRECT_URI,
  };
}

export function quickBooksAuthorizeUri(state: string, scopes: string[] = [QUICKBOOKS_ACCOUNTING_SCOPE]): string {
  const { clientId, redirectUri } = clientConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

async function requestToken(form: Record<string, string>): Promise<QuickBooksTokenResponse> {
  const { clientId, clientSecret } = clientConfig();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams(form).toString(),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    // Body carries Intuit's error code (e.g. invalid_grant), which callers use to decide on reconnect.
    throw new Error(`Intuit token request failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const json = JSON.parse(text) as Partial<QuickBooksTokenResponse>;
  if (!json.access_token || !json.refresh_token) {
    throw new Error('Intuit token response was missing tokens.');
  }
  return json as QuickBooksTokenResponse;
}

export function exchangeQuickBooksCode(code: string): Promise<QuickBooksTokenResponse> {
  return requestToken({ grant_type: 'authorization_code', code, redirect_uri: clientConfig().redirectUri });
}

export function refreshQuickBooksToken(refreshToken: string): Promise<QuickBooksTokenResponse> {
  return requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
}
