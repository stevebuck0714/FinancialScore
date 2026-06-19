import prisma from '@/lib/prisma';
import { AccountingPlatform } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  MONTHLY_FINANCIAL_NUMERIC_FIELDS,
  findZeroRevenueAnomalies,
  toCanonicalMonthlyFinancial,
  toMonthlyFinancialCreateInput,
  type CanonicalMonthlyFinancial,
} from '@/lib/financial-canonical';

export type CanonicalFinancialPayload = {
  monthlyData: CanonicalMonthlyFinancial[];
  metadata?: Record<string, unknown>;
};

type FinancialImportMode = 'through' | 'only';

// Always returns UTC start-of-month. See lib/date-utils.ts.
function parseMonthDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0));
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}$/.test(trimmed) ? `${trimmed}-01` : trimmed;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1, 0, 0, 0, 0));
}

function normalizePayload(payload: unknown): CanonicalFinancialPayload {
  const src = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
  const rawRows = Array.isArray(src.monthlyData) ? src.monthlyData : [];
  const rows: CanonicalMonthlyFinancial[] = [];
  for (const row of rawRows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const rowObj = row as Record<string, unknown>;
    const monthDate = parseMonthDate(rowObj.monthDate ?? rowObj.date ?? rowObj.month);
    if (!monthDate) continue;
    rows.push(toCanonicalMonthlyFinancial({ ...rowObj, monthDate }));
  }

  // De-duplicate by month; keep latest occurrence in payload.
  const deduped = new Map<string, CanonicalMonthlyFinancial>();
  for (const row of rows) {
    const key = `${row.monthDate.getFullYear()}-${String(row.monthDate.getMonth() + 1).padStart(2, '0')}`;
    deduped.set(key, row);
  }
  const monthlyData = Array.from(deduped.values()).sort((a, b) => a.monthDate.getTime() - b.monthDate.getTime());
  const metadata =
    src.metadata && typeof src.metadata === 'object' && !Array.isArray(src.metadata)
      ? (src.metadata as Record<string, unknown>)
      : {};
  return { monthlyData, metadata };
}

async function resolveUploadedByUserId(companyId: string, preferredUserId?: string): Promise<string | null> {
  if (preferredUserId) {
    const user = await prisma.user.findFirst({
      where: { id: preferredUserId, companyId },
      select: { id: true },
    });
    if (user?.id) return user.id;
  }
  const latestRecord = await prisma.financialRecord.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    select: { uploadedByUserId: true },
  });
  if (latestRecord?.uploadedByUserId) return latestRecord.uploadedByUserId;
  const fallback = await prisma.user.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (fallback?.id) return fallback.id;

  // Multi-tenant fallback: some users are linked via UserCompanyAccess only.
  const accessFallback = await prisma.userCompanyAccess.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
    select: { userId: true },
  });
  if (accessFallback?.userId) return accessFallback.userId;

  // Last-resort fallback for legacy data shapes.
  const anyUser = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return anyUser?.id || null;
}

// UTC. Local-TZ accessors here used to silently shift boundary monthDates
// (eg. 2026-03-01T00:00:00Z) to the previous month on negative-offset
// laptops. See lib/date-utils.ts for the broader rule.
function parseTargetMonth(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) return null;
  const [yearToken, monthToken] = trimmed.split('-');
  const year = Number(yearToken);
  const month = Number(monthToken);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  // Through-mode comparisons use `row.monthDate <= targetMonthDate`.
  // Return end-of-target-month UTC so rows dated at month end are included.
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function normalizeImportMode(value: unknown): FinancialImportMode {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'only' ? 'only' : 'through';
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

const PNL_NUMERIC_FIELDS = [
  'revenue',
  'expense',
  'cogsPayroll',
  'cogsOwnerPay',
  'cogsContractors',
  'cogsMaterials',
  'cogsCommissions',
  'cogsOther',
  'cogsTotal',
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
  'nonOperatingIncome',
  'nonOperatingExpense',
  'extraordinaryItems',
] as const satisfies ReadonlyArray<(typeof MONTHLY_FINANCIAL_NUMERIC_FIELDS)[number]>;

function hasJsonEntries(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0);
}

