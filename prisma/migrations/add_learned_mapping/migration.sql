-- CreateTable (idempotent: this migration predates timestamped naming and was
-- historically applied via `prisma db push`, so on some environments the table
-- exists without a corresponding _prisma_migrations row. IF NOT EXISTS keeps
-- `prisma migrate deploy` working in either state.)
CREATE TABLE IF NOT EXISTS "LearnedMapping" (
    "id" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountClassification" TEXT,
    "targetField" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnedMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LearnedMapping_accountName_accountClassification_targetFi_key" ON "LearnedMapping"("accountName", "accountClassification", "targetField");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LearnedMapping_accountName_idx" ON "LearnedMapping"("accountName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LearnedMapping_targetField_idx" ON "LearnedMapping"("targetField");

