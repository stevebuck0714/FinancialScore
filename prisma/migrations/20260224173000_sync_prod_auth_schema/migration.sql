-- Permanent fix for production schema drift discovered during auth flows.
-- Adds Company columns expected by Prisma and creates UserCompanyAccess table.

ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "tier1SupportOwner" TEXT DEFAULT 'CORELYTICS',
ADD COLUMN IF NOT EXISTS "tier1SupportConsultantId" TEXT,
ADD COLUMN IF NOT EXISTS "tier1SupportContactEmail" TEXT,
ADD COLUMN IF NOT EXISTS "hasRealOperationalData" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "realDataActivatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "forceOperationalMockData" BOOLEAN NOT NULL DEFAULT false;

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

CREATE UNIQUE INDEX IF NOT EXISTS "UserCompanyAccess_userId_companyId_key" ON "UserCompanyAccess"("userId", "companyId");
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
