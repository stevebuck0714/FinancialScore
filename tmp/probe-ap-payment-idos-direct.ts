import { callInforIonApi } from '../lib/infor-m3/client';
import type { InforM3Credentials } from '../lib/infor-m3/credentials';

const HEADERS = {
  'X-Infor-MongooseConfig': 'APR_PRD_LYN',
  'X-Infor-Site': 'LYN',
} as Record<string, string>;

const CANDIDATES = ['SLAPPMTS', 'SLAPTRXP', 'SLAPTRXPS', 'SLVCHHDRS'];

function getEnvCredentials(): InforM3Credentials {
  const tenantId = process.env.INFOR_M3_TENANT_ID;
  const clientName = process.env.INFOR_M3_CLIENT_NAME;
  const clientId = process.env.INFOR_M3_CLIENT_ID;
  const clientSecret = process.env.INFOR_M3_CLIENT_SECRET;
  const ionApiBaseUrl = process.env.INFOR_M3_IONAPI_BASE_URL;
  const ssoBaseUrl = process.env.INFOR_M3_SSO_BASE_URL;
  const serviceAccountAccessKey = process.env.INFOR_M3_SERVICE_ACCOUNT_ACCESS_KEY;
  const serviceAccountSecretKey = process.env.INFOR_M3_SERVICE_ACCOUNT_SECRET_KEY;

  if (
    !tenantId ||
    !clientId ||
    !clientSecret ||
    !ionApiBaseUrl ||
    !ssoBaseUrl ||
    !serviceAccountAccessKey ||
    !serviceAccountSecretKey
  ) {
    throw new Error('Missing required INFOR_M3_* environment variables.');
  }

  return {
    tenantId,
    clientName: clientName || undefined,
    clientId,
    clientSecret,
    ionApiBaseUrl,
    ssoBaseUrl,
    oauthAuthPath: process.env.INFOR_M3_OAUTH_AUTH_PATH || 'authorization.oauth2',
    oauthTokenPath: process.env.INFOR_M3_OAUTH_TOKEN_PATH || 'token.oauth2',
    oauthRevokePath: process.env.INFOR_M3_OAUTH_REVOKE_PATH || 'revoke_token.oauth2',
    serviceAccountAccessKey,
    serviceAccountSecretKey,
  };
}

function extractPropertyNames(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  const nodes = Array.isArray(b.Properties)
    ? b.Properties
    : Array.isArray(b.properties)
      ? b.properties
      : Array.isArray(b.PropertyList)
        ? b.PropertyList
        : [];
  return nodes
    .map((n: any) => String(n?.Name || n?.name || n?.PropertyName || '').trim())
    .filter(Boolean);
}

function extractItems(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  if (Array.isArray(b.Items)) return b.Items;
  if (Array.isArray(b.items)) return b.items;
  if (Array.isArray(b.records)) return b.records;
  return [];
}

async function main() {
  const credentials = getEnvCredentials();
  const results: Array<Record<string, unknown>> = [];

  for (const ido of CANDIDATES) {
    const infoPath = `/APR_PRD/CSI/IDORequestService/ido/info/${ido}`;
    const loadPath = `/APR_PRD/CSI/IDORequestService/ido/load/${ido}?recordCap=5`;

    const info = await callInforIonApi(credentials, infoPath, { timeoutMs: 45000, headers: HEADERS });
    const load = await callInforIonApi(credentials, loadPath, { timeoutMs: 45000, headers: HEADERS });

    const infoProps = extractPropertyNames(info.body);
    const loadItems = extractItems(load.body);
    results.push({
      ido,
      infoStatus: info.status,
      loadStatus: load.status,
      infoOk: info.ok,
      loadOk: load.ok,
      infoPropertyCount: infoProps.length,
      sampleInfoProps: infoProps.slice(0, 40),
      loadItemCount: loadItems.length,
      firstLoadItemKeys: loadItems.length ? Object.keys(loadItems[0]).slice(0, 40) : [],
      infoBodyPreview: typeof info.body === 'string' ? info.body.slice(0, 300) : JSON.stringify(info.body).slice(0, 300),
      loadBodyPreview: typeof load.body === 'string' ? load.body.slice(0, 300) : JSON.stringify(load.body).slice(0, 300),
    });
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
