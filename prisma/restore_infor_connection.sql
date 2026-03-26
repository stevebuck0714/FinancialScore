UPDATE "AccountingConnection"
SET
  status = 'ACTIVE',
  "errorMessage" = NULL,
  "updatedAt" = NOW()
WHERE
  platform = 'INFOR_M3'
  AND (
    ("connectionMetadata"->'inforProfiles'->'INFOR_CSI'->>'clientIdEncrypted') IS NOT NULL
    OR ("connectionMetadata"->'inforProfiles'->'INFOR_M3'->>'clientIdEncrypted') IS NOT NULL
    OR ("connectionMetadata"->>'clientIdEncrypted') IS NOT NULL
  );
