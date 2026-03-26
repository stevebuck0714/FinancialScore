WITH payload AS (
  SELECT
    'cmmnwyofv000fqhp4z8lebbny'::text AS company_id,
    'INFOR_M3'::text AS platform_id,
    jsonb_build_array(
      jsonb_build_object('module','Customers','miProgram','SLCustomers','endpointPath','/APR_PRD/CSI/IDORequestService/ido/load/SLCustomers?properties=CustNum,Name&recordCap=500','transactions',jsonb_build_array('CSI_LOAD'),'mongooseConfig','TMSManager','site','','enabled',true),
      jsonb_build_object('module','AR','miProgram','SLArtrans','endpointPath','/APR_PRD/CSI/IDORequestService/ido/load/SLArtrans?recordCap=1000','transactions',jsonb_build_array('CSI_LOAD'),'mongooseConfig','TMSManager','site','','enabled',true),
      jsonb_build_object('module','AP','miProgram','SLAptrx','endpointPath','/APR_PRD/CSI/IDORequestService/ido/load/SLAptrx?recordCap=1000','transactions',jsonb_build_array('CSI_LOAD'),'mongooseConfig','TMSManager','site','','enabled',true),
      jsonb_build_object('module','Sales','miProgram','SLCoitems','endpointPath','/APR_PRD/CSI/IDORequestService/ido/load/SLCoitems?recordCap=1000','transactions',jsonb_build_array('CSI_LOAD'),'mongooseConfig','TMSManager','site','','enabled',true),
      jsonb_build_object('module','Sales','miProgram','SLInvHdrs','endpointPath','/APR_PRD/CSI/IDORequestService/ido/load/SLInvHdrs?recordCap=1000','transactions',jsonb_build_array('CSI_LOAD'),'mongooseConfig','TMSManager','site','','enabled',true),
      jsonb_build_object('module','Sales','miProgram','SLCos','endpointPath','/APR_PRD/CSI/IDORequestService/ido/load/SLCos?properties=CoNum,CustNum,Stat,OrderDate,DueDate&recordCap=1000','transactions',jsonb_build_array('CSI_LOAD'),'mongooseConfig','TMSManager','site','','enabled',true),
      jsonb_build_object('module','Inventory','miProgram','SLItems','endpointPath','/APR_PRD/CSI/IDORequestService/ido/load/SLItems?recordCap=1000','transactions',jsonb_build_array('CSI_LOAD'),'mongooseConfig','TMSManager','site','','enabled',true),
      jsonb_build_object('module','Inventory','miProgram','SLItemlocs','endpointPath','/APR_PRD/CSI/IDORequestService/ido/load/SLItemlocs?recordCap=1000','transactions',jsonb_build_array('CSI_LOAD'),'mongooseConfig','TMSManager','site','','enabled',true),
      jsonb_build_object('module','Cash','miProgram','SLBankHdrs','endpointPath','/APR_PRD/CSI/IDORequestService/ido/load/SLBankHdrs?recordCap=1000','transactions',jsonb_build_array('CSI_LOAD'),'mongooseConfig','TMSManager','site','','enabled',true),
      jsonb_build_object('module','Vendors','miProgram','SLVendors','endpointPath','/APR_PRD/CSI/IDORequestService/ido/load/SLVendors?properties=VendNum,Name&recordCap=1000','transactions',jsonb_build_array('CSI_LOAD'),'mongooseConfig','TMSManager','site','','enabled',true),
      jsonb_build_object('module','GL','miProgram','SLChartAccts','endpointPath','/APR_PRD/CSI/IDORequestService/ido/load/SLChartAccts?recordCap=1000','transactions',jsonb_build_array('CSI_LOAD'),'mongooseConfig','TMSManager','site','','enabled',true),
      jsonb_build_object('module','GL','miProgram','SLGLTRANS','endpointPath','/APR_PRD/CSI/IDORequestService/ido/load/SLGLTRANS?properties=Acct,TransDate,DomAmount,ForAmount,Amount,DrCr,RecordDate,Site,TransNum,Ref,Description&recordCap=1000','transactions',jsonb_build_array('CSI_LOAD'),'mongooseConfig','TMSManager','site','','enabled',true),
      jsonb_build_object('module','GL','miProgram','GLAcctPeriodBalances','endpointPath','/APR_PRD/CSI/IDORequestService/ido/load/GLAcctPeriodBalances?properties=Acct,FiscalYear,FiscalPeriod,BegBalance,Debit,Credit,EndBalance,Site&recordCap=200','transactions',jsonb_build_array('CSI_LOAD'),'mongooseConfig','TMSManager','site','','enabled',true),
      jsonb_build_object('module','GL','miProgram','SLLedgers','endpointPath','/APR_PRD/CSI/IDORequestService/ido/load/SLLedgers?recordCap=1000','transactions',jsonb_build_array('CSI_LOAD'),'mongooseConfig','TMSManager','site','','enabled',true)
    ) AS programs
)
INSERT INTO "AccountingConnection" (
  "id","companyId","platform","status","autoSync","syncFrequency","connectionMetadata","createdAt","updatedAt"
)
SELECT
  gen_random_uuid()::text,
  p.company_id,
  p.platform_id::"AccountingPlatform",
  'ACTIVE'::"ConnectionStatus",
  false,
  'daily',
  jsonb_build_object(
    'accountingProgramsBySystem', jsonb_build_object('INFOR_CSI', p.programs),
    'accountingPrograms', p.programs
  ),
  NOW(),
  NOW()
FROM payload p
ON CONFLICT ("companyId","platform")
DO UPDATE SET
  "status" = 'ACTIVE'::"ConnectionStatus",
  "errorMessage" = NULL,
  "connectionMetadata" =
    COALESCE("AccountingConnection"."connectionMetadata",'{}'::jsonb) ||
    jsonb_build_object(
      'accountingProgramsBySystem', jsonb_build_object('INFOR_CSI', (SELECT programs FROM payload)),
      'accountingPrograms', (SELECT programs FROM payload)
    ),
  "updatedAt" = NOW();
