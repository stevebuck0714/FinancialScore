CREATE TABLE "CustomerGroupAssignment" (
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerGroup" TEXT,
    "csr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerGroupAssignment_pkey" PRIMARY KEY ("companyId", "customerId")
);

CREATE INDEX "CustomerGroupAssignment_companyId_customerName_idx"
ON "CustomerGroupAssignment"("companyId", "customerName");

CREATE INDEX "CustomerGroupAssignment_companyId_customerGroup_idx"
ON "CustomerGroupAssignment"("companyId", "customerGroup");
