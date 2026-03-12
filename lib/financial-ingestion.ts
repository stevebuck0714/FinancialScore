import prisma from '@/lib/prisma';
import { AccountingPlatform } from '@prisma/client';
import {
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

function parseMonthDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}$/.test(trimmed) ? `${trimmed}-01` : trimmed;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
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
  return fallback?.id || null;
}

function parseTargetMonth(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

function normalizeImportMode(value: unknown): FinancialImportMode {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'only' ? 'only' : 'through';
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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
}) {
  const startedAt = Date.now();
  const normalized = normalizePayload(params.payload);
  const canonicalRows = normalized.monthlyData;
  const targetMonthDate = parseTargetMonth(params.targetMonth);
  const mode = normalizeImportMode(params.mode);
  const filteredRows = targetMonthDate
    ? canonicalRows.filter((row) =>
        mode === 'only'
          ? row.monthDate.getFullYear() === targetMonthDate.getFullYear() &&
            row.monthDate.getMonth() === targetMonthDate.getMonth()
          : row.monthDate <= targetMonthDate
      )
    : canonicalRows;

  let rowsForRecord = filteredRows;

  if (targetMonthDate) {
    const latestFinancialRecord = await prisma.financialRecord.findFirst({
      where: { companyId: params.companyId },
      include: {
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
          ...(row as any),
          monthDate: row.monthDate,
        });
        merged.set(monthKey(canonical.monthDate), canonical);
      }
      for (const row of filteredRows) {
        merged.set(monthKey(row.monthDate), row);
      }
      rowsForRecord = Array.from(merged.values()).sort((a, b) => a.monthDate.getTime() - b.monthDate.getTime());
    }
  }

  const touchedMonths = filteredRows.map((row) => monthKey(row.monthDate));

  if (filteredRows.length === 0) {
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

  const anomalies = findZeroRevenueAnomalies(filteredRows);
  const latestMonth = filteredRows[filteredRows.length - 1].monthDate;
  const latestMonthKey = `${latestMonth.getFullYear()}-${String(latestMonth.getMonth() + 1).padStart(2, '0')}`;
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
      } as any,
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
      } as any,
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
