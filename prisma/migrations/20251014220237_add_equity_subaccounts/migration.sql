/*
  Warnings:

  - Added the required column `updatedAt` to the `AssessmentRecord` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssessmentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "responses" JSONB NOT NULL,
    "notes" JSONB NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "overallScore" REAL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssessmentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssessmentRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AssessmentRecord" ("companyId", "completedAt", "id", "notes", "overallScore", "responses", "userId") SELECT "companyId", "completedAt", "id", "notes", "overallScore", "responses", "userId" FROM "AssessmentRecord";
DROP TABLE "AssessmentRecord";
ALTER TABLE "new_AssessmentRecord" RENAME TO "AssessmentRecord";
CREATE INDEX "AssessmentRecord_userId_idx" ON "AssessmentRecord"("userId");
CREATE INDEX "AssessmentRecord_companyId_idx" ON "AssessmentRecord"("companyId");
CREATE INDEX "AssessmentRecord_isCompleted_idx" ON "AssessmentRecord"("isCompleted");
CREATE INDEX "AssessmentRecord_completedAt_idx" ON "AssessmentRecord"("completedAt");
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
    "ownersCapital" REAL NOT NULL DEFAULT 0,
    "ownersDraw" REAL NOT NULL DEFAULT 0,
    "commonStock" REAL NOT NULL DEFAULT 0,
    "preferredStock" REAL NOT NULL DEFAULT 0,
    "retainedEarnings" REAL NOT NULL DEFAULT 0,
    "additionalPaidInCapital" REAL NOT NULL DEFAULT 0,
    "treasuryStock" REAL NOT NULL DEFAULT 0,
    "totalEquity" REAL NOT NULL DEFAULT 0,
    "totalLAndE" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonthlyFinancial_financialRecordId_fkey" FOREIGN KEY ("financialRecordId") REFERENCES "FinancialRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MonthlyFinancial" ("ap", "ar", "autoTravel", "benefits", "cash", "cogsCommissions", "cogsContractors", "cogsMaterials", "cogsOther", "cogsOwnerPay", "cogsPayroll", "cogsTotal", "companyId", "createdAt", "depreciationAmortization", "expense", "extraordinaryItems", "financialRecordId", "fixedAssets", "id", "infrastructure", "insurance", "interestExpense", "inventory", "ltd", "marketing", "mealsEntertainment", "monthDate", "nonOperatingIncome", "otherAssets", "otherCA", "otherCL", "otherExpense", "ownerBasePay", "payroll", "phoneComm", "professionalFees", "rent", "revenue", "revenueBreakdown", "salesExpense", "subcontractors", "taxLicense", "tca", "tcl", "totalAssets", "totalEquity", "totalLAndE", "totalLiab", "trainingCert") SELECT "ap", "ar", "autoTravel", "benefits", "cash", "cogsCommissions", "cogsContractors", "cogsMaterials", "cogsOther", "cogsOwnerPay", "cogsPayroll", "cogsTotal", "companyId", "createdAt", "depreciationAmortization", "expense", "extraordinaryItems", "financialRecordId", "fixedAssets", "id", "infrastructure", "insurance", "interestExpense", "inventory", "ltd", "marketing", "mealsEntertainment", "monthDate", "nonOperatingIncome", "otherAssets", "otherCA", "otherCL", "otherExpense", "ownerBasePay", "payroll", "phoneComm", "professionalFees", "rent", "revenue", "revenueBreakdown", "salesExpense", "subcontractors", "taxLicense", "tca", "tcl", "totalAssets", "totalEquity", "totalLAndE", "totalLiab", "trainingCert" FROM "MonthlyFinancial";
DROP TABLE "MonthlyFinancial";
ALTER TABLE "new_MonthlyFinancial" RENAME TO "MonthlyFinancial";
CREATE INDEX "MonthlyFinancial_companyId_idx" ON "MonthlyFinancial"("companyId");
CREATE INDEX "MonthlyFinancial_financialRecordId_idx" ON "MonthlyFinancial"("financialRecordId");
CREATE INDEX "MonthlyFinancial_monthDate_idx" ON "MonthlyFinancial"("monthDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
