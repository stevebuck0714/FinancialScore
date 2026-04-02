import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const site = process.argv[3] || 'MAIN';

const idos = ['SLGlTrans', 'SLChartOfAccounts', 'GLAcctPeriodBalances'];

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
  const candidates = [b.Properties, b.properties, b.PropertyList, b.propertyList].find((v) => Array.isArray(v)) || [];
  return (candidates as any[])
    .map((p) => String(p?.Name || p?.name || p?.PropertyName || p?.propertyName || '').trim())
    .filter(Boolean);
}

function summarize(body: unknown) {
  const items = extractItems(body);
  const first = items[0] || {};
  return {
    itemCount: items.length,
    firstItemKeys: Object.keys(first).slice(0, 40),
    firstItem: first,
  };
}

async function main() {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { accountingSystem: true } });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(companyId, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials available');

  const rows = await prisma.$queryRaw<Array<{ metadata: unknown }>>`
    SELECT "connectionMetadata" AS metadata
    FROM "AccountingConnection"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
    LIMIT 1
  `;
  const meta = rows[0]?.metadata && typeof rows[0].metadata === 'object' && !Array.isArray(rows[0].metadata)
    ? (rows[0].metadata as Record<string, unknown>)
    : {};
  const bySystem = meta.accountingProgramsBySystem && typeof meta.accountingProgramsBySystem === 'object'
    ? (meta.accountingProgramsBySystem as Record<string, unknown>)
    : {};
  const csiPrograms = Array.isArray(bySystem.INFOR_CSI) ? bySystem.INFOR_CSI as Array<Record<string, unknown>> : [];
  const firstProgram = csiPrograms.find((p) => typeof p === 'object') || {};
  const mongooseConfig = String(firstProgram?.mongooseConfig || '').trim() || 'APR_PRD_LYN';
  const headers: Record<string, string> = {
    'X-Infor-Site': site,
    'X-Infor-MongooseConfig': mongooseConfig,
  };

  const results: Array<Record<string, unknown>> = [];
  for (const ido of idos) {
    const infoPath = `/APR_PRD/CSI/IDORequestService/ido/info/${ido}`;
    const loadPath = `/APR_PRD/CSI/IDORequestService/ido/load/${ido}?properties=*&recordCap=20`;
    const infoRes = await callInforIonApi(resolved.credentials, infoPath, { timeoutMs: 30000, headers });
    const loadRes = await callInforIonApi(resolved.credentials, loadPath, { timeoutMs: 30000, headers });
    results.push({
      ido,
      infoPath,
      loadPath,
      infoStatus: infoRes.status,
      loadStatus: loadRes.status,
      infoPropertyCount: extractPropertyNames(infoRes.body).length,
      infoPropertySample: extractPropertyNames(infoRes.body).slice(0, 30),
      loadSummary: summarize(loadRes.body),
    });
  }

  console.log(JSON.stringify({ companyId, site, mongooseConfig, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
