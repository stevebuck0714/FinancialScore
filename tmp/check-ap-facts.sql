-- Check APTransactionFact summary for dev
SELECT 
  "apAcct",
  "transType",
  COUNT(*) as cnt,
  SUM("normalizedAmount") as total_normalized,
  MIN("eventDate")::date as earliest,
  MAX("eventDate")::date as latest
FROM "APTransactionFact"
WHERE "companyId" = 'cmmnwyofv000fqhp4z8lebbny'
GROUP BY "apAcct", "transType"
ORDER BY "apAcct", "transType";
