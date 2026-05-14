CREATE TABLE IF NOT EXISTS "PulseExecBriefingCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "cacheDate" TEXT NOT NULL,
  "dataVersion" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "PulseExecBriefingCache_company_date_key"
  ON "PulseExecBriefingCache"("companyId", "cacheDate");

CREATE INDEX IF NOT EXISTS "PulseExecBriefingCache_company_version_idx"
  ON "PulseExecBriefingCache"("companyId", "cacheDate", "dataVersion");

CREATE INDEX IF NOT EXISTS "PulseExecBriefingCache_expires_idx"
  ON "PulseExecBriefingCache"("expiresAt");

CREATE TABLE IF NOT EXISTS "PulseDailySummary" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "summaryDate" TEXT NOT NULL,
  "dataVersion" TEXT NOT NULL,
  "facts" JSONB NOT NULL,
  "sourceNotes" JSONB NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "PulseDailySummary_company_date_key"
  ON "PulseDailySummary"("companyId", "summaryDate");

CREATE INDEX IF NOT EXISTS "PulseDailySummary_company_version_idx"
  ON "PulseDailySummary"("companyId", "summaryDate", "dataVersion");

CREATE INDEX IF NOT EXISTS "PulseDailySummary_expires_idx"
  ON "PulseDailySummary"("expiresAt");
