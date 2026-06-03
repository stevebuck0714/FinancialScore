CREATE TABLE IF NOT EXISTS "LoanInstrumentTerm" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "companyId" TEXT NOT NULL,
  "instrumentKey" TEXT NOT NULL,
  "displayName" TEXT,
  "loanType" TEXT,
  "lender" TEXT,
  "originalBalance" NUMERIC(18, 2),
  "currentBalance" NUMERIC(18, 2),
  "interestRatePct" NUMERIC(9, 4),
  "maturityDate" DATE,
  "amortizationTermMonths" INTEGER,
  "paymentFrequency" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "LoanInstrumentTerm_company_instrument_key" UNIQUE ("companyId", "instrumentKey")
);

CREATE INDEX IF NOT EXISTS "LoanInstrumentTerm_company_idx"
  ON "LoanInstrumentTerm" ("companyId");
