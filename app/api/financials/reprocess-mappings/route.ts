import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ingestFinancialPayload } from '@/lib/financial-ingestion';
import { syncErpDailyFinancialsFromGL } from '@/lib/financial/sync-erp-daily-financials';
import { buildCsiMonthlyDataFromGlResponses } from '@/lib/infor-m3/csi-monthly-financial-builder';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';

export const dynamic = 'force-dynamic';
const CSI_REBUILD_MAX_MONTHS = 36;
const CSI_LEDGER_PROGRAMS = new Set(['SLGLTRANS']);

type FinancialImportMode = 'through' | 'only';

function normalizeFinancialImportMode(value: unknown): FinancialImportMode {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'only' ? 'only' : 'through';
}

function normalizeTargetMonth(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeConfiguredPlatform(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  const compact = upper.replace(/[\s-]+/g, '_');
  if (compact.includes('INFOR') && compact.includes('CSI')) return 'INFOR_CSI';
  if (compact.includes('INFOR') && compact.includes('M3')) return 'INFOR_M3';
  if (compact === 'QUICKBOOKS_DESKTOP' || compact === 'QUICKBOOKSDESKTOP') return 'QUICKBOOKS_DESKTOP';
  if (compact === 'QUICKBOOKS_ENTERPRISE' || compact === 'QUICKBOOKSENTERPRISE') return 'QUICKBOOKS_ENTERPRISE';
  if (compact === 'QUICKBOOKS_ONLINE' || compact === 'QBO') return 'QUICKBOOKS';
  if (compact === 'CSV' || compact === 'CSVFILE') return 'CSV_FILE';
  return compact;
}

function hasMonthlyDataRows(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false;
  const rows = payload.monthlyData;
  return Array.isArray(rows) && rows.length > 0;
}

function looksLikeCoaOnlyPayloadStub(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false;
  const metadata =
    payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, unknown>)
      : {};
  const sourceType = String(metadata.sourceType || '').trim().toLowerCase();
  const sourceModule = String(metadata.sourceModule || '').trim().toUpperCase();
  return sourceType === 'endpoint' && sourceModule === 'GL' && !hasMonthlyDataRows(payload);
}

function resolveThroughMonthForRebuild(
  payload: Record<string, unknown> | null,
  requestedTargetMonth: string | null,
): string {
  const requested = String(requestedTargetMonth || '').trim();
  if (/^\d{4}-\d{2}$/.test(requested)) return requested;

  const metadata =
    payload?.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, unknown>)
      : {};
  const metadataThrough = String(metadata.throughMonth || '').trim();
  if (/^\d{4}-\d{2}$/.test(metadataThrough)) return metadataThrough;

  const rows = Array.isArray(payload?.monthlyData) ? (payload?.monthlyData as Array<Record<string, unknown>>) : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    const monthDate = String(row?.monthDate || row?.month || row?.date || '').trim();
    if (/^\d{4}-\d{2}/.test(monthDate)) return monthDate.slice(0, 7);
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getThroughMonthWindow(throughMonth: string, maxMonths: number): { throughDate: Date; earliestDate: Date } | null {
  const throughDate = new Date(`${throughMonth}-01T00:00:00Z`);
  if (Number.isNaN(throughDate.getTime())) return null;
  const earliestDate = new Date(
    throughDate.getUTCFullYear(),
    throughDate.getUTCMonth() - (Math.max(1, maxMonths) - 1),
    1,
  );
  return { throughDate, earliestDate };
}

