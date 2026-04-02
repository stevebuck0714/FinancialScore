import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const MONTH = process.argv[3] || '2026-03';

function extractItems(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  if (Array.isArray(b.Items)) return b.Items;
  if (Array.isArray(b.items)) return b.items;
  if (Array.isArray(b.records)) return b.records;
  return [];
}

async function main() {
  const company = await prisma.company.findUnique({
    where: { id: COMPANY_ID },
    select: { accountingSystem: true },
  });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(COMPANY_ID, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials available');

  const [year, month] = MONTH.split('-').map(Number);
  const isoStart = `${MONTH}-01`;
  const isoEnd = `${MONTH}-31`;
  const compactStart = `${year}${String(month).padStart(2, '0')}01`;
  const compactEnd = `${year}${String(month).padStart(2, '0')}31`;

  const queries = [
    {
      name: 'transdate_iso',
      requestPath: `/APR_PRD/CSI/IDORequestService/ido/load/SLGlTrans?properties=Acct,Site,DomAmount,Amount,TransDate,RecordDate,Ref,TransNum,DrCr&filter=TransDate>='${isoStart}' and TransDate<='${isoEnd}'&recordCap=2000`,
    },
    {
      name: 'transdate_compact',
      requestPath: `/APR_PRD/CSI/IDORequestService/ido/load/SLGlTrans?properties=Acct,Site,DomAmount,Amount,TransDate,RecordDate,Ref,TransNum,DrCr&filter=TransDate>='${compactStart}' and TransDate<='${compactEnd}'&recordCap=2000`,
    },
    {
      name: 'recorddate_iso',
      requestPath: `/APR_PRD/CSI/IDORequestService/ido/load/SLGlTrans?properties=Acct,Site,DomAmount,Amount,TransDate,RecordDate,Ref,TransNum,DrCr&filter=RecordDate>='${isoStart}' and RecordDate<='${isoEnd}'&recordCap=2000`,
    },
    {
      name: 'recorddate_compact',
      requestPath: `/APR_PRD/CSI/IDORequestService/ido/load/SLGlTrans?properties=Acct,Site,DomAmount,Amount,TransDate,RecordDate,Ref,TransNum,DrCr&filter=RecordDate>='${compactStart}' and RecordDate<='${compactEnd}'&recordCap=2000`,
    },
  ];
  const results: Array<Record<string, unknown>> = [];
  for (const query of queries) {
    const response = await callInforIonApi(resolved.credentials, query.requestPath, { timeoutMs: 45000 });
    const items = extractItems(response.body);
    results.push({
      query: query.name,
      status: response.status,
      itemCount: items.length,
      requestPath: query.requestPath,
      sample: items.slice(0, 3),
    });
  }

  console.log(
    JSON.stringify(
      {
        companyId: COMPANY_ID,
        month: MONTH,
        results,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
