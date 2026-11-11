export const FOODREADY_SOURCE_CODE = 'FOODREADY_AI';
export const FOODREADY_LABEL = 'FoodReady AI';
export const FOODREADY_API_BASE_URL = 'https://api.foodready.ai';

/** Endpoints from FoodReady's public OpenAPI spec (https://api.foodready.ai/api/openapi.json). */
export const DEFAULT_FOODREADY_DATA_DOMAINS = [
  { dataDomain: 'Inventory On Hand', sourceObject: '/api/inventoryItems/search', enabled: true },
  { dataDomain: 'Lots, Expiration & Traceability', sourceObject: '/api/purchaseOrders/lots/search', enabled: true },
  { dataDomain: 'Inventory Movements', sourceObject: '/api/purchaseOrderReceiving/search', enabled: true },
  { dataDomain: 'WIP Item Lots', sourceObject: '/api/wipItemLots/search', enabled: true },
  { dataDomain: 'Items, Ingredients & Units', sourceObject: '/api/itemPackaging/search', enabled: true },
  { dataDomain: 'Recipes (BOMs)', sourceObject: '/api/bom/search', enabled: true },
  { dataDomain: 'Manufacturing Orders', sourceObject: '/api/mo/search', enabled: true },
  { dataDomain: 'Production Batches', sourceObject: '/api/moBatch/search', enabled: true },
  { dataDomain: 'Suppliers', sourceObject: '/api/v2/suppliers/search', enabled: true },
  { dataDomain: 'Suppliers & Purchase Orders', sourceObject: '/api/purchaseOrders/search', enabled: true },
  { dataDomain: 'Sales Orders', sourceObject: '/api/salesOrders', enabled: true },
] as const;

/** Domains saved before FoodReady was an API source stored descriptions instead of endpoints. */
const LEGACY_DOMAIN_ENDPOINTS: Record<string, string> = {
  'Recipes & Production Batches': '/api/bom/search',
};

export function foodReadyEndpointForDomain(dataDomain: string, sourceObject: string): string | null {
  const trimmed = sourceObject.trim();
  if (trimmed.startsWith('/')) return trimmed;
  return DEFAULT_FOODREADY_DATA_DOMAINS.find((row) => row.dataDomain === dataDomain)?.sourceObject
    || LEGACY_DOMAIN_ENDPOINTS[dataDomain]
    || null;
}

export type FoodReadyCredentials = {
  baseUrl: string;
  apiKey: string;
  organizationId: string;
};

export function foodReadyCredentialsFromConnection(
  connection: { baseUrl: string | null; accessToken: string | null; connectionMetadata: unknown } | null | undefined
): FoodReadyCredentials | null {
  const baseUrl = String(connection?.baseUrl || FOODREADY_API_BASE_URL).trim();
  const apiKey = String(connection?.accessToken || '').trim();
  const metadata = connection?.connectionMetadata;
  const settings = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).foodReadySettings
    : null;
  const organizationId = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? String((settings as Record<string, unknown>).organizationId || '').trim()
    : '';
  return apiKey ? { baseUrl, apiKey, organizationId } : null;
}

export async function foodReadyApiRequest<T>(
  credentials: FoodReadyCredentials,
  path: string,
  query: Record<string, string | number | boolean> = {}
): Promise<T> {
  const baseUrl = new URL(credentials.baseUrl);
  if (baseUrl.protocol !== 'https:') throw new Error('FoodReady API Base URL must use HTTPS.');
  const url = new URL(path, baseUrl);
  if (url.origin !== baseUrl.origin) throw new Error('FoodReady endpoint must be relative to the configured API Base URL.');
  if (credentials.organizationId) url.searchParams.set('organizationId', credentials.organizationId);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, { headers: { Accept: 'application/json', 'x-api-key': credentials.apiKey }, cache: 'no-store' });
  const text = await response.text();
  if (!response.ok) throw new Error(`FoodReady API returned HTTP ${response.status} for ${path}.`);
  return (text ? JSON.parse(text) : {}) as T;
}
