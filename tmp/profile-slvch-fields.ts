import prisma from '../lib/prisma';

type AnyRecord = Record<string, unknown>;

function asArray(value: unknown): AnyRecord[] {
  if (Array.isArray(value)) return value.filter((v): v is AnyRecord => !!v && typeof v === 'object');
  return [];
}

async function main() {
  const companyId = 'cmmnwyofv000fqhp4z8lebbny';
  const rows = await prisma.apiSyncLog.findMany({
    where: { companyId, platform: 'INFOR_M3' },
    orderBy: { createdAt: 'desc' },
    take: 800,
  });
  const hit = rows.find((row: any) => {
    const details = (row as any).errorDetails || {};
    return String(details.miProgram || '').trim().toUpperCase() === 'SLVCHHDRS' && String(row.status) === 'success';
  });
  if (!hit) {
    console.log(JSON.stringify({ found: false }, null, 2));
    return;
  }
  const details = (hit as any).errorDetails || {};
  const response = details.response;
  const records = [
    ...asArray((response as any)?.Items),
    ...asArray((response as any)?.items),
    ...asArray((response as any)?.records),
  ];
  const sample = records.slice(0, 2000);
  const keys = new Set<string>();
  for (const rec of sample) {
    for (const key of Object.keys(rec)) keys.add(key);
  }

  const candidateFields = [
    'Type',
    'Stat',
    'Status',
    'InvAmt',
    'PoCost',
    'DiscPct',
    'PreRegister',
    'InWorkflow',
    'PostFromPo',
    'VouchSeq',
    'Voucher',
    'InvNum',
    'DistDate',
    'RecordDate',
    'InvDate',
    'DueDate',
    'Paid',
    'PaidAmt',
    'Open',
    'OpenAmt',
    'Balance',
    'BalDue',
    'Bal',
    'CurrCode',
    'VendNum',
    'VadName',
  ];

  const distributions: Record<string, Record<string, number>> = {};
  for (const field of candidateFields) {
    distributions[field] = {};
  }

  for (const rec of sample) {
    for (const field of candidateFields) {
      const raw = (rec as any)[field];
      const token = raw === null || raw === undefined ? '<null>' : String(raw).trim() || '<empty>';
      distributions[field][token] = (distributions[field][token] || 0) + 1;
    }
  }

  const compact = Object.fromEntries(
    Object.entries(distributions).map(([field, dist]) => [
      field,
      Object.entries(dist)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15),
    ])
  );

  console.log(
    JSON.stringify(
      {
        found: true,
        createdAt: hit.createdAt,
        syncRunId: details.syncRunId || null,
        totalRecordsInPayload: records.length,
        sampled: sample.length,
        knownKeys: Array.from(keys).sort(),
        topDistributions: compact,
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
