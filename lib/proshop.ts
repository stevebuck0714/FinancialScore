export const PROSHOP_SOURCE_CODE = 'PROSHOP_STANDARD';
export const PROSHOP_LABEL = 'ProShop';

export const DEFAULT_PROSHOP_DATA_DOMAINS = [
  { dataDomain: 'Jobs & Work Orders', sourceObject: '', enabled: true },
  { dataDomain: 'Job Operations & Routing', sourceObject: '', enabled: true },
  { dataDomain: 'Time & Labor', sourceObject: '', enabled: true },
  { dataDomain: 'Production & Completion', sourceObject: '', enabled: true },
  { dataDomain: 'Inventory & Materials', sourceObject: '', enabled: true },
  { dataDomain: 'Purchase Orders & Receipts', sourceObject: '', enabled: true },
  { dataDomain: 'Customers & Sales Orders', sourceObject: '', enabled: true },
  { dataDomain: 'Quality & Nonconformances', sourceObject: '', enabled: true },
] as const;

export type ProShopCredentials = {
  baseUrl: string;
  apiKey: string;
  apiKeyHeader: 'authorization' | 'x-api-key';
};

export function proShopCredentialsFromConnection(
  connection: { baseUrl: string | null; accessToken: string | null; connectionMetadata: unknown } | null | undefined
): ProShopCredentials | null {
  const baseUrl = String(connection?.baseUrl || '').trim();
  const apiKey = String(connection?.accessToken || '').trim();
  const metadata = connection?.connectionMetadata;
  const configuredHeader = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).proShopSettings
    : null;
  const apiKeyHeader = configuredHeader && typeof configuredHeader === 'object' && !Array.isArray(configuredHeader)
    && (configuredHeader as Record<string, unknown>).apiKeyHeader === 'x-api-key'
    ? 'x-api-key'
    : 'authorization';
  return baseUrl && apiKey ? { baseUrl, apiKey, apiKeyHeader } : null;
}

export async function proShopApiRequest<T>(credentials: ProShopCredentials, path: string): Promise<T> {
  const baseUrl = new URL(credentials.baseUrl);
  if (baseUrl.protocol !== 'https:') throw new Error('ProShop API Base URL must use HTTPS.');
  const url = new URL(path, baseUrl);
  if (url.origin !== baseUrl.origin) throw new Error('ProShop endpoint must be relative to the configured API Base URL.');
  const headers = credentials.apiKeyHeader === 'x-api-key'
    ? { Accept: 'application/json', 'X-API-Key': credentials.apiKey }
    : { Accept: 'application/json', Authorization: `Bearer ${credentials.apiKey}` };
  const response = await fetch(url, { headers, cache: 'no-store' });
  const text = await response.text();
  if (!response.ok) throw new Error(`ProShop API returned HTTP ${response.status} for ${path}.`);
  return (text ? JSON.parse(text) : {}) as T;
}
