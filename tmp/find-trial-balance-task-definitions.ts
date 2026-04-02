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

function looksTrial(v: unknown): boolean {
  const t = String(v || '').toLowerCase();
  return t.includes('trial') || t.includes('trialbalance') || t.includes('trial balance');
}

async function main() {
  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID }, select: { accountingSystem: true } });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(COMPANY_ID, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials available');
  const headers = { 'X-Infor-MongooseConfig': 'APR_PRD_LYN', 'X-Infor-Site': 'LYN' } as Record<string, string>;

  const response = await callInforIonApi(
    resolved.credentials,
    '/APR_PRD/CSI/IDORequestService/ido/load/BGTaskDefinitions?properties=*&recordCap=1000',
    { timeoutMs: 45000, headers },
  );
  const items = extractItems(response.body);
  const hits = items.filter((item) => Object.values(item).some((v) => looksTrial(v)));
  console.log(
    JSON.stringify(
      {
        companyId: COMPANY_ID,
        status: response.status,
        itemCount: items.length,
        trialLikeTasks: hits.length,
        sampleKeys: items.length ? Object.keys(items[0]).slice(0, 30) : [],
        sampleHits: hits.slice(0, 40),
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
