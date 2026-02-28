-- Manual migration: add user-company membership table for multi-company access.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS "UserCompanyAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "companyRole" TEXT DEFAULT 'user',
  "sidebarAccess" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCompanyAccess_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserCompanyAccess_userId_companyId_key'
  ) THEN
    ALTER TABLE "UserCompanyAccess"
      ADD CONSTRAINT "UserCompanyAccess_userId_companyId_key" UNIQUE ("userId", "companyId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "UserCompanyAccess_userId_idx" ON "UserCompanyAccess"("userId");
CREATE INDEX IF NOT EXISTS "UserCompanyAccess_companyId_idx" ON "UserCompanyAccess"("companyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserCompanyAccess_userId_fkey'
  ) THEN
    ALTER TABLE "UserCompanyAccess"
      ADD CONSTRAINT "UserCompanyAccess_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserCompanyAccess_companyId_fkey'
  ) THEN
    ALTER TABLE "UserCompanyAccess"
      ADD CONSTRAINT "UserCompanyAccess_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill memberships from legacy one-company assignment.
INSERT INTO "UserCompanyAccess" ("id", "userId", "companyId", "companyRole", "sidebarAccess", "createdAt", "updatedAt")
SELECT
  CONCAT('uca_', SUBSTRING(md5(u."id" || ':' || u."companyId") FROM 1 FOR 24)) AS "id",
  u."id",
  u."companyId",
  COALESCE(u."companyRole", 'user') AS "companyRole",
  u."sidebarAccess",
  NOW(),
  NOW()
FROM "User" u
WHERE u."companyId" IS NOT NULL
ON CONFLICT ("userId", "companyId") DO NOTHING;
