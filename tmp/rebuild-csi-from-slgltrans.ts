import prisma from '../lib/prisma';
import { ingestFinancialPayload } from '../lib/financial-ingestion';
import { buildCsiMonthlyDataFromGlResponses } from '../lib/infor-m3/csi-monthly-financial-builder';

type JsonRecord = Record<string, unknown>;
type OpeningSeed = {
  accountId?: string | null;
  accountCode?: string | null;
  asOfDate?: string | null;
  endingBalance?: number | string | null;
};

function parseArgs(argv: string[]) {
  const args = {
    companyId: 'cmmnwyofv000fqhp4z8lebbny',
    throughMonth: '2026-03',
    maxMonths: 36,
  };
  if (argv[2] && !argv[2].startsWith('--')) args.companyId = String(argv[2]).trim();
  for (let i = 3; i < argv.length; i += 1) {
    const token = String(argv[i] || '').trim();
    if (token === '--throughMonth' && argv[i + 1]) {
      args.throughMonth = String(argv[i + 1]).trim();
      i += 1;
    } else if (token === '--maxMonths' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) args.maxMonths = Math.max(1, Math.min(60, Math.floor(n)));
      i += 1;
    }
  }
  return args;
}

async function loadHistoricalSlgltransItems(companyId: string): Promise<JsonRecord[]> {
  const rows = await prisma.$queryRaw<Array<{ item: unknown }>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = 'SLGLTRANS'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    )
    SELECT x.value AS item
    FROM logs
    CROSS JOIN LATERAL jsonb_array_elements(items) x
  `;
  const parsedRows = rows
    .map((row) => (row?.item && typeof row.item === 'object' && !Array.isArray(row.item) ? (row.item as JsonRecord) : null))
    .filter((row): row is JsonRecord => Boolean(row));
  const deduped = new Map<string, JsonRecord>();
  for (const row of parsedRows) {
    const rowPointer = String(row.RowPointer || row.rowPointer || '').trim().toLowerCase();
    if (rowPointer) {
      const key = `ptr:${rowPointer}`;
      if (!deduped.has(key)) deduped.set(key, row);
      continue;
    }
    const fallbackKey = [
      String(row.Acct || row.acct || '').trim().toLowerCase(),
      String(row.Site || row.site || '').trim().toLowerCase(),
      String(row.TransNum || row.transNum || '').trim().toLowerCase(),
      String(row.Ref || row.ref || '').trim().toLowerCase(),
      String(row.TransDate || row.transDate || '').trim().toLowerCase(),
      String(row.DomAmount || row.domAmount || '').trim().toLowerCase(),
      String(row.DrCr || row.drCr || '').trim().toLowerCase(),
    ].join('|');
    const key = `fb:${fallbackKey}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

async function main() {
  const args = parseArgs(process.argv);
  const companyId = String(args.companyId);
  const connection = await prisma.accountingConnection.findUnique({
    where: { companyId_platform: { companyId, platform: 'INFOR_M3' } },
    select: { connectionMetadata: true },
  });
  const metadata =
    connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
      ? (connection.connectionMetadata as JsonRecord)
      : {};
  const payload =
    metadata.inforCsiFinancialPayload && typeof metadata.inforCsiFinancialPayload === 'object'
      ? (metadata.inforCsiFinancialPayload as JsonRecord)
      : metadata.inforM3FinancialPayload && typeof metadata.inforM3FinancialPayload === 'object'
        ? (metadata.inforM3FinancialPayload as JsonRecord)
        : null;
  if (!payload) throw new Error('No Infor payload in connection metadata');
  const openingBalances = Array.isArray(metadata.csiTrialBalanceSnapshots)
    ? (metadata.csiTrialBalanceSnapshots as OpeningSeed[])
    : [];

  const slgltransRows = await loadHistoricalSlgltransItems(companyId);
  const glResponsesRaw = Array.isArray(payload.glResponses) ? payload.glResponses : [];
  const nonLedgerResponses = glResponsesRaw.filter((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return true;
    const p = String((entry as JsonRecord).miProgram || (entry as JsonRecord).program || '').trim().toUpperCase();
    return p !== 'SLGLTRANS' && p !== 'SLLEDGERS';
  });

  const glResponsesForBuild = [
    ...nonLedgerResponses,
    { module: 'GL', miProgram: 'SLGLTRANS', createdAt: new Date().toISOString(), response: { Items: slgltransRows } },
  ];
  const mappings = await prisma.accountMapping.findMany({
    where: { companyId },
    select: { qbAccount: true, qbAccountId: true, qbAccountCode: true, targetField: true },
  });
  const built = buildCsiMonthlyDataFromGlResponses({
    glResponses: glResponsesForBuild,
    throughMonth: args.throughMonth,
    maxMonths: args.maxMonths,
    accountMappings: mappings,
    openingBalances,
  });
  const ingestPayload: JsonRecord = {
    monthlyData: built.monthlyData,
    metadata: {
      source: 'rebuild-csi-from-slgltrans',
      generatedAt: new Date().toISOString(),
      throughMonth: args.throughMonth,
      buildStats: built.stats,
    },
  };
  const ingestResult = await ingestFinancialPayload({
    companyId,
    platform: 'INFOR_M3',
    source: 'infor-csi',
    payload: ingestPayload,
    syncType: 'reprocess_financial_payload',
    mode: 'through',
    targetMonth: args.throughMonth,
    maxMonths: args.maxMonths,
  });

  console.log(
    JSON.stringify(
      {
        companyId,
        throughMonth: args.throughMonth,
        maxMonths: args.maxMonths,
        slgltransRows: slgltransRows.length,
        openingSeedRows: openingBalances.length,
        buildStats: built.stats,
        ingestResult,
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
