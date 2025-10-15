/*
  Warnings:

  - Added the required column `companyId` to the `MonthlyFinancial` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AccountMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "qbAccount" TEXT NOT NULL,
    "qbAccountId" TEXT,
    "qbAccountCode" TEXT,
    "qbAccountClassification" TEXT,
    "targetField" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AccountMapping" ("companyId", "confidence", "createdAt", "id", "qbAccount", "targetField", "updatedAt") SELECT "companyId", "confidence", "createdAt", "id", "qbAccount", "targetField", "updatedAt" FROM "AccountMapping";
DROP TABLE "AccountMapping";
ALTER TABLE "new_AccountMapping" RENAME TO "AccountMapping";
CREATE INDEX "AccountMapping_companyId_idx" ON "AccountMapping"("companyId");
CREATE UNIQUE INDEX "AccountMapping_companyId_qbAccount_key" ON "AccountMapping"("companyId", "qbAccount");
CREATE TABLE "new_ApiSyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recordsImported" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorDetails" JSONB,
    "duration" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiSyncLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ApiSyncLog" ("companyId", "createdAt", "duration", "errorCount", "errorDetails", "id", "platform", "recordsImported", "status", "syncType") SELECT "companyId", "createdAt", "duration", "errorCount", "errorDetails", "id", "platform", "recordsImported", "status", "syncType" FROM "ApiSyncLog";
DROP TABLE "ApiSyncLog";
ALTER TABLE "new_ApiSyncLog" RENAME TO "ApiSyncLog";
CREATE INDEX "ApiSyncLog_companyId_idx" ON "ApiSyncLog"("companyId");
CREATE INDEX "ApiSyncLog_platform_idx" ON "ApiSyncLog"("platform");
CREATE INDEX "ApiSyncLog_createdAt_idx" ON "ApiSyncLog"("createdAt");
CREATE TABLE "new_MonthlyFinancial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "financialRecordId" TEXT NOT NULL,
    "monthDate" DATETIME NOT NULL,
    "revenue" REAL NOT NULL DEFAULT 0,
    "revenueBreakdown" JSONB,
    "expense" REAL NOT NULL DEFAULT 0,
    "cogsPayroll" REAL NOT NULL DEFAULT 0,
    "cogsOwnerPay" REAL NOT NULL DEFAULT 0,
    "cogsContractors" REAL NOT NULL DEFAULT 0,
    "cogsMaterials" REAL NOT NULL DEFAULT 0,
    "cogsCommissions" REAL NOT NULL DEFAULT 0,
    "cogsOther" REAL NOT NULL DEFAULT 0,
    "cogsTotal" REAL NOT NULL DEFAULT 0,
    "payroll" REAL NOT NULL DEFAULT 0,
    "ownerBasePay" REAL NOT NULL DEFAULT 0,
    "benefits" REAL NOT NULL DEFAULT 0,
    "insurance" REAL NOT NULL DEFAULT 0,
    "professionalFees" REAL NOT NULL DEFAULT 0,
    "subcontractors" REAL NOT NULL DEFAULT 0,
    "rent" REAL NOT NULL DEFAULT 0,
    "taxLicense" REAL NOT NULL DEFAULT 0,
    "phoneComm" REAL NOT NULL DEFAULT 0,
    "infrastructure" REAL NOT NULL DEFAULT 0,
    "autoTravel" REAL NOT NULL DEFAULT 0,
    "salesExpense" REAL NOT NULL DEFAULT 0,
    "marketing" REAL NOT NULL DEFAULT 0,
    "trainingCert" REAL NOT NULL DEFAULT 0,
    "mealsEntertainment" REAL NOT NULL DEFAULT 0,
    "interestExpense" REAL NOT NULL DEFAULT 0,
    "depreciationAmortization" REAL NOT NULL DEFAULT 0,
    "otherExpense" REAL NOT NULL DEFAULT 0,
    "nonOperatingIncome" REAL NOT NULL DEFAULT 0,
    "extraordinaryItems" REAL NOT NULL DEFAULT 0,
    "cash" REAL NOT NULL DEFAULT 0,
    "ar" REAL NOT NULL DEFAULT 0,
    "inventory" REAL NOT NULL DEFAULT 0,
    "otherCA" REAL NOT NULL DEFAULT 0,
    "tca" REAL NOT NULL DEFAULT 0,
    "fixedAssets" REAL NOT NULL DEFAULT 0,
    "otherAssets" REAL NOT NULL DEFAULT 0,
    "totalAssets" REAL NOT NULL DEFAULT 0,
    "ap" REAL NOT NULL DEFAULT 0,
    "otherCL" REAL NOT NULL DEFAULT 0,
    "tcl" REAL NOT NULL DEFAULT 0,
    "ltd" REAL NOT NULL DEFAULT 0,
    "totalLiab" REAL NOT NULL DEFAULT 0,
    "totalEquity" REAL NOT NULL DEFAULT 0,
    "totalLAndE" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonthlyFinancial_financialRecordId_fkey" FOREIGN KEY ("financialRecordId") REFERENCES "FinancialRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MonthlyFinancial" ("ap", "ar", "autoTravel", "benefits", "cash", "cogsCommissions", "cogsContractors", "cogsMaterials", "cogsOther", "cogsOwnerPay", "cogsPayroll", "cogsTotal", "createdAt", "depreciationAmortization", "expense", "extraordinaryItems", "financialRecordId", "fixedAssets", "id", "infrastructure", "insurance", "interestExpense", "inventory", "ltd", "marketing", "mealsEntertainment", "monthDate", "nonOperatingIncome", "otherAssets", "otherCA", "otherCL", "otherExpense", "ownerBasePay", "payroll", "phoneComm", "professionalFees", "rent", "revenue", "salesExpense", "subcontractors", "taxLicense", "tca", "tcl", "totalAssets", "totalEquity", "totalLAndE", "totalLiab", "trainingCert") SELECT "ap", "ar", "autoTravel", "benefits", "cash", "cogsCommissions", "cogsContractors", "cogsMaterials", "cogsOther", "cogsOwnerPay", "cogsPayroll", "cogsTotal", "createdAt", "depreciationAmortization", "expense", "extraordinaryItems", "financialRecordId", "fixedAssets", "id", "infrastructure", "insurance", "interestExpense", "inventory", "ltd", "marketing", "mealsEntertainment", "monthDate", "nonOperatingIncome", "otherAssets", "otherCA", "otherCL", "otherExpense", "ownerBasePay", "payroll", "phoneComm", "professionalFees", "rent", "revenue", "salesExpense", "subcontractors", "taxLicense", "tca", "tcl", "totalAssets", "totalEquity", "totalLAndE", "totalLiab", "trainingCert" FROM "MonthlyFinancial";
DROP TABLE "MonthlyFinancial";
ALTER TABLE "new_MonthlyFinancial" RENAME TO "MonthlyFinancial";
CREATE INDEX "MonthlyFinancial_companyId_idx" ON "MonthlyFinancial"("companyId");
CREATE INDEX "MonthlyFinancial_financialRecordId_idx" ON "MonthlyFinancial"("financialRecordId");
CREATE INDEX "MonthlyFinancial_monthDate_idx" ON "MonthlyFinancial"("monthDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