async function loadHistoricalCsiLedgerItems(
  companyId: string,
  throughMonth: string,
  maxMonths: number,
): Promise<Record<string, unknown>[]> {
  const window = getThroughMonthWindow(throughMonth, maxMonths);
  if (!window) return [];
  const rows = await prisma.$queryRaw<Array<{ item: unknown; miProgram: unknown }>>`
    WITH logs AS (
      SELECT
        l."errorDetails"->'response'->'Items' AS items,
        UPPER(COALESCE(l."errorDetails"->>'miProgram','')) AS mi_program
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) IN ('SLGLTRANS')
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    ),
    ledger_rows AS (
      SELECT x.value AS item, mi_program
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    )
    SELECT item, mi_program AS "miProgram"
    FROM ledger_rows
  `;
  const parsedRows = rows
    .map((row) => {
      if (!row?.item || typeof row.item !== 'object' || Array.isArray(row.item)) return null;
      return {
        ...(row.item as Record<string, unknown>),
        __miProgram: String(row.miProgram || '').trim().toUpperCase(),
      } as Record<string, unknown>;
    })
    .filter((row): row is Record<string, unknown> => !!row);
  const filteredRows = parsedRows.filter((row) => {
    const monthKey = extractMonthKeyFromLedgerRow(row);
    if (!monthKey) return false;
    return monthKey >= `${window.earliestDate.getUTCFullYear()}-${String(window.earliestDate.getUTCMonth() + 1).padStart(2, '0')}` && monthKey <= throughMonth;
  });
  const deduped = new Map<string, Record<string, unknown>>();
  for (const row of filteredRows) {
    const rowPointer = String(row.RowPointer || row.rowPointer || '').trim().toLowerCase();
    if (rowPointer) {
      if (!deduped.has(`ptr:${rowPointer}`)) deduped.set(`ptr:${rowPointer}`, row);
      continue;
    }
    // Fallback to full-row signature only when RowPointer is absent to avoid
    // collapsing distinct ledger lines that share coarse business keys.
    const fullSignature = JSON.stringify(row);
    if (!deduped.has(`json:${fullSignature}`)) {
      deduped.set(`json:${fullSignature}`, row);
    }
  }
  if (deduped.size > 0) {
    return Array.from(deduped.values());
  }
  // Defensive fallback (should be unreachable with non-empty parsedRows).
  for (const row of filteredRows) {
    const keyParts = [
      String(row.RowPointer || row.rowPointer || '').trim(),
      String(row.Acct || row.account || '').trim(),
      String(row.ControlYear || row.controlYear || '').trim(),
      String(row.ControlPeriod || row.controlPeriod || '').trim(),
      String(row.TransNum || row.transNum || '').trim(),
      String(row.Voucher || row.voucher || '').trim(),
      String(row.VouchSeq || row.vouchSeq || '').trim(),
      String(row.DomAmount || row.domAmount || '').trim(),
      String(row.Ref || row.reference || '').trim(),
      String(row.RecordDate || row.recordDate || '').trim(),
      String(row.TransDate || row.transDate || '').trim(),
    ];
    const key = keyParts.join('|').toLowerCase();
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

async function loadHistoricalCsiLedgerFacts(
  companyId: string,
  throughMonth: string,
  maxMonths: number,
): Promise<Record<string, unknown>[]> {
  const window = getThroughMonthWindow(throughMonth, maxMonths);
  if (!window) return [];
  const endExclusive = new Date(Date.UTC(window.throughDate.getUTCFullYear(), window.throughDate.getUTCMonth() + 1, 1));
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      transDate: Date;
      accountId: string;
      accountName: string | null;
      signedAmount: number;
      debitAmount: number | null;
      creditAmount: number | null;
      sourceProgram: string | null;
      drCr: string | null;
      transNum: string | null;
      ref: string | null;
      description: string | null;
    }>
  >`
    SELECT
      id,
      "transDate",
      "accountId",
      "accountName",
      "signedAmount",
      "debitAmount",
      "creditAmount",
      "sourceProgram",
      "drCr",
      "transNum",
      ref,
      description
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
      AND "transDate" >= ${window.earliestDate}
      AND "transDate" < ${endExclusive}
    ORDER BY "transDate" ASC
  `;

  return (Array.isArray(rows) ? rows : []).map((row: any) => {
    const d = row?.transDate ? new Date(row.transDate) : null;
    const controlYear = d && !Number.isNaN(d.getTime()) ? d.getUTCFullYear() : null;
    const controlPeriod = d && !Number.isNaN(d.getTime()) ? d.getUTCMonth() + 1 : null;
    return {
      RowPointer: String(row?.id || ''),
      TransDate: d ? d.toISOString() : null,
      ControlYear: controlYear,
      ControlPeriod: controlPeriod,
      Acct: String(row?.accountId || ''),
      Description: String(row?.accountName || row?.description || ''),
      SignedAmount: Number(row?.signedAmount || 0),
      DomAmount: Number(row?.signedAmount || 0),
      Debit: Number(row?.debitAmount || 0),
      Credit: Number(row?.creditAmount || 0),
      DrCr: String(row?.drCr || ''),
      TransNum: String(row?.transNum || ''),
      Ref: String(row?.ref || ''),
      __miProgram: String(row?.sourceProgram || 'GLTRANSACTIONFACT').trim().toUpperCase(),
    } as Record<string, unknown>;
  });
}

type MonthCoverageSummary = {
  minMonth: string | null;
  maxMonth: string | null;
  distinctMonths: number;
  totalRows: number;
  months: string[];
  missingMonths: string[];
};

function toYearMonth(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const yyyymm = raw.match(/^(\d{4})-(\d{2})/);
  if (yyyymm) return `${yyyymm[1]}-${yyyymm[2]}`;
  const compact = raw.match(/^(\d{4})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildMonthRange(startMonth: string, endMonth: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) return [];
  const [startYear, startMon] = startMonth.split('-').map(Number);
  const [endYear, endMon] = endMonth.split('-').map(Number);
  const start = new Date(Date.UTC(startYear, startMon - 1, 1));
  const end = new Date(Date.UTC(endYear, endMon - 1, 1));
  if (start > end) return [];
  const months: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function extractMonthKeyFromLedgerRow(row: Record<string, unknown>): string | null {
  const year = Number(String(row.ControlYear || row.controlYear || '').trim());
  const period = Number(String(row.ControlPeriod || row.controlPeriod || '').trim());
  if (Number.isFinite(year) && Number.isFinite(period) && year >= 1900 && period >= 1 && period <= 12) {
    return `${Math.trunc(year)}-${String(Math.trunc(period)).padStart(2, '0')}`;
  }
  const periodToken = toYearMonth(row.ControlPeriod || row.controlPeriod || row.FiscalPeriod || row.fiscalPeriod);
  if (periodToken) return periodToken;
  return (
    toYearMonth(row.TransDate || row.transDate) ||
    toYearMonth(row.RecordDate || row.recordDate) ||
    toYearMonth(row.Date || row.date)
  );
}

function summarizeMonthCounts(monthCounts: Map<string, number>): MonthCoverageSummary {
  const months = Array.from(monthCounts.keys())
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
    .sort();
  const totalRows = Array.from(monthCounts.values()).reduce((sum, n) => sum + Number(n || 0), 0);
  const minMonth = months.length > 0 ? months[0] : null;
  const maxMonth = months.length > 0 ? months[months.length - 1] : null;
  const expected = minMonth && maxMonth ? buildMonthRange(minMonth, maxMonth) : [];
  const missingMonths = expected.filter((m) => !monthCounts.has(m));
  return {
    minMonth,
    maxMonth,
    distinctMonths: months.length,
    totalRows,
    months,
    missingMonths,
  };
}

function summarizeLedgerCoverage(rows: Record<string, unknown>[]): MonthCoverageSummary {
  const monthCounts = new Map<string, number>();
  for (const row of rows) {
    const key = extractMonthKeyFromLedgerRow(row);
    if (!key) continue;
    monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
  }
  return summarizeMonthCounts(monthCounts);
}

function summarizeMonthlyRowsCoverage(rows: Array<Record<string, unknown>>): MonthCoverageSummary {
  const monthCounts = new Map<string, number>();
  for (const row of rows) {
    const key = toYearMonth(row.monthDate || row.month || row.date);
    if (!key) continue;
    monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
  }
  return summarizeMonthCounts(monthCounts);
}

function hasDetailedSectorBreakdownsForMonth(
  payload: Record<string, unknown> | null,
  targetMonth: string | null,
): boolean {
  if (!payload || !targetMonth) return false;
  const rows = Array.isArray(payload.monthlyData) ? (payload.monthlyData as Array<Record<string, unknown>>) : [];
  const row = rows.find((entry) => toYearMonth(entry.monthDate || entry.month || entry.date) === targetMonth);
  if (!row) return false;

  const revenueBreakdown =
    row.revenueBreakdown && typeof row.revenueBreakdown === 'object' && !Array.isArray(row.revenueBreakdown)
      ? (row.revenueBreakdown as Record<string, unknown>)
      : {};
  const cogsBreakdown =
    row.cogsBreakdown && typeof row.cogsBreakdown === 'object' && !Array.isArray(row.cogsBreakdown)
      ? (row.cogsBreakdown as Record<string, unknown>)
      : {};

  const hasDetailedRevenue = Object.entries(revenueBreakdown).some(
    ([key, value]) => key.startsWith('rev_') && key !== 'rev_other_revenue' && Number(value || 0) !== 0,
  );
  const hasDetailedCogs = Object.entries(cogsBreakdown).some(
    ([key, value]) => key.startsWith('cogs_') && key !== 'cogs_other_cogs' && Number(value || 0) !== 0,
  );
  return hasDetailedRevenue || hasDetailedCogs;
}

function extractCsiLedgerRowsFromGlResponses(glResponses: unknown[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const entry of glResponses) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const wrapper = entry as Record<string, unknown>;
    const program = String(wrapper.miProgram || wrapper.program || '').trim().toUpperCase();
    if (!CSI_LEDGER_PROGRAMS.has(program)) continue;
    const response =
      wrapper.response && typeof wrapper.response === 'object' && !Array.isArray(wrapper.response)
        ? (wrapper.response as Record<string, unknown>)
        : null;
    const items = Array.isArray(response?.Items) ? response!.Items : [];
    for (const item of items) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        rows.push(item as Record<string, unknown>);
      }
    }
  }
  return rows;
}

