CREATE TABLE "QoeLender" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address1" TEXT,
  "address2" TEXT,
  "city" TEXT,
  "state" TEXT,
  "zip" TEXT,
  "country" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QoeLender_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "QoeEngagementTracker" ADD COLUMN "lenderId" TEXT;

CREATE UNIQUE INDEX "QoeLender_name_key" ON "QoeLender"("name");
CREATE INDEX "QoeEngagementTracker_lenderId_idx" ON "QoeEngagementTracker"("lenderId");

ALTER TABLE "QoeEngagementTracker"
  ADD CONSTRAINT "QoeEngagementTracker_lenderId_fkey"
  FOREIGN KEY ("lenderId") REFERENCES "QoeLender"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
