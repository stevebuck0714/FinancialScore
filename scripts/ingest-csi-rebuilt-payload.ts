import prisma from '../lib/prisma';
import { ingestFinancialPayload } from '../lib/financial-ingestion';

type JsonRecord = Record<string, unknown>;

function parseArgs(argv: string[]) {
  const companyId = String(argv[2] || '').trim();
  if (!companyId) {
    throw new Error('Usage: npx tsx scripts/ingest-csi-rebuilt-payload.ts <companyId>');
  }
  return { companyId };
}

function monthToken(value: unknown): string | null {
  const text = String(value || '').trim();
  const m = text.match(/^(\d{4}-\d{2})/);
  return m ? m[1] : null;
}

function resolveThroughMonth(payload: JsonRecord): string {
  const metadata =
    payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? (payload.metadata as JsonRecord)
      : {};
  const fromMetadata = monthToken(metadata.throughMonth);
  if (fromMetadata) return fromMetadata;
  const rows = Array.isArray(payload.monthlyData) ? (payload.monthlyData as JsonRecord[]) : [];
  const months = rows
    .map((row) => monthToken(row.monthDate || row.month || row.date))
    .filter((v): v is string => Boolean(v))
    .sort();
  if (months.length > 0) return months[months.length - 1];
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function main() {
  const { companyId } = parseArgs(process.argv);
  console.log(`[ingest-csi-rebuilt] start company=${companyId}`);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { accountingSystem: true },
  });
  const configured = String(company?.accountingSystem || '').toUpperCase();
  console.log(`[ingest-csi-rebuilt] accountingSystem=${configured || 'N/A'}`);
  const payloadKeyPrimary = configured.includes('CSI') ? 'inforCsiFinancialPayload' : 'inforM3FinancialPayload';
  const payloadKeyFallback = configured.includes('CSI') ? 'inforM3FinancialPayload' : 'inforCsiFinancialPayload';

  const payloadRows = await prisma.$queryRaw<Array<{ csi: unknown; m3: unknown }>>`
    SELECT
      "connectionMetadata"->'inforCsiFinancialPayload' AS csi,
      "connectionMetadata"->'inforM3FinancialPayload' AS m3
    FROM "AccountingConnection"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
    LIMIT 1
  `;
  const payloadRow = payloadRows[0] || null;
  console.log('[ingest-csi-rebuilt] loaded payload paths from metadata');
  const payloadPrimaryValue = payloadKeyPrimary === 'inforCsiFinancialPayload' ? payloadRow?.csi : payloadRow?.m3;
  const payloadFallbackValue = payloadKeyFallback === 'inforCsiFinancialPayload' ? payloadRow?.csi : payloadRow?.m3;
  const payload =
    payloadPrimaryValue && typeof payloadPrimaryValue === 'object' && !Array.isArray(payloadPrimaryValue)
      ? (payloadPrimaryValue as JsonRecord)
      : payloadFallbackValue && typeof payloadFallbackValue === 'object' && !Array.isArray(payloadFallbackValue)
        ? (payloadFallbackValue as JsonRecord)
        : null;
  if (!payload) throw new Error('No Infor payload found in connection metadata.');
  console.log('[ingest-csi-rebuilt] payload selected');

  const monthlyData = Array.isArray(payload.monthlyData) ? payload.monthlyData : [];
  if (monthlyData.length === 0) throw new Error('Payload has no monthlyData rows to ingest.');
  const throughMonth = resolveThroughMonth(payload);
  console.log(`[ingest-csi-rebuilt] monthlyRows=${monthlyData.length} throughMonth=${throughMonth}`);
  const ingestPayload = {
    monthlyData,
    metadata: payload.metadata || {},
  };

  const result = await ingestFinancialPayload({
    companyId,
    platform: 'INFOR_M3',
    source: configured.includes('CSI') ? 'infor-csi' : 'infor-m3',
    payload: ingestPayload,
    syncType: 'reprocess_financial_payload',
    targetMonth: throughMonth,
    mode: 'through',
    maxMonths: 36,
  });
  console.log(`[ingest-csi-rebuilt] ingest ok=${result.ok} status=${result.status} imported=${result.recordsImported}`);

  console.log(
    JSON.stringify(
      {
        companyId,
        throughMonth,
        monthlyRowsInPayload: monthlyData.length,
        result,
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
