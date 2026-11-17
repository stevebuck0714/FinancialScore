-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dataRoomDocumentId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "institution" TEXT,
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
    "checkNumber" TEXT,
    "transactionType" TEXT,
    "payer" TEXT,
    "payee" TEXT,
    "byOrderOf" TEXT,
    "paymentMethod" TEXT,
    "paymentProcessor" TEXT,
    "referenceNumber" TEXT,
    "ppdId" TEXT,
    "reason" TEXT,
    "location" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankTransaction_companyId_accountLast4_date_idx" ON "BankTransaction"("companyId", "accountLast4", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_dataRoomDocumentId_externalId_key" ON "BankTransaction"("dataRoomDocumentId", "externalId");

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_dataRoomDocumentId_fkey" FOREIGN KEY ("dataRoomDocumentId") REFERENCES "DataRoomDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
