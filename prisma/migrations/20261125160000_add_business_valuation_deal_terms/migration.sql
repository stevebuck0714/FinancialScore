-- AlterTable
ALTER TABLE "BusinessValuationEngagement" ADD COLUMN "dealTerms" JSONB;

-- CreateTable
CREATE TABLE "BusinessValuationAppraisal" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "appraiserFirm" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "includedInDeal" BOOLEAN NOT NULL DEFAULT true,
    "documentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessValuationAppraisal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessValuationAppraisal_engagementId_idx" ON "BusinessValuationAppraisal"("engagementId");

-- AddForeignKey
ALTER TABLE "BusinessValuationAppraisal" ADD CONSTRAINT "BusinessValuationAppraisal_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "BusinessValuationEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
