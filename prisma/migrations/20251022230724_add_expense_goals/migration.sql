-- CreateTable
CREATE TABLE "ExpenseGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "goals" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseGoal_companyId_key" ON "ExpenseGoal"("companyId");

-- CreateIndex
CREATE INDEX "ExpenseGoal_companyId_idx" ON "ExpenseGoal"("companyId");
