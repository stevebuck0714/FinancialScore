ALTER TABLE "User"
ADD COLUMN "operationalDashboardAccess" JSONB;

ALTER TABLE "UserCompanyAccess"
ADD COLUMN "operationalDashboardAccess" JSONB;
