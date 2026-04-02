import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const CANDIDATES = ['SLTrialBalance', 'SLGLSummary', 'SLAcctBal', 'SLGLBalances', 'GLAcctPeriodBalances', 'SLLedgers', 'SLGlTrans'];

function extractItems(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  if (Array.isArray(b.Items)) return b.Items;
  if (Array.isArray(b.items)) return b.items;
  if (Array.isArray(b.records)) return b.records;
  return [];
}

function extractPropertyNames(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  const nodes = Array.isArray(b.Properties)
    ? b.Properties
    : Array.isArray(b.properties)
      ? b.properties
      : Array.isArray(b.PropertyList)
        ? b.PropertyList
        : [];
  return nodes
    .map((n: any) => String(n?.Name || n?.name || n?.PropertyName || '').trim())
    .filter(Boolean);
}

async function main() {
  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID }, select: { accountingSystem: true } });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(COMPANY_ID, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials');

  const results: Array<Record<string, unknown>> = [];
  for (const ido of CANDIDATES) {
    const infoPath = `/APR_PRD/CSI/IDORequestService/ido/info/${ido}`;
    const loadPath = `/APR_PRD/CSI/IDORequestService/ido/load/${ido}?properties=*&recordCap=20`;
    const info = await callInforIonApi(resolved.credentials, infoPath, { timeoutMs: 30000 });
    const load = await callInforIonApi(resolved.credentials, loadPath, { timeoutMs: 30000 });
    const props = extractPropertyNames(info.body);
    const items = extractItems(load.body);
    results.push({
      ido,
      infoStatus: info.status,
      loadStatus: load.status,
      propertyCount: props.length,
      itemCount: items.length,
      sampleProps: props.slice(0, 20),
      firstItemKeys: items.length ? Object.keys(items[0]).slice(0, 20) : [],
    });
  }

  console.log(JSON.stringify({ companyId: COMPANY_ID, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
