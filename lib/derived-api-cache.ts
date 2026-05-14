import { createHash } from 'crypto';
import prisma from '@/lib/prisma';

type CacheRow<T> = {
  payload: T;
};

let ensurePromise: Promise<void> | null = null;

export function hashCacheParts(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts, (_key, value) => {
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return value.toISOString();
    return value;
  })).digest('hex');
}

async function ensureDerivedApiCacheTable(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "DerivedApiCache" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "namespace" TEXT NOT NULL,
          "cacheKey" TEXT NOT NULL,
          "dataVersion" TEXT NOT NULL,
          "payload" JSONB NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "expiresAt" TIMESTAMP NOT NULL,
          CONSTRAINT "DerivedApiCache_namespace_key_unique" UNIQUE ("namespace", "cacheKey")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "DerivedApiCache_lookup_idx"
        ON "DerivedApiCache"("namespace", "cacheKey", "dataVersion")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "DerivedApiCache_expires_idx"
        ON "DerivedApiCache"("expiresAt")
      `);
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  await ensurePromise;
}

export async function readDerivedApiCache<T>(params: {
  namespace: string;
  cacheKey: string;
  dataVersion: string;
}): Promise<T | null> {
  await ensureDerivedApiCacheTable();
  const rows = await prisma.$queryRawUnsafe<Array<CacheRow<T>>>(
    `SELECT "payload"
     FROM "DerivedApiCache"
     WHERE "namespace" = $1
       AND "cacheKey" = $2
       AND "dataVersion" = $3
       AND "expiresAt" > CURRENT_TIMESTAMP
     LIMIT 1`,
    params.namespace,
    params.cacheKey,
    params.dataVersion
  );
  return rows[0]?.payload || null;
}

export async function writeDerivedApiCache(params: {
  namespace: string;
  cacheKey: string;
  dataVersion: string;
  payload: unknown;
  ttlSeconds: number;
}): Promise<void> {
  await ensureDerivedApiCacheTable();
  const expiresAt = new Date(Date.now() + Math.max(1, params.ttlSeconds) * 1000);
  const id = hashCacheParts([params.namespace, params.cacheKey]);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "DerivedApiCache" ("id", "namespace", "cacheKey", "dataVersion", "payload", "updatedAt", "expiresAt")
     VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP, $6)
     ON CONFLICT ("namespace", "cacheKey")
     DO UPDATE SET
       "dataVersion" = EXCLUDED."dataVersion",
       "payload" = EXCLUDED."payload",
       "updatedAt" = CURRENT_TIMESTAMP,
       "expiresAt" = EXCLUDED."expiresAt"`,
    id,
    params.namespace,
    params.cacheKey,
    params.dataVersion,
    JSON.stringify(params.payload),
    expiresAt
  );
}
