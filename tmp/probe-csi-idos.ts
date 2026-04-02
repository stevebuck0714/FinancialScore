import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { callInforIonApi } from '@/lib/infor-m3/client';
import prisma from '@/lib/prisma';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const site = 'LYN';
const mongooseConfig = 'APR_PRD_LYN';
const candidates = [
  '/APR_PRD/CSI/IDORequestService/ido/info/SLVendTrans',
  '/APR_PRD/CSI/IDORequestService/ido/info/SLVendors',
  '/APR_PRD/CSI/IDORequestService/ido/info/SLVchDists',
  '/APR_PRD/CSI/IDORequestService/ido/info/SLVchHdrs',
  '/APR_PRD/CSI/IDORequestService/ido/load/SLVendTrans?properties=*&recordCap=20',
  '/APR_PRD/CSI/IDORequestService/ido/load/SLVendors?properties=*&recordCap=20',
  '/APR_PRD/CSI/IDORequestService/ido/load/SLVchDists?properties=*&recordCap=20',
  '/APR_PRD/CSI/IDORequestService/ido/load/SLVchHdrs?properties=*&recordCap=20',
];

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as any;
  return (
    b?.message ||
    b?.Message ||
    b?.fault?.message ||
    b?.fault?.detail ||
    b?.responseMessage ||
    null
  );
}

function extractItems(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  if (Array.isArray(b.Items)) return b.Items;
  if (Array.isArray(b.items)) return b.items;
  if (Array.isArray(b.records)) return b.records;
  return [];
}

async function main(): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { accountingSystem: true },
  });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(companyId, inforSystem as any);
  if (!resolved.credentials) {
    console.log(JSON.stringify({ error: 'No credentials' }));
    return;
  }
  for (const endpointPath of candidates) {
    try {
      const response = await callInforIonApi(resolved.credentials, endpointPath, {
        timeoutMs: 30000,
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
          message: extractMessage(response.body),
          itemCount: items.length,
          firstKeys:
            first && typeof first === 'object'
              ? Object.keys(first as Record<string, unknown>).slice(0, 40)
              : [],
        })
      );
    } catch (error) {
      console.log(JSON.stringify({ endpointPath, error: String(error) }));
    }
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
