import prisma from '../lib/prisma';

type JsonRecord = Record<string, unknown>;

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const AS_OF_DATE = process.argv[3] || '2026-01-31';
const SITE = (process.argv[4] || 'LYN').trim();

const BS_TARGET_FIELDS = new Set([
  'cash',
  'ar',
  'inventory',
  'otherca',
  'fixedassets',
  'otherassets',
  'totalassets',
  'ap',
  'loc',
  'othercl',
  'tcl',
  'ltd',
  'totalliab',
  'ownerscapital',
  'ownersdraw',
  'commonstock',
  'preferredstock',
  'retainedearnings',
  'additionalpaidincapital',
  'treasurystock',
  'totalequity',
  'totallande',
]);

function isoDayEnd(dateText: string): Date {
  return new Date(`${dateText}T23:59:59.999Z`);
}

async function main() {
  const asOf = isoDayEnd(AS_OF_DATE);
  const mappings = await prisma.accountMapping.findMany({
    where: { companyId: COMPANY_ID },
    select: { qbAccountId: true, qbAccountCode: true, targetField: true },
  });
  const bsAccounts = Array.from(
    new Set(
      mappings
        .filter((m) => BS_TARGET_FIELDS.has(String(m.targetField || '').trim().toLowerCase()))
        .map((m) => String(m.qbAccountId || m.qbAccountCode || '').trim())
        .filter(Boolean),
    ),
  );
  if (bsAccounts.length === 0) throw new Error('No mapped balance-sheet accounts found.');

  const balances = await prisma.$queryRaw<Array<{ accountId: string; site: string | null; endingBalance: number }>>`
    SELECT
      TRIM(g."accountId") AS "accountId",
      g.site AS site,
      SUM(g."signedAmount")::double precision AS "endingBalance"
    FROM "GLTransactionFact" g
    WHERE g."companyId" = ${COMPANY_ID}
      AND g."transDate" <= ${asOf}
      AND TRIM(g."accountId") = ANY(${bsAccounts})
      ${SITE ? prisma.$queryRaw`AND COALESCE(g.site,'') = ${SITE}` : prisma.$queryRaw``}
    GROUP BY 1,2
  `;

  const snapshotRows = balances.map((row) => ({
    accountId: String(row.accountId || '').trim(),
    accountCode: String(row.accountId || '').trim(),
    site: row.site || SITE || null,
    asOfDate: AS_OF_DATE,
    endingBalance: Number(row.endingBalance || 0),
    source: 'infor_slgltrans_cumulative',
    importedAt: new Date().toISOString(),
  }));

  const connection = await prisma.accountingConnection.findUnique({
    where: { companyId_platform: { companyId: COMPANY_ID, platform: 'INFOR_M3' } },
    select: { connectionMetadata: true },
  });
  const metadata =
    connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
      ? (connection.connectionMetadata as JsonRecord)
      : {};
  const existing = Array.isArray(metadata.csiTrialBalanceSnapshots) ? (metadata.csiTrialBalanceSnapshots as unknown[]) : [];
  const keep = existing.filter((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const rec = row as Record<string, unknown>;
    return !(String(rec.asOfDate || '').trim() === AS_OF_DATE && String(rec.source || '').trim() === 'infor_slgltrans_cumulative');
  });
  const merged = [...keep, ...snapshotRows];

  await prisma.accountingConnection.updateMany({
    where: { companyId: COMPANY_ID, platform: 'INFOR_M3' },
    data: {
      connectionMetadata: {
        ...metadata,
        csiTrialBalanceSnapshots: merged,
      } as any,
      lastSyncAt: new Date(),
    },
  });

  console.log(
    JSON.stringify(
      {
        companyId: COMPANY_ID,
        asOfDate: AS_OF_DATE,
        site: SITE || null,
        bsAccountsMapped: bsAccounts.length,
        snapshotRows: snapshotRows.length,
        totalStoredSnapshots: merged.length,
      },
      null,
      2,
    ),
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
