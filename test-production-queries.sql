-- Test queries for GuidanceIQ production database
-- Run these in Neon SQL Editor for GuidanceIQ database

-- 1. Check if consultant exists
SELECT id, "fullName", "userId" FROM "Consultant"
WHERE id = 'cmix30pr40002l80411fzzb77';

-- 2. Check companies for this consultant
SELECT id, name, "consultantId" FROM "Company"
WHERE "consultantId" = 'cmix30pr40002l80411fzzb77'
ORDER BY "createdAt" DESC;

-- 3. Check if user exists
SELECT id, email, name, "consultantId" FROM "User"
WHERE email = 'corelyticstest5@yahoo.com';

-- 4. Test the API query that was failing
SELECT id, name, "linesOfBusiness", "userDefinedAllocations", "headcountAllocations"
FROM "Company"
WHERE id = 'prod_1765299971679_m3fp9wsyz'; -- Use actual company ID from your logs

-- 5. Check column existence
SELECT column_name FROM information_schema.columns
WHERE table_name = 'Company'
AND column_name IN ('linesOfBusiness', 'userDefinedAllocations', 'headcountAllocations')
ORDER BY column_name;







