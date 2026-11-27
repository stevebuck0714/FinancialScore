-- Financial records cannot outlive the user who uploaded them.
ALTER TABLE "FinancialRecord"
  DROP CONSTRAINT "FinancialRecord_uploadedByUserId_fkey",
  ADD CONSTRAINT "FinancialRecord_uploadedByUserId_fkey"
    FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
