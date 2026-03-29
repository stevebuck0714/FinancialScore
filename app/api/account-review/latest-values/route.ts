import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';

export const dynamic = 'force-dynamic';

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function readAny(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(record)) lower.set(k.toLowerCase(), v);
  for (const key of keys) {
    const value = lower.get(key.toLowerCase());
    if (value !== undefined) return value;
  }
  return undefined;
}

function toYearMonth(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const compact = raw.match(/^(\d{4})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}

function collectValuesFromInforPayload(rawPayload: unknown, targetMonth: string | null): Map<string, number> {
  const valueByKey = new Map<string, number>();
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return valueByKey;
  }
  const payload = rawPayload as Record<string, unknown>;
  const glResponses = Array.isArray(payload.glResponses) ? payload.glResponses : [];
  const accountAccumulator = new Map<string, number>();

  for (const entry of glResponses) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const entryRecord = entry as Record<string, unknown>;
    const response =
      entryRecord.response && typeof entryRecord.response === 'object' && !Array.isArray(entryRecord.response)
        ? (entryRecord.response as Record<string, unknown>)
        : null;
    const items =
      Array.isArray(response?.Items) ? (response?.Items as unknown[])
      : Array.isArray(response?.items) ? (response?.items as unknown[])
      : Array.isArray(entryRecord.Items) ? (entryRecord.Items as unknown[])
      : [];

    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const acct = String(readAny(row, ['Acct', 'AcctNum', 'Account', 'account', 'accountId', 'accountCode']) ?? '').trim();
      if (!acct) continue;

      const year = normalizeNumber(readAny(row, ['ControlYear', 'controlYear', 'FiscalYear', 'fiscalYear']));
      const period = normalizeNumber(readAny(row, ['ControlPeriod', 'controlPeriod', 'FiscalPeriod', 'fiscalPeriod']));
      const rowMonth =
        year >= 1900 && period >= 1 && period <= 12
          ? `${Math.trunc(year)}-${String(Math.trunc(period)).padStart(2, '0')}`
          : toYearMonth(readAny(row, ['PeriodEndDate', 'periodEndDate', 'RecordDate', 'recordDate', 'TransDate', 'transDate', 'Date', 'date']));
      if (targetMonth && rowMonth && rowMonth !== targetMonth) continue;

      const amount = normalizeNumber(
        readAny(row, [
          'EndBalance',
          'endBalance',
          'EndingBalance',
          'endingBalance',
          'Balance',
          'balance',
          'PeriodEndBalance',
          'periodEndBalance',
          'YtdBalance',
          'ytdBalance',
          'ACAM',
          'Amount',
          'amount',
          'DomAmount',
          'domAmount',
        ]),
      );
      accountAccumulator.set(acct, Number(accountAccumulator.get(acct) || 0) + amount);

      const name = String(
        readAny(row, ['Description', 'description', 'AcctDesc', 'accountName', 'Name', 'name']) ?? '',
      )
        .trim()
        .toLowerCase();
      if (name) valueByKey.set(`name:${name}`, amount);
    }
  }

  for (const [acct, amount] of accountAccumulator.entries()) {
    valueByKey.set(`id:${String(acct).trim()}`, amount);
  }
  return valueByKey;
}

function parseMonthBoundary(targetMonth: string | null): { start: Date; endExclusive: Date } {
  if (targetMonth && /^\d{4}-\d{2}$/.test(targetMonth)) {
    const [yearStr, monthStr] = targetMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endExclusive = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    return { start, endExclusive };
  }
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, endExclusive };
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const searchParams = request.nextUrl.searchParams;
    const companyId = String(searchParams.get('companyId') || '').trim();
    const targetMonthRaw = String(searchParams.get('targetMonth') || '').trim();
    const targetMonth = /^\d{4}-\d{2}$/.test(targetMonthRaw) ? targetMonthRaw : null;

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('AccountReviewLatestValues', companyId, 'READ');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rows = await prisma.$queryRaw<Array<{ csi: unknown; m3: unknown }>>`
      SELECT
        "connectionMetadata"->'inforCsiFinancialPayload' AS csi,
        "connectionMetadata"->'inforM3FinancialPayload' AS m3
      FROM "AccountingConnection"
      WHERE "companyId" = ${companyId}
        AND platform = 'INFOR_M3'
      LIMIT 1
    `;
    const metadataPayload = rows[0]?.csi ?? rows[0]?.m3 ?? null;
    const valueByKey = collectValuesFromInforPayload(metadataPayload, targetMonth);

    // Fallback for environments where stored GL payload is missing/empty:
    // use latest mapped-line rows for the selected month keyed by account id/name.
    if (valueByKey.size === 0) {
      const { start, endExclusive } = parseMonthBoundary(targetMonth);
      const mappedLines = await (prisma as any).dailyFinancialMappedLine.findMany({
        where: {
          companyId,
          frequency: 'daily',
          snapshotDate: { gte: start, lt: endExclusive },
        },
        select: {
          snapshotDate: true,
          sourceAccountId: true,
          sourceAccountName: true,
          amount: true,
        },
        orderBy: [{ snapshotDate: 'desc' }],
      });

      for (const row of mappedLines) {
        const amount = normalizeNumber(row?.amount);
        const sourceId = String(row?.sourceAccountId || '').trim();
        const sourceName = String(row?.sourceAccountName || '').trim().toLowerCase();
        if (sourceId && !valueByKey.has(`id:${sourceId}`)) {
          valueByKey.set(`id:${sourceId}`, amount);
        }
        if (sourceName && !valueByKey.has(`name:${sourceName}`)) {
          valueByKey.set(`name:${sourceName}`, amount);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      companyId,
      targetMonth,
      count: valueByKey.size,
      values: Object.fromEntries(valueByKey.entries()),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to load account review latest values',
        details,
      },
      { status: 500 },
    );
  }
}
