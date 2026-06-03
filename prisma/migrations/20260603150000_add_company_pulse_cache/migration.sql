CREATE TABLE IF NOT EXISTS "PulseAlert" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "drillView" TEXT NOT NULL,
  "deltaText" TEXT,
  "updatedAt" TIMESTAMP,
  "itemLabel" TEXT,
  "priorityScore" DOUBLE PRECISION,
  "bucket" TEXT,
  "priorityFocusTerm" TEXT,
  "explainability" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'new',
  "dueAt" TIMESTAMP,
  "snoozedUntil" TIMESTAMP,
  "notes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "resolvedAt" TIMESTAMP,
  "lastSeenAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modifiedAt" TIMESTAMP NOT NULL
);

ALTER TABLE "PulseAlert"
ADD COLUMN IF NOT EXISTS "explainability" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS "PulseAlert_company_fingerprint_key"
ON "PulseAlert"("companyId", "fingerprint");

CREATE INDEX IF NOT EXISTS "PulseAlert_company_status_idx"
ON "PulseAlert"("companyId", "status");

CREATE INDEX IF NOT EXISTS "PulseAlert_company_active_idx"
ON "PulseAlert"("companyId", "isActive");

CREATE TABLE IF NOT EXISTS "PulseAlertEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "alertId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "actorUserId" TEXT,
  "actorEmail" TEXT,
  "note" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PulseAlertEvent_alert_created_idx"
ON "PulseAlertEvent"("alertId", "createdAt");

CREATE TABLE IF NOT EXISTS "PulseCompanyCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "cacheDate" TEXT NOT NULL,
  "dataVersion" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "generatedAt" TIMESTAMP,
  "expiresAt" TIMESTAMP,
  "alertCounts" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "readinessItems" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "sourceNotes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "error" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "PulseCompanyCache_company_key"
ON "PulseCompanyCache"("companyId");

CREATE INDEX IF NOT EXISTS "PulseCompanyCache_status_updated_idx"
ON "PulseCompanyCache"("status", "updatedAt");
