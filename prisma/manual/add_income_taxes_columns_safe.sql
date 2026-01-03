-- Manual schema patch: add income tax fields to MonthlyFinancial
-- NOTE: We are using a manual SQL patch because Prisma schema pushes/migrations
-- currently fail against this database due to legacy enum/type drift.
--
-- SAFE VERSION: Checks if columns exist before adding them
-- Safe to run multiple times? YES - this version checks for existing columns first.

-- Check and add stateIncomeTaxes column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'MonthlyFinancial' 
        AND column_name = 'stateIncomeTaxes'
    ) THEN
        ALTER TABLE "MonthlyFinancial"
        ADD COLUMN "stateIncomeTaxes" DOUBLE PRECISION NOT NULL DEFAULT 0;
        RAISE NOTICE 'Added stateIncomeTaxes column';
    ELSE
        RAISE NOTICE 'stateIncomeTaxes column already exists';
    END IF;
END $$;

-- Check and add federalIncomeTaxes column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'MonthlyFinancial' 
        AND column_name = 'federalIncomeTaxes'
    ) THEN
        ALTER TABLE "MonthlyFinancial"
        ADD COLUMN "federalIncomeTaxes" DOUBLE PRECISION NOT NULL DEFAULT 0;
        RAISE NOTICE 'Added federalIncomeTaxes column';
    ELSE
        RAISE NOTICE 'federalIncomeTaxes column already exists';
    END IF;
END $$;




