/**
 * Vista Cloud (Trimble Viewpoint Vista) credential + connection settings.
 *
 * Auth model: API key passed in the X-Application-Key header (NOT OAuth).
 * Endpoint pattern:
 *   {baseUrl}/subscribers/{subscriberCode}/vista/{module}/{version}/data/{resource}/cache/search
 * Customers can have separate keys for production and test environments.
 */

export type VistaCloudSettings = {
  subscriberCode: string;
  applicationKeyProd: string;
  applicationKeyTest: string;
  baseUrl: string;
  apiVersion: string;
  defaultEnvironment: 'PROD' | 'TEST' | '';
};

export const DEFAULT_VISTA_CLOUD_SETTINGS: VistaCloudSettings = {
  subscriberCode: '',
  applicationKeyProd: '',
  applicationKeyTest: '',
  baseUrl: 'https://api.xchange.trimble.com/connect/v1/direct',
  apiVersion: 'v1',
  defaultEnvironment: 'PROD',
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function sanitizeVistaCloudSettings(value: unknown): VistaCloudSettings {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const env = asString(src.defaultEnvironment).toUpperCase();
  return {
    subscriberCode: asString(src.subscriberCode),
    applicationKeyProd: asString(src.applicationKeyProd),
    applicationKeyTest: asString(src.applicationKeyTest),
    baseUrl: asString(src.baseUrl) || DEFAULT_VISTA_CLOUD_SETTINGS.baseUrl,
    apiVersion: asString(src.apiVersion) || DEFAULT_VISTA_CLOUD_SETTINGS.apiVersion,
    defaultEnvironment: env === 'TEST' ? 'TEST' : env === 'PROD' ? 'PROD' : '',
  };
}
