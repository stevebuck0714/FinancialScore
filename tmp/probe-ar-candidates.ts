import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { callInforIonApi } from '@/lib/infor-m3/client';
import prisma from '@/lib/prisma';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const site = 'LYN';
const mongooseConfig = 'APR_PRD_LYN';

const idoCandidates = [
  'SLArtrans',
  'SLArTran',
  'SLARTrans',
  'SLCustdrfts',
  'SLCustTrans',
  'SLCustTran',
  'SLInvHdrs',
  'SLInvStmts',
  'SLCoitems',
  'SLOpenItem',
  'SLAROpenItem',
];

function extractPropertyNames(infoBody: any): string[] {
  const props = Array.isArray(infoBody?.Properties) ? infoBody.Properties : [];
  return props
    .map((p: any) => String(p?.Name || p?.PropertyName || '').trim())
    .filter((name: string) => name.length > 0);
}

function buildSafePropertyList(names: string[]): string[] {
  const preferred = [
    'CustNum',
    'CustName',
    'CustaddrName',
    'CoNum',
    'InvNum',
    'ApplyToInvNum',
    'DerApplyToInvNum',
    'Voucher',
    'InvDate',
    'DueDate',
    'RecordDate',
    'CheckDate',
    'CreateDate',
    'Type',
    'Stat',
  ];
  const availablePreferred = preferred.filter((name) => names.includes(name));
  const moneyAndAging = names.filter((name) =>
    /(amt|amount|bal|open|due|pay|disc|credit|debit|curr|date|aging|days|type|stat|cust|inv)/i.test(name)
  );
  return Array.from(new Set([...availablePreferred, ...moneyAndAging])).slice(0, 80);
}

function extractItems(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  if (Array.isArray(b.Items)) return b.Items;
  if (Array.isArray(b.items)) return b.items;
  if (Array.isArray(b.records)) return b.records;
  return [];
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as any;
  return String(b.Message || b.message || b.error || b?.fault?.message || '').trim() || null;
}

async function main() {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { accountingSystem: true },
  });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(companyId, inforSystem as any);
  if (!resolved.credentials) throw new Error('No credentials');

  const headers = {
    'X-Infor-Site': site,
    'X-Infor-MongooseConfig': mongooseConfig,
  };

  for (const ido of idoCandidates) {
    const infoPath = `/APR_PRD/CSI/IDORequestService/ido/info/${ido}`;
    const info = await callInforIonApi(resolved.credentials, infoPath, { timeoutMs: 30000, headers }).catch((e) => ({
      status: 0,
      body: { Message: String(e) },
    }));

    const infoBody: any = (info as any).body || {};
    const propertyNames = extractPropertyNames(infoBody);
    const safeProperties = buildSafePropertyList(propertyNames);
    const loadPath = `/APR_PRD/CSI/IDORequestService/ido/load/${ido}?recordCap=20&properties=${encodeURIComponent(
      safeProperties.join(',')
    )}`;
    const load = await callInforIonApi(resolved.credentials, loadPath, { timeoutMs: 30000, headers }).catch((e) => ({
      status: 0,
      body: { Message: String(e) },
    }));
    const items = extractItems((load as any).body);
    const first = items[0] || null;

    console.log(
      JSON.stringify({
        ido,
        infoStatus: (info as any).status || 0,
        infoMessage: extractMessage((info as any).body),
        propertyCount: propertyNames.length,
        safePropertiesUsed: safeProperties,
        loadStatus: (load as any).status || 0,
        loadMessage: extractMessage((load as any).body),
        itemCount: items.length,
        firstItemKeys: first && typeof first === 'object' ? Object.keys(first as Record<string, unknown>).slice(0, 80) : [],
      })
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
