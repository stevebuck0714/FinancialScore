import type { OperationalSystemConnection } from '@prisma/client';

export const JOBBOSS_SOURCE_CODE = 'JOBBOSS2_STANDARD';
export const JOBBOSS_LABEL = 'JobBOSS²';
export const JOBBOSS_API_BASE_URL = 'https://api-jb2.integrations.ecimanufacturing.com';
export const JOBBOSS_TOKEN_URL = 'https://api-user.integrations.ecimanufacturing.com/oauth2/api-user/token';

export type JobBossCredentials = { clientId: string; clientSecret: string };

export const DEFAULT_JOBBOSS_DATA_DOMAINS = [
  { dataDomain: 'Customers', sourceObject: '/api/v1/customers', enabled: true },
  { dataDomain: 'Quotes & Estimates', sourceObject: '/api/v1/quotes', enabled: true },
  { dataDomain: 'Quote Line Items', sourceObject: '/api/v1/quote-line-items', enabled: true },
  { dataDomain: 'Sales Orders', sourceObject: '/api/v1/orders', enabled: true },
  { dataDomain: 'Sales Order Line Items', sourceObject: '/api/v1/order-line-items', enabled: true },
  { dataDomain: 'Jobs & Material Requirements', sourceObject: '/api/v1/job-requirements', enabled: true },
  { dataDomain: 'Routings', sourceObject: '/api/v1/routings', enabled: true },
  { dataDomain: 'Time Tickets', sourceObject: '/api/v1/time-tickets', enabled: true },
  { dataDomain: 'Purchase Orders', sourceObject: '/api/v1/purchase-orders', enabled: true },
  { dataDomain: 'Purchase Order Line Items', sourceObject: '/api/v1/purchase-order-line-items', enabled: true },
  { dataDomain: 'Inventory & Materials', sourceObject: '/api/v1/materials', enabled: true },
  { dataDomain: 'Inventory Bins', sourceObject: '/api/v1/bin-locations', enabled: true },
  { dataDomain: 'AR Invoices', sourceObject: '/api/v1/ar-invoices', enabled: true },
  { dataDomain: 'Quality & Non-Conformances', sourceObject: '/api/v1/non-conformances', enabled: true },
] as const;

export function jobBossCredentialsFromConnection(
  connection: Pick<OperationalSystemConnection, 'accessToken' | 'refreshToken'> | null | undefined
): JobBossCredentials | null {
  const clientId = String(connection?.accessToken || '').trim();
  const clientSecret = String(connection?.refreshToken || '').trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export async function getJobBossAccessToken(credentials: JobBossCredentials): Promise<string> {
  const response = await fetch(JOBBOSS_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'openid' }).toString(),
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`JobBOSS² authorization failed (HTTP ${response.status}).`);
  const payload = text ? JSON.parse(text) as { access_token?: string } : {};
  if (!payload.access_token) throw new Error('JobBOSS² authorization did not return an access token.');
  return payload.access_token;
}

export async function jobBossApiRequest<T>(accessToken: string, path: string, query: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(path, JOBBOSS_API_BASE_URL);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`JobBOSS² API returned HTTP ${response.status} for ${path}.`);
  return (text ? JSON.parse(text) : {}) as T;
}
