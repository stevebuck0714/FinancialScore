UPDATE "OperationalSystemConnection"
SET "provider" = 'FOODREADY', "updatedAt" = NOW()
WHERE "sourceCode" = 'FOODREADY_AI'
  AND "provider" = 'SPREADSHEET_UPLOAD';
