import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

function extractItems(body: unknown): Array<Record<string, unknown>> {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  if (Array.isArray(b.Items)) return b.Items;
  if (Array.isArray(b.items)) return b.items;
  if (Array.isArray(b.records)) return b.records;
  return [];
}

function scanTrial(item: Record<string, unknown>): boolean {
  const blob = Object.values(item).map((v) => String(v || '').toLowerCase()).join(' | ');
  return blob.includes('trial balance') || blob.includes('trialbalance') || blob.includes('multifsbtrialbalance');
}

async function main() {
  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID }, select: { accountingSystem: true } });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(COMPANY_ID, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials available');
  const headers = { 'X-Infor-MongooseConfig': 'APR_PRD_LYN', 'X-Infor-Site': 'LYN' } as Record<string, string>;

  let bookmark = '';
  let loops = 0;
  let totalItems = 0;
  const hits: Array<Record<string, unknown>> = [];
  while (loops < 25) {
    loops += 1;
    const query = bookmark
      ? `/APR_PRD/CSI/IDORequestService/ido/load/BGTaskHistories?properties=*&recordCap=500&bookmark=${encodeURIComponent(bookmark)}`
      : '/APR_PRD/CSI/IDORequestService/ido/load/BGTaskHistories?properties=*&recordCap=500';
    const response = await callInforIonApi(resolved.credentials, query, { timeoutMs: 45000, headers });
    const body = response.body as any;
    const items = extractItems(body);
    totalItems += items.length;
    for (const item of items) {
      if (!scanTrial(item)) continue;
      hits.push({
        TaskName: item.TaskName ?? null,
        TaskExecutable: item.TaskExecutable ?? null,
        DerReportOutputFilename: item.DerReportOutputFilename ?? null,
        CompletionDate: item.CompletionDate ?? null,
        CompletionStatus: item.CompletionStatus ?? null,
        CreatedBy: item.CreatedBy ?? null,
        RecordDate: item.RecordDate ?? null,
      });
    }
    const more = Boolean(body?.MoreRowsExist);
    bookmark = String(body?.Bookmark || '');
    if (!more || !bookmark) break;
  }

  console.log(
    JSON.stringify(
      {
        companyId: COMPANY_ID,
        loops,
        totalItemsScanned: totalItems,
        trialHits: hits.length,
        hits: hits.slice(0, 100),
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
