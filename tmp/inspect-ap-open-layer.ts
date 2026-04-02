import { getInforM3CredentialsWithOptionalEnvFallback } from '@/lib/infor-m3/credentials';
import { callInforIonApi } from '@/lib/infor-m3/client';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const headers = {
  'X-Infor-Site': 'LYN',
  'X-Infor-MongooseConfig': 'APR_PRD_LYN',
};

function propertyNames(infoBody: any): string[] {
  const props = Array.isArray(infoBody?.Properties) ? infoBody.Properties : [];
  return props
    .map((p: any) => String(p?.Name || p?.PropertyName || '').trim())
    .filter((name: string) => name.length > 0);
}

async function main() {
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(companyId, 'INFOR_CSI' as any);
  if (!resolved.credentials) throw new Error('No credentials');

  for (const ido of ['SLAptrxs', 'SLAptrxps', 'SLAPPmts']) {
    const infoPath = `/APR_PRD/CSI/IDORequestService/ido/info/${ido}`;
    const info = await callInforIonApi(resolved.credentials, infoPath, { timeoutMs: 30000, headers });
    const infoBody: any = info.body || {};
    const names = propertyNames(infoBody);
    const interesting = names.filter((n) => /bal|open|due|amt|amount|pay|paid|disc|vend|inv|date|stat|type|curr/i.test(n));
    const preferred = ['VendNum', 'UbVendNum', 'UbVendName', 'VendaddrName', 'InvNum', 'Voucher'];
    const availablePreferred = preferred.filter((name) => names.includes(name));
    const safeList = Array.from(new Set([...availablePreferred, ...interesting])).slice(0, 60);
    const loadPath = `/APR_PRD/CSI/IDORequestService/ido/load/${ido}?properties=${encodeURIComponent(safeList.join(','))}&recordCap=20`;
    const load = await callInforIonApi(resolved.credentials, loadPath, { timeoutMs: 30000, headers });
    const loadBody: any = load.body || {};
    const items = Array.isArray(loadBody?.Items) ? loadBody.Items : [];

    console.log(
      JSON.stringify(
        {
          ido,
          infoStatus: info.status,
          infoMessage: infoBody?.Message || null,
          propertyCount: names.length,
          interestingProperties: interesting.slice(0, 120),
          loadStatus: load.status,
          loadMessage: loadBody?.Message || null,
          itemCount: items.length,
          firstItemKeys: items[0] ? Object.keys(items[0]).slice(0, 120) : [],
          firstItem: items[0] || null,
          usedProperties: safeList,
        },
        null,
        2
      )
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
