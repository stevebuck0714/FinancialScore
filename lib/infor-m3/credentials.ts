import prisma from '@/lib/prisma';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/encryption';
import { shouldAllowInforM3EnvFallback } from '@/lib/infor-m3/security-config';
import { normalizeInforSystem, type InforSystem } from '@/lib/infor-m3/system';

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

type InforConnectionMetadataContainer = Record<string, unknown> & {
  inforProfiles?: Record<string, InforM3ConnectionMetadata>;
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

function isCompleteMetadata(metadata: Partial<InforM3ConnectionMetadata> | null | undefined): metadata is InforM3ConnectionMetadata {
  if (!metadata) return false;
  return Boolean(
    metadata.clientIdEncrypted &&
      metadata.clientSecretEncrypted &&
      metadata.serviceAccountAccessKeyEncrypted &&
      metadata.serviceAccountSecretKeyEncrypted &&
      metadata.ionApiBaseUrl &&
      metadata.ssoBaseUrl &&
      metadata.tenantId
  );
}

async function resolveInforSystemForCompany(companyId: string, system?: InforSystem): Promise<InforSystem> {
  if (system) return normalizeInforSystem(system);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { accountingSystem: true },
  });
  return normalizeInforSystem(company?.accountingSystem);
}

export async function saveInforM3CredentialsForCompany(
  companyId: string,
  credentials: InforM3Credentials,
  system?: InforSystem
): Promise<void> {
  const resolvedSystem = await resolveInforSystemForCompany(companyId, system);
  const metadata = toMetadata(credentials);
  const existing = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform: 'INFOR_M3',
      },
    },
    select: {
      connectionMetadata: true,
    },
  });
  const existingMetadata =
    existing?.connectionMetadata && typeof existing.connectionMetadata === 'object'
      ? (existing.connectionMetadata as InforConnectionMetadataContainer)
      : {};
  const profiles = {
    ...(existingMetadata.inforProfiles || {}),
    [resolvedSystem]: metadata,
  };
  const mergedMetadata: InforConnectionMetadataContainer = {
    ...existingMetadata,
    inforProfiles: profiles,
  };
  if (resolvedSystem === 'INFOR_M3') {
    Object.assign(mergedMetadata, metadata);
  }

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
      connectionMetadata: mergedMetadata as any,
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
      connectionMetadata: mergedMetadata as any,
    },
  });
}

export async function clearInforM3CredentialsForCompany(companyId: string, system?: InforSystem): Promise<void> {
  const resolvedSystem = await resolveInforSystemForCompany(companyId, system);
  const existing = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform: 'INFOR_M3',
      },
    },
    select: {
      connectionMetadata: true,
    },
  });
  if (!existing?.connectionMetadata || typeof existing.connectionMetadata !== 'object') {
    await prisma.accountingConnection.deleteMany({
      where: {
        companyId,
        platform: 'INFOR_M3',
      },
    });
    return;
  }

  const metadata = { ...(existing.connectionMetadata as InforConnectionMetadataContainer) };
  const profiles = { ...(metadata.inforProfiles || {}) };
  delete profiles[resolvedSystem];
  metadata.inforProfiles = profiles;

  if (resolvedSystem === 'INFOR_M3') {
    delete metadata.clientIdEncrypted;
    delete metadata.clientSecretEncrypted;
    delete metadata.serviceAccountAccessKeyEncrypted;
    delete metadata.serviceAccountSecretKeyEncrypted;
    delete metadata.tenantId;
    delete metadata.clientName;
    delete metadata.ionApiBaseUrl;
    delete metadata.ssoBaseUrl;
    delete metadata.oauthAuthPath;
    delete metadata.oauthTokenPath;
    delete metadata.oauthRevokePath;
    delete metadata.credentialsSource;
  }

  const hasProfileCredentials = Object.values(profiles).some((profile) => isCompleteMetadata(profile));
  const hasLegacyCredentials = isCompleteMetadata(metadata as Partial<InforM3ConnectionMetadata>);
  if (!hasProfileCredentials && !hasLegacyCredentials) {
    await prisma.accountingConnection.deleteMany({
      where: {
        companyId,
        platform: 'INFOR_M3',
      },
    });
    return;
  }

  await prisma.accountingConnection.update({
    where: {
      companyId_platform: {
        companyId,
        platform: 'INFOR_M3',
      },
    },
    data: {
      connectionMetadata: metadata as any,
      status: 'ACTIVE',
      errorMessage: null,
    },
  });
}

export async function getInforM3CredentialsForCompany(
  companyId: string,
  system?: InforSystem
): Promise<InforM3Credentials | null> {
  const resolvedSystem = await resolveInforSystemForCompany(companyId, system);
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

  const metadata = connection.connectionMetadata as InforConnectionMetadataContainer;
  const profileMetadata =
    metadata?.inforProfiles && typeof metadata.inforProfiles === 'object'
      ? (metadata.inforProfiles[resolvedSystem] as InforM3ConnectionMetadata | undefined)
      : undefined;

  if (isCompleteMetadata(profileMetadata)) {
    return fromMetadata(profileMetadata);
  }
  if (isCompleteMetadata(metadata as Partial<InforM3ConnectionMetadata>)) {
    return fromMetadata(metadata as unknown as InforM3ConnectionMetadata);
  }
  return null;
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
  companyId: string,
  system?: InforSystem
): Promise<{ credentials: InforM3Credentials | null; source: 'database' | 'env' | null }> {
  const dbCredentials = await getInforM3CredentialsForCompany(companyId, system);
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
