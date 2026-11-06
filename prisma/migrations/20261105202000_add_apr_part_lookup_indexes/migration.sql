-- Exact APR P/N searches normalize input with UPPER(TRIM(...)); these indexes
-- let Monthly Forecast use that same normalization without scanning source data.
CREATE INDEX IF NOT EXISTS "ProductRevenueForecastLine_company_apr_part_lookup_idx"
  ON "ProductRevenueForecastLine" ("companyId", UPPER(TRIM("itemSku")));

CREATE INDEX IF NOT EXISTS "CustomerOrderLineSnapshot_company_sku_apr_part_lookup_idx"
  ON "CustomerOrderLineSnapshot" ("companyId", UPPER(TRIM("sku")));

CREATE INDEX IF NOT EXISTS "CustomerOrderLineSnapshot_company_item_apr_part_lookup_idx"
  ON "CustomerOrderLineSnapshot" ("companyId", UPPER(TRIM("itemId")));

CREATE INDEX IF NOT EXISTS "InforRawRecord_company_program_apr_part_lookup_idx"
  ON "InforRawRecord" (
    "companyId",
    UPPER(TRIM("payload"->>'Item'))
  )
  WHERE "miProgram" IN ('SLCustomerItems', 'SLCUSTOMERITEMS');

-- ProductInvoiceLineFact is created at runtime for older installations, so it
-- may not exist when migrations are applied to a new database.
DO $$
BEGIN
  IF to_regclass('"ProductInvoiceLineFact"') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS "ProductInvoiceLineFact_company_apr_part_lookup_idx"
      ON "ProductInvoiceLineFact" ("companyId", UPPER(TRIM("itemSku")))
    ';
  END IF;
END $$;
