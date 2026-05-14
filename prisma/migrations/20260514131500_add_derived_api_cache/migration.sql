CREATE TABLE IF NOT EXISTS "DerivedApiCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "namespace" TEXT NOT NULL,
  "cacheKey" TEXT NOT NULL,
  "dataVersion" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "DerivedApiCache_namespace_key_unique"
  ON "DerivedApiCache"("namespace", "cacheKey");

CREATE INDEX IF NOT EXISTS "DerivedApiCache_lookup_idx"
  ON "DerivedApiCache"("namespace", "cacheKey", "dataVersion");

CREATE INDEX IF NOT EXISTS "DerivedApiCache_expires_idx"
  ON "DerivedApiCache"("expiresAt");