function mergePnlFields(target: CanonicalMonthlyFinancial, source: CanonicalMonthlyFinancial): CanonicalMonthlyFinancial {
  const merged = { ...target };
  for (const field of PNL_NUMERIC_FIELDS) {
    if (Number(merged[field] || 0) === 0 && Number(source[field] || 0) !== 0) {
      merged[field] = source[field];
    }
  }
  if (!hasJsonEntries(merged.revenueBreakdown) && hasJsonEntries(source.revenueBreakdown)) {
    merged.revenueBreakdown = source.revenueBreakdown;
  }
  if (!hasJsonEntries(merged.cogsBreakdown) && hasJsonEntries(source.cogsBreakdown)) {
    merged.cogsBreakdown = source.cogsBreakdown;
  }
  if (!hasJsonEntries(merged.expenseBreakdown) && hasJsonEntries(source.expenseBreakdown)) {
    merged.expenseBreakdown = source.expenseBreakdown;
  }
  if (!hasJsonEntries(merged.lobBreakdowns) && hasJsonEntries(source.lobBreakdowns)) {
    merged.lobBreakdowns = source.lobBreakdowns;
  }
  return merged;
}

function mergeTargetMonthRow(
  existing: CanonicalMonthlyFinancial | undefined,
  incoming: CanonicalMonthlyFinancial,
): CanonicalMonthlyFinancial {
  if (!existing) return incoming;
  return mergePnlFields(incoming, existing);
}

