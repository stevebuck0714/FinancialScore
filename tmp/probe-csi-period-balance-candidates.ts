import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

const candidates = [
  'GLAcctPeriodBalances',
  'SLGLAcctPeriodBalances',
  'GLAccountBalances',
  'GLLedgerPeriods',
  'SLGLLedgerPeriods',
  'SLLedgers',
  'SLGlTrans',
];

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
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { accountingSystem: true } });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(companyId, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials');

  const out: Array<Record<string, unknown>> = [];
  for (const ido of candidates) {
    const infoPath = `/APR_PRD/CSI/IDORequestService/ido/info/${ido}`;
    const loadPath = `/APR_PRD/CSI/IDORequestService/ido/load/${ido}?properties=*&recordCap=20`;
    const info = await callInforIonApi(resolved.credentials, infoPath, { timeoutMs: 30000 });
    const load = await callInforIonApi(resolved.credentials, loadPath, { timeoutMs: 30000 });
    const props = extractPropertyNames(info.body);
    const items = extractItems(load.body);
    const first = items[0] || {};
    const hasPeriodShape =
      props.some((p) => /^FiscalYear$/i.test(p) || /^ControlYear$/i.test(p)) &&
      props.some((p) => /^FiscalPeriod$/i.test(p) || /^ControlPeriod$/i.test(p)) &&
      props.some((p) => /EndBalance/i.test(p));
    out.push({
      ido,
      infoStatus: info.status,
      loadStatus: load.status,
      propertyCount: props.length,
      hasPeriodShape,
      sampleProps: props.slice(0, 30),
      itemCount: items.length,
      firstItemKeys: Object.keys(first).slice(0, 30),
    });
  }

  console.log(JSON.stringify({ companyId, candidates: out }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
