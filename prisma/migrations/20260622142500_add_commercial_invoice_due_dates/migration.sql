-- Track invoice issue dates and future billing follow-up dates for admin-managed billing.
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "commercialInvoiceDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "commercialNextDueDate" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Company_commercialInvoiceDate_idx"
  ON "Company"("commercialInvoiceDate");

CREATE INDEX IF NOT EXISTS "Company_commercialNextDueDate_idx"
  ON "Company"("commercialNextDueDate");
