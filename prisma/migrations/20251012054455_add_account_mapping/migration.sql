-- CreateTable
CREATE TABLE "AccountMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "qbAccount" TEXT NOT NULL,
    "targetField" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "AccountMapping_companyId_idx" ON "AccountMapping"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountMapping_companyId_qbAccount_key" ON "AccountMapping"("companyId", "qbAccount");
