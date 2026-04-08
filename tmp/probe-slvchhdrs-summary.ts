import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const query =
  'recordCap=200&orderby=RecordDate desc&properties=VendNum,VadName,Voucher,VouchSeq,InvNum,InvDate,DistDate,RecordDate,Type,InvAmt,DiscPct,TermsCode,ExchRate,PreRegister,InWorkflow,PostFromPo';

type AnyRecord = Record<string, unknown>;

function extractItems(body: unknown): AnyRecord[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  if (Array.isArray(b.Items)) return b.Items.filter((v: unknown) => !!v && typeof v === 'object');
  if (Array.isArray(b.items)) return b.items.filter((v: unknown) => !!v && typeof v === 'object');
  if (Array.isArray(b.records)) return b.records.filter((v: unknown) => !!v && typeof v === 'object');
  return [];
}

function topCounts(items: AnyRecord[], field: string, limit = 10): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const token = item[field] === null || item[field] === undefined ? '<null>' : String(item[field]).trim() || '<empty>';
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

async function main() {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { accountingSystem: true } });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(companyId, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials available');

  const response = await callInforIonApi(
    resolved.credentials,
    `/APR_PRD/CSI/IDORequestService/ido/load/SLVCHHDRS?${query}`,
    {
      timeoutMs: 45000,
      headers: {
        'X-Infor-MongooseConfig': 'APR_PRD_LYN',
      },
    }
  );

  const items = extractItems(response.body);
  const sample = items.slice(0, 20).map((row) => ({
    VendNum: row.VendNum ?? null,
    VadName: row.VadName ?? null,
    Voucher: row.Voucher ?? null,
    VouchSeq: row.VouchSeq ?? null,
    InvNum: row.InvNum ?? null,
    InvDate: row.InvDate ?? null,
    DistDate: row.DistDate ?? null,
    RecordDate: row.RecordDate ?? null,
    Type: row.Type ?? null,
    InvAmt: row.InvAmt ?? null,
    DiscPct: row.DiscPct ?? null,
    TermsCode: row.TermsCode ?? null,
    ExchRate: row.ExchRate ?? null,
    PreRegister: row.PreRegister ?? null,
    InWorkflow: row.InWorkflow ?? null,
    PostFromPo: row.PostFromPo ?? null,
  }));

  console.log(
    JSON.stringify(
      {
        status: response.status,
        ok: response.ok,
        itemCount: items.length,
        typeCounts: topCounts(items, 'Type'),
        preRegisterCounts: topCounts(items, 'PreRegister'),
        inWorkflowCounts: topCounts(items, 'InWorkflow'),
        postFromPoCounts: topCounts(items, 'PostFromPo'),
        vouchSeqCounts: topCounts(items, 'VouchSeq'),
        sample,
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
