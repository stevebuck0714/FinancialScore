-- A record's company must match its dataset's company.
-- CreateIndex
CREATE UNIQUE INDEX "OperationalDataset_id_companyId_key" ON "OperationalDataset"("id", "companyId");

-- DropForeignKey
ALTER TABLE "OperationalRecord" DROP CONSTRAINT "OperationalRecord_datasetId_fkey";

-- AddForeignKey
ALTER TABLE "OperationalRecord" ADD CONSTRAINT "OperationalRecord_datasetId_companyId_fkey" FOREIGN KEY ("datasetId", "companyId") REFERENCES "OperationalDataset"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
