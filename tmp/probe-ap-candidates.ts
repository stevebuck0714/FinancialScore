import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { callInforIonApi } from '@/lib/infor-m3/client';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const site = 'LYN';
const mongooseConfig = 'APR_PRD_LYN';

const idoCandidates = [
  'SLVendTrans',
  'SLVendTran',
  'SLVendTrns',
  'SLVendorTrans',
  'SLVendorTran',
  'SLVchDists',
  'SLVchDist',
  'SLVoucherDist',
  'SLVoucherDists',
  'SLAPTran',
  'SLAPTrans',
  'SLAptrx',
  'SLAptrxs',
  'SLAptrxp',
  'SLAptrxps',
  'SLVchHdrs',
];

function messageOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as any;
  return String(b.Message || b.message || b.error || '').trim() || null;
}

async function main() {
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(companyId, 'INFOR_CSI' as any);
  if (!resolved.credentials) throw new Error('No credentials');

  for (const ido of idoCandidates) {
    const infoPath = `/APR_PRD/CSI/IDORequestService/ido/info/${ido}`;
    const loadPath = `/APR_PRD/CSI/IDORequestService/ido/load/${ido}?recordCap=1`;
    const headers = {
      'X-Infor-Site': site,
      'X-Infor-MongooseConfig': mongooseConfig,
    };
    const info = await callInforIonApi(resolved.credentials, infoPath, { timeoutMs: 20000, headers }).catch((e) => ({
      ok: false,
      status: 0,
      body: { Message: String(e) },
    }));
    const load = await callInforIonApi(resolved.credentials, loadPath, { timeoutMs: 20000, headers }).catch((e) => ({
      ok: false,
      status: 0,
      body: { Message: String(e) },
    }));
    const loadItems = Array.isArray((load.body as any)?.Items) ? (load.body as any).Items.length : 0;
    console.log(
      JSON.stringify({
        ido,
        infoStatus: info.status,
        infoMessage: messageOf(info.body),
        loadStatus: load.status,
        loadMessage: messageOf(load.body),
        loadItems,
      })
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