function getTargetFamily(value: unknown): 'revenue' | 'cogs' | 'expense' | 'other' {
  const target = String(value || '').trim().toLowerCase();
  if (!target || target === 'unmapped' || target === 'ignored') return 'other';
  if (target === 'revenue' || target.startsWith('rev_')) return 'revenue';
  if (target === 'cogstotal' || target === 'costofgoodssold' || target.startsWith('cogs')) return 'cogs';
  const expenseTargets = new Set([
    'payroll', 'ownerbasepay', 'ownersretirement', 'benefits', 'insurance', 'professionalfees',
    'subcontractors', 'rent', 'taxlicense', 'stateincometaxes', 'federalincometaxes', 'phonecomm',
    'infrastructure', 'autotravel', 'salesexpense', 'marketing', 'trainingcert', 'mealsentertainment',
    'interestexpense', 'depreciationamortization', 'otherexpense', 'operatingexpensetotal', 'expense',
  ]);
  return expenseTargets.has(target) ? 'expense' : 'other';
}

function getClassificationFamily(value: unknown): 'revenue' | 'cogs' | 'expense' | 'other' {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'other';
  const normalized = raw.startsWith('manual:') ? raw.slice('manual:'.length).trim() : raw;
  if (!normalized) return 'other';
  if (normalized === 'r' || normalized === 'income' || normalized === 'revenue') return 'revenue';
  if (
    normalized === 'c' ||
    normalized === 'cogs' ||
    normalized.includes('cost of goods') ||
    normalized.includes('cost of sales')
  ) return 'cogs';
  if (normalized === 'e' || normalized === 'expense') return 'expense';
  return 'other';
}

