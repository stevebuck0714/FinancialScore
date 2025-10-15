-- CreateTable
CREATE TABLE "Consultant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT,
    "fullName" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Consultant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "location" TEXT,
    "industrySector" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Company_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "userType" TEXT,
    "companyId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "rawData" JSONB NOT NULL,
    "columnMapping" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancialRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancialRecord_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonthlyFinancial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "financialRecordId" TEXT NOT NULL,
    "monthDate" DATETIME NOT NULL,
    "revenue" REAL NOT NULL DEFAULT 0,
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

-- CreateTable
CREATE TABLE "AssessmentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "responses" JSONB NOT NULL,
    "notes" JSONB NOT NULL,
    "overallScore" REAL NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssessmentRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "legalStructure" TEXT,
    "businessStatus" TEXT,
    "ownership" TEXT,
    "workforce" TEXT,
    "keyAdvisors" TEXT,
    "specialNotes" TEXT,
    "qoeNotes" TEXT,
    "disclosures" JSONB NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "userEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Consultant_userId_key" ON "Consultant"("userId");

-- CreateIndex
CREATE INDEX "Consultant_userId_idx" ON "Consultant"("userId");

-- CreateIndex
CREATE INDEX "Company_consultantId_idx" ON "Company"("consultantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "FinancialRecord_companyId_idx" ON "FinancialRecord"("companyId");

-- CreateIndex
CREATE INDEX "FinancialRecord_uploadedByUserId_idx" ON "FinancialRecord"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "MonthlyFinancial_financialRecordId_idx" ON "MonthlyFinancial"("financialRecordId");

-- CreateIndex
CREATE INDEX "MonthlyFinancial_monthDate_idx" ON "MonthlyFinancial"("monthDate");

-- CreateIndex
CREATE INDEX "AssessmentRecord_userId_idx" ON "AssessmentRecord"("userId");

-- CreateIndex
CREATE INDEX "AssessmentRecord_companyId_idx" ON "AssessmentRecord"("companyId");

-- CreateIndex
CREATE INDEX "AssessmentRecord_completedAt_idx" ON "AssessmentRecord"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_companyId_key" ON "CompanyProfile"("companyId");

-- CreateIndex
CREATE INDEX "CompanyProfile_companyId_idx" ON "CompanyProfile"("companyId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
