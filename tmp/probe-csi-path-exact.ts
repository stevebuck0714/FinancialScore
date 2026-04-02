import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const PATH_TO_CALL =
  process.argv[3] || '/APR_PRD/CSI/IDORequestService/ido/load/SLGLTRANS?properties=*&recordCap=20';
const MONGOOSE_CONFIG = process.argv[4] || '';
const SITE = process.argv[5] || '';

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
  const headers: Record<string, string> = {};
  if (MONGOOSE_CONFIG) headers['X-Infor-MongooseConfig'] = MONGOOSE_CONFIG;
  if (SITE) headers['X-Infor-Site'] = SITE;
  const response = await callInforIonApi(resolved.credentials, PATH_TO_CALL, { timeoutMs: 45000, headers });
  const items = extractItems(response.body);
  const body = response.body && typeof response.body === 'object' ? (response.body as Record<string, unknown>) : {};
  console.log(
    JSON.stringify(
      {
        companyId: COMPANY_ID,
        path: PATH_TO_CALL,
        mongooseConfig: MONGOOSE_CONFIG || null,
        site: SITE || null,
        status: response.status,
        topKeys: Object.keys(body),
        itemCount: items.length,
        firstItemKeys: items.length ? Object.keys(items[0]).slice(0, 30) : [],
        message: (body as any).Message || null,
        success: (body as any).Success ?? null,
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
