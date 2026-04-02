import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const IDO = process.argv[3] || 'BGTaskHistories';

function extractPropertyNames(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  const nodes = Array.isArray(b.Properties) ? b.Properties : [];
  return nodes
    .map((n: any) => String(n?.Name || '').trim())
    .filter(Boolean);
}

async function main() {
  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID }, select: { accountingSystem: true } });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(COMPANY_ID, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials available');
  const headers = { 'X-Infor-MongooseConfig': 'APR_PRD_LYN', 'X-Infor-Site': 'LYN' } as Record<string, string>;
  const path = `/APR_PRD/CSI/IDORequestService/ido/info/${IDO}`;
  const response = await callInforIonApi(resolved.credentials, path, { timeoutMs: 45000, headers });
  const body = response.body && typeof response.body === 'object' ? (response.body as Record<string, unknown>) : {};
  const props = extractPropertyNames(response.body);
  console.log(
    JSON.stringify(
      {
        companyId: COMPANY_ID,
        ido: IDO,
        status: response.status,
        success: (body as any).Success ?? null,
        message: (body as any).Message || null,
        propertyCount: props.length,
        properties: props,
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
