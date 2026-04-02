import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const ido = process.argv[3] || 'GLAcctPeriodBalances';
  const site = process.argv[4] || 'LYN';

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { accountingSystem: true } });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(companyId, inforSystem as any);
  if (!resolved.credentials) throw new Error('No credentials');

  const infoPath = `/APR_PRD/CSI/IDORequestService/ido/info/${ido}`;
  const info = await callInforIonApi(resolved.credentials, infoPath, {
    timeoutMs: 30000,
    headers: {
      'X-Infor-Site': site,
      'X-Infor-MongooseConfig': 'APR_PRD_LYN',
    },
  });

  const body = info.body && typeof info.body === 'object' ? (info.body as Record<string, unknown>) : {};
  const topKeys = Object.keys(body);
  const nested: Record<string, unknown> = {};
  for (const key of topKeys.slice(0, 20)) {
    const value = (body as any)[key];
    nested[key] = Array.isArray(value)
      ? { type: 'array', length: value.length, firstKeys: value[0] && typeof value[0] === 'object' ? Object.keys(value[0]).slice(0, 20) : [] }
      : value && typeof value === 'object'
        ? { type: 'object', keys: Object.keys(value as Record<string, unknown>).slice(0, 40) }
        : value;
  }

  console.log(JSON.stringify({ companyId, ido, infoStatus: info.status, topKeys, nested, rawBody: body }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
