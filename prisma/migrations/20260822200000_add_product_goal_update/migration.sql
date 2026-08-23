CREATE TABLE IF NOT EXISTS "ProductGoalUpdate" (
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "dataThru" TIMESTAMP(3),
    "goalUpdate" JSONB NOT NULL DEFAULT '{}',
    "pyramid" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductGoalUpdate_pkey" PRIMARY KEY ("companyId", "year")
);
