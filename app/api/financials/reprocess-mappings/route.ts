import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ingestFinancialPayload } from '@/lib/financial-ingestion';
import { MONTHLY_FINANCIAL_NUMERIC_FIELDS } from '@/lib/financial-canonical';
import {
  publishMonthFromDailySnapshots,
  publishMonthsFromMonthlyFinancialDirect,
} from '@/lib/financial/publish-month-service';
import { currentMonthKeyUtc } from '@/lib/date-utils';
import { syncErpDailyFinancialsFromGL } from '@/lib/financial/sync-erp-daily-financials';
import { buildCsiMonthlyDataFromGlResponses } from '@/lib/infor-m3/csi-monthly-financial-builder';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';
import {
  BAKERS_PIN_START,
  BAKERS_WALK_START,
  buildBakersAnchoredDailyBalances,
  isBakersCompany,
  resolveBakersLocTarget,
} from '@/lib/financial/qbd-bakers-bs-pins';
import { warmDailyExecutiveBriefingCache } from '@/lib/pulse/exec-briefing-warmup';
import { warmDailyIndustryBriefCache } from '@/lib/industry-brief/warmup';
import { formatEstDate } from '@/lib/time/eastern';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const CSI_REBUILD_MAX_MONTHS = 36;
const CSI_LEDGER_PROGRAMS = new Set(['SLGLTRANS']);
const QBD_DAILY_FINANCIAL_SOURCE = 'QUICKBOOKS_DESKTOP_REPROCESS';

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

async function hasQuickBooksDesktopBackfillPages(companyId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "QuickBooksDesktopBackfillPage"
    WHERE "companyId" = ${companyId}
      AND "requestName" IN (
        'AccountQuery',
        'BalanceSheetStandardReportQuery',
        'TrialBalanceReportQuery',
        'GeneralDetailReportQuery',
        'InvoiceQuery',
        'BillQuery',
        'ReceivePaymentQuery',
        'BillPaymentCheckQuery',
        'BillPaymentCreditCardQuery'
      )
  `;
  return Number(rows[0]?.count || 0) > 0;
}

async function hasQuickBooksDesktopConnectionMetadata(companyId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "AccountingConnection"
    WHERE "companyId" = ${companyId}
      AND platform = 'QUICKBOOKS'
      AND (
        "connectionMetadata" ? 'quickbooksDesktopSettings'
        OR "connectionMetadata" ? 'quickbooksDesktopCredentials'
        OR "connectionMetadata" ? 'quickbooksDesktopBackfillJobs'
        OR "connectionMetadata" ? 'quickbooksDesktopFinancialPayload'
      )
  `;
  return Number(rows[0]?.count || 0) > 0;
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

type QbdMappedMonthlyRow = Record<string, unknown> & {
  monthDate: string;
  revenue: number;
  cogsTotal: number;
  expense: number;
  revenueBreakdown: Record<string, number>;
  cogsBreakdown: Record<string, number>;
  expenseBreakdown: Record<string, number>;
};

const QBD_EXPENSE_TARGET_FIELDS = new Set([
  'payroll',
  'ownerBasePay',
  'benefits',
  'insurance',
  'professionalFees',
  'subcontractors',
  'rent',
  'taxLicense',
  'stateIncomeTaxes',
  'federalIncomeTaxes',
  'phoneComm',
  'infrastructure',
  'autoTravel',
  'salesExpense',
  'marketing',
  'trainingCert',
  'mealsEntertainment',
  'interestExpense',
  'depreciationAmortization',
  'otherExpense',
  'nonOperatingExpense',
]);

const QBD_COGS_TARGET_FIELDS = new Set([
  'cogsPayroll',
  'cogsOwnerPay',
  'cogsContractors',
  'cogsMaterials',
  'cogsCommissions',
  'cogsOther',
]);

const QBD_BALANCE_SHEET_TARGET_FIELDS = new Set([
  'cash',
  'ar',
  'retainageReceivables',
  'contractAssets',
  'inventory',
  'otherCA',
  'fixedAssets',
  'constructionEquipment',
  'officeEquipment',
  'shopEquipment',
  'investments',
  'rightOfUseLeases',
  'otherAssets',
  'ap',
  'loc',
  'contractLiabilities',
  'otherCL',
  'ltd',
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
  'totalEquity',
  'totalAssets',
  'totalLiab',
  'totalLAndE',
]);

const QBD_MONTHLY_BS_PRESERVE_FIELDS = [
  'cash',
  'ar',
  'retainageReceivables',
  'contractAssets',
  'inventory',
  'otherCA',
  'tca',
  'fixedAssets',
  'constructionEquipment',
  'officeEquipment',
  'shopEquipment',
  'investments',
  'rightOfUseLeases',
  'otherAssets',
  'totalAssets',
  'ap',
  'loc',
  'contractLiabilities',
  'otherCL',
  'tcl',
  'ltd',
  'totalLiab',
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
  'totalEquity',
  'totalLAndE',
] as const;

const QBD_DAILY_PNL_UPDATE_FIELDS = MONTHLY_FINANCIAL_NUMERIC_FIELDS.filter(
  (field) => !(QBD_MONTHLY_BS_PRESERVE_FIELDS as readonly string[]).includes(field),
);

const QBD_PNL_REBUILD_REQUESTS = new Set([
  'InvoiceQuery',
  'BillQuery',
  'CheckQuery',
  'CreditMemoQuery',
  'SalesReceiptQuery',
  'JournalEntryQuery',
  'DepositQuery',
  'VendorCreditQuery',
  'GeneralDetailReportQuery',
]);

const QBD_BALANCE_SHEET_REBUILD_REQUESTS = new Set([
  'BalanceSheetStandardReportQuery',
  'GeneralDetailReportQuery',
  'AccountQuery',
  'JournalEntryQuery',
  'DepositQuery',
  'CheckQuery',
  'BillPaymentCheckQuery',
  'BillPaymentCreditCardQuery',
]);

const QBD_FINANCIAL_REBUILD_REQUESTS = new Set([
  ...Array.from(QBD_PNL_REBUILD_REQUESTS),
  ...Array.from(QBD_BALANCE_SHEET_REBUILD_REQUESTS),
]);

const QBD_BALANCE_SHEET_ANCHOR_FIELDS = [
  'cash',
  'ar',
  'retainageReceivables',
  'contractAssets',
  'inventory',
  'otherCA',
  'fixedAssets',
  'constructionEquipment',
  'officeEquipment',
  'shopEquipment',
  'investments',
  'rightOfUseLeases',
  'otherAssets',
  'ap',
  'loc',
  'contractLiabilities',
  'otherCL',
  'ltd',
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
] as const;

function qbdAsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function qbdAsArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(qbdAsRecord).filter((row) => Object.keys(row).length > 0) : [];
}

function qbdString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return '';
}

function qbdNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').replace(/\(([^)]+)\)/, '-$1').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function qbdLookupKey(value: unknown): string {
  return qbdString(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function qbdAccountLookupKeys(value: unknown): string[] {
  const raw = qbdString(value);
  if (!raw) return [];
  const keys = new Set<string>();
  const add = (candidate: unknown) => {
    const key = qbdLookupKey(candidate);
    if (key) keys.add(key);
  };
  add(raw);

  // Balance Sheet report labels often include account numbers while stored
  // mappings may carry only the account name, or vice versa.
  const leadingCode = raw.match(/^\s*([0-9][0-9.\-]*)\s+(.+)$/);
  if (leadingCode) {
    add(leadingCode[1]);
    add(leadingCode[2]);
  }
  const parenCode = raw.match(/^(.+?)\s+\(([0-9][0-9.\-]*)\)\s*$/);
  if (parenCode) {
    add(parenCode[1]);
    add(parenCode[2]);
  }
  const colonParts = raw.split(':').map((part) => part.trim()).filter(Boolean);
  if (colonParts.length > 1) {
    add(colonParts[colonParts.length - 1]);
  }

  return Array.from(keys);
}

function qbdReportAmount(record: Record<string, unknown>): number {
  const colData = Array.isArray(record.colData) ? record.colData.map(qbdAsRecord) : [];
  const normalize = (value: string) => qbdString(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  const titledColumn = colData.find((col) => {
    const title = normalize(qbdString(col.colTitle));
    return title === 'amount' || title === 'balance' || title === 'total';
  });
  if (titledColumn) return qbdNumber(titledColumn.value);
  const amountColumn = colData.find((col) => qbdString(col.colID) === '2') || colData[colData.length - 1];
  return qbdNumber(amountColumn?.value);
}

function qbdReportColValue(record: Record<string, unknown>, colID: string): string {
  const colData = Array.isArray(record.colData) ? record.colData.map(qbdAsRecord) : [];
  const column = colData.find((col) => qbdString(col.colID) === colID);
  return qbdString(column?.value);
}

function qbdReportColValueByTitle(
  record: Record<string, unknown>,
  titleCandidates: string[],
  fallbackColIDs: string[] = [],
): string {
  const normalize = (value: string) => qbdString(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  const candidates = new Set(titleCandidates.map(normalize).filter(Boolean));
  const colData = Array.isArray(record.colData) ? record.colData.map(qbdAsRecord) : [];
  const titledColumn = colData.find((col) => candidates.has(normalize(qbdString(col.colTitle))));
  if (titledColumn) return qbdString(titledColumn.value);
  for (const colID of fallbackColIDs) {
    const value = qbdReportColValue(record, colID);
    if (value) return value;
  }
  return '';
}

function qbdReportAccountName(record: Record<string, unknown>): string {
  return qbdString(record.accountName || record.rowValue || record.label) ||
    qbdReportColValueByTitle(record, ['Account', 'Name'], ['1', '0']) ||
    qbdReportColValue(record, '1');
}

function qbdGeneralLedgerPnlAmount(targetField: string, rawAmount: number): number {
  if (targetField === 'revenue' || targetField.startsWith('rev_') || targetField === 'nonOperatingIncome') {
    return rawAmount * -1;
  }
  return rawAmount;
}

function qbdBalanceSheetReportDateKey(records: Record<string, unknown>[]): string | null {
  for (const record of records) {
    const subtitle = qbdString(record.reportSubtitle);
    const match = /^As of\s+(.+)$/i.exec(subtitle);
    if (!match) continue;
    const parsed = new Date(`${match[1]} UTC`);
    if (Number.isNaN(parsed.getTime())) continue;
    return qbdDateKey(parsed.toISOString());
  }
  return null;
}

function qbdAddDays(dateKey: string, days: number): string | null {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return qbdDateKey(date.toISOString());
}

function copyQbdBalanceSheetFields(source: QbdMappedMonthlyRow, target: QbdMappedMonthlyRow) {
  for (const field of QBD_BALANCE_SHEET_TARGET_FIELDS) {
    const value = Number(source[field] || 0);
    target[field] = value;
  }
  recomputeQbdBalanceSheetTotals(target);
}

function qbdRef(record: Record<string, unknown>, key: string): { id: string; name: string } {
  const ref = qbdAsRecord(record[key]);
  return {
    id: qbdString(ref.ListID),
    name: qbdString(ref.FullName || ref.Name),
  };
}

type QbdMappedAccount = {
  accountId: string;
  accountName: string;
  accountCode: string;
  targetField: string;
};

function qbdMonthKey(value: unknown): string | null {
  const raw = qbdString(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}

function qbdDateKey(value: unknown): string | null {
  const raw = qbdString(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
}

function qbdReadNestedNumber(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = qbdNumber(record[key]);
    if (value !== 0) return value;
  }
  return 0;
}

function qbdBalanceForAccount(account: Record<string, unknown>, accountHasChildren: boolean): number {
  const balance = qbdNumber(account.Balance);
  if (balance !== 0) return balance;
  return accountHasChildren ? 0 : qbdNumber(account.TotalBalance);
}

function recomputeQbdBalanceSheetTotals(row: QbdMappedMonthlyRow) {
  const number = (field: string) => Number(row[field] || 0);
  const tca =
    number('cash') +
    number('ar') +
    number('retainageReceivables') +
    number('contractAssets') +
    number('inventory') +
    number('otherCA');
  const fixedAssetComponents =
    number('constructionEquipment') +
    number('officeEquipment') +
    number('shopEquipment');
  const fixedAssets = number('fixedAssets') || fixedAssetComponents;
  const totalAssets =
    tca +
    fixedAssets +
    number('investments') +
    number('rightOfUseLeases') +
    number('otherAssets');
  const currentLiabilityComponents =
    number('ap') +
    number('loc') +
    number('contractLiabilities') +
    number('otherCL');
  const tcl = currentLiabilityComponents;
  const totalLiab = tcl + number('ltd');
  const totalEquity =
    number('ownersCapital') +
    number('ownersDraw') +
    number('commonStock') +
    number('preferredStock') +
    number('retainedEarnings') +
    number('additionalPaidInCapital') +
    number('treasuryStock');

  row.tca = tca;
  if (fixedAssets !== 0 && number('fixedAssets') === 0) row.fixedAssets = fixedAssets;
  row.totalAssets = totalAssets;
  row.tcl = tcl;
  row.totalLiab = totalLiab;
  row.totalEquity = totalEquity;
  row.totalLAndE = totalLiab + totalEquity;
}

function createQbdMappedMonth(monthKey: string): QbdMappedMonthlyRow {
  return {
    monthDate: `${monthKey}-01`,
    revenue: 0,
    cogsTotal: 0,
    expense: 0,
    revenueBreakdown: {},
    cogsBreakdown: {},
    expenseBreakdown: {},
  };
}

function createQbdMappedDailySnapshot(dateKey: string): QbdMappedMonthlyRow {
  return {
    ...createQbdMappedMonth(dateKey.slice(0, 7)),
    snapshotDate: dateKey,
    frequency: 'daily',
    sourcePlatform: QBD_DAILY_FINANCIAL_SOURCE,
  };
}

function qbdAddMappedAmount(row: QbdMappedMonthlyRow, targetField: string, amount: number) {
  if (!targetField || targetField === 'unmapped' || amount === 0) return;
  if (targetField === 'nonOperatingIncome') {
    row.nonOperatingIncome = Number(row.nonOperatingIncome || 0) + amount;
    return;
  }
  if (targetField === 'revenue' || targetField.startsWith('rev_')) {
    row.revenue += amount;
    if (targetField.startsWith('rev_')) {
      row.revenueBreakdown[targetField] = Number(row.revenueBreakdown[targetField] || 0) + amount;
    }
    return;
  }
  if (targetField === 'cogsTotal' || targetField === 'costOfGoodsSold' || targetField.startsWith('cogs')) {
    row.cogsTotal += amount;
    const key = targetField.startsWith('cogs_') ? targetField : 'cogs_other';
    row.cogsBreakdown[key] = Number(row.cogsBreakdown[key] || 0) + amount;
    if (QBD_COGS_TARGET_FIELDS.has(targetField) && targetField !== 'cogsTotal') {
      row[targetField] = Number(row[targetField] || 0) + amount;
    }
    return;
  }
  if (QBD_EXPENSE_TARGET_FIELDS.has(targetField)) {
    row.expense += amount;
    row[targetField] = Number(row[targetField] || 0) + amount;
    row.expenseBreakdown[targetField] = Number(row.expenseBreakdown[targetField] || 0) + amount;
  }
}

function qbdIsIncomeStatementExpenseTarget(targetField: string): boolean {
  return (
    targetField === 'revenue' ||
    targetField.startsWith('rev_') ||
    targetField === 'cogsTotal' ||
    targetField === 'costOfGoodsSold' ||
    targetField.startsWith('cogs') ||
    targetField === 'nonOperatingIncome' ||
    QBD_EXPENSE_TARGET_FIELDS.has(targetField)
  );
}

function qbdResetPnl(row: QbdMappedMonthlyRow) {
  row.revenue = 0;
  row.revenueBreakdown = {};
  row.expense = 0;
  row.cogsTotal = 0;
  row.cogsBreakdown = {};
  row.expenseBreakdown = {};
  for (const field of QBD_COGS_TARGET_FIELDS) {
    row[field] = 0;
  }
  for (const field of QBD_EXPENSE_TARGET_FIELDS) {
    row[field] = 0;
  }
}

function qbdCopyPnl(source: QbdMappedMonthlyRow, target: QbdMappedMonthlyRow) {
  qbdResetPnl(target);
  target.revenue = Number(source.revenue || 0);
  target.revenueBreakdown = { ...(source.revenueBreakdown || {}) };
  target.expense = Number(source.expense || 0);
  target.cogsTotal = Number(source.cogsTotal || 0);
  target.cogsBreakdown = { ...(source.cogsBreakdown || {}) };
  target.expenseBreakdown = { ...(source.expenseBreakdown || {}) };
  for (const field of QBD_COGS_TARGET_FIELDS) {
    target[field] = Number(source[field] || 0);
  }
  for (const field of QBD_EXPENSE_TARGET_FIELDS) {
    target[field] = Number(source[field] || 0);
  }
}

function qbdApplyBalance(row: QbdMappedMonthlyRow, targetField: string, balance: number) {
  if (!QBD_BALANCE_SHEET_TARGET_FIELDS.has(targetField) || balance === 0) return;
  row[targetField] = Number(row[targetField] || 0) + balance;
}

function getQuickBooksDesktopDomainScope(metadata: Record<string, unknown>) {
  const requestNames = new Set<string>();
  const configuredRequestNames = Array.isArray(metadata.quickbooksDesktopBackfillRequestNames)
    ? metadata.quickbooksDesktopBackfillRequestNames
    : [];
  for (const requestName of configuredRequestNames) {
    const normalized = qbdString(requestName);
    if (normalized) requestNames.add(normalized);
  }

  const jobs = metadata.quickbooksDesktopBackfillJobs && typeof metadata.quickbooksDesktopBackfillJobs === 'object' && !Array.isArray(metadata.quickbooksDesktopBackfillJobs)
    ? (metadata.quickbooksDesktopBackfillJobs as Record<string, Record<string, unknown>>)
    : {};
  for (const job of Object.values(jobs)) {
    const normalized = qbdString(job?.requestName);
    if (normalized) requestNames.add(normalized);
  }

  const hasExplicitScope = requestNames.size > 0;
  const requestNameList = Array.from(requestNames).sort();
  const canUpdatePnl = !hasExplicitScope || requestNameList.some((requestName) => QBD_PNL_REBUILD_REQUESTS.has(requestName));
  const canUpdateBalanceSheet = !hasExplicitScope || requestNameList.some((requestName) => QBD_BALANCE_SHEET_REBUILD_REQUESTS.has(requestName));
  const canUpdateFinancials = !hasExplicitScope || requestNameList.some((requestName) => QBD_FINANCIAL_REBUILD_REQUESTS.has(requestName));

  return {
    hasExplicitScope,
    requestNames: requestNameList,
    canUpdatePnl,
    canUpdateBalanceSheet,
    canUpdateFinancials,
  };
}

async function loadQbdPageRecords(companyId: string, requestName: string, detailOnly = false, allBatches = false): Promise<Record<string, unknown>[]> {
  const rows = allBatches
    ? await prisma.$queryRaw<Array<{ payload: unknown }>>`
      SELECT p."payload"
      FROM "QuickBooksDesktopBackfillPage" p
      WHERE p."companyId" = ${companyId}
        AND p."requestName" = ${requestName}
        AND (${detailOnly}::boolean = (p."jobId" LIKE '%:detail:%'))
      ORDER BY p."createdAt" ASC, p."jobId" ASC, p."pageNumber" ASC
    `
    : await prisma.$queryRaw<Array<{ payload: unknown }>>`
      WITH latest_batch AS (
        SELECT "batchId"
        FROM "QuickBooksDesktopBackfillPage"
        WHERE "companyId" = ${companyId}
          AND "requestName" = ${requestName}
          AND (${detailOnly}::boolean = ("jobId" LIKE '%:detail:%'))
        ORDER BY "createdAt" DESC
        LIMIT 1
      )
      SELECT p."payload"
      FROM "QuickBooksDesktopBackfillPage" p
      JOIN latest_batch lb ON lb."batchId" = p."batchId"
      WHERE p."companyId" = ${companyId}
        AND p."requestName" = ${requestName}
        AND (${detailOnly}::boolean = (p."jobId" LIKE '%:detail:%'))
      ORDER BY p."jobId", p."pageNumber" ASC
    `;
  return rows.flatMap((row) => (Array.isArray(row.payload) ? row.payload.map(qbdAsRecord) : []));
}

async function loadQbdPageRecordsForBatch(params: {
  companyId: string;
  requestName: string;
  batchId: string;
  detailOnly?: boolean;
}): Promise<Record<string, unknown>[]> {
  const detailOnly = Boolean(params.detailOnly);
  const rows = await prisma.$queryRaw<Array<{ payload: unknown }>>`
    SELECT p."payload"
    FROM "QuickBooksDesktopBackfillPage" p
    WHERE p."companyId" = ${params.companyId}
      AND p."requestName" = ${params.requestName}
      AND p."batchId" = ${params.batchId}
      AND (${detailOnly}::boolean = (p."jobId" LIKE '%:detail:%'))
    ORDER BY p."jobId" ASC, p."pageNumber" ASC
  `;
  return rows.flatMap((row) => (Array.isArray(row.payload) ? row.payload.map(qbdAsRecord) : []));
}

async function loadQbdLatestBatchId(params: {
  companyId: string;
  requestName: string;
  detailOnly?: boolean;
}): Promise<string | null> {
  const detailOnly = Boolean(params.detailOnly);
  const rows = await prisma.$queryRaw<Array<{ batchId: string }>>`
    SELECT "batchId"
    FROM "QuickBooksDesktopBackfillPage"
    WHERE "companyId" = ${params.companyId}
      AND "requestName" = ${params.requestName}
      AND (${detailOnly}::boolean = ("jobId" LIKE '%:detail:%'))
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;
  const batchId = qbdString(rows[0]?.batchId);
  return batchId || null;
}

async function loadQbdLatestBaselineBatchId(params: {
  companyId: string;
  requestName: string;
  minPages?: number;
  detailOnly?: boolean;
}): Promise<string | null> {
  const minPages = Math.max(1, Number(params.minPages || 10));
  const detailOnly = Boolean(params.detailOnly);
  const rows = await prisma.$queryRaw<Array<{ batchId: string }>>`
    WITH batches AS (
      SELECT
        "batchId",
        COUNT(*)::int AS pages,
        MAX("createdAt") AS last_seen
      FROM "QuickBooksDesktopBackfillPage"
      WHERE "companyId" = ${params.companyId}
        AND "requestName" = ${params.requestName}
        AND (${detailOnly}::boolean = ("jobId" LIKE '%:detail:%'))
      GROUP BY "batchId"
    )
    SELECT "batchId"
    FROM batches
    WHERE pages >= ${minPages}
    ORDER BY last_seen DESC
    LIMIT 1
  `;
  const batchId = qbdString(rows[0]?.batchId);
  return batchId || null;
}

function qbdReportTxnDateKey(row: Record<string, unknown>): string {
  return qbdDateKey(qbdReportColValueByTitle(row, ['Txn Date', 'Date'], ['3']));
}

function qbdMaxTxnDateKey(rows: Array<Record<string, unknown>>): string {
  let maxKey = '';
  for (const row of rows) {
    if (qbdString(row.rowKind) !== 'DataRow') continue;
    const dateKey = qbdReportTxnDateKey(row);
    if (dateKey && dateKey > maxKey) maxKey = dateKey;
  }
  return maxKey;
}

async function loadQbdOverlaidGlRowsAfterDate(params: {
  companyId: string;
  afterTxnDateKey: string;
  excludeBatchId?: string;
  recentBatchLimit?: number;
}): Promise<Record<string, unknown>[]> {
  const companyId = String(params.companyId || '').trim();
  const afterTxnDateKey = String(params.afterTxnDateKey || '').trim();
  const excludeBatchId = qbdString(params.excludeBatchId);
  const recentBatchLimit = Math.max(5, Math.min(60, Math.floor(Number(params.recentBatchLimit || 40))));
  if (!companyId || !/^\d{4}-\d{2}-\d{2}$/.test(afterTxnDateKey)) return [];

  const coverage = await prisma.$queryRaw<
    Array<{
      batchId: string | null;
      lastSeen: Date | null;
    }>
  >`
    WITH recent_batches AS (
      SELECT "batchId", MAX("createdAt") AS "lastSeen"
      FROM "QuickBooksDesktopBackfillPage"
      WHERE "companyId" = ${companyId}
        AND "requestName" = 'GeneralDetailReportQuery'
      GROUP BY "batchId"
      ORDER BY "lastSeen" DESC
      LIMIT ${recentBatchLimit}
    ),
    batch_rows AS (
      SELECT
        p."batchId" AS "batchId",
        p."createdAt" AS "createdAt"
      FROM "QuickBooksDesktopBackfillPage" p
      JOIN recent_batches rb ON rb."batchId" = p."batchId"
      CROSS JOIN LATERAL jsonb_array_elements(p."payload"::jsonb) AS row
      CROSS JOIN LATERAL jsonb_array_elements(row->'colData') AS col
      WHERE p."companyId" = ${companyId}
        AND p."requestName" = 'GeneralDetailReportQuery'
        AND row->>'rowKind' = 'DataRow'
        AND col->>'colID' = '3'
        AND col->>'value' > ${afterTxnDateKey}
    )
    SELECT
      "batchId",
      MAX("createdAt") AS "lastSeen"
    FROM batch_rows
    GROUP BY "batchId"
    ORDER BY MAX("createdAt") ASC
  `;

  const batches = coverage
    .map((row) => {
      const batchId = qbdString(row.batchId);
      if (!batchId || !row.lastSeen || batchId === excludeBatchId) return null;
      return { batchId, lastSeen: row.lastSeen };
    })
    .filter((row): row is { batchId: string; lastSeen: Date } => row !== null)
    .sort((a, b) => a.lastSeen.getTime() - b.lastSeen.getTime());

  const rowsByDate = new Map<string, Record<string, unknown>[]>();
  for (const batch of batches) {
    const batchRows = await loadQbdPageRecordsForBatch({
      companyId,
      requestName: 'GeneralDetailReportQuery',
      batchId: batch.batchId,
    });
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const row of batchRows) {
      if (qbdString(row.rowKind) !== 'DataRow') continue;
      const dateKey = qbdReportTxnDateKey(row);
      if (!dateKey || dateKey <= afterTxnDateKey) continue;
      const list = grouped.get(dateKey) || [];
      list.push(row);
      grouped.set(dateKey, list);
    }
    for (const [dateKey, rows] of grouped) {
      rowsByDate.set(dateKey, rows);
    }
  }

  return [...rowsByDate.keys()].sort().flatMap((dateKey) => rowsByDate.get(dateKey) || []);
}

async function loadQbdGeneralLedgerRowsForMonthlyBuild(companyId: string): Promise<Record<string, unknown>[]> {
  // Prefer the most recent large baseline batch, then overlay every later incremental
  // GL day after that baseline's max txn date. A single later 1-day pull must not win
  // the whole tail, and a refreshed baseline must not drop already-stored later days.
  const requestName = 'GeneralDetailReportQuery';
  const [latestBatchId, baselineBatchId] = await Promise.all([
    loadQbdLatestBatchId({ companyId, requestName }),
    loadQbdLatestBaselineBatchId({ companyId, requestName, minPages: 10 }),
  ]);

  if (!latestBatchId) return [];
  const primaryBatchId = baselineBatchId || latestBatchId;
  const baselineRows = await loadQbdPageRecordsForBatch({ companyId, requestName, batchId: primaryBatchId });
  const baselineMax = qbdMaxTxnDateKey(baselineRows);

  if (!baselineMax) {
    return primaryBatchId === latestBatchId
      ? baselineRows
      : loadQbdPageRecordsForBatch({ companyId, requestName, batchId: latestBatchId });
  }

  const overlayRows = await loadQbdOverlaidGlRowsAfterDate({
    companyId,
    afterTxnDateKey: baselineMax,
    excludeBatchId: primaryBatchId,
  });
  if (!overlayRows.length) return baselineRows;
  return [...baselineRows, ...overlayRows];
}

type QbdMonthGlBatchCoverage = {
  batchId: string;
  rowsInMonth: number;
  minTxn: string | null;
  maxTxn: string | null;
  lastSeen: Date;
};

type QbdMonthGlMerge = {
  batchesConsidered: number;
  batchesUsed: number;
  minTxnDate: string | null;
  maxTxnDate: string | null;
  coveredDates: number;
};

async function loadQbdMonthGlBatchCoverage(companyId: string, monthKey: string): Promise<QbdMonthGlBatchCoverage[]> {
  const monthStart = `${monthKey}-01`;
  const monthEndDate = new Date(`${monthStart}T00:00:00.000Z`);
  if (Number.isNaN(monthEndDate.getTime())) return [];
  monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
  const nextMonthStart = monthEndDate.toISOString().slice(0, 10);

  const rows = await prisma.$queryRaw<
    Array<{
      batchId: string | null;
      rowsInMonth: number | null;
      minTxn: string | null;
      maxTxn: string | null;
      lastSeen: Date | null;
    }>
  >`
    WITH recent_batches AS (
      SELECT "batchId", MAX("createdAt") AS "lastSeen"
      FROM "QuickBooksDesktopBackfillPage"
      WHERE "companyId" = ${companyId}
        AND "requestName" = 'GeneralDetailReportQuery'
      GROUP BY "batchId"
      ORDER BY "lastSeen" DESC
      LIMIT 25
    ),
    batch_rows AS (
      SELECT
        p."batchId" AS "batchId",
        col->>'value' AS "txnDate",
        p."createdAt" AS "createdAt"
      FROM "QuickBooksDesktopBackfillPage" p
      JOIN recent_batches rb ON rb."batchId" = p."batchId"
      CROSS JOIN LATERAL jsonb_array_elements(p."payload"::jsonb) AS row
      CROSS JOIN LATERAL jsonb_array_elements(row->'colData') AS col
      WHERE p."companyId" = ${companyId}
        AND p."requestName" = 'GeneralDetailReportQuery'
        AND row->>'rowKind' = 'DataRow'
        AND col->>'colID' = '3'
        AND col->>'value' >= ${monthStart}
        AND col->>'value' < ${nextMonthStart}
    )
    SELECT
      "batchId",
      COUNT(*)::int AS "rowsInMonth",
      MIN("txnDate") AS "minTxn",
      MAX("txnDate") AS "maxTxn",
      MAX("createdAt") AS "lastSeen"
    FROM batch_rows
    GROUP BY "batchId"
    ORDER BY MAX("createdAt") ASC
  `;

  return rows
    .map((row) => {
      const batchId = qbdString(row.batchId);
      if (!batchId || !row.lastSeen) return null;
      return {
        batchId,
        rowsInMonth: Number(row.rowsInMonth || 0),
        minTxn: qbdDateKey(row.minTxn) || null,
        maxTxn: qbdDateKey(row.maxTxn) || null,
        lastSeen: row.lastSeen,
      };
    })
    .filter((row): row is QbdMonthGlBatchCoverage => row !== null);
}

async function loadQbdBestGlRowsForMonth(
  companyId: string,
  monthKey: string,
): Promise<{ rows: Record<string, unknown>[]; merge: QbdMonthGlMerge }> {
  const emptyMerge: QbdMonthGlMerge = {
    batchesConsidered: 0,
    batchesUsed: 0,
    minTxnDate: null,
    maxTxnDate: null,
    coveredDates: 0,
  };
  const coverage = await loadQbdMonthGlBatchCoverage(companyId, monthKey);
  if (coverage.length === 0) return { rows: [], merge: emptyMerge };

  // Overlay by txn date, oldest batch first. A later 1-day pull replaces only the
  // days it contains, so it cannot wipe an older month-to-date batch that ends earlier.
  const sorted = [...coverage].sort((a, b) => a.lastSeen.getTime() - b.lastSeen.getTime());
  const rowsByDate = new Map<string, Record<string, unknown>[]>();
  let batchesUsed = 0;

  for (const batch of sorted) {
    const batchRows = await loadQbdPageRecordsForBatch({
      companyId,
      requestName: 'GeneralDetailReportQuery',
      batchId: batch.batchId,
    });
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const row of batchRows) {
      if (qbdString(row.rowKind) !== 'DataRow') continue;
      const dateKey = qbdReportTxnDateKey(row);
      if (!dateKey || dateKey.slice(0, 7) !== monthKey) continue;
      const list = grouped.get(dateKey) || [];
      list.push(row);
      grouped.set(dateKey, list);
    }
    if (grouped.size === 0) continue;
    batchesUsed += 1;
    for (const [dateKey, rows] of grouped) {
      rowsByDate.set(dateKey, rows);
    }
  }

  const coveredDates = [...rowsByDate.keys()].sort();
  return {
    rows: coveredDates.flatMap((dateKey) => rowsByDate.get(dateKey) || []),
    merge: {
      batchesConsidered: coverage.length,
      batchesUsed,
      minTxnDate: coveredDates[0] || null,
      maxTxnDate: coveredDates[coveredDates.length - 1] || null,
      coveredDates: coveredDates.length,
    },
  };
}

function qbdTransactionIdentity(record: Record<string, unknown>, fallbackPrefix: string, index: number): string {
  return qbdString(record.TxnID) ||
    [
      fallbackPrefix,
      qbdString(record.TxnDate),
      qbdString(record.RefNumber),
      qbdString(record.EditSequence),
      qbdString(record.TotalAmount || record.Amount || record.Subtotal),
      index,
    ].join('|');
}

function qbdDedupeTransactionRecords(records: Record<string, unknown>[], fallbackPrefix: string): Record<string, unknown>[] {
  const byKey = new Map<string, Record<string, unknown>>();
  records.forEach((record, index) => {
    const key = qbdTransactionIdentity(record, fallbackPrefix, index);
    const current = byKey.get(key);
    const currentModified = qbdString(current?.TimeModified);
    const nextModified = qbdString(record.TimeModified);
    if (!current || nextModified >= currentModified) {
      byKey.set(key, record);
    }
  });
  return Array.from(byKey.values());
}

async function buildQuickBooksDesktopMappedMonthlyPayload(companyId: string, basePayload: Record<string, unknown>) {
  const mappings = await prisma.accountMapping.findMany({
    where: { companyId },
    select: { accountId: true, accountName: true, accountCode: true, targetField: true },
  });
  const targetByKey = new Map<string, string>();
  const mappingByKey = new Map<string, QbdMappedAccount>();
  const accountCodeCounts = new Map<string, number>();
  for (const mapping of mappings) {
    const code = qbdString(mapping.accountCode).toLowerCase();
    if (code) accountCodeCounts.set(code, Number(accountCodeCounts.get(code) || 0) + 1);
  }
  for (const mapping of mappings) {
    const target = qbdString(mapping.targetField);
    const mappedAccount = {
      accountId: qbdString(mapping.accountId),
      accountName: qbdString(mapping.accountName),
      accountCode: qbdString(mapping.accountCode),
      targetField: target,
    };
    const keyValues = [mapping.accountId, mapping.accountName]
      .map(qbdString)
      .filter(Boolean);
    const accountCode = qbdString(mapping.accountCode);
    if (accountCode && accountCodeCounts.get(accountCode.toLowerCase()) === 1) {
      keyValues.push(accountCode);
    }
    for (const key of keyValues) {
      for (const normalized of qbdAccountLookupKeys(key)) {
        targetByKey.set(normalized, target);
        mappingByKey.set(normalized, mappedAccount);
      }
    }
  }

  const getTarget = (ref: { id?: string; name?: string; code?: string }) => {
    for (const candidate of [ref.id, ref.name, ref.code]) {
      for (const key of qbdAccountLookupKeys(candidate)) {
        const target = targetByKey.get(key);
        if (target) return target;
      }
    }
    return '';
  };
  const getMapping = (ref: { id?: string; name?: string; code?: string }) => {
    for (const candidate of [ref.id, ref.name, ref.code]) {
      for (const key of qbdAccountLookupKeys(candidate)) {
        const mapping = mappingByKey.get(key);
        if (mapping) return mapping;
      }
    }
    return null;
  };

  const [accounts, balanceSheetReportRows, generalLedgerReportRows] =
    await Promise.all([
      loadQbdPageRecords(companyId, 'AccountQuery'),
      loadQbdPageRecords(companyId, 'BalanceSheetStandardReportQuery'),
      loadQbdGeneralLedgerRowsForMonthlyBuild(companyId),
    ]);

  const accountIdByName = new Map<string, string>();
  for (const account of accounts) {
    const listId = qbdString(account.ListID);
    const fullName = qbdString(account.FullName || account.Name);
    if (!listId || !fullName) continue;
    for (const key of qbdAccountLookupKeys(fullName)) {
      accountIdByName.set(key, listId);
    }
  }

  const months = new Map<string, QbdMappedMonthlyRow>();
  const getMonth = (monthKey: string) => {
    const row = months.get(monthKey) || createQbdMappedMonth(monthKey);
    months.set(monthKey, row);
    return row;
  };
  const dailySnapshots = new Map<string, QbdMappedMonthlyRow>();
  const getDailySnapshot = (dateKey: string) => {
    const row = dailySnapshots.get(dateKey) || createQbdMappedDailySnapshot(dateKey);
    dailySnapshots.set(dateKey, row);
    return row;
  };
  const seedMonthlyRows = Array.isArray(basePayload.monthlyData)
    ? (basePayload.monthlyData as Array<Record<string, unknown>>)
    : [];
  for (const sourceRow of seedMonthlyRows) {
    const monthKey = qbdMonthKey(sourceRow.monthDate || sourceRow.month || sourceRow.date);
    if (!monthKey) continue;
    const row = getMonth(monthKey);
    for (const field of MONTHLY_FINANCIAL_NUMERIC_FIELDS) {
      row[field] = qbdNumber(sourceRow[field]);
    }
    const revenueBreakdown = qbdAsRecord(sourceRow.revenueBreakdown);
    const cogsBreakdown = qbdAsRecord(sourceRow.cogsBreakdown);
    const expenseBreakdown = qbdAsRecord(sourceRow.expenseBreakdown);
    if (Object.keys(revenueBreakdown).length) row.revenueBreakdown = revenueBreakdown as Record<string, number>;
    if (Object.keys(cogsBreakdown).length) row.cogsBreakdown = cogsBreakdown as Record<string, number>;
    if (Object.keys(expenseBreakdown).length) row.expenseBreakdown = expenseBreakdown as Record<string, number>;
  }

  const balanceSheetReportDate = qbdBalanceSheetReportDateKey(balanceSheetReportRows);
  const balanceSheetAnchor = balanceSheetReportDate ? createQbdMappedDailySnapshot(balanceSheetReportDate) : null;
  const accountBalancesAtReportDate = new Map<string, { accountId: string; accountName: string; balance: number }>();
  if (balanceSheetAnchor) {
    for (const reportRow of balanceSheetReportRows) {
      const rowType = qbdString(reportRow.rowType).toLowerCase();
      const rowKind = qbdString(reportRow.rowKind);
      if (rowType && rowType !== 'account') continue;
      if (!rowType && rowKind !== 'DataRow') continue;
      const accountName = qbdReportAccountName(reportRow);
      const target = getTarget({ name: accountName });
      const amount = qbdReportAmount(reportRow);
      qbdApplyBalance(balanceSheetAnchor, target, amount);
      const mapping = getMapping({ name: accountName });
      if (mapping?.accountId && QBD_BALANCE_SHEET_TARGET_FIELDS.has(mapping.targetField)) {
        accountBalancesAtReportDate.set(mapping.accountId, {
          accountId: mapping.accountId,
          accountName: mapping.accountName || accountName,
          balance: amount,
        });
      }
    }
    recomputeQbdBalanceSheetTotals(balanceSheetAnchor);
    const reportMonth = balanceSheetReportDate.slice(0, 7);
    const monthRow = getMonth(reportMonth);
    for (const field of QBD_BALANCE_SHEET_TARGET_FIELDS) {
      const value = Number(balanceSheetAnchor[field] || 0);
      if (value !== 0) monthRow[field] = value;
    }
    recomputeQbdBalanceSheetTotals(monthRow);
    dailySnapshots.set(balanceSheetReportDate, balanceSheetAnchor);
  }

  const glMovementsByDate = new Map<string, Map<string, number>>();
  const accountMovementsByDate = new Map<string, Map<string, number>>();
  const glPnlByMonth = new Map<string, QbdMappedMonthlyRow>();
  const glPnlByDate = new Map<string, QbdMappedMonthlyRow>();
  let earliestGlDate: string | null = null;
  for (const glRow of generalLedgerReportRows) {
    if (qbdString(glRow.rowKind) !== 'DataRow') continue;
    const accountName = qbdString(glRow.accountName || glRow.rowValue);
    const dateKey = qbdDateKey(qbdReportColValueByTitle(glRow, ['Txn Date', 'Date'], ['3']));
    if (!dateKey) continue;
    let accountId = '';
    for (const key of qbdAccountLookupKeys(accountName)) {
      const matchedId = accountIdByName.get(key);
      if (matchedId) {
        accountId = matchedId;
        break;
      }
    }
    const mappedTarget = getTarget({ id: accountId, name: accountName });
    const target = resolveBakersLocTarget({
      companyId,
      dateKey,
      accountId,
      accountName,
      mappedTarget,
    });
    const rawAmount = qbdNumber(qbdReportColValueByTitle(glRow, ['Amount'], ['8']));
    const amount = qbdGeneralLedgerPnlAmount(mappedTarget, rawAmount);
    if (amount === 0) continue;
    if (qbdIsIncomeStatementExpenseTarget(mappedTarget)) {
      const monthKey = dateKey.slice(0, 7);
      const monthRow = glPnlByMonth.get(monthKey) || createQbdMappedMonth(monthKey);
      const dayRow = glPnlByDate.get(dateKey) || createQbdMappedDailySnapshot(dateKey);
      qbdAddMappedAmount(monthRow, mappedTarget, amount);
      qbdAddMappedAmount(dayRow, mappedTarget, amount);
      glPnlByMonth.set(monthKey, monthRow);
      glPnlByDate.set(dateKey, dayRow);
    }
    if (!QBD_BALANCE_SHEET_TARGET_FIELDS.has(target)) continue;
    const dateMovements = glMovementsByDate.get(dateKey) || new Map<string, number>();
    dateMovements.set(target, Number(dateMovements.get(target) || 0) + amount);
    glMovementsByDate.set(dateKey, dateMovements);
    const mapping = getMapping({ id: accountId, name: accountName });
    if (mapping?.accountId) {
      const accountDateMovements = accountMovementsByDate.get(dateKey) || new Map<string, number>();
      accountDateMovements.set(mapping.accountId, Number(accountDateMovements.get(mapping.accountId) || 0) + amount);
      accountMovementsByDate.set(dateKey, accountDateMovements);
    }
    earliestGlDate = earliestGlDate && earliestGlDate < dateKey ? earliestGlDate : dateKey;
  }

  for (const [monthKey, glRow] of glPnlByMonth.entries()) {
    qbdCopyPnl(glRow, getMonth(monthKey));
  }
  for (const [dateKey, glRow] of glPnlByDate.entries()) {
    qbdCopyPnl(glRow, getDailySnapshot(dateKey));
  }

  const qbdBalanceSheetAccountAnchors: Array<{
    anchorDate: string;
    accountId: string;
    accountName: string;
    openingBalance: number;
  }> = [];
  if (balanceSheetReportDate && !earliestGlDate) {
    for (const account of accountBalancesAtReportDate.values()) {
      qbdBalanceSheetAccountAnchors.push({
        anchorDate: balanceSheetReportDate,
        accountId: account.accountId,
        accountName: account.accountName,
        openingBalance: account.balance,
      });
    }
  }
  if (balanceSheetAnchor && balanceSheetReportDate && earliestGlDate) {
    const runningBalances = new Map<string, number>();
    for (const field of QBD_BALANCE_SHEET_TARGET_FIELDS) {
      runningBalances.set(field, Number(balanceSheetAnchor[field] || 0));
    }
    const runningAccountBalances = new Map<string, number>();
    for (const [accountId, account] of accountBalancesAtReportDate.entries()) {
      runningAccountBalances.set(accountId, account.balance);
    }

    let cursor: string | null = balanceSheetReportDate;
    while (cursor && cursor >= earliestGlDate) {
      const dailyRow = getDailySnapshot(cursor);
      for (const field of QBD_BALANCE_SHEET_TARGET_FIELDS) {
        dailyRow[field] = Number(runningBalances.get(field) || 0);
      }
      for (const [accountId, balance] of runningAccountBalances.entries()) {
        const account = accountBalancesAtReportDate.get(accountId);
        if (!account) continue;
        qbdBalanceSheetAccountAnchors.push({
          anchorDate: cursor,
          accountId,
          accountName: account.accountName,
          openingBalance: balance,
        });
      }
      recomputeQbdBalanceSheetTotals(dailyRow);

      const movements = glMovementsByDate.get(cursor);
      if (movements) {
        for (const [field, amount] of movements.entries()) {
          runningBalances.set(field, Number(runningBalances.get(field) || 0) - amount);
        }
      }
      const accountMovements = accountMovementsByDate.get(cursor);
      if (accountMovements) {
        for (const [accountId, amount] of accountMovements.entries()) {
          runningAccountBalances.set(accountId, Number(runningAccountBalances.get(accountId) || 0) - amount);
        }
      }
      cursor = qbdAddDays(cursor, -1);
    }

    let latestGlDate: string | null = null;
    for (const dateKey of glMovementsByDate.keys()) {
      if (!latestGlDate || dateKey > latestGlDate) latestGlDate = dateKey;
    }
    for (const dateKey of glPnlByDate.keys()) {
      if (!latestGlDate || dateKey > latestGlDate) latestGlDate = dateKey;
    }
    if (latestGlDate && latestGlDate > balanceSheetReportDate) {
      const forwardBalances = new Map<string, number>();
      for (const field of QBD_BALANCE_SHEET_TARGET_FIELDS) {
        forwardBalances.set(field, Number(balanceSheetAnchor[field] || 0));
      }
      let forwardCursor = qbdAddDays(balanceSheetReportDate, 1);
      while (forwardCursor && forwardCursor <= latestGlDate) {
        const movements = glMovementsByDate.get(forwardCursor);
        if (movements) {
          for (const [field, amount] of movements.entries()) {
            forwardBalances.set(field, Number(forwardBalances.get(field) || 0) + amount);
          }
        }
        const dailyRow = getDailySnapshot(forwardCursor);
        for (const field of QBD_BALANCE_SHEET_TARGET_FIELDS) {
          dailyRow[field] = Number(forwardBalances.get(field) || 0);
        }
        recomputeQbdBalanceSheetTotals(dailyRow);
        forwardCursor = qbdAddDays(forwardCursor, 1);
      }
    }

    const latestDailyByMonth = new Map<string, QbdMappedMonthlyRow>();
    for (const row of dailySnapshots.values()) {
      const dateKey = qbdDateKey(row.snapshotDate);
      if (!dateKey) continue;
      const monthKey = dateKey.slice(0, 7);
      const existing = latestDailyByMonth.get(monthKey);
      if (!existing || String(existing.snapshotDate || '') < dateKey) {
        latestDailyByMonth.set(monthKey, row);
      }
    }
    for (const [monthKey, row] of latestDailyByMonth.entries()) {
      copyQbdBalanceSheetFields(row, getMonth(monthKey));
    }
  }

  if (isBakersCompany(companyId)) {
    let throughDate = BAKERS_PIN_START;
    for (const dateKey of glMovementsByDate.keys()) {
      if (dateKey > throughDate) throughDate = dateKey;
    }
    for (const dateKey of dailySnapshots.keys()) {
      if (dateKey > throughDate) throughDate = dateKey;
    }
    const today = formatEstDate();
    if (today > throughDate) throughDate = today;
    const anchored = buildBakersAnchoredDailyBalances(glMovementsByDate, throughDate);
    for (const [dateKey, balances] of anchored.entries()) {
      const dailyRow = getDailySnapshot(dateKey);
      for (const [field, value] of Object.entries(balances)) {
        dailyRow[field] = value;
      }
    }
    const latestDailyByMonth = new Map<string, QbdMappedMonthlyRow>();
    for (const row of dailySnapshots.values()) {
      const dateKey = qbdDateKey(row.snapshotDate);
      if (!dateKey || dateKey < BAKERS_WALK_START) continue;
      const monthKey = dateKey.slice(0, 7);
      const existing = latestDailyByMonth.get(monthKey);
      if (!existing || String(existing.snapshotDate || '') < dateKey) {
        latestDailyByMonth.set(monthKey, row);
      }
    }
    for (const [monthKey, row] of latestDailyByMonth.entries()) {
      copyQbdBalanceSheetFields(row, getMonth(monthKey));
    }
  }

  const sortedMonthKeys = Array.from(months.keys()).sort();
  const latestMonth = sortedMonthKeys[sortedMonthKeys.length - 1] || null;
  const sortedDailyKeys = Array.from(dailySnapshots.keys()).sort();
  const latestDay = sortedDailyKeys[sortedDailyKeys.length - 1] || null;
  if (latestMonth && !balanceSheetAnchor) {
    const latest = getMonth(latestMonth);
    const accountFullNames = accounts.map((account) => qbdString(account.FullName || account.Name)).filter(Boolean);
    for (const account of accounts) {
      const fullName = qbdString(account.FullName || account.Name);
      const accountHasChildren = fullName
        ? accountFullNames.some((candidate) => candidate !== fullName && candidate.startsWith(`${fullName}:`))
        : false;
      const target = getTarget({
        id: qbdString(account.ListID),
        name: fullName,
        code: qbdString(account.AccountNumber),
      });
      qbdApplyBalance(latest, target, qbdBalanceForAccount(account, accountHasChildren));
      if (latestDay) {
        qbdApplyBalance(getDailySnapshot(latestDay), target, qbdBalanceForAccount(account, accountHasChildren));
      }
    }
    recomputeQbdBalanceSheetTotals(latest);
    if (latestDay) {
      recomputeQbdBalanceSheetTotals(getDailySnapshot(latestDay));
    }
  }

  const monthlyData = Array.from(months.values()).sort((a, b) => String(a.monthDate).localeCompare(String(b.monthDate)));
  const qbdDailyFinancialSnapshots = Array.from(dailySnapshots.values()).sort((a, b) => String(a.snapshotDate).localeCompare(String(b.snapshotDate)));
  return {
    ...basePayload,
    monthlyData,
    qbdDailyFinancialSnapshots,
    qbdBalanceSheetAccountAnchors,
    metadata: {
      ...(basePayload.metadata && typeof basePayload.metadata === 'object' && !Array.isArray(basePayload.metadata)
        ? (basePayload.metadata as Record<string, unknown>)
        : {}),
      qbdMappedMonthlyBuild: {
        generatedAt: new Date().toISOString(),
        mappings: mappings.length,
        months: monthlyData.length,
        dailySnapshots: qbdDailyFinancialSnapshots.length,
        monthlyReportRowsSeeded: seedMonthlyRows.length,
        transactionDetailRowsUsedForPnl: 0,
        balanceSheetReportRows: balanceSheetReportRows.length,
        balanceSheetAccountAnchors: qbdBalanceSheetAccountAnchors.length,
        balanceSheetReportDate,
        generalLedgerReportRows: generalLedgerReportRows.length,
        generalLedgerPnlMonths: glPnlByMonth.size,
        generalLedgerPnlDays: glPnlByDate.size,
        generalLedgerMovementDays: glMovementsByDate.size,
        dailyBalanceSheetStartDate: earliestGlDate,
      },
    },
  };
}

async function persistQuickBooksDesktopDailyFinancialSnapshots(
  companyId: string,
  payload: Record<string, unknown>,
  scope: { canUpdatePnl: boolean; canUpdateBalanceSheet: boolean },
  options: { monthKey?: string | null } = {},
) {
  const rows = Array.isArray(payload.qbdDailyFinancialSnapshots)
    ? (payload.qbdDailyFinancialSnapshots as Array<Record<string, unknown>>)
    : [];
  const monthKey = options.monthKey && /^\d{4}-\d{2}$/.test(options.monthKey) ? options.monthKey : null;
  const sourceRunId = `qbd-reprocess-${Date.now()}`;
  const parsedRows = rows
    .map((row) => {
      const rawDate = qbdString(row.snapshotDate);
      const dateKey = qbdDateKey(rawDate);
      if (!dateKey) return null;
      if (monthKey && dateKey.slice(0, 7) !== monthKey) return null;
      const snapshotDate = new Date(`${dateKey}T00:00:00.000Z`);
      if (Number.isNaN(snapshotDate.getTime())) return null;
      const numericFields = Object.fromEntries(
        MONTHLY_FINANCIAL_NUMERIC_FIELDS.map((field) => [field, qbdNumber(row[field])])
      );
      const hasBalanceSheetSignal = QBD_MONTHLY_BS_PRESERVE_FIELDS.some((field) => qbdNumber(row[field]) !== 0);
      return {
        companyId,
        snapshotDate,
        frequency: 'daily',
        ...numericFields,
        sourcePlatform: QBD_DAILY_FINANCIAL_SOURCE,
        sourceRunId,
        hasBalanceSheetSignal,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (!parsedRows.length) {
    return { rowsWritten: 0, startDate: null, endDate: null };
  }

  const sortedDates = parsedRows.map((row) => row.snapshotDate).sort((a, b) => a.getTime() - b.getTime());
  const startDate = sortedDates[0];
  const endDate = sortedDates[sortedDates.length - 1];

  let rowsWritten = 0;
  for (const row of parsedRows) {
    const { hasBalanceSheetSignal, ...data } = row;
    const pnlUpdate = scope.canUpdatePnl
      ? Object.fromEntries(QBD_DAILY_PNL_UPDATE_FIELDS.map((field) => [field, Number(data[field as keyof typeof data] || 0)]))
      : {};
    const balanceSheetUpdate = scope.canUpdateBalanceSheet && hasBalanceSheetSignal
      ? Object.fromEntries(QBD_MONTHLY_BS_PRESERVE_FIELDS.map((field) => [field, Number(data[field] || 0)]))
      : {};
    const updatePayload = {
      ...pnlUpdate,
      ...balanceSheetUpdate,
      sourcePlatform: QBD_DAILY_FINANCIAL_SOURCE,
      sourceRunId,
    };
    const createData = {
      ...data,
      ...(!scope.canUpdatePnl
        ? Object.fromEntries(QBD_DAILY_PNL_UPDATE_FIELDS.map((field) => [field, 0]))
        : {}),
      ...(!scope.canUpdateBalanceSheet
        ? Object.fromEntries(QBD_MONTHLY_BS_PRESERVE_FIELDS.map((field) => [field, 0]))
        : {}),
    };
    await prisma.dailyFinancialSnapshot.upsert({
      where: {
        companyId_snapshotDate_frequency: {
          companyId,
          snapshotDate: data.snapshotDate,
          frequency: data.frequency,
        },
      },
      create: createData,
      update: updatePayload,
    });
    rowsWritten += 1;
  }

  await prisma.dailyFinancialImportRun.create({
    data: {
      companyId,
      platform: 'QUICKBOOKS_DESKTOP',
      runType: 'qbd_reprocess_daily_financials',
      status: rowsWritten === parsedRows.length ? 'SUCCESS' : 'PARTIAL',
      snapshotDate: endDate,
      recordsIngested: rowsWritten,
      metadata: {
        source: QBD_DAILY_FINANCIAL_SOURCE,
        rowsBuilt: parsedRows.length,
        qbdRowsDeletedInWindow: 0,
        writeMode: 'upsert_preserve_balance_sheet_without_signal',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      finishedAt: new Date(),
    },
  });

  return {
    rowsWritten,
    rowsDeleted: 0,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

async function rebuildQuickBooksDesktopDailyPnlMonth(companyId: string, monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error('Valid targetMonth is required for QBD daily P&L month rebuild.');
  }

  const mappings = await prisma.accountMapping.findMany({
    where: { companyId },
    select: { accountId: true, accountName: true, accountCode: true, targetField: true },
  });
  const targetByKey = new Map<string, string>();
  const accountCodeCounts = new Map<string, number>();
  for (const mapping of mappings) {
    const code = qbdString(mapping.accountCode).toLowerCase();
    if (code) accountCodeCounts.set(code, Number(accountCodeCounts.get(code) || 0) + 1);
  }
  for (const mapping of mappings) {
    const target = qbdString(mapping.targetField);
    const keyValues = [mapping.accountId, mapping.accountName].map(qbdString).filter(Boolean);
    const accountCode = qbdString(mapping.accountCode);
    if (accountCode && accountCodeCounts.get(accountCode.toLowerCase()) === 1) keyValues.push(accountCode);
    for (const key of keyValues) {
      for (const normalized of qbdAccountLookupKeys(key)) {
        targetByKey.set(normalized, target);
      }
    }
  }

  const { rows: glRows, merge: glMerge } = await loadQbdBestGlRowsForMonth(companyId, monthKey);
  const dailySnapshots = new Map<string, QbdMappedMonthlyRow>();
  const getDailySnapshot = (dateKey: string) => {
    const row = dailySnapshots.get(dateKey) || createQbdMappedDailySnapshot(dateKey);
    dailySnapshots.set(dateKey, row);
    return row;
  };
  const getTarget = (accountName: unknown) => {
    for (const key of qbdAccountLookupKeys(accountName)) {
      const target = targetByKey.get(key);
      if (target) return target;
    }
    return '';
  };
  let pnlRowsUsed = 0;
  let unmappedRows = 0;
  let nonPnlRows = 0;
  let zeroAmountRows = 0;

  for (const glRow of glRows) {
    const dateKey = qbdDateKey(qbdReportColValueByTitle(glRow, ['Txn Date', 'Date'], ['3']));
    if (!dateKey || dateKey.slice(0, 7) !== monthKey) continue;
    const target = getTarget(glRow.accountName || glRow.rowValue);
    if (!target) {
      unmappedRows += 1;
      continue;
    }
    if (!qbdIsIncomeStatementExpenseTarget(target)) {
      nonPnlRows += 1;
      continue;
    }
    const rawAmount = qbdNumber(qbdReportColValueByTitle(glRow, ['Amount'], ['8']));
    const amount = qbdGeneralLedgerPnlAmount(target, rawAmount);
    if (amount === 0) {
      zeroAmountRows += 1;
      continue;
    }
    qbdAddMappedAmount(getDailySnapshot(dateKey), target, amount);
    pnlRowsUsed += 1;
  }

  const qbdDailyFinancialSnapshots = Array.from(dailySnapshots.values()).sort((a, b) => String(a.snapshotDate).localeCompare(String(b.snapshotDate)));
  const result = await persistQuickBooksDesktopDailyFinancialSnapshots(
    companyId,
    { qbdDailyFinancialSnapshots },
    { canUpdatePnl: true, canUpdateBalanceSheet: false },
    { monthKey },
  );
  const balanceSheetResult = await rebuildQuickBooksDesktopDailyBalanceSheetMonth(companyId, monthKey);
  const totals = qbdDailyFinancialSnapshots.reduce(
    (acc, row) => {
      acc.revenue += Number(row.revenue || 0);
      acc.cogsTotal += Number(row.cogsTotal || 0);
      acc.expense += Number(row.expense || 0);
      return acc;
    },
    { revenue: 0, cogsTotal: 0, expense: 0 },
  );

  return {
    month: monthKey,
    glRowsScanned: glRows.length,
    glMerge,
    pnlRowsUsed,
    unmappedRows,
    nonPnlRows,
    zeroAmountRows,
    dailyRowsBuilt: qbdDailyFinancialSnapshots.length,
    ...result,
    balanceSheet: balanceSheetResult,
    totals,
  };
}

async function rebuildQuickBooksDesktopDailyBalanceSheetMonth(companyId: string, monthKey: string) {
  const monthStart = `${monthKey}-01`;
  const monthEndDate = new Date(`${monthStart}T00:00:00.000Z`);
  monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
  monthEndDate.setUTCDate(0);
  const monthEnd = qbdDateKey(monthEndDate.toISOString());
  if (!monthEnd) {
    return { month: monthKey, rowsWritten: 0, seedDate: null, reportDate: null, skipped: 'invalid_month' };
  }

  const mappings = await prisma.accountMapping.findMany({
    where: { companyId },
    select: { accountId: true, accountName: true, accountCode: true, targetField: true },
  });
  const targetByKey = new Map<string, string>();
  const accountCodeCounts = new Map<string, number>();
  for (const mapping of mappings) {
    const code = qbdString(mapping.accountCode).toLowerCase();
    if (code) accountCodeCounts.set(code, Number(accountCodeCounts.get(code) || 0) + 1);
  }
  for (const mapping of mappings) {
    const target = qbdString(mapping.targetField);
    const keyValues = [mapping.accountId, mapping.accountName].map(qbdString).filter(Boolean);
    const accountCode = qbdString(mapping.accountCode);
    if (accountCode && accountCodeCounts.get(accountCode.toLowerCase()) === 1) keyValues.push(accountCode);
    for (const key of keyValues) {
      for (const normalized of qbdAccountLookupKeys(key)) {
        targetByKey.set(normalized, target);
      }
    }
  }
  const getTarget = (ref: { id?: string; name?: unknown }) => {
    for (const candidate of [ref.id, ref.name]) {
      for (const key of qbdAccountLookupKeys(candidate)) {
        const target = targetByKey.get(key);
        if (target) return target;
      }
    }
    return '';
  };

  const accounts = await loadQbdPageRecords(companyId, 'AccountQuery');
  const accountIdByName = new Map<string, string>();
  for (const account of accounts) {
    const listId = qbdString(account.ListID);
    const fullName = qbdString(account.FullName || account.Name);
    if (!listId || !fullName) continue;
    for (const key of qbdAccountLookupKeys(fullName)) {
      accountIdByName.set(key, listId);
    }
  }
  const resolveAccountId = (accountName: string) => {
    for (const key of qbdAccountLookupKeys(accountName)) {
      const matchedId = accountIdByName.get(key);
      if (matchedId) return matchedId;
    }
    return '';
  };

  const { rows: glRows } = await loadQbdBestGlRowsForMonth(companyId, monthKey);
  const glMovementsByDate = new Map<string, Map<string, number>>();
  for (const glRow of glRows) {
    if (qbdString(glRow.rowKind) !== 'DataRow') continue;
    const dateKey = qbdDateKey(qbdReportColValueByTitle(glRow, ['Txn Date', 'Date'], ['3']));
    if (!dateKey || dateKey.slice(0, 7) !== monthKey) continue;
    const accountName = qbdString(glRow.accountName || glRow.rowValue);
    const accountId = resolveAccountId(accountName);
    const mappedTarget = getTarget({ id: accountId, name: accountName });
    const target = resolveBakersLocTarget({
      companyId,
      dateKey,
      accountId,
      accountName,
      mappedTarget,
    });
    if (!QBD_BALANCE_SHEET_TARGET_FIELDS.has(target)) continue;
    const amount = qbdGeneralLedgerPnlAmount(mappedTarget, qbdNumber(qbdReportColValueByTitle(glRow, ['Amount'], ['8'])));
    if (amount === 0) continue;
    const dateMovements = glMovementsByDate.get(dateKey) || new Map<string, number>();
    dateMovements.set(target, Number(dateMovements.get(target) || 0) + amount);
    glMovementsByDate.set(dateKey, dateMovements);
  }

  const balanceSheetReportRows = await loadQbdPageRecords(companyId, 'BalanceSheetStandardReportQuery');
  const reportDate = qbdBalanceSheetReportDateKey(balanceSheetReportRows);
  const reportSnap = reportDate ? createQbdMappedDailySnapshot(reportDate) : null;
  if (reportSnap) {
    for (const reportRow of balanceSheetReportRows) {
      const rowType = qbdString(reportRow.rowType).toLowerCase();
      const rowKind = qbdString(reportRow.rowKind);
      if (rowType && rowType !== 'account') continue;
      if (!rowType && rowKind !== 'DataRow') continue;
      qbdApplyBalance(
        reportSnap,
        getTarget({ name: qbdReportAccountName(reportRow) }),
        qbdReportAmount(reportRow),
      );
    }
    recomputeQbdBalanceSheetTotals(reportSnap);
  }

  const priorSnapshots = await prisma.dailyFinancialSnapshot.findMany({
    where: {
      companyId,
      frequency: 'daily',
      snapshotDate: { lte: new Date(`${monthEnd}T00:00:00.000Z`) },
    },
    orderBy: { snapshotDate: 'desc' },
    take: 60,
  });
  const priorWithBs = priorSnapshots.find((row) =>
    QBD_MONTHLY_BS_PRESERVE_FIELDS.some((field) => Number((row as Record<string, unknown>)[field] || 0) !== 0),
  );
  const priorDate = priorWithBs ? qbdDateKey(priorWithBs.snapshotDate.toISOString()) : null;

  const seedBalances = new Map<string, number>();
  let seedDate: string | null = null;
  const reportInMonth = Boolean(reportSnap && reportDate && reportDate >= monthStart && reportDate <= monthEnd);
  if (reportInMonth && reportSnap && reportDate) {
    seedDate = reportDate;
    for (const field of QBD_BALANCE_SHEET_TARGET_FIELDS) {
      seedBalances.set(field, Number(reportSnap[field] || 0));
    }
  } else if (priorDate && priorWithBs) {
    seedDate = priorDate;
    for (const field of QBD_BALANCE_SHEET_TARGET_FIELDS) {
      seedBalances.set(field, Number((priorWithBs as Record<string, unknown>)[field] || 0));
    }
  }

  if (!seedDate) {
    return { month: monthKey, rowsWritten: 0, seedDate: null, reportDate, skipped: 'no_balance_sheet_seed' };
  }

  let latestTarget = seedDate >= monthStart && seedDate <= monthEnd ? seedDate : monthStart;
  for (const dateKey of glMovementsByDate.keys()) {
    if (dateKey <= monthEnd && dateKey > latestTarget) latestTarget = dateKey;
  }
  for (const row of priorSnapshots) {
    const dateKey = qbdDateKey(row.snapshotDate.toISOString());
    if (dateKey && dateKey >= monthStart && dateKey <= monthEnd && dateKey > latestTarget) {
      latestTarget = dateKey;
    }
  }

  const dailySnapshots = new Map<string, QbdMappedMonthlyRow>();
  const assign = (dateKey: string, balances: Map<string, number>) => {
    const row = dailySnapshots.get(dateKey) || createQbdMappedDailySnapshot(dateKey);
    for (const field of QBD_BALANCE_SHEET_TARGET_FIELDS) {
      row[field] = Number(balances.get(field) || 0);
    }
    recomputeQbdBalanceSheetTotals(row);
    dailySnapshots.set(dateKey, row);
  };

  if (seedDate >= monthStart && seedDate <= monthEnd) {
    assign(seedDate, seedBalances);
  }

  const forwardBalances = new Map(seedBalances);
  let cursor = qbdAddDays(seedDate, 1);
  while (cursor && cursor <= latestTarget && cursor <= monthEnd) {
    const movements = glMovementsByDate.get(cursor);
    if (movements) {
      for (const [field, amount] of movements.entries()) {
        forwardBalances.set(field, Number(forwardBalances.get(field) || 0) + amount);
      }
    }
    if (cursor >= monthStart) assign(cursor, forwardBalances);
    cursor = qbdAddDays(cursor, 1);
  }

  if (seedDate >= monthStart) {
    const backBalances = new Map(seedBalances);
    cursor = seedDate;
    while (cursor && cursor >= monthStart) {
      if (cursor !== seedDate) assign(cursor, backBalances);
      const movements = glMovementsByDate.get(cursor);
      if (movements) {
        for (const [field, amount] of movements.entries()) {
          backBalances.set(field, Number(backBalances.get(field) || 0) - amount);
        }
      }
      cursor = qbdAddDays(cursor, -1);
    }
  }

  if (isBakersCompany(companyId) && monthKey >= '2024-01') {
    const fullGlRows = await loadQbdGeneralLedgerRowsForMonthlyBuild(companyId);
    const fullMovements = new Map<string, Map<string, number>>();
    for (const glRow of fullGlRows) {
      if (qbdString(glRow.rowKind) !== 'DataRow') continue;
      const dateKey = qbdDateKey(qbdReportColValueByTitle(glRow, ['Txn Date', 'Date'], ['3']));
      if (!dateKey || dateKey < BAKERS_WALK_START || dateKey > monthEnd) continue;
      const accountName = qbdString(glRow.accountName || glRow.rowValue);
      const accountId = resolveAccountId(accountName);
      const mappedTarget = getTarget({ id: accountId, name: accountName });
      const target = resolveBakersLocTarget({
        companyId,
        dateKey,
        accountId,
        accountName,
        mappedTarget,
      });
      if (!QBD_BALANCE_SHEET_TARGET_FIELDS.has(target)) continue;
      const amount = qbdGeneralLedgerPnlAmount(
        mappedTarget,
        qbdNumber(qbdReportColValueByTitle(glRow, ['Amount'], ['8'])),
      );
      if (amount === 0) continue;
      const dateMovements = fullMovements.get(dateKey) || new Map<string, number>();
      dateMovements.set(target, Number(dateMovements.get(target) || 0) + amount);
      fullMovements.set(dateKey, dateMovements);
    }
    // Same month overlay P&L already uses: later 1-day GL batches replace only the
    // dates they contain, so August cash/AR/AP can move after the baseline ends.
    for (const [dateKey, movements] of glMovementsByDate.entries()) {
      if (dateKey < monthStart || dateKey > monthEnd) continue;
      fullMovements.set(dateKey, movements);
    }
    const anchored = buildBakersAnchoredDailyBalances(fullMovements, monthEnd);
    for (const [dateKey, balances] of anchored.entries()) {
      if (dateKey < monthStart || dateKey > monthEnd) continue;
      const row = createQbdMappedDailySnapshot(dateKey);
      for (const [field, value] of Object.entries(balances)) {
        row[field] = value;
      }
      dailySnapshots.set(dateKey, row);
    }
  }

  const persistResult = await persistQuickBooksDesktopDailyFinancialSnapshots(
    companyId,
    { qbdDailyFinancialSnapshots: Array.from(dailySnapshots.values()) },
    { canUpdatePnl: false, canUpdateBalanceSheet: true },
    { monthKey },
  );
  return {
    month: monthKey,
    seedDate,
    reportDate,
    latestTarget,
    movementDays: glMovementsByDate.size,
    dailyRowsBuilt: dailySnapshots.size,
    ...persistResult,
  };
}

async function preserveQuickBooksDesktopHistoricalMonthlyBalanceSheet(
  companyId: string,
  payload: Record<string, unknown>,
  options: { preserveAllBalanceSheet?: boolean } = {},
): Promise<{ monthsPreserved: number; coverageStartMonth: string | null; preserveAllBalanceSheet: boolean }> {
  const metadata = qbdAsRecord(payload.metadata);
  const build = qbdAsRecord(metadata.qbdMappedMonthlyBuild);
  const coverageStartDate = qbdDateKey(build.dailyBalanceSheetStartDate);
  if (!coverageStartDate && !options.preserveAllBalanceSheet) {
    return { monthsPreserved: 0, coverageStartMonth: null, preserveAllBalanceSheet: false };
  }

  const coverageStartMonth = coverageStartDate ? coverageStartDate.slice(0, 7) : null;
  const monthlyRows = Array.isArray(payload.monthlyData)
    ? (payload.monthlyData as Array<Record<string, unknown>>)
    : [];
  const monthsNeedingPreservation = monthlyRows
    .map((row) => qbdMonthKey(row.monthDate || row.month || row.date))
    .filter((monthKey): monthKey is string => Boolean(monthKey && (options.preserveAllBalanceSheet || (coverageStartMonth && monthKey < coverageStartMonth))));

  if (monthsNeedingPreservation.length === 0) {
    return { monthsPreserved: 0, coverageStartMonth, preserveAllBalanceSheet: Boolean(options.preserveAllBalanceSheet) };
  }

  const latestFinancialRecord = await prisma.financialRecord.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    include: {
      monthlyData: {
        where: options.preserveAllBalanceSheet || !coverageStartMonth
          ? {}
          : {
              monthDate: {
                lt: new Date(`${coverageStartMonth}-01T00:00:00.000Z`),
              },
            },
      },
    },
  });
  if (!latestFinancialRecord?.monthlyData?.length) {
    return { monthsPreserved: 0, coverageStartMonth, preserveAllBalanceSheet: Boolean(options.preserveAllBalanceSheet) };
  }

  const existingByMonth = new Map<string, Record<string, unknown>>();
  for (const existingRow of latestFinancialRecord.monthlyData as Array<Record<string, unknown>>) {
    const key = qbdMonthKey(existingRow.monthDate);
    if (key) existingByMonth.set(key, existingRow);
  }

  let monthsPreserved = 0;
  for (const row of monthlyRows) {
    const key = qbdMonthKey(row.monthDate || row.month || row.date);
    if (!key || (!options.preserveAllBalanceSheet && coverageStartMonth && key >= coverageStartMonth)) continue;
    const existing = existingByMonth.get(key);
    if (!existing) continue;

    for (const field of QBD_MONTHLY_BS_PRESERVE_FIELDS) {
      row[field] = qbdNumber(existing[field]);
    }
    monthsPreserved += 1;
  }

  return { monthsPreserved, coverageStartMonth, preserveAllBalanceSheet: Boolean(options.preserveAllBalanceSheet) };
}

async function persistQuickBooksDesktopBalanceSheetAnchor(companyId: string, payload: Record<string, unknown>) {
  const metadata = qbdAsRecord(payload.metadata);
  const build = qbdAsRecord(metadata.qbdMappedMonthlyBuild);
  const dateKey = qbdDateKey(build.balanceSheetReportDate);
  const rows = Array.isArray(payload.qbdDailyFinancialSnapshots)
    ? (payload.qbdDailyFinancialSnapshots as Array<Record<string, unknown>>)
    : [];
  const row = rows.find((candidate) => qbdDateKey(candidate.snapshotDate) === dateKey);
  if (!dateKey || !row) {
    return null;
  }
  const anchorDate = new Date(`${dateKey}T00:00:00.000Z`);
  const anchorValues = Object.fromEntries(
    QBD_BALANCE_SHEET_ANCHOR_FIELDS.map((field) => [field, qbdNumber(row[field])]),
  );

  await prisma.balanceSheetAnchor.upsert({
    where: {
      companyId_anchorDate: {
        companyId,
        anchorDate,
      },
    },
    update: {
      ...anchorValues,
      source: 'QUICKBOOKS_DESKTOP_BALANCE_SHEET_STANDARD',
      notes: `Imported from QBD BalanceSheetStandardReportQuery on ${new Date().toISOString()}`,
    },
    create: {
      companyId,
      anchorDate,
      ...anchorValues,
      source: 'QUICKBOOKS_DESKTOP_BALANCE_SHEET_STANDARD',
      notes: `Imported from QBD BalanceSheetStandardReportQuery on ${new Date().toISOString()}`,
    },
  });

  const accountAnchorRows = Array.isArray(payload.qbdBalanceSheetAccountAnchors)
    ? (payload.qbdBalanceSheetAccountAnchors as Array<Record<string, unknown>>)
    : [];
  const parsedAccountAnchors = accountAnchorRows
    .map((accountRow) => {
      const accountDateKey = qbdDateKey(accountRow.anchorDate);
      const accountId = qbdString(accountRow.accountId);
      if (!accountDateKey || !accountId) return null;
      return {
        companyId,
        anchorDate: new Date(`${accountDateKey}T00:00:00.000Z`),
        accountId,
        accountName: qbdString(accountRow.accountName) || null,
        openingBalance: qbdNumber(accountRow.openingBalance),
        source: 'QUICKBOOKS_DESKTOP_BALANCE_SHEET_STANDARD_ACCOUNT',
        notes: `Imported from QBD BalanceSheetStandardReportQuery account rows on ${new Date().toISOString()}`,
      };
    })
    .filter((accountRow): accountRow is NonNullable<typeof accountRow> => accountRow !== null);

  if (parsedAccountAnchors.length > 0) {
    const anchorDates = parsedAccountAnchors.map((accountRow) => accountRow.anchorDate);
    const minAnchorDate = new Date(Math.min(...anchorDates.map((anchor) => anchor.getTime())));
    const maxAnchorDate = new Date(Math.max(...anchorDates.map((anchor) => anchor.getTime())));
    await prisma.balanceSheetAccountAnchor.deleteMany({
      where: {
        companyId,
        anchorDate: {
          gte: minAnchorDate,
          lte: maxAnchorDate,
        },
        accountId: {
          in: Array.from(new Set(parsedAccountAnchors.map((accountRow) => accountRow.accountId))),
        },
      },
    });
    const batchSize = 1000;
    for (let index = 0; index < parsedAccountAnchors.length; index += batchSize) {
      await prisma.balanceSheetAccountAnchor.createMany({
        data: parsedAccountAnchors.slice(index, index + batchSize),
        skipDuplicates: true,
      });
    }
    await prisma.$executeRawUnsafe(
      `DELETE FROM "LoanActivityCache" WHERE "companyId" = $1`,
      companyId
    ).catch(() => undefined);
  }

  return {
    anchorDate: anchorDate.toISOString(),
    fieldsPopulated: Object.values(anchorValues).filter((value) => Number(value || 0) !== 0).length,
    accountAnchorsWritten: parsedAccountAnchors.length,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyId = body?.companyId;
    const targetMonth = normalizeTargetMonth(body?.targetMonth);
    const mode = normalizeFinancialImportMode(body?.mode);
    const dailyOnly = body?.dailyOnly === true;
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
    const [hasQbdBackfillPages, hasQbdConnectionMetadata] = await Promise.all([
      hasQuickBooksDesktopBackfillPages(String(companyId)),
      hasQuickBooksDesktopConnectionMetadata(String(companyId)),
    ]);
    const shouldUseQuickBooksDesktopReprocess =
      isQuickBooksDesktopFamily(configuredPlatform) ||
      (configuredPlatform === 'QUICKBOOKS' && hasQbdBackfillPages) ||
      (hasQbdConnectionMetadata && hasQbdBackfillPages);

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

    if (configuredPlatform === 'QUICKBOOKS' && !shouldUseQuickBooksDesktopReprocess) {
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

    if (!shouldUseQuickBooksDesktopReprocess && (configuredPlatform === 'INFOR_M3' || configuredPlatform === 'INFOR_CSI')) {
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
        configuredPlatformRaw,
        shouldUseQuickBooksDesktopReprocess,
        hasQbdBackfillPages,
        hasQbdConnectionMetadata,
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

    if (shouldUseQuickBooksDesktopReprocess) {
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
      const qbdDomainScope = getQuickBooksDesktopDomainScope(metadata);
      let financialPayload =
        metadata.quickbooksDesktopFinancialPayload && typeof metadata.quickbooksDesktopFinancialPayload === 'object'
          ? (metadata.quickbooksDesktopFinancialPayload as Record<string, unknown>)
          : null;
      if (!financialPayload) {
        const { loadQuickBooksDesktopBackfillPayloads } = await import('@/lib/quickbooks-desktop/backfill-payloads');
        financialPayload = (await loadQuickBooksDesktopBackfillPayloads(String(companyId), metadata))?.financialPayload || null;
      }
      if (!financialPayload && dailyOnly) {
        financialPayload = {};
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

      const qbdDiagnostics: Record<string, unknown> = {
        companyId: String(companyId),
        configuredPlatform,
        configuredPlatformRaw,
        hasQbdBackfillPages,
        hasQbdConnectionMetadata,
        targetMonth: targetMonth || null,
        mode,
        hadMonthlyDataRows: hasMonthlyDataRows(financialPayload),
        domainScope: qbdDomainScope,
      };
      if (!qbdDomainScope.canUpdateFinancials) {
        return NextResponse.json(
          {
            success: true,
            message: 'QuickBooks Desktop reprocess skipped financial rebuild because the selected sync domains do not own financial statement data.',
            diagnostics: qbdDiagnostics,
          },
          { status: 200 },
        );
      }
      if (dailyOnly) {
        if (!targetMonth) {
          return NextResponse.json(
            {
              ok: false,
              error: 'targetMonth is required when dailyOnly=true for QuickBooks Desktop.',
              diagnostics: qbdDiagnostics,
            },
            { status: 400 },
          );
        }

        // Daily-only rebuild must not reuse the monthly payload builder: that path can
        // overwrite overlay-merged daily P&L with zeros. Rebuild P&L from merged GL, then
        // fill daily BS from the latest Balance Sheet report (or last stored BS snapshot)
        // plus GL movements, including days after the report date.
        const dailyPnlResult = await rebuildQuickBooksDesktopDailyPnlMonth(String(companyId), targetMonth);
        const qbdDailyFinancialSnapshots = {
          rowsWritten: dailyPnlResult.rowsWritten,
          rowsDeleted: dailyPnlResult.rowsDeleted,
          startDate: dailyPnlResult.startDate,
          endDate: dailyPnlResult.endDate,
          balanceSheet: dailyPnlResult.balanceSheet,
        };
        // The Web Connector's first sync after midnight supplies the prior
        // month's final daily P&L. Republish that closed month from those
        // rebuilt daily rows so the earlier month-start cron cannot leave an
        // MTD monthly record visible in reports.
        const qbdPublishResult = targetMonth !== currentMonthKeyUtc()
          ? await publishMonthFromDailySnapshots({
              companyId: String(companyId),
              month: targetMonth,
            })
          : null;
        const qbdBalanceSheetAnchor = null;
        qbdDiagnostics.dailyFinancialSnapshots = qbdDailyFinancialSnapshots;
        qbdDiagnostics.balanceSheetAnchor = qbdBalanceSheetAnchor;
        qbdDiagnostics.qbdDailyPnlMonthRebuild = dailyPnlResult;
        if (qbdPublishResult) {
          qbdDiagnostics.publishedMasterData = {
            success: qbdPublishResult.success,
            publishedMonths: qbdPublishResult.publishedMonths.length,
            skippedMonths: qbdPublishResult.skippedMonths.length,
            error: qbdPublishResult.error || null,
          };
        }
        return NextResponse.json({
          success: qbdPublishResult?.success ?? true,
          ok: qbdPublishResult?.success ?? true,
          message: qbdPublishResult?.success === false
            ? `QuickBooks Desktop daily financials rebuilt for ${targetMonth}, but month-close publish failed.`
            : `QuickBooks Desktop daily financials rebuilt for ${targetMonth}.`,
          diagnostics: qbdDiagnostics,
          qbdDailyFinancialSnapshots,
          qbdPublishResult,
          qbdBalanceSheetAnchor,
        });
      }
      financialPayload = await buildQuickBooksDesktopMappedMonthlyPayload(String(companyId), financialPayload);
      qbdDiagnostics.rebuiltMappedMonthlyData = true;
      qbdDiagnostics.rebuiltMonthlyRows = Array.isArray(financialPayload.monthlyData) ? financialPayload.monthlyData.length : 0;
      qbdDiagnostics.rebuiltCoverage = summarizeMonthlyRowsCoverage(
        Array.isArray(financialPayload.monthlyData) ? (financialPayload.monthlyData as Array<Record<string, unknown>>) : [],
      );
      const qbdHistoricalBsPreservation = await preserveQuickBooksDesktopHistoricalMonthlyBalanceSheet(
        String(companyId),
        financialPayload,
        { preserveAllBalanceSheet: !qbdDomainScope.canUpdateBalanceSheet },
      );
      qbdDiagnostics.historicalBalanceSheetPreservation = qbdHistoricalBsPreservation;

      const result = await ingestFinancialPayload({
        companyId: String(companyId),
        platform: 'QUICKBOOKS',
        source: configuredPlatform === 'QUICKBOOKS_ENTERPRISE' ? 'quickbooks-enterprise' : 'quickbooks-desktop',
        payload: financialPayload,
        syncType: 'reprocess_financial_payload',
        targetMonth: targetMonth || undefined,
        mode,
      });
      const qbdDailyFinancialSnapshots = result.ok && qbdDomainScope.canUpdateBalanceSheet
        ? targetMonth
          ? await rebuildQuickBooksDesktopDailyBalanceSheetMonth(String(companyId), targetMonth)
          : await persistQuickBooksDesktopDailyFinancialSnapshots(
              String(companyId),
              financialPayload,
              { canUpdatePnl: false, canUpdateBalanceSheet: true },
            )
        : null;
      if (qbdDailyFinancialSnapshots) {
        qbdDiagnostics.dailyFinancialSnapshots = qbdDailyFinancialSnapshots;
      }
      const qbdBalanceSheetAnchor = result.ok
        ? qbdDomainScope.canUpdateBalanceSheet
          ? await persistQuickBooksDesktopBalanceSheetAnchor(String(companyId), financialPayload)
          : null
        : null;
      if (qbdBalanceSheetAnchor) {
        qbdDiagnostics.balanceSheetAnchor = qbdBalanceSheetAnchor;
      }
      const qbdPublishResult = result.ok
        ? await publishMonthsFromMonthlyFinancialDirect({ companyId: String(companyId), force: true })
        : null;
      if (qbdPublishResult) {
        qbdDiagnostics.publishedMasterData = {
          success: qbdPublishResult.success,
          publishedMonths: qbdPublishResult.publishedMonths.length,
          skippedMonths: qbdPublishResult.skippedMonths.length,
          lockedMonths: qbdPublishResult.lockedMonths.length,
          missingMonths: qbdPublishResult.missingMonths.length,
          error: qbdPublishResult.error || null,
        };
      }
      if (result.ok) {
        setTimeout(async () => {
          const briefingWarmup = await warmDailyExecutiveBriefingCache({
            companyId: String(companyId),
            source: 'qbd-reprocess-mappings-complete',
          });
          if (!briefingWarmup.ok) {
            console.warn('Daily Executive Briefing warm-up failed after QBD reprocess:', {
              companyId: String(companyId),
              error: briefingWarmup.error,
              skipped: briefingWarmup.skipped,
            });
          }
          const industryWarmup = await warmDailyIndustryBriefCache({
            companyId: String(companyId),
            source: 'qbd-reprocess-mappings-complete',
          });
          if (!industryWarmup.ok) {
            console.warn('Daily Industry Brief warm-up failed after QBD reprocess:', {
              companyId: String(companyId),
              error: industryWarmup.error,
              skipped: industryWarmup.skipped,
            });
          }
        }, 0);
      }

      return NextResponse.json(
        {
          success: result.ok,
          message: result.ok
            ? 'QuickBooks Desktop reprocess completed successfully.'
            : result.error || 'QuickBooks Desktop reprocess failed.',
          diagnostics: qbdDiagnostics,
          qbdDailyFinancialSnapshots,
          qbdBalanceSheetAnchor,
          qbdPublishResult,
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

