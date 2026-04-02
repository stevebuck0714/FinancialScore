import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const TASK_NAME = process.argv[3] || 'MultiFSBTrialBalance';

function extractItems(body: unknown): Array<Record<string, unknown>> {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  if (Array.isArray(b.Items)) return b.Items;
  if (Array.isArray(b.items)) return b.items;
  if (Array.isArray(b.records)) return b.records;
  return [];
}

async function main() {
  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID }, select: { accountingSystem: true } });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(COMPANY_ID, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials available');
  const headers = { 'X-Infor-MongooseConfig': 'APR_PRD_LYN', 'X-Infor-Site': 'LYN' } as Record<string, string>;

  const loadPath = `/APR_PRD/CSI/IDORequestService/ido/load/BGTaskHistories?properties=*&filter=TaskName='${TASK_NAME}'&recordCap=200`;
  const response = await callInforIonApi(resolved.credentials, loadPath, { timeoutMs: 45000, headers });
  const items = extractItems(response.body);
  const projected = items.map((item) => ({
    TaskName: item.TaskName ?? null,
    TaskExecutable: item.TaskExecutable ?? null,
    CompletionDate: item.CompletionDate ?? null,
    CompletionStatus: item.CompletionStatus ?? null,
    DerReportOutputFilename: item.DerReportOutputFilename ?? null,
    CreatedBy: item.CreatedBy ?? null,
    RecordDate: item.RecordDate ?? null,
    RowPointer: item.RowPointer ?? null,
  }));

  console.log(
    JSON.stringify(
      {
        companyId: COMPANY_ID,
        taskName: TASK_NAME,
        status: response.status,
        itemCount: items.length,
        sampleKeys: items.length ? Object.keys(items[0]).slice(0, 30) : [],
        rows: projected,
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
