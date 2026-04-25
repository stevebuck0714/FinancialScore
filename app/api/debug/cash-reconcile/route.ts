/**
 * Debug: reconcile Cash Position chart vs TB for an Infor CSI company.
 *
 * Returns, for a given month range:
 *   - balance_movement:cash totals by source account / month (what the chart's
 *     rollforward consumes for each period's net change)
 *   - CashSnapshot rows on each requested anchor date (what the chart shows
 *     when no rollforward is needed)
 *   - The active sheet anchor (from lib/financial/cash-balance-sheet-anchor.ts)
 *
 * Auth: requires `?secret=<CRON_SECRET>` query param (matches cron handlers).
 *
 * Usage:
 *   GET /api/debug/cash-reconcile
 *     ?companyId=cmmcp278j0002kz0439rlixdj
 *     &start=2026-01-01
 *     &end=2026-03-31
 *     &anchorDays=2026-01-31,2026-02-28,2026-03-31
 *     &secret=...
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCashBalanceSheetAnchorConfig } from '@/lib/financial/cash-balance-sheet-anchor';

export const dynamic = 'force-dynamic';

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

function parseDayParam(value: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const cronSecret = process.env.CRON_SECRET || '';
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not set on server' }, { status: 500 });
  }
  const provided = searchParams.get('secret') || request.headers.get('x-cron-secret');
  if (provided !== cronSecret) return unauthorized();

  const companyId = searchParams.get('companyId');
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });

  const start = parseDayParam(searchParams.get('start')) || new Date('2026-01-01T00:00:00.000Z');
  const end = parseDayParam(searchParams.get('end')) || new Date('2026-03-31T00:00:00.000Z');
  const anchorDays = (searchParams.get('anchorDays') || '2026-01-31,2026-02-28,2026-03-31')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));

  try {
    const sheetAnchor = getCashBalanceSheetAnchorConfig(companyId);

    const movementBuckets = await prisma.$queryRawUnsafe<
      Array<{
        period_month: string;
        source_account_id: string | null;
        source_account_name: string | null;
        total: number;
        row_count: number;
        first_day: Date;
        last_day: Date;
      }>
    >(
      `SELECT to_char(date_trunc('month', "snapshotDate"), 'YYYY-MM') AS period_month,
              "sourceAccountId" AS source_account_id,
              "sourceAccountName" AS source_account_name,
              SUM(amount)::float8 AS total,
              COUNT(*)::int AS row_count,
              MIN("snapshotDate") AS first_day,
              MAX("snapshotDate") AS last_day
       FROM "DailyFinancialMappedLine"
       WHERE "companyId" = $1
         AND "frequency" = 'daily'
         AND "targetField" = 'balance_movement:cash'
         AND "snapshotDate" >= $2::date
         AND "snapshotDate" <= $3::date
       GROUP BY 1, 2, 3
       ORDER BY 1, 3, 2`,
      companyId,
      start,
      end
    );

    const dailyMovementRows = await prisma.$queryRawUnsafe<
      Array<{
        snapshot_date: Date;
        source_account_id: string | null;
        source_account_name: string | null;
        total: number;
      }>
    >(
      `SELECT "snapshotDate" AS snapshot_date,
              "sourceAccountId" AS source_account_id,
              "sourceAccountName" AS source_account_name,
              SUM(amount)::float8 AS total
       FROM "DailyFinancialMappedLine"
       WHERE "companyId" = $1
         AND "frequency" = 'daily'
         AND "targetField" = 'balance_movement:cash'
         AND "snapshotDate" >= $2::date
         AND "snapshotDate" <= $3::date
       GROUP BY 1, 2, 3
       HAVING SUM(amount) <> 0
       ORDER BY 1, 3`,
      companyId,
      start,
      end
    );

    const snapshotsByDay: Record<
      string,
      Array<{
        accountId: string | null;
        accountNumber: string | null;
        accountName: string | null;
        cashBalance: number;
        createdAt: Date;
      }>
    > = {};
    for (const day of anchorDays) {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          account_id: string | null;
          account_number: string | null;
          account_name: string | null;
          cash_balance: number;
          created_at: Date;
        }>
      >(
        `SELECT DISTINCT ON ("accountId", "accountNumber", "accountName")
                "accountId" AS account_id,
                "accountNumber" AS account_number,
                "accountName" AS account_name,
                "cashBalance"::float8 AS cash_balance,
                "createdAt" AS created_at
         FROM "CashSnapshot"
         WHERE "companyId" = $1
           AND "frequency" = 'daily'
           AND "snapshotDate" = $2::date
         ORDER BY "accountId", "accountNumber", "accountName", "createdAt" DESC`,
        companyId,
        day
      );
      snapshotsByDay[day] = rows.map((r) => ({
        accountId: r.account_id,
        accountNumber: r.account_number,
        accountName: r.account_name,
        cashBalance: Number(r.cash_balance || 0),
        createdAt: r.created_at,
      }));
    }

    // Also: rollforward this server would compute right now, summed per anchor day,
    // so we can compare to the chart and to TB without any client-side aggregation.
    let rollforwardByDay: Record<string, { totalCash: number; perAccount: Array<{ accountId: string | null; accountNumber: string | null; accountName: string | null; balance: number }> }> | null = null;
    if (sheetAnchor) {
      const anchorDate = new Date(`${sheetAnchor.anchorDateIso}T00:00:00.000Z`);
      const balances = new Map<string, { accountId: string | null; accountNumber: string | null; accountName: string | null; balance: number }>();
      for (const a of sheetAnchor.accounts) {
        const key = a.accountId || a.accountNumber || a.accountName;
        balances.set(key, { accountId: a.accountId, accountNumber: a.accountNumber, accountName: a.accountName, balance: a.cashBalance });
      }
      // Pull all movements between anchor and the latest requested anchor day
      const latestAnchorDay = anchorDays[anchorDays.length - 1] || end.toISOString().slice(0, 10);
      const allMovements = await prisma.$queryRawUnsafe<
        Array<{ snapshot_date: Date; source_account_id: string | null; source_account_name: string | null; total: number }>
      >(
        `SELECT "snapshotDate" AS snapshot_date,
                "sourceAccountId" AS source_account_id,
                "sourceAccountName" AS source_account_name,
                SUM(amount)::float8 AS total
         FROM "DailyFinancialMappedLine"
         WHERE "companyId" = $1
           AND "frequency" = 'daily'
           AND "targetField" = 'balance_movement:cash'
           AND "snapshotDate" > $2::date
           AND "snapshotDate" <= $3::date
         GROUP BY 1, 2, 3
         ORDER BY 1`,
        companyId,
        anchorDate,
        new Date(`${latestAnchorDay}T00:00:00.000Z`)
      );
      rollforwardByDay = {};
      // Walk forward day by day; record snapshot at each anchor day
      const anchorDaySet = new Set(anchorDays);
      const movementsByDay = new Map<string, typeof allMovements>();
      for (const m of allMovements) {
        const k = new Date(m.snapshot_date).toISOString().slice(0, 10);
        if (!movementsByDay.has(k)) movementsByDay.set(k, []);
        movementsByDay.get(k)!.push(m);
      }
      const dayCursor = new Date(anchorDate);
      while (dayCursor <= new Date(`${latestAnchorDay}T00:00:00.000Z`)) {
        dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
        const k = dayCursor.toISOString().slice(0, 10);
        const todays = movementsByDay.get(k) || [];
        for (const m of todays) {
          const key = m.source_account_id || m.source_account_name || 'UNKNOWN';
          const existing = balances.get(key);
          if (existing) {
            existing.balance += Number(m.total || 0);
          } else {
            balances.set(key, {
              accountId: m.source_account_id,
              accountNumber: m.source_account_id, // best effort
              accountName: m.source_account_name,
              balance: Number(m.total || 0),
            });
          }
        }
        if (anchorDaySet.has(k)) {
          const perAccount = Array.from(balances.values()).map((v) => ({ ...v }));
          const totalCash = perAccount.reduce((s, r) => s + r.balance, 0);
          rollforwardByDay[k] = { totalCash, perAccount };
        }
      }
    }

    return NextResponse.json({
      companyId,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      sheetAnchor,
      monthlyMovementByAccount: movementBuckets,
      dailyNonZeroMovementSample: dailyMovementRows,
      snapshotsByDay,
      rollforwardByDay,
    });
  } catch (err) {
    console.error('cash-reconcile failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
