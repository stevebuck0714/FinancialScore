import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export type OperationalSystemConnectionRecord = {
  id: string;
  companyId: string;
  provider: string;
  sourceCode: string;
  status: string;
  authType: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  baseUrl: string | null;
  lastSyncAt: Date | null;
  autoSync: boolean;
  syncFrequency: string;
  connectionMetadata: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type SaveConnectionInput = {
  companyId: string;
  provider: string;
  sourceCode: string;
  status: string;
  authType?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  baseUrl?: string | null;
  lastSyncAt?: Date | null;
  autoSync: boolean;
  syncFrequency: string;
  connectionMetadata?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

function getDelegate():
  | {
      findMany: (args: unknown) => Promise<any[]>;
      findUnique: (args: unknown) => Promise<any | null>;
      upsert: (args: unknown) => Promise<any>;
      deleteMany: (args: unknown) => Promise<{ count: number }>;
    }
  | null {
  const delegate = (prisma as any).operationalSystemConnection;
  return delegate && typeof delegate === 'object' ? delegate : null;
}

function isUnknownProviderEnumError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('not found in enum') && message.includes('OperationalSystemProvider');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeRow(row: any): OperationalSystemConnectionRecord {
  return {
    id: String(row.id),
    companyId: String(row.companyId),
    provider: String(row.provider),
    sourceCode: String(row.sourceCode),
    status: String(row.status),
    authType: row.authType == null ? null : String(row.authType),
    accessToken: row.accessToken == null ? null : String(row.accessToken),
    refreshToken: row.refreshToken == null ? null : String(row.refreshToken),
    tokenExpiresAt: row.tokenExpiresAt ? new Date(row.tokenExpiresAt) : null,
    baseUrl: row.baseUrl == null ? null : String(row.baseUrl),
    lastSyncAt: row.lastSyncAt ? new Date(row.lastSyncAt) : null,
    autoSync: Boolean(row.autoSync),
    syncFrequency: String(row.syncFrequency || 'manual'),
    connectionMetadata: asRecord(row.connectionMetadata),
    errorMessage: row.errorMessage == null ? null : String(row.errorMessage),
    createdAt: row.createdAt ? new Date(row.createdAt) : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
  };
}

export function isQuickBooksAccountingSystem(value: unknown): boolean {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'QUICKBOOKS' || normalized === 'QUICKBOOKS_ONLINE' || normalized === 'QBO';
}

export async function listOperationalSystemConnections(companyId: string): Promise<OperationalSystemConnectionRecord[]> {
  const delegate = getDelegate();
  if (delegate) {
    try {
      const rows = await delegate.findMany({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(normalizeRow);
    } catch (error) {
      if (!isUnknownProviderEnumError(error)) throw error;
    }
  }

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT
      "id",
      "companyId",
      "provider",
      "sourceCode",
      "status",
      "authType",
      "accessToken",
      "refreshToken",
      "tokenExpiresAt",
      "baseUrl",
      "lastSyncAt",
      "autoSync",
      "syncFrequency",
      "connectionMetadata",
      "errorMessage",
      "createdAt",
      "updatedAt"
    FROM "OperationalSystemConnection"
    WHERE "companyId" = ${companyId}
    ORDER BY "createdAt" ASC
  `);

  return rows.map(normalizeRow);
}

export async function getOperationalSystemConnection(
  companyId: string,
  provider: string,
  sourceCode: string
): Promise<OperationalSystemConnectionRecord | null> {
  const delegate = getDelegate();
  if (delegate) {
    try {
      const row = await delegate.findUnique({
        where: {
          companyId_provider_sourceCode: {
            companyId,
            provider,
            sourceCode,
          },
        },
      });
      return row ? normalizeRow(row) : null;
    } catch (error) {
      if (!isUnknownProviderEnumError(error)) throw error;
    }
  }

  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT
      "id",
      "companyId",
      "provider",
      "sourceCode",
      "status",
      "authType",
      "accessToken",
      "refreshToken",
      "tokenExpiresAt",
      "baseUrl",
      "lastSyncAt",
      "autoSync",
      "syncFrequency",
      "connectionMetadata",
      "errorMessage",
      "createdAt",
      "updatedAt"
    FROM "OperationalSystemConnection"
    WHERE "companyId" = ${companyId}
      AND "provider" = ${provider}::"OperationalSystemProvider"
      AND "sourceCode" = ${sourceCode}
    LIMIT 1
  `);

  return rows.length > 0 ? normalizeRow(rows[0]) : null;
}

export async function saveOperationalSystemConnection(input: SaveConnectionInput): Promise<void> {
  const delegate = getDelegate();
  const hasOwn = (key: keyof SaveConnectionInput) => Object.prototype.hasOwnProperty.call(input, key);
  const createPayload = {
    authType: input.authType ?? null,
    accessToken: input.accessToken ?? null,
    refreshToken: input.refreshToken ?? null,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    baseUrl: input.baseUrl ?? null,
    lastSyncAt: input.lastSyncAt ?? null,
    autoSync: input.autoSync,
    syncFrequency: input.syncFrequency,
    connectionMetadata: input.connectionMetadata ?? null,
    errorMessage: input.errorMessage ?? null,
    status: input.status,
  };
  const updatePayload = {
    status: input.status,
    autoSync: input.autoSync,
    syncFrequency: input.syncFrequency,
    ...(hasOwn('authType') ? { authType: input.authType ?? null } : {}),
    ...(hasOwn('accessToken') ? { accessToken: input.accessToken ?? null } : {}),
    ...(hasOwn('refreshToken') ? { refreshToken: input.refreshToken ?? null } : {}),
    ...(hasOwn('tokenExpiresAt') ? { tokenExpiresAt: input.tokenExpiresAt ?? null } : {}),
    ...(hasOwn('baseUrl') ? { baseUrl: input.baseUrl ?? null } : {}),
    ...(hasOwn('lastSyncAt') ? { lastSyncAt: input.lastSyncAt ?? null } : {}),
    ...(hasOwn('connectionMetadata') ? { connectionMetadata: input.connectionMetadata ?? null } : {}),
    ...(hasOwn('errorMessage') ? { errorMessage: input.errorMessage ?? null } : {}),
  };

  if (delegate) {
    try {
      await delegate.upsert({
        where: {
          companyId_provider_sourceCode: {
            companyId: input.companyId,
            provider: input.provider,
            sourceCode: input.sourceCode,
          },
        },
        update: updatePayload,
        create: {
          companyId: input.companyId,
          provider: input.provider,
          sourceCode: input.sourceCode,
          ...createPayload,
        },
      });
      return;
    } catch (error) {
      if (!isUnknownProviderEnumError(error)) throw error;
    }
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "OperationalSystemConnection" (
      "id",
      "companyId",
      "provider",
      "sourceCode",
      "status",
      "authType",
      "accessToken",
      "refreshToken",
      "tokenExpiresAt",
      "baseUrl",
      "lastSyncAt",
      "autoSync",
      "syncFrequency",
      "connectionMetadata",
      "errorMessage",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      md5(random()::text || clock_timestamp()::text),
      ${input.companyId},
      ${input.provider}::"OperationalSystemProvider",
      ${input.sourceCode},
      ${createPayload.status}::"ConnectionStatus",
      ${createPayload.authType},
      ${createPayload.accessToken},
      ${createPayload.refreshToken},
      ${createPayload.tokenExpiresAt},
      ${createPayload.baseUrl},
      ${createPayload.lastSyncAt},
      ${createPayload.autoSync},
      ${createPayload.syncFrequency},
      ${createPayload.connectionMetadata ? JSON.stringify(createPayload.connectionMetadata) : null}::jsonb,
      ${createPayload.errorMessage},
      NOW(),
      NOW()
    )
    ON CONFLICT ("companyId", "provider", "sourceCode")
    DO UPDATE SET
      "status" = EXCLUDED."status",
      "authType" = CASE WHEN ${hasOwn('authType')} THEN EXCLUDED."authType" ELSE "OperationalSystemConnection"."authType" END,
      "accessToken" = CASE WHEN ${hasOwn('accessToken')} THEN EXCLUDED."accessToken" ELSE "OperationalSystemConnection"."accessToken" END,
      "refreshToken" = CASE WHEN ${hasOwn('refreshToken')} THEN EXCLUDED."refreshToken" ELSE "OperationalSystemConnection"."refreshToken" END,
      "tokenExpiresAt" = CASE WHEN ${hasOwn('tokenExpiresAt')} THEN EXCLUDED."tokenExpiresAt" ELSE "OperationalSystemConnection"."tokenExpiresAt" END,
      "baseUrl" = CASE WHEN ${hasOwn('baseUrl')} THEN EXCLUDED."baseUrl" ELSE "OperationalSystemConnection"."baseUrl" END,
      "lastSyncAt" = CASE WHEN ${hasOwn('lastSyncAt')} THEN EXCLUDED."lastSyncAt" ELSE "OperationalSystemConnection"."lastSyncAt" END,
      "autoSync" = EXCLUDED."autoSync",
      "syncFrequency" = EXCLUDED."syncFrequency",
      "connectionMetadata" = CASE WHEN ${hasOwn('connectionMetadata')} THEN EXCLUDED."connectionMetadata" ELSE "OperationalSystemConnection"."connectionMetadata" END,
      "errorMessage" = CASE WHEN ${hasOwn('errorMessage')} THEN EXCLUDED."errorMessage" ELSE "OperationalSystemConnection"."errorMessage" END,
      "updatedAt" = NOW()
  `);
}

export async function deleteOperationalSystemConnection(
  companyId: string,
  provider: string,
  sourceCode: string
): Promise<void> {
  const delegate = getDelegate();
  if (delegate) {
    try {
      await delegate.deleteMany({
        where: {
          companyId,
          provider,
          sourceCode,
        },
      });
      return;
    } catch (error) {
      if (!isUnknownProviderEnumError(error)) throw error;
    }
  }

  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "OperationalSystemConnection"
    WHERE "companyId" = ${companyId}
      AND "provider" = ${provider}::"OperationalSystemProvider"
      AND "sourceCode" = ${sourceCode}
  `);
}

