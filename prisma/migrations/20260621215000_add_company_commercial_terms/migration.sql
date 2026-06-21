-- Track customer billing/payment terms independently from consultant attribution.
ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "commercialBillingMethod" TEXT NOT NULL DEFAULT 'usaepay',
  ADD COLUMN IF NOT EXISTS "commercialPaymentStatus" TEXT NOT NULL DEFAULT 'not_billed',
  ADD COLUMN IF NOT EXISTS "commercialInvoiceNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "commercialInvoiceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "commercialPaymentDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "commercialTermsNotes" TEXT;

CREATE INDEX IF NOT EXISTS "Company_commercialBillingMethod_idx"
  ON "Company"("commercialBillingMethod");

CREATE INDEX IF NOT EXISTS "Company_commercialPaymentStatus_idx"
  ON "Company"("commercialPaymentStatus");
