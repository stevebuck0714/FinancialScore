CREATE TABLE "RealEstateCashActivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodEnd" DATE NOT NULL,
    "activityDate" DATE,
    "activityType" TEXT NOT NULL,
    "counterparty" TEXT,
    "description" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealEstateCashActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RealEstateOperationalMetric" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodEnd" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "unit" TEXT,
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealEstateOperationalMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RealEstateCashActivity_companyId_sourceReference_key" ON "RealEstateCashActivity"("companyId", "sourceReference");
CREATE INDEX "RealEstateCashActivity_companyId_periodEnd_idx" ON "RealEstateCashActivity"("companyId", "periodEnd");
CREATE INDEX "RealEstateCashActivity_companyId_activityDate_idx" ON "RealEstateCashActivity"("companyId", "activityDate");
CREATE UNIQUE INDEX "RealEstateOperationalMetric_companyId_periodEnd_metric_key" ON "RealEstateOperationalMetric"("companyId", "periodEnd", "metric");
CREATE INDEX "RealEstateOperationalMetric_companyId_periodEnd_idx" ON "RealEstateOperationalMetric"("companyId", "periodEnd");

ALTER TABLE "RealEstateCashActivity" ADD CONSTRAINT "RealEstateCashActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealEstateOperationalMetric" ADD CONSTRAINT "RealEstateOperationalMetric_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
