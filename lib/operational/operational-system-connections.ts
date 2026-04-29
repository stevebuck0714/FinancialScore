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
    const rows = await delegate.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(normalizeRow);
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
  const payload = {
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

  if (delegate) {
    await delegate.upsert({
      where: {
        companyId_provider_sourceCode: {
          companyId: input.companyId,
          provider: input.provider,
          sourceCode: input.sourceCode,
        },
      },
      update: payload,
      create: {
        companyId: input.companyId,
        provider: input.provider,
        sourceCode: input.sourceCode,
        ...payload,
      },
    });
    return;
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
      ${payload.status}::"ConnectionStatus",
      ${payload.authType},
      ${payload.accessToken},
      ${payload.refreshToken},
      ${payload.tokenExpiresAt},
      ${payload.baseUrl},
      ${payload.lastSyncAt},
      ${payload.autoSync},
      ${payload.syncFrequency},
      ${payload.connectionMetadata ? JSON.stringify(payload.connectionMetadata) : null}::jsonb,
      ${payload.errorMessage},
      NOW(),
      NOW()
    )
    ON CONFLICT ("companyId", "provider", "sourceCode")
    DO UPDATE SET
      "status" = EXCLUDED."status",
      "authType" = EXCLUDED."authType",
      "accessToken" = EXCLUDED."accessToken",
      "refreshToken" = EXCLUDED."refreshToken",
      "tokenExpiresAt" = EXCLUDED."tokenExpiresAt",
      "baseUrl" = EXCLUDED."baseUrl",
      "lastSyncAt" = EXCLUDED."lastSyncAt",
      "autoSync" = EXCLUDED."autoSync",
      "syncFrequency" = EXCLUDED."syncFrequency",
      "connectionMetadata" = EXCLUDED."connectionMetadata",
      "errorMessage" = EXCLUDED."errorMessage",
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
    await delegate.deleteMany({
      where: {
        companyId,
        provider,
        sourceCode,
      },
    });
    return;
  }

  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "OperationalSystemConnection"
    WHERE "companyId" = ${companyId}
      AND "provider" = ${provider}::"OperationalSystemProvider"
      AND "sourceCode" = ${sourceCode}
  `);
}

