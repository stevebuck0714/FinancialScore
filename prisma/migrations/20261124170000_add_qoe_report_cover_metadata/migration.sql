ALTER TABLE "QoeEngagementTracker"
  ADD COLUMN "preparedFor" TEXT,
  ADD COLUMN "proposedBorrower" TEXT,
  ADD COLUMN "transactionType" TEXT,
  ADD COLUMN "businessPurchasePrice" TEXT,
  ADD COLUMN "preparedUnder" TEXT,
  ADD COLUMN "engagementLetterDate" TIMESTAMP(3),
  ADD COLUMN "sbaLoanNumber" TEXT,
  ADD COLUMN "sellerDocumentsComplete" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "modulesEngaged" TEXT,
  ADD COLUMN "engagementPartner" TEXT;
