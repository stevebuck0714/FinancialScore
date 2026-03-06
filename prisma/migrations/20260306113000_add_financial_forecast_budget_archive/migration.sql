CREATE TABLE "FinancialForecastBudgetArchive" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialForecastBudgetArchive_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialForecastBudgetArchive_companyId_idx" ON "FinancialForecastBudgetArchive"("companyId");
CREATE INDEX "FinancialForecastBudgetArchive_createdAt_idx" ON "FinancialForecastBudgetArchive"("createdAt");

ALTER TABLE "FinancialForecastBudgetArchive"
ADD CONSTRAINT "FinancialForecastBudgetArchive_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
