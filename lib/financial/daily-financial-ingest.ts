import prisma from '@/lib/prisma';
import { BS_LAST_DAY_FIELDS, PNL_SUM_FIELDS, safeNumber } from '@/lib/financial/month-publish';

const NUMERIC_FIELDS = [...PNL_SUM_FIELDS, ...BS_LAST_DAY_FIELDS];

type RawRecord = Record<string, unknown>;
type RawMappedLine = {
  snapshotDate: string | Date;
  frequency?: string;
  sourceAccountName: string;
  sourceAccountId?: string | null;
  sourceAccountType?: string | null;
  targetField: string;
  amount: number;
};

type DailySnapshotDelegate = {
  upsert: (args: unknown) => Promise<unknown>;
};

type ImportRunDelegate = {
  create: (args: unknown) => Promise<unknown>;
};

type MappedLineDelegate = {
  upsert: (args: unknown) => Promise<unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getDailySnapshotDelegate(): DailySnapshotDelegate | null {
  const delegate = (prisma as unknown as Record<string, unknown>).dailyFinancialSnapshot as Record<string, unknown> | undefined;
  if (!delegate || typeof delegate.upsert !== 'function') return null;
  return delegate as unknown as DailySnapshotDelegate;
}

function getImportRunDelegate(): ImportRunDelegate | null {
  const delegate = (prisma as unknown as Record<string, unknown>).dailyFinancialImportRun as Record<string, unknown> | undefined;
  if (!delegate || typeof delegate.create !== 'function') return null;
  return delegate as unknown as ImportRunDelegate;
}

function getMappedLineDelegate(): MappedLineDelegate | null {
  const delegate = (prisma as unknown as Record<string, unknown>).dailyFinancialMappedLine as Record<string, unknown> | undefined;
  if (!delegate || typeof delegate.upsert !== 'function') return null;
  return delegate as unknown as MappedLineDelegate;
}

export type DailyFinancialIngestParams = {
  companyId: string;
  platform?: string;
  runId?: string | null;
  frequency?: string;
  records: RawRecord[];
  mappedLines?: Array<{
    snapshotDate: string | Date;
    frequency?: string;
    sourceAccountName: string;
    sourceAccountId?: string | null;
    sourceAccountType?: string | null;
    targetField: string;
    amount: number;
  }>;
};

function toDate(value: unknown): Date | null {
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function extractDailyFinancialRecordsFromMetadata(metadata: unknown): RawRecord[] {
  const source = asRecord(metadata);
  const candidates = [
    source.dailyFinancialSnapshots,
    source.dailyFinancialRecords,
    source.dailyTrialBalanceSnapshots,
    source.dailyTrialBalanceRecords,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as RawRecord[];
  }
  return [];
}

export function extractDailyFinancialMappedLinesFromMetadata(metadata: unknown): Array<{
  snapshotDate: string | Date;
  frequency?: string;
  sourceAccountName: string;
  sourceAccountId?: string | null;
  sourceAccountType?: string | null;
  targetField: string;
  amount: number;
}> {
  const source = asRecord(metadata);
  const candidates = [
    source.dailyFinancialMappedLines,
    source.dailyTrialBalanceMappedLines,
    source.mappedDailyFinancialLines,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as RawMappedLine[];
  }
  return [];
}

export async function ingestDailyFinancialSnapshots(params: DailyFinancialIngestParams): Promise<{
  success: boolean;
  ingested: number;
  skipped: number;
  error?: string;
}> {
  const companyId = String(params.companyId || '').trim();
  const platform = String(params.platform || 'SCHEDULED_INTEGRATION').trim();
  const runId = String(params.runId || '').trim() || null;
  const frequency = String(params.frequency || 'daily').trim().toLowerCase() || 'daily';
  const inputRecords = Array.isArray(params.records) ? params.records : [];
  const inputMappedLines = Array.isArray(params.mappedLines) ? params.mappedLines : [];

  if (!companyId) {
    return { success: false, ingested: 0, skipped: inputRecords.length, error: 'companyId is required' };
  }

  const dailySnapshotDelegate = getDailySnapshotDelegate();
  const importRunDelegate = getImportRunDelegate();
  const mappedLineDelegate = getMappedLineDelegate();
  if (!dailySnapshotDelegate || !importRunDelegate) {
    return {
      success: false,
      ingested: 0,
      skipped: inputRecords.length,
      error: 'Daily financial models are not available. Run prisma migrate + prisma generate.',
    };
  }

  let ingested = 0;
  let skipped = 0;
  let linesIngested = 0;
  const dates: Date[] = [];

  for (const rawRecord of inputRecords) {
    const snapshotDate = toDate(rawRecord?.snapshotDate || rawRecord?.date);
    if (!snapshotDate) {
      skipped += 1;
      continue;
    }

    const recordFrequency = String(rawRecord?.frequency || frequency || 'daily').toLowerCase();
    const normalized: Record<string, unknown> = {
      companyId,
      snapshotDate,
      frequency: recordFrequency,
      sourcePlatform: platform,
      sourceRunId: runId,
    };

    for (const field of NUMERIC_FIELDS) {
      normalized[field] = safeNumber(rawRecord?.[field]);
    }

    await dailySnapshotDelegate.upsert({
      where: {
        companyId_snapshotDate_frequency: {
          companyId,
          snapshotDate,
          frequency: recordFrequency,
        },
      },
      create: normalized,
      update: normalized,
    });

    ingested += 1;
    dates.push(snapshotDate);
  }

  for (const line of inputMappedLines) {
    if (!mappedLineDelegate) break;
    const snapshotDate = toDate(line.snapshotDate);
    if (!snapshotDate) continue;
    const sourceAccountName = String(line.sourceAccountName || '').trim();
    const targetField = String(line.targetField || '').trim();
    if (!sourceAccountName || !targetField) continue;
    const lineFrequency = String(line.frequency || frequency || 'daily').toLowerCase();

    await mappedLineDelegate.upsert({
      where: {
        companyId_snapshotDate_frequency_sourceAccountName_targetField: {
          companyId,
          snapshotDate,
          frequency: lineFrequency,
          sourceAccountName,
          targetField,
        },
      },
      create: {
        companyId,
        snapshotDate,
        frequency: lineFrequency,
        sourceAccountName,
        sourceAccountId: line.sourceAccountId || null,
        sourceAccountType: line.sourceAccountType || null,
        targetField,
        amount: safeNumber(line.amount),
        sourcePlatform: platform,
        sourceRunId: runId,
      },
      update: {
        sourceAccountId: line.sourceAccountId || null,
        sourceAccountType: line.sourceAccountType || null,
        amount: safeNumber(line.amount),
        sourcePlatform: platform,
        sourceRunId: runId,
      },
    });
    linesIngested += 1;
  }

  const latestDate = dates.length ? new Date(Math.max(...dates.map((entry) => entry.getTime()))) : new Date();

  await importRunDelegate.create({
    data: {
      companyId,
      platform,
      runType: 'daily',
      status: ingested > 0 ? 'SUCCESS' : 'FAILED',
      snapshotDate: latestDate,
      recordsIngested: ingested,
      errorMessage: ingested > 0 ? null : 'No valid records with snapshotDate were provided',
      metadata: {
        runId,
        providedRecordCount: inputRecords.length,
        skippedRecordCount: skipped,
          providedMappedLineCount: inputMappedLines.length,
          ingestedMappedLineCount: linesIngested,
      },
      finishedAt: new Date(),
    },
  });

  return { success: ingested > 0, ingested, skipped };
}
