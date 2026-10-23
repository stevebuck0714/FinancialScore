ALTER TABLE "LoanInstrumentTerm"
  ADD COLUMN IF NOT EXISTS "firstPaymentDate" DATE,
  ADD COLUMN IF NOT EXISTS "dayCountConvention" TEXT;
