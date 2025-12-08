-- MANUAL COMPANY DELETION SCRIPT
-- Replace 'your-company-id' with the actual company ID you want to delete

-- Option 1: Soft Delete (recommended for immediate use)
-- This marks the company as deleted without removing data
UPDATE "Company"
SET "name" = CONCAT("name", ' (DELETED)'),
    "consultantId" = NULL
WHERE "id" = 'your-company-id';

-- Option 2: Full Hard Delete (use only if you want to completely remove all data)
-- WARNING: This permanently deletes all company data - use with caution
/*
DELETE FROM "PaymentTransaction" WHERE "companyId" = 'your-company-id';
DELETE FROM "RevenueRecord" WHERE "companyId" = 'your-company-id';
DELETE FROM "SubscriptionEvent" WHERE "companyId" = 'your-company-id';
DELETE FROM "Subscription" WHERE "companyId" = 'your-company-id';
DELETE FROM "CompanyProfile" WHERE "companyId" = 'your-company-id';
DELETE FROM "FinancialRecord" WHERE "companyId" = 'your-company-id';
DELETE FROM "AssessmentRecord" WHERE "companyId" = 'your-company-id';
DELETE FROM "User" WHERE "companyId" = 'your-company-id';
DELETE FROM "AccountingConnection" WHERE "companyId" = 'your-company-id';
DELETE FROM "AccountMapping" WHERE "companyId" = 'your-company-id';
DELETE FROM "Company" WHERE "id" = 'your-company-id';
*/

-- Example usage:
-- UPDATE "Company" SET "name" = CONCAT("name", ' (DELETED)'), "consultantId" = NULL WHERE "id" = 'cmix6s26x0001l504l0dooegk';
