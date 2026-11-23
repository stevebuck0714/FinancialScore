ALTER TABLE "QoeEngagementTracker" ADD COLUMN "accountManagerUserId" TEXT;

CREATE INDEX "QoeEngagementTracker_accountManagerUserId_idx"
  ON "QoeEngagementTracker"("accountManagerUserId");

ALTER TABLE "QoeEngagementTracker"
  ADD CONSTRAINT "QoeEngagementTracker_accountManagerUserId_fkey"
  FOREIGN KEY ("accountManagerUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
