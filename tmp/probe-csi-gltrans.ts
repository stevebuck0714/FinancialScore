import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { callInforIonApi } from '@/lib/infor-m3/client';
import prisma from '@/lib/prisma';

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const site = process.argv[3] || 'MAIN';
const mongooseConfig = process.argv[4] || '';

const candidates = [
  '/APR_PRD/CSI/IDORequestService/ido/info/SLGlTrans',
  '/APR_PRD/CSI/IDORequestService/ido/load/SLGlTrans?properties=*&recordCap=20',
  '/APR_PRD/CSI/IDORequestService/ido/info/SLChartOfAccounts',
  '/APR_PRD/CSI/IDORequestService/ido/load/SLChartOfAccounts?properties=*&recordCap=20',
  '/APR_PRD/CSI/IDORequestService/ido/info/GLAcctPeriodBalances',
  '/APR_PRD/CSI/IDORequestService/ido/load/GLAcctPeriodBalances?properties=*&recordCap=20',
];

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
    where: { id: companyId },
    select: { accountingSystem: true },
  });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(companyId, inforSystem as any);
  if (!resolved.credentials) throw new Error('No Infor credentials resolved');

  for (const endpointPath of candidates) {
    try {
      const response = await callInforIonApi(resolved.credentials, endpointPath, {
        timeoutMs: 45000,
        headers: {
          ...(site ? { 'X-Infor-Site': site } : {}),
          ...(mongooseConfig ? { 'X-Infor-MongooseConfig': mongooseConfig } : {}),
        },
      });
      const items = extractItems(response.body);
      const first = items[0] || null;
      console.log(
        JSON.stringify({
          endpointPath,
          status: response.status,
          ok: response.status >= 200 && response.status < 300,
          itemCount: items.length,
          firstKeys: first && typeof first === 'object' ? Object.keys(first as Record<string, unknown>).slice(0, 40) : [],
        })
      );
    } catch (error) {
      console.log(JSON.stringify({ endpointPath, error: String(error) }));
    }
  }
}

main()
  .catch((error) => {
    console.error(String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

