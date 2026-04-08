import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const ido = process.argv[3] || 'SLVCHHDRS';
const query = process.argv[4] || 'recordCap=10';
const siteArg = process.argv[5];
const mongooseConfigArg = process.argv[6] || 'APR_PRD_LYN';

function extractItems(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  if (Array.isArray(b.Items)) return b.Items.filter((v: unknown) => !!v && typeof v === 'object');
  if (Array.isArray(b.items)) return b.items.filter((v: unknown) => !!v && typeof v === 'object');
  if (Array.isArray(b.records)) return b.records.filter((v: unknown) => !!v && typeof v === 'object');
  return [];
}

async function main() {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { accountingSystem: true } });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(companyId, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials available');

  const headers: Record<string, string> = {};
  if (mongooseConfigArg && mongooseConfigArg.toUpperCase() !== 'NONE') {
    headers['X-Infor-MongooseConfig'] = mongooseConfigArg;
  }
  if (siteArg && siteArg.toUpperCase() !== 'NONE') {
    headers['X-Infor-Site'] = siteArg;
  }

  const response = await callInforIonApi(resolved.credentials, `/APR_PRD/CSI/IDORequestService/ido/load/${ido}?${query}`, {
    timeoutMs: 45000,
    headers,
  });

  console.log(
    JSON.stringify(
      {
        companyId,
        ido,
        query,
        site: siteArg || null,
        mongooseConfig: mongooseConfigArg || null,
        status: response.status,
        ok: response.ok,
        items: extractItems(response.body),
        body: response.body,
      },
      null,
      2
    )
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
