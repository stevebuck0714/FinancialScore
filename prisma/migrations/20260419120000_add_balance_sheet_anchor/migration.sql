-- One-time-known balance-sheet anchor for a company. Used by the
-- daily-bs-from-gl rebuilder as a starting point: for any
-- snapshotDate >= anchorDate, each balance-sheet line is computed as
-- anchor[field] + GL_delta(field, anchorDate < transDate <= snapshotDate).

CREATE TABLE "BalanceSheetAnchor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "cash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ar" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inventory" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherCA" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fixedAssets" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherAssets" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ap" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherCL" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ltd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ownersCapital" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ownersDraw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commonStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "preferredStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retainedEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "additionalPaidInCapital" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "treasuryStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BalanceSheetAnchor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BalanceSheetAnchor_companyId_anchorDate_key"
  ON "BalanceSheetAnchor" ("companyId", "anchorDate");

CREATE INDEX "BalanceSheetAnchor_companyId_anchorDate_idx"
  ON "BalanceSheetAnchor" ("companyId", "anchorDate" DESC);
