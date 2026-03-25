import prisma from '../lib/prisma';
import { ingestFinancialPayload } from '../lib/financial-ingestion';
import { buildCsiMonthlyDataFromGlResponses } from '../lib/infor-m3/csi-monthly-financial-builder';

type JsonRecord = Record<string, unknown>;

function parseArgs(argv: string[]) {
  const args = {
    companyId: '',
    throughMonth: '',
    maxMonths: 36,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = String(argv[i] || '').trim();
    if (!token) continue;
    if (!args.companyId && !token.startsWith('--')) {
      args.companyId = token;
      continue;
    }
    if (token === '--throughMonth' && argv[i + 1]) {
      args.throughMonth = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (token === '--maxMonths' && argv[i + 1]) {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        args.maxMonths = Math.max(1, Math.min(60, Math.floor(value)));
      }
      i += 1;
      continue;
    }
  }
  if (!args.companyId) {
    throw new Error('Usage: npx tsx scripts/rebuild-csi-history.ts <companyId> [--throughMonth YYYY-MM] [--maxMonths 60]');
  }
  return args;
}

function normalizeTargetMonth(value: unknown): string | null {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  return null;
}

function resolveThroughMonth(payload: JsonRecord | null, requested: string): string {
  if (normalizeTargetMonth(requested)) return requested;
  const metadata =
    payload?.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? (payload.metadata as JsonRecord)
      : {};
  const metadataThrough = normalizeTargetMonth(metadata.throughMonth);
  if (metadataThrough) return metadataThrough;
  const rows = Array.isArray(payload?.monthlyData) ? (payload?.monthlyData as JsonRecord[]) : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    const value = String(row?.monthDate || row?.month || row?.date || '').trim();
    const match = value.match(/^(\d{4}-\d{2})/);
    if (match) return match[1];
  }
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function loadHistoricalCsiSlLedgersItems(companyId: string): Promise<JsonRecord[]> {
  const rows = await prisma.$queryRaw<Array<{ item: unknown }>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = 'SLLEDGERS'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    ),
    ledger_rows AS (
      SELECT x.value AS item
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    )
    SELECT item
    FROM ledger_rows
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
      String(row.Acct || row.account || '').trim(),
      String(row.ControlYear || row.controlYear || '').trim(),
      String(row.ControlPeriod || row.controlPeriod || '').trim(),
      String(row.TransNum || row.transNum || '').trim(),
      String(row.Voucher || row.voucher || '').trim(),
      String(row.VouchSeq || row.vouchSeq || '').trim(),
      String(row.Ref || row.reference || '').trim(),
      String(row.TransDate || row.transDate || '').trim(),
      String(row.RecordDate || row.recordDate || '').trim(),
      String(row.DomAmount || row.domAmount || '').trim(),
    ]
      .map((x) => x.toLowerCase())
      .join('|');
    const key = `fb:${fallbackKey}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

async function main() {
  const args = parseArgs(process.argv);
  const companyId = String(args.companyId);
  const startedAt = Date.now();
  console.log(`[rebuild-csi-history] starting company=${companyId} maxMonths=${args.maxMonths}`);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { accountingSystem: true },
  });
  const configuredPlatform = String(company?.accountingSystem || '').toUpperCase();
  if (!(configuredPlatform.includes('INFOR'))) {
    throw new Error(`Company ${companyId} is not configured for Infor (found: ${configuredPlatform || 'N/A'}).`);
  }

  const connection = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform: 'INFOR_M3',
      },
    },
    select: { connectionMetadata: true },
  });
  const metadata =
    connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
      ? (connection.connectionMetadata as JsonRecord)
      : {};
  const payloadPrimary = configuredPlatform.includes('CSI') ? 'inforCsiFinancialPayload' : 'inforM3FinancialPayload';
  const payloadFallback = configuredPlatform.includes('CSI') ? 'inforM3FinancialPayload' : 'inforCsiFinancialPayload';
  const payload =
    metadata[payloadPrimary] && typeof metadata[payloadPrimary] === 'object'
      ? ({ ...(metadata[payloadPrimary] as JsonRecord) } as JsonRecord)
      : metadata[payloadFallback] && typeof metadata[payloadFallback] === 'object'
        ? ({ ...(metadata[payloadFallback] as JsonRecord) } as JsonRecord)
        : null;
  if (!payload) {
    throw new Error('No Infor payload found in AccountingConnection metadata.');
  }

  const throughMonth = resolveThroughMonth(payload, args.throughMonth);
  console.log(`[rebuild-csi-history] resolved throughMonth=${throughMonth}`);
  const historicalLedgers = await loadHistoricalCsiSlLedgersItems(companyId);
  console.log(`[rebuild-csi-history] loaded deduped ledger rows=${historicalLedgers.length}`);
  if (historicalLedgers.length === 0) {
    throw new Error('No historical SLLEDGERS rows found to rebuild from.');
  }

  const glResponsesRaw = Array.isArray(payload.glResponses) ? payload.glResponses : [];
  const nonLedgers = glResponsesRaw.filter((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return true;
    const program = String((entry as JsonRecord).miProgram || (entry as JsonRecord).program || '').trim().toUpperCase();
    return program !== 'SLLEDGERS';
  });
  const glResponsesForBuild = [
    ...nonLedgers,
    {
      module: 'GL',
      miProgram: 'SLLEDGERS',
      createdAt: new Date().toISOString(),
      response: { Items: historicalLedgers },
    },
  ];

  const mappings = await prisma.accountMapping.findMany({
    where: { companyId },
    select: {
      qbAccount: true,
      qbAccountId: true,
      qbAccountCode: true,
      targetField: true,
    },
  });

  const built = buildCsiMonthlyDataFromGlResponses({
    glResponses: glResponsesForBuild,
    throughMonth,
    maxMonths: args.maxMonths,
    accountMappings: mappings,
  });
  console.log(
    `[rebuild-csi-history] built monthlyData rows=${built.monthlyData.length} chartRows=${built.stats.chartRows} ledgerRows=${built.stats.ledgerRows}`,
  );
  if (!Array.isArray(built.monthlyData) || built.monthlyData.length === 0) {
    throw new Error('Rebuild produced no monthlyData rows.');
  }

  const rebuiltPayload: JsonRecord = {
    ...payload,
    glResponses: glResponsesForBuild,
    monthlyData: built.monthlyData,
    metadata: {
      ...(payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
        ? (payload.metadata as JsonRecord)
        : {}),
      source: 'csi_gl_rollup_rebuild_deduped',
      generatedAt: new Date().toISOString(),
      throughMonth,
      buildStats: built.stats,
      rebuildFromHistoricalSlLedgers: true,
    },
  };
  const ingestPayload: JsonRecord = {
    monthlyData: built.monthlyData,
    metadata: rebuiltPayload.metadata as JsonRecord,
  };

  await prisma.accountingConnection.updateMany({
    where: {
      companyId,
      platform: 'INFOR_M3',
    },
    data: {
      connectionMetadata: {
        ...metadata,
        [payloadPrimary]: rebuiltPayload,
      } as any,
      lastSyncAt: new Date(),
    },
  });
  console.log('[rebuild-csi-history] updated connection metadata payload');

  const ingestResult = await ingestFinancialPayload({
    companyId,
    platform: 'INFOR_M3',
    source: configuredPlatform.includes('CSI') ? 'infor-csi' : 'infor-m3',
    payload: ingestPayload,
    syncType: 'reprocess_financial_payload',
    mode: 'through',
    targetMonth: throughMonth,
    maxMonths: args.maxMonths,
  });
  console.log(
    `[rebuild-csi-history] ingest completed ok=${ingestResult.ok} status=${ingestResult.status} recordsImported=${ingestResult.recordsImported}`,
  );

  console.log(
    JSON.stringify(
      {
        companyId,
        throughMonth,
        maxMonths: args.maxMonths,
        historicalLedgerRowsDeduped: historicalLedgers.length,
        buildStats: built.stats,
        ingestResult,
        elapsedMs: Date.now() - startedAt,
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