export async function ingestFinancialPayload(params: {
  companyId: string;
  platform: AccountingPlatform;
  source: string;
  payload: unknown;
  preferredUserId?: string;
  syncType?: string;
  targetMonth?: string;
  mode?: FinancialImportMode;
  maxMonths?: number;
}) {
  const startedAt = Date.now();
  const normalized = normalizePayload(params.payload);
  const canonicalRows = normalized.monthlyData;
  const targetMonthDate = parseTargetMonth(params.targetMonth);
  const mode = normalizeImportMode(params.mode);
  const filteredRowsBase = targetMonthDate
    ? canonicalRows.filter((row) =>
        mode === 'only'
          ? row.monthDate.getUTCFullYear() === targetMonthDate.getUTCFullYear() &&
            row.monthDate.getUTCMonth() === targetMonthDate.getUTCMonth()
          : row.monthDate <= targetMonthDate
      )
    : canonicalRows;
  const boundedRows =
    targetMonthDate && mode === 'through' && Number.isFinite(params.maxMonths) && Number(params.maxMonths) > 0
      ? (() => {
          const maxMonths = Math.max(1, Math.floor(Number(params.maxMonths)));
          // UTC start-of-earliest-month — see comment on parseTargetMonth.
          const earliestAllowed = new Date(
            Date.UTC(
              targetMonthDate.getUTCFullYear(),
              targetMonthDate.getUTCMonth() - (maxMonths - 1),
              1,
              0,
              0,
              0,
              0,
            ),
          );
          return filteredRowsBase.filter((row) => row.monthDate >= earliestAllowed);
        })()
      : filteredRowsBase;

  let rowsForRecord = boundedRows;

  if (targetMonthDate) {
    const existingPnlByMonth = new Map<string, CanonicalMonthlyFinancial>();
    const boundedMonthDates = boundedRows.map((row) => row.monthDate);
    if (boundedMonthDates.length > 0) {
      const historicalRows = await prisma.monthlyFinancial.findMany({
        where: {
          companyId: params.companyId,
          monthDate: { in: boundedMonthDates },
        },
        orderBy: { createdAt: 'desc' },
      });
      for (const row of historicalRows) {
        const canonical = toCanonicalMonthlyFinancial({
          ...(row as unknown as Record<string, unknown>),
          monthDate: row.monthDate,
        });
        const key = monthKey(canonical.monthDate);
        const existing = existingPnlByMonth.get(key);
        existingPnlByMonth.set(key, existing ? mergePnlFields(existing, canonical) : canonical);
      }
    }

    const latestFinancialRecord = await prisma.financialRecord.findFirst({
      where: { companyId: params.companyId },
      select: {
        id: true,
        monthlyData: {
          orderBy: { monthDate: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (latestFinancialRecord?.monthlyData?.length) {
      const merged = new Map<string, CanonicalMonthlyFinancial>();
      for (const row of latestFinancialRecord.monthlyData) {
        const canonical = toCanonicalMonthlyFinancial({
          ...(row as unknown as Record<string, unknown>),
          monthDate: row.monthDate,
        });
        merged.set(monthKey(canonical.monthDate), canonical);
      }
      for (const row of boundedRows) {
        const key = monthKey(row.monthDate);
        merged.set(key, mergeTargetMonthRow(existingPnlByMonth.get(key) || merged.get(key), row));
      }
      rowsForRecord = Array.from(merged.values()).sort((a, b) => a.monthDate.getTime() - b.monthDate.getTime());
    }
  }

  const touchedMonths = boundedRows.map((row) => monthKey(row.monthDate));

  if (boundedRows.length === 0) {
    return {
      ok: false,
      status: 400,
      error: targetMonthDate
        ? `No valid monthlyData rows found for targetMonth ${params.targetMonth}.`
        : 'No valid monthlyData rows found in payload.',
    };
  }

  const userId = await resolveUploadedByUserId(params.companyId, params.preferredUserId);
  if (!userId) {
    return {
      ok: false,
      status: 400,
      error: 'Unable to resolve uploadedByUserId for company.',
    };
  }

  const touchedMonthSet = new Set(touchedMonths);
  const validationRows = targetMonthDate
    ? rowsForRecord.filter((row) => touchedMonthSet.has(monthKey(row.monthDate)))
    : boundedRows;
  const anomalies = findZeroRevenueAnomalies(validationRows);
  const latestMonth = validationRows[validationRows.length - 1]?.monthDate || boundedRows[boundedRows.length - 1].monthDate;
  const latestMonthKey = `${latestMonth.getUTCFullYear()}-${String(latestMonth.getUTCMonth() + 1).padStart(2, '0')}`;
  const latestMonthWarnings = anomalies.filter((x) => x.month === latestMonthKey);
  const blockingFailures = anomalies.filter((x) => x.month !== latestMonthKey);
  if (blockingFailures.length > 0) {
    return {
      ok: false,
      status: 422,
      error: 'Financial payload validation failed',
      details: `Income is zero with non-zero COGS/Expenses for month(s): ${Array.from(new Set(blockingFailures.map((x) => x.month))).join(', ')}`,
      blockingFailures,
      latestMonthWarnings,
    };
  }

  const financialRecord = await prisma.financialRecord.create({
    data: {
      companyId: params.companyId,
      uploadedByUserId: userId,
      fileName: `${params.source} Push - ${new Date().toISOString()}`,
      fileUrl: null,
      rawData: {
        source: params.source,
        syncDate: new Date().toISOString(),
        payload: params.payload,
        metadata: normalized.metadata,
        importWindow: targetMonthDate
          ? {
              targetMonth: params.targetMonth,
              mode,
              monthsTouched: touchedMonths,
            }
          : null,
        validation: { latestMonthWarnings },
      } as Prisma.InputJsonValue,
      columnMapping: {
        source: params.source,
        method: 'push_payload',
      },
    },
  });

  await prisma.monthlyFinancial.createMany({
    data: rowsForRecord.map((row) => toMonthlyFinancialCreateInput(params.companyId, financialRecord.id, row)),
  });

  await prisma.apiSyncLog.create({
    data: {
      companyId: params.companyId,
      platform: params.platform,
      syncType: params.syncType || 'financial_push',
      status: 'success',
      recordsImported: rowsForRecord.length,
      errorCount: 0,
      errorDetails: {
        source: params.source,
        targetMonth: params.targetMonth || null,
        mode: targetMonthDate ? mode : null,
        monthsTouched: touchedMonths,
        latestMonthWarnings,
        metadata: normalized.metadata,
      } as Prisma.InputJsonValue,
      duration: Date.now() - startedAt,
    },
  });

  await prisma.accountingConnection.updateMany({
    where: {
      companyId: params.companyId,
      platform: params.platform,
    },
    data: {
      status: 'ACTIVE',
      lastSyncAt: new Date(),
      errorMessage: null,
    },
  });

  return {
    ok: true,
    status: 200,
    financialRecordId: financialRecord.id,
    recordsImported: rowsForRecord.length,
    monthsTouched: touchedMonths,
    latestMonthWarnings,
  };
}
