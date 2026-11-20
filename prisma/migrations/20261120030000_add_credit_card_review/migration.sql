-- One-time Plaid Asset Report imports for company credit-card transactions.
-- Tokens are never stored; the source CSV in Data Room is the engagement record.
CREATE TABLE "CreditCardImport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "importedByUserId" TEXT NOT NULL,
    "dataRoomDocumentId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PLAID_ASSETS',
    "institution" TEXT,
    "requestedDays" INTEGER NOT NULL DEFAULT 730,
    "coverageStart" TEXT,
    "coverageEnd" TEXT,
    "accountCount" INTEGER NOT NULL DEFAULT 0,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCardImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditCardTransaction" (
    "id" TEXT NOT NULL,
    "creditCardImportId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "accountLast4" TEXT,
    "accountName" TEXT,
    "date" TEXT NOT NULL,
    "dateTransacted" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT,
    "description" TEXT,
    "merchantName" TEXT,
    "category" TEXT[],
    "categoryId" TEXT,
    "creditCategoryPrimary" TEXT,
    "creditCategoryDetailed" TEXT,
    "reviewClassification" TEXT,
    "reviewNote" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCardTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditCardImport_dataRoomDocumentId_key" ON "CreditCardImport"("dataRoomDocumentId");
CREATE INDEX "CreditCardImport_companyId_importedAt_idx" ON "CreditCardImport"("companyId", "importedAt" DESC);
CREATE UNIQUE INDEX "CreditCardTransaction_creditCardImportId_externalId_key" ON "CreditCardTransaction"("creditCardImportId", "externalId");
CREATE INDEX "CreditCardTransaction_companyId_accountLast4_date_idx" ON "CreditCardTransaction"("companyId", "accountLast4", "date");
CREATE INDEX "CreditCardTransaction_companyId_reviewClassification_idx" ON "CreditCardTransaction"("companyId", "reviewClassification");

ALTER TABLE "CreditCardImport" ADD CONSTRAINT "CreditCardImport_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardImport" ADD CONSTRAINT "CreditCardImport_dataRoomDocumentId_fkey"
  FOREIGN KEY ("dataRoomDocumentId") REFERENCES "DataRoomDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardTransaction" ADD CONSTRAINT "CreditCardTransaction_creditCardImportId_fkey"
  FOREIGN KEY ("creditCardImportId") REFERENCES "CreditCardImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardTransaction" ADD CONSTRAINT "CreditCardTransaction_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
