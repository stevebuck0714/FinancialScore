import prisma from '@/lib/prisma';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/encryption';
import { shouldAllowInforM3EnvFallback } from '@/lib/infor-m3/security-config';

export interface InforM3Credentials {
  tenantId: string;
  clientName?: string;
  clientId: string;
  clientSecret: string;
  ionApiBaseUrl: string;
  ssoBaseUrl: string;
  oauthAuthPath?: string;
  oauthTokenPath?: string;
  oauthRevokePath?: string;
  serviceAccountAccessKey: string;
  serviceAccountSecretKey: string;
}

type InforM3ConnectionMetadata = {
  tenantId: string;
  clientName?: string;
  clientIdEncrypted: string;
  clientSecretEncrypted: string;
  ionApiBaseUrl: string;
  ssoBaseUrl: string;
  oauthAuthPath?: string;
  oauthTokenPath?: string;
  oauthRevokePath?: string;
  serviceAccountAccessKeyEncrypted: string;
  serviceAccountSecretKeyEncrypted: string;
  credentialsSource?: 'database' | 'env';
};

function toMetadata(credentials: InforM3Credentials): InforM3ConnectionMetadata {
  return {
    tenantId: credentials.tenantId,
    clientName: credentials.clientName,
    clientIdEncrypted: encryptOAuthToken(credentials.clientId),
    clientSecretEncrypted: encryptOAuthToken(credentials.clientSecret),
    ionApiBaseUrl: credentials.ionApiBaseUrl,
    ssoBaseUrl: credentials.ssoBaseUrl,
    oauthAuthPath: credentials.oauthAuthPath || 'authorization.oauth2',
    oauthTokenPath: credentials.oauthTokenPath || 'token.oauth2',
    oauthRevokePath: credentials.oauthRevokePath || 'revoke_token.oauth2',
    serviceAccountAccessKeyEncrypted: encryptOAuthToken(credentials.serviceAccountAccessKey),
    serviceAccountSecretKeyEncrypted: encryptOAuthToken(credentials.serviceAccountSecretKey),
    credentialsSource: 'database',
  };
}

function fromMetadata(metadata: InforM3ConnectionMetadata): InforM3Credentials {
  return {
    tenantId: metadata.tenantId,
    clientName: metadata.clientName,
    clientId: decryptOAuthToken(metadata.clientIdEncrypted),
    clientSecret: decryptOAuthToken(metadata.clientSecretEncrypted),
    ionApiBaseUrl: metadata.ionApiBaseUrl,
    ssoBaseUrl: metadata.ssoBaseUrl,
    oauthAuthPath: metadata.oauthAuthPath || 'authorization.oauth2',
    oauthTokenPath: metadata.oauthTokenPath || 'token.oauth2',
    oauthRevokePath: metadata.oauthRevokePath || 'revoke_token.oauth2',
    serviceAccountAccessKey: decryptOAuthToken(metadata.serviceAccountAccessKeyEncrypted),
    serviceAccountSecretKey: decryptOAuthToken(metadata.serviceAccountSecretKeyEncrypted),
  };
}

export async function saveInforM3CredentialsForCompany(
  companyId: string,
  credentials: InforM3Credentials
): Promise<void> {
  const metadata = toMetadata(credentials);

  await prisma.accountingConnection.upsert({
    where: {
      companyId_platform: {
        companyId,
        platform: 'INFOR_M3',
      },
    },
    update: {
      status: 'ACTIVE',
      tenantId: credentials.tenantId,
      platformVersion: 'ionapi-1.0',
      errorMessage: null,
      connectionMetadata: metadata,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
    },
    create: {
      companyId,
      platform: 'INFOR_M3',
      status: 'ACTIVE',
      tenantId: credentials.tenantId,
      platformVersion: 'ionapi-1.0',
      autoSync: false,
      syncFrequency: 'manual',
      connectionMetadata: metadata,
    },
  });
}

export async function clearInforM3CredentialsForCompany(companyId: string): Promise<void> {
  await prisma.accountingConnection.deleteMany({
    where: {
      companyId,
      platform: 'INFOR_M3',
    },
  });
}

export async function getInforM3CredentialsForCompany(
  companyId: string
): Promise<InforM3Credentials | null> {
  const connection = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform: 'INFOR_M3',
      },
    },
    select: {
      connectionMetadata: true,
      status: true,
    },
  });

  if (!connection || !connection.connectionMetadata || connection.status !== 'ACTIVE') {
    return null;
  }

  const metadata = connection.connectionMetadata as InforM3ConnectionMetadata;

  if (
    !metadata.clientIdEncrypted ||
    !metadata.clientSecretEncrypted ||
    !metadata.serviceAccountAccessKeyEncrypted ||
    !metadata.serviceAccountSecretKeyEncrypted ||
    !metadata.ionApiBaseUrl ||
    !metadata.ssoBaseUrl ||
    !metadata.tenantId
  ) {
    return null;
  }

  return fromMetadata(metadata);
}

export function getInforM3CredentialsFromEnv(): InforM3Credentials | null {
  const tenantId = process.env.INFOR_M3_TENANT_ID;
  const clientName = process.env.INFOR_M3_CLIENT_NAME;
  const clientId = process.env.INFOR_M3_CLIENT_ID;
  const clientSecret = process.env.INFOR_M3_CLIENT_SECRET;
  const ionApiBaseUrl = process.env.INFOR_M3_IONAPI_BASE_URL;
  const ssoBaseUrl = process.env.INFOR_M3_SSO_BASE_URL;
  const oauthAuthPath = process.env.INFOR_M3_OAUTH_AUTH_PATH || 'authorization.oauth2';
  const oauthTokenPath = process.env.INFOR_M3_OAUTH_TOKEN_PATH || 'token.oauth2';
  const oauthRevokePath = process.env.INFOR_M3_OAUTH_REVOKE_PATH || 'revoke_token.oauth2';
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
    return null;
  }

  return {
    tenantId,
    clientName,
    clientId,
    clientSecret,
    ionApiBaseUrl,
    ssoBaseUrl,
    oauthAuthPath,
    oauthTokenPath,
    oauthRevokePath,
    serviceAccountAccessKey,
    serviceAccountSecretKey,
  };
}

export async function getInforM3CredentialsWithOptionalEnvFallback(
  companyId: string
): Promise<{ credentials: InforM3Credentials | null; source: 'database' | 'env' | null }> {
  const dbCredentials = await getInforM3CredentialsForCompany(companyId);
  if (dbCredentials) {
    return { credentials: dbCredentials, source: 'database' };
  }

  const allowEnvFallback = shouldAllowInforM3EnvFallback();
  if (!allowEnvFallback) {
    return { credentials: null, source: null };
  }

  const envCredentials = getInforM3CredentialsFromEnv();
  if (!envCredentials) {
    return { credentials: null, source: null };
  }

  return { credentials: envCredentials, source: 'env' };
}