function summarizeMappingsForDiagnostics(
  mappings: Array<{ targetField?: string | null; accountClassification?: string | null }>,
) {
  let unmappedCount = 0;
  let sectorRevenueCount = 0;
  let sectorCogsCount = 0;
  let cogsClassCount = 0;
  let cogsClassMappedToCogsCount = 0;
  let cogsClassMappedElsewhereCount = 0;
  for (const row of mappings) {
    const target = String(row?.targetField || '').trim();
    const targetFamily = getTargetFamily(target);
    if (!target || target.toLowerCase() === 'unmapped') unmappedCount += 1;
    if (target.toLowerCase().startsWith('rev_')) sectorRevenueCount += 1;
    if (target.toLowerCase().startsWith('cogs_')) sectorCogsCount += 1;
    const classFamily = getClassificationFamily(row?.accountClassification);
    if (classFamily === 'cogs') {
      cogsClassCount += 1;
      if (targetFamily === 'cogs') cogsClassMappedToCogsCount += 1;
      else cogsClassMappedElsewhereCount += 1;
    }
  }
  return {
    totalMappings: mappings.length,
    unmappedCount,
    sectorRevenueCount,
    sectorCogsCount,
    cogsClassCount,
    cogsClassMappedToCogsCount,
    cogsClassMappedElsewhereCount,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyId = body?.companyId;
    const targetMonth = normalizeTargetMonth(body?.targetMonth);
    const mode = normalizeFinancialImportMode(body?.mode);
    const useHistoricalSlLedgersRequested = body?.useHistoricalSlLedgers === true;
    const persistRebuiltPayload = body?.persistRebuiltPayload === true;

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID required' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { id: String(companyId) },
      select: { accountingSystem: true },
    });

    const configuredPlatformRaw = String(company?.accountingSystem || '');
    const configuredPlatform = normalizeConfiguredPlatform(configuredPlatformRaw);

    if (!configuredPlatform) {
      return NextResponse.json(
        { error: 'Accounting system is not configured for this company profile.' },
        { status: 400 },
      );
    }

    if (configuredPlatform === 'CSV_FILE') {
      return NextResponse.json(
        { error: 'CSV workflows should use Process & Save Monthly Data, not API reprocess.' },
        { status: 400 },
      );
    }

    // Xero adapter is implemented today; other platforms can be added behind this unified endpoint.
    if (configuredPlatform === 'XERO') {
      const origin = new URL(request.url).origin;
      const xeroResponse = await fetch(`${origin}/api/xero/reprocess-mappings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: request.headers.get('cookie') || '',
        },
        body: JSON.stringify({ companyId, targetMonth, mode }),
        cache: 'no-store',
      });
      const payload = await xeroResponse.json().catch(() => ({}));
      return NextResponse.json(payload, { status: xeroResponse.status });
    }

    if (configuredPlatform === 'QUICKBOOKS') {
      const latestFinancialRecord = await prisma.financialRecord.findFirst({
        where: { companyId: String(companyId) },
        orderBy: { createdAt: 'desc' },
        select: { uploadedByUserId: true },
      });

      const fallbackUser = await prisma.user.findFirst({
        where: { companyId: String(companyId) },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      const userId = latestFinancialRecord?.uploadedByUserId || fallbackUser?.id;
      if (!userId) {
        return NextResponse.json(
          { error: 'Unable to resolve a user for QuickBooks reprocess.' },
          { status: 400 },
        );
      }

      const origin = new URL(request.url).origin;
      const qboResponse = await fetch(`${origin}/api/quickbooks/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: request.headers.get('cookie') || '',
        },
        body: JSON.stringify({ companyId, userId, targetMonth, mode }),
        cache: 'no-store',
      });
      const payload = await qboResponse.json().catch(() => ({}));
      return NextResponse.json(payload, { status: qboResponse.status });
    }

    if (configuredPlatform === 'INFOR_M3' || configuredPlatform === 'INFOR_CSI') {
      const isInforCsi = configuredPlatform === 'INFOR_CSI';
      const payloadRows = await prisma.$queryRaw<Array<{ csi: unknown; m3: unknown }>>`
        SELECT
          "connectionMetadata"->'inforCsiFinancialPayload' AS csi,
          "connectionMetadata"->'inforM3FinancialPayload' AS m3
        FROM "AccountingConnection"
        WHERE "companyId" = ${String(companyId)}
          AND platform = 'INFOR_M3'
        LIMIT 1
      `;
      const payloadRow = payloadRows[0] || null;
      const payloadSource = isInforCsi
        ? payloadRow?.csi && typeof payloadRow.csi === 'object' && !Array.isArray(payloadRow.csi)
          ? (payloadRow.csi as Record<string, unknown>)
          : payloadRow?.m3 && typeof payloadRow.m3 === 'object' && !Array.isArray(payloadRow.m3)
            ? (payloadRow.m3 as Record<string, unknown>)
            : null
        : payloadRow?.m3 && typeof payloadRow.m3 === 'object' && !Array.isArray(payloadRow.m3)
          ? (payloadRow.m3 as Record<string, unknown>)
          : payloadRow?.csi && typeof payloadRow.csi === 'object' && !Array.isArray(payloadRow.csi)
            ? (payloadRow.csi as Record<string, unknown>)
            : null;
      let financialPayload =
        payloadSource && typeof payloadSource === 'object'
          ? ({ ...payloadSource } as Record<string, unknown>)
          : null;

      if (!financialPayload) {
        if (!isInforCsi) {
          return NextResponse.json(
            {
              success: false,
              error: 'No Infor M3 financial payload is available yet. Push financial payload first, then reprocess.',
            },
            { status: 400 },
          );
        }
        // CSI reprocess must be able to rebuild from historical GL transaction logs
        // even when the cached payload metadata has not been populated yet.
        financialPayload = {
          monthlyData: [],
          metadata: {
            source: 'csi_reprocess_without_cached_payload',
            generatedAt: new Date().toISOString(),
          },
        };
      }

      const payloadLooksStub = isInforCsi && looksLikeCoaOnlyPayloadStub(financialPayload);
      const useHistoricalSlLedgers =
        useHistoricalSlLedgersRequested ||
        (mode === 'only' && !!targetMonth) ||
        payloadLooksStub ||
        !hasMonthlyDataRows(financialPayload);
      const effectivePersistRebuiltPayload =
        persistRebuiltPayload ||
        payloadLooksStub ||
        !hasMonthlyDataRows(financialPayload);
      const diagnostics: Record<string, unknown> = {
        companyId: String(companyId),
        configuredPlatform,
        targetMonth: targetMonth || null,
        mode,
        useHistoricalSlLedgersRequested,
        useHistoricalSlLedgersEffective: useHistoricalSlLedgers,
        payloadLooksStub,
        effectivePersistRebuiltPayload,
      };

      const mappings = await prisma.accountMapping.findMany({
        where: { companyId: String(companyId) },
        select: {
          accountName: true,
          accountId: true,
          accountCode: true,
          accountClassification: true,
          targetField: true,
        },
      });
      const hasSectorAwareMappings = mappings.some((row) => {
        const target = String(row?.targetField || '').trim().toLowerCase();
        return target.startsWith('rev_') || target.startsWith('cogs_');
      });

      const glResponsesRaw = Array.isArray(financialPayload.glResponses) ? financialPayload.glResponses : [];
      const hasDetailedBreakdownForTargetMonth = hasDetailedSectorBreakdownsForMonth(financialPayload, targetMonth);
      const shouldSkipGlRebuildForOnlyMode =
        mode === 'only' &&
        !!targetMonth &&
        hasMonthlyDataRows(financialPayload) &&
        (!hasSectorAwareMappings || hasDetailedBreakdownForTargetMonth);
      diagnostics.glRebuildSkippedForOnlyMode = shouldSkipGlRebuildForOnlyMode;
      diagnostics.hasSectorAwareMappings = hasSectorAwareMappings;
      diagnostics.hasDetailedBreakdownForTargetMonth = hasDetailedBreakdownForTargetMonth;
      if ((glResponsesRaw.length > 0 || useHistoricalSlLedgers) && !shouldSkipGlRebuildForOnlyMode) {
        // Keep "only" mode lightweight so month-targeted reprocess calls do not
        // attempt a full 36-month CSI rebuild and exceed serverless limits.
        const rebuildMaxMonths = mode === 'only' && targetMonth ? 1 : CSI_REBUILD_MAX_MONTHS;
        const throughMonthForBuild = resolveThroughMonthForRebuild(financialPayload, targetMonth);
        diagnostics.throughMonthForBuild = throughMonthForBuild;
        diagnostics.rebuildMaxMonths = rebuildMaxMonths;
        const historicalLedgers = useHistoricalSlLedgers
          ? await loadHistoricalCsiLedgerItems(
              String(companyId),
              throughMonthForBuild,
              rebuildMaxMonths,
            )
          : [];
        const factLedgerRows =
          historicalLedgers.length === 0
            ? await loadHistoricalCsiLedgerFacts(String(companyId), throughMonthForBuild, rebuildMaxMonths)
            : [];
        const payloadLedgerRows = extractCsiLedgerRowsFromGlResponses(glResponsesRaw);
        const sourceRowsForCoverage =
          historicalLedgers.length > 0
            ? historicalLedgers
            : factLedgerRows.length > 0
              ? factLedgerRows
              : payloadLedgerRows;
        diagnostics.sourceCoverage = {
          source:
            historicalLedgers.length > 0
              ? 'historical_csi_ledger_sql'
              : factLedgerRows.length > 0
                ? 'gl_transaction_fact'
                : 'payload_csi_ledger',
          useHistoricalSlLedgers,
          ...summarizeLedgerCoverage(sourceRowsForCoverage),
        };
        const glResponsesForBuild =
          sourceRowsForCoverage.length > 0
            ? (() => {
                // Keep at most one CSI ledger response to avoid double-counting.
                const nonLedgers = glResponsesRaw.filter((entry) => {
                  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return true;
                  const row = entry as Record<string, unknown>;
                  const program = String(row.miProgram || row.program || '').trim().toUpperCase();
                  return !CSI_LEDGER_PROGRAMS.has(program);
                });
                const existingLedgers = glResponsesRaw.find((entry) => {
                  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
                  const row = entry as Record<string, unknown>;
                  const program = String(row.miProgram || row.program || '').trim().toUpperCase();
                  return CSI_LEDGER_PROGRAMS.has(program);
                });
                if (existingLedgers && typeof existingLedgers === 'object' && !Array.isArray(existingLedgers)) {
                  const row = existingLedgers as Record<string, unknown>;
                  const response =
                    row.response && typeof row.response === 'object' && !Array.isArray(row.response)
                      ? ({ ...(row.response as Record<string, unknown>), Items: sourceRowsForCoverage } as Record<string, unknown>)
                      : ({ Items: sourceRowsForCoverage } as Record<string, unknown>);
                  return [
                    ...nonLedgers,
                    {
                      ...row,
                      response,
                    },
                  ];
                }
                return [
                  ...nonLedgers,
                  {
                    module: 'GL',
                    miProgram: 'SLGLTRANS',
                    createdAt: new Date().toISOString(),
                    response: { Items: sourceRowsForCoverage },
                  },
                ];
              })()
            : glResponsesRaw;
        diagnostics.mappingCoverage = summarizeMappingsForDiagnostics(mappings);
        const built = buildCsiMonthlyDataFromGlResponses({
          glResponses: glResponsesForBuild,
          throughMonth: throughMonthForBuild,
          maxMonths: rebuildMaxMonths,
          accountMappings: mappings,
        });
        diagnostics.builtCoverage = {
          ...summarizeMonthlyRowsCoverage(built.monthlyData as Array<Record<string, unknown>>),
          buildStats: built.stats,
        };
        if (sourceRowsForCoverage.length === 0 || built.monthlyData.length === 0) {
          const isOnlyModeMissingMonth = mode === 'only' && !!targetMonth;
          return NextResponse.json(
            {
              success: false,
              error: isOnlyModeMissingMonth
                ? `No valid monthlyData rows found for targetMonth ${targetMonth}.`
                : 'Reprocess could not build monthly data from real ledger rows. Run ledger sync for this month range, then retry.',
              diagnostics,
            },
            { status: 400 },
          );
        }
        if (built.monthlyData.length > 0) {
          financialPayload = {
            ...financialPayload,
            monthlyData: built.monthlyData,
            metadata: {
              ...(financialPayload.metadata && typeof financialPayload.metadata === 'object' && !Array.isArray(financialPayload.metadata)
                ? (financialPayload.metadata as Record<string, unknown>)
                : {}),
              source: 'csi_gl_rollup_from_reprocess',
              generatedAt: new Date().toISOString(),
                throughMonth: throughMonthForBuild,
              buildStats: built.stats,
            },
          };
          if (effectivePersistRebuiltPayload) {
            const connection = await prisma.accountingConnection.findUnique({
              where: {
                companyId_platform: {
                  companyId: String(companyId),
                  platform: 'INFOR_M3',
                },
              },
              select: { connectionMetadata: true },
            });
            const metadata =
              connection?.connectionMetadata &&
              typeof connection.connectionMetadata === 'object' &&
              !Array.isArray(connection.connectionMetadata)
                ? (connection.connectionMetadata as Record<string, unknown>)
                : {};
            const payloadMetadataKeyPrimary = isInforCsi ? 'inforCsiFinancialPayload' : 'inforM3FinancialPayload';
            await prisma.accountingConnection.updateMany({
              where: {
                companyId: String(companyId),
                platform: 'INFOR_M3',
              },
              data: {
                connectionMetadata: {
                  ...metadata,
                  [payloadMetadataKeyPrimary]: financialPayload,
                } as any,
                lastSyncAt: new Date(),
              },
            });
          }
        }
      }

      const payloadForIngest =
        mode === 'only' && targetMonth
          ? (() => {
              const monthlyRows = Array.isArray(financialPayload?.monthlyData)
                ? (financialPayload.monthlyData as Array<Record<string, unknown>>).filter(
                    (row) => toYearMonth(row?.monthDate || row?.month || row?.date) === targetMonth
                  )
                : [];
              const metadata =
                financialPayload?.metadata &&
                typeof financialPayload.metadata === 'object' &&
                !Array.isArray(financialPayload.metadata)
                  ? (financialPayload.metadata as Record<string, unknown>)
                  : {};
              diagnostics.ingestPayloadTrimmed = true;
              diagnostics.ingestPayloadMonthlyRows = monthlyRows.length;
              return {
                monthlyData: monthlyRows,
                metadata: {
                  ...metadata,
                  targetMonth,
                  mode,
                  source: 'reprocess_mappings_only_mode_trimmed',
                },
              };
            })()
          : financialPayload;

      if (!(mode === 'only' && targetMonth)) {
        diagnostics.ingestPayloadTrimmed = false;
      }

      const result = await ingestFinancialPayload({
        companyId: String(companyId),
        platform: 'INFOR_M3',
        source: isInforCsi ? 'infor-csi' : 'infor-m3',
        payload: payloadForIngest,
        syncType: 'reprocess_financial_payload',
        targetMonth: targetMonth || undefined,
        mode,
      });
      const monthlyFinancialFinalizer = result.ok
        ? await syncErpDailyFinancialsFromGL({
            companyId: String(companyId),
            rebuildDailySnapshots: false,
            syncMonthly: true,
          })
        : null;
      if (monthlyFinancialFinalizer && !monthlyFinancialFinalizer.ok) {
        diagnostics.monthlyFinancialSyncWarning = monthlyFinancialFinalizer;
      }

      if (result.ok && typeof result.financialRecordId === 'string' && result.financialRecordId) {
        const persistedRows = await prisma.monthlyFinancial.findMany({
          where: { financialRecordId: result.financialRecordId },
          select: { monthDate: true, revenue: true, cogsTotal: true, expense: true },
          orderBy: { monthDate: 'asc' },
        });
        const monthCounts = new Map<string, number>();
        for (const row of persistedRows) {
          const key = toYearMonth(row.monthDate);
          if (!key) continue;
          monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
        }
        diagnostics.persistedCoverage = {
          ...summarizeMonthCounts(monthCounts),
          rowsWritten: persistedRows.length,
          latestMonthTotals: persistedRows.length > 0
            ? (() => {
                const latest = persistedRows[persistedRows.length - 1];
                return {
                  month: toYearMonth(latest.monthDate),
                  revenue: Number(latest.revenue || 0),
                  cogsTotal: Number(latest.cogsTotal || 0),
                  expense: Number(latest.expense || 0),
                };
              })()
            : null,
        };
      }

      return NextResponse.json(
        {
          success: result.ok,
          message: result.ok
            ? (isInforCsi
              ? 'Infor CSI reprocess completed successfully.'
              : 'Infor M3 reprocess completed successfully.')
            : result.error || (isInforCsi ? 'Infor CSI reprocess failed.' : 'Infor M3 reprocess failed.'),
          diagnostics,
          monthlyFinancialFinalizer,
          ...result,
        },
        { status: result.status },
      );
    }

    if (isQuickBooksDesktopFamily(configuredPlatform)) {
      const connection = await prisma.accountingConnection.findUnique({
        where: {
          companyId_platform: {
            companyId: String(companyId),
            platform: 'QUICKBOOKS',
          },
        },
        select: {
          connectionMetadata: true,
        },
      });

      const metadata =
        connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
          ? (connection.connectionMetadata as Record<string, unknown>)
          : {};
      let financialPayload =
        metadata.quickbooksDesktopFinancialPayload && typeof metadata.quickbooksDesktopFinancialPayload === 'object'
          ? (metadata.quickbooksDesktopFinancialPayload as Record<string, unknown>)
          : null;
      if (!financialPayload) {
        const { loadQuickBooksDesktopBackfillPayloads } = await import('@/lib/quickbooks-desktop/backfill-payloads');
        financialPayload = (await loadQuickBooksDesktopBackfillPayloads(String(companyId), metadata))?.financialPayload || null;
      }

      if (!financialPayload) {
        return NextResponse.json(
          {
            success: false,
            error:
              'No QuickBooks Desktop financial payload or completed backfill pages are available yet.',
          },
          { status: 400 },
        );
      }

      const result = await ingestFinancialPayload({
        companyId: String(companyId),
        platform: 'QUICKBOOKS',
        source: configuredPlatform === 'QUICKBOOKS_ENTERPRISE' ? 'quickbooks-enterprise' : 'quickbooks-desktop',
        payload: financialPayload,
        syncType: 'reprocess_financial_payload',
        targetMonth: targetMonth || undefined,
        mode,
      });

      return NextResponse.json(
        {
          success: result.ok,
          message: result.ok
            ? 'QuickBooks Desktop reprocess completed successfully.'
            : result.error || 'QuickBooks Desktop reprocess failed.',
          ...result,
        },
        { status: result.status },
      );
    }

    if (configuredPlatform === 'SAGE_INTACCT' || configuredPlatform === 'SAGE') {
      const connection = await prisma.accountingConnection.findUnique({
        where: {
          companyId_platform: {
            companyId: String(companyId),
            platform: 'SAGE_INTACCT',
          },
        },
        select: {
          connectionMetadata: true,
        },
      });

      const metadata =
        connection?.connectionMetadata && typeof connection.connectionMetadata === 'object' && !Array.isArray(connection.connectionMetadata)
          ? (connection.connectionMetadata as Record<string, unknown>)
          : {};
      const financialPayload =
        metadata.sageIntacctFinancialPayload && typeof metadata.sageIntacctFinancialPayload === 'object'
          ? (metadata.sageIntacctFinancialPayload as Record<string, unknown>)
          : null;

      if (!financialPayload) {
        return NextResponse.json(
          {
            success: false,
            error:
              'No Sage financial payload is available yet. Push financial payload first, then reprocess.',
          },
          { status: 400 },
        );
      }

      const result = await ingestFinancialPayload({
        companyId: String(companyId),
        platform: 'SAGE_INTACCT',
        source: 'sage-intacct',
        payload: financialPayload,
        syncType: 'reprocess_financial_payload',
        targetMonth: targetMonth || undefined,
        mode,
      });

      return NextResponse.json(
        {
          success: result.ok,
          message: result.ok
            ? 'Sage reprocess completed successfully.'
            : result.error || 'Sage reprocess failed.',
          ...result,
        },
        { status: result.status },
      );
    }

    return NextResponse.json(
      {
        error: `Reprocess mappings adapter not yet implemented for ${configuredPlatform}.`,
        configuredPlatform,
        configuredPlatformRaw,
      },
      { status: 501 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to reprocess mappings' },
      { status: 500 },
    );
  }
}

