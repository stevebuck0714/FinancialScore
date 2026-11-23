-- Internal Account Manager tracker for Quality of Earnings engagement intake and evidence collection.
CREATE TABLE "QoeEngagementTracker" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "engagementType" TEXT,
  "reviewPeriodStart" TEXT,
  "reviewPeriodEnd" TEXT,
  "fiscalYearEndMonth" INTEGER,
  "reportDueDate" TIMESTAMP(3),
  "accountManagerName" TEXT,
  "corelyticsAccountant" TEXT,
  "teamLeadName" TEXT,
  "lenderName" TEXT,
  "loanOfficerName" TEXT,
  "buyerOrBrokerName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QoeEngagementTracker_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QoeEngagementTrackerContact" (
  "id" TEXT NOT NULL,
  "trackerId" TEXT NOT NULL,
  "contactType" TEXT NOT NULL,
  "name" TEXT,
  "role" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "preferredContactMethod" TEXT,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QoeEngagementTrackerContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QoeEngagementTrackerBankAccount" (
  "id" TEXT NOT NULL,
  "trackerId" TEXT NOT NULL,
  "institution" TEXT,
  "accountName" TEXT,
  "accountType" TEXT,
  "last4" TEXT,
  "legalEntity" TEXT,
  "purpose" TEXT,
  "receivesCustomerPayments" BOOLEAN NOT NULL DEFAULT false,
  "statementsNeeded" BOOLEAN NOT NULL DEFAULT true,
  "statementsFromMonth" TEXT,
  "statementsThroughMonth" TEXT,
  "bankContactName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'IDENTIFIED',
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QoeEngagementTrackerBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QoeEngagementDocumentRequirement" (
  "id" TEXT NOT NULL,
  "trackerId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "requirement" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
  "owner" TEXT,
  "requestedDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "receivedDate" TIMESTAMP(3),
  "dataRoomFolder" TEXT,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QoeEngagementDocumentRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QoeEngagementTracker_companyId_key" ON "QoeEngagementTracker"("companyId");
CREATE INDEX "QoeEngagementTrackerContact_trackerId_sortOrder_idx" ON "QoeEngagementTrackerContact"("trackerId", "sortOrder");
CREATE INDEX "QoeEngagementTrackerBankAccount_trackerId_sortOrder_idx" ON "QoeEngagementTrackerBankAccount"("trackerId", "sortOrder");
CREATE INDEX "QoeEngagementDocumentRequirement_trackerId_sortOrder_idx" ON "QoeEngagementDocumentRequirement"("trackerId", "sortOrder");
CREATE INDEX "QoeEngagementDocumentRequirement_trackerId_status_idx" ON "QoeEngagementDocumentRequirement"("trackerId", "status");

ALTER TABLE "QoeEngagementTracker"
  ADD CONSTRAINT "QoeEngagementTracker_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QoeEngagementTrackerContact"
  ADD CONSTRAINT "QoeEngagementTrackerContact_trackerId_fkey"
  FOREIGN KEY ("trackerId") REFERENCES "QoeEngagementTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QoeEngagementTrackerBankAccount"
  ADD CONSTRAINT "QoeEngagementTrackerBankAccount_trackerId_fkey"
  FOREIGN KEY ("trackerId") REFERENCES "QoeEngagementTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QoeEngagementDocumentRequirement"
  ADD CONSTRAINT "QoeEngagementDocumentRequirement_trackerId_fkey"
  FOREIGN KEY ("trackerId") REFERENCES "QoeEngagementTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
