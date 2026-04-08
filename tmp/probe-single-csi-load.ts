import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const ido = process.argv[3] || 'SLAPPMTS';
const query = process.argv[4] || 'recordCap=5';
const siteArg = process.argv[5];
const mongooseConfigArg = process.argv[6] || 'APR_PRD_LYN';

function extractItems(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  if (Array.isArray(b.Items)) return b.Items;
  if (Array.isArray(b.items)) return b.items;
  if (Array.isArray(b.records)) return b.records;
  return [];
}

async function main() {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { accountingSystem: true } });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(companyId, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials available');

  const path = `/APR_PRD/CSI/IDORequestService/ido/load/${ido}?${query}`;
  const headers: Record<string, string> = {};
  if (mongooseConfigArg && mongooseConfigArg.toUpperCase() !== 'NONE') {
    headers['X-Infor-MongooseConfig'] = mongooseConfigArg;
  }
  if (siteArg && siteArg.toUpperCase() !== 'NONE') {
    headers['X-Infor-Site'] = siteArg;
  }
  const response = await callInforIonApi(resolved.credentials, path, {
    timeoutMs: 45000,
    headers,
  });

  const items = extractItems(response.body);
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
        itemCount: items.length,
        firstItemKeys: items.length ? Object.keys(items[0]).slice(0, 40) : [],
        bodyPreview:
          typeof response.body === 'string'
            ? response.body.slice(0, 500)
            : JSON.stringify(response.body).slice(0, 800),
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
