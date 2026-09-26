CREATE INDEX IF NOT EXISTS "InforRawRecord_company_platform_program_business_date_idx"
  ON "InforRawRecord" (
    "companyId",
    "platform",
    "miProgram",
    "businessDate" DESC,
    "fetchedAt" DESC,
    "createdAt" DESC
  );
