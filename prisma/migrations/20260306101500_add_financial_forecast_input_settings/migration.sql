CREATE TABLE "FinancialForecastInputSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "revenueGrowthByRow" JSONB NOT NULL,
    "cogsPctByRow" JSONB NOT NULL,
    "opexPctByRow" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialForecastInputSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialForecastInputSettings_companyId_key" ON "FinancialForecastInputSettings"("companyId");
CREATE INDEX "FinancialForecastInputSettings_companyId_idx" ON "FinancialForecastInputSettings"("companyId");

ALTER TABLE "FinancialForecastInputSettings"
ADD CONSTRAINT "FinancialForecastInputSettings_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
