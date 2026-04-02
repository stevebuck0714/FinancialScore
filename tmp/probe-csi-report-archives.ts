import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

const CANDIDATE_IDOS = [
  'SLTrialBalance',
  'TrialBalance',
  'SLGLSummary',
  'SLAcctBal',
  'SLGLBalances',
  'GLTrialBalance',
  'TrialBal',
  'BGTaskHistories',
  'BGTaskHistory',
  'ActiveBGTasks',
  'BGTaskDefinitions',
  'RptOutputFiles',
  'ReportOutput',
  'ReportOutputs',
  'ReportArchive',
  'DocumentObjects',
  'DocumentObject',
  'DocumentOutput',
  'DocOutput',
  'SLReports',
  'ReportQueue',
];

function extractItems(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  if (Array.isArray(b.Items)) return b.Items;
  if (Array.isArray(b.items)) return b.items;
  if (Array.isArray(b.records)) return b.records;
  return [];
}

async function callWithHeaders(
  credentials: any,
  path: string,
  mongooseConfig: string | null,
  site: string | null,
) {
  const headers: Record<string, string> = {};
  if (mongooseConfig) headers['X-Infor-MongooseConfig'] = mongooseConfig;
  if (site) headers['X-Infor-Site'] = site;
  const response = await callInforIonApi(credentials, path, { timeoutMs: 30000, headers });
  const body = response.body && typeof response.body === 'object' ? (response.body as Record<string, unknown>) : {};
  const items = extractItems(response.body);
  return {
    status: response.status,
    success: (body as any).Success ?? null,
    message: String((body as any).Message || ''),
    itemCount: items.length,
    firstItemKeys: items.length ? Object.keys(items[0]).slice(0, 12) : [],
  };
}

async function main() {
  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID }, select: { accountingSystem: true } });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(COMPANY_ID, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials available');

  const headerVariants: Array<{ mongooseConfig: string | null; site: string | null; tag: string }> = [
    { mongooseConfig: null, site: null, tag: 'none' },
    { mongooseConfig: 'APR_PRD_LYN', site: 'LYN', tag: 'apr_lyn' },
    { mongooseConfig: 'TMSManager', site: 'LYN', tag: 'tms_lyn' },
  ];

  const results: Array<Record<string, unknown>> = [];
  for (const ido of CANDIDATE_IDOS) {
    for (const variant of headerVariants) {
      const infoPath = `/APR_PRD/CSI/IDORequestService/ido/info/${ido}`;
      const loadPath = `/APR_PRD/CSI/IDORequestService/ido/load/${ido}?properties=*&recordCap=20`;
      const info = await callWithHeaders(resolved.credentials, infoPath, variant.mongooseConfig, variant.site);
      const load = await callWithHeaders(resolved.credentials, loadPath, variant.mongooseConfig, variant.site);
      results.push({
        ido,
        headerVariant: variant.tag,
        infoStatus: info.status,
        infoSuccess: info.success,
        infoMessage: info.message,
        loadStatus: load.status,
        loadSuccess: load.success,
        loadMessage: load.message,
        loadItemCount: load.itemCount,
        loadFirstItemKeys: load.firstItemKeys,
      });
    }
  }

  const viable = results.filter((r) => Number(r.loadItemCount || 0) > 0 || String(r.loadMessage || '').length === 0);
  console.log(JSON.stringify({ companyId: COMPANY_ID, candidates: CANDIDATE_IDOS.length, viable, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
