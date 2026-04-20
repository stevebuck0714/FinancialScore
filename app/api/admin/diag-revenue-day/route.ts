/**
 * TEMPORARY READ-ONLY ADMIN DIAGNOSTIC.
 *
 * Returns a per-account breakdown of GLTransactionFact rows for one company
 * on one day, joined against AccountMapping so we can see which accounts are
 * unmapped. Used to diagnose the 2026-03-10 Atlantic Precision revenue
 * anomaly (Total Revenue $2.7M but Finished Goods Sales $0).
 *
 * Auth: CRON_SECRET via either x-cron-secret header or ?secret= query param.
 * No writes. Delete this file once the diagnosis is complete.
 *
 * Usage:
 *   GET /api/admin/diag-revenue-day?companyId=XXX&date=2026-03-10
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const headerSecret = request.headers.get('x-cron-secret');
  const querySecret = new URL(request.url).searchParams.get('secret');
  return headerSecret === expected || querySecret === expected;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId') || '';
  const dateStr = url.searchParams.get('date') || '';

  if (!companyId || !dateStr) {
    return NextResponse.json(
      { error: 'companyId and date (YYYY-MM-DD) are required' },
      { status: 400 },
    );
  }

  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(`${dateStr}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 });
  }

  const rows: any[] = await prisma.gLTransactionFact.findMany({
    where: {
      companyId,
      OR: [
        { transDate: { gte: start, lte: end } },
        { distDate: { gte: start, lte: end } },
      ],
    },
    select: {
      accountId: true,
      accountName: true,
      accountType: true,
      accountCategory: true,
      signedAmount: true,
      debitAmount: true,
      creditAmount: true,
      drCr: true,
      transNum: true,
      ref: true,
      description: true,
      sourceProgram: true,
      transDate: true,
      distDate: true,
    },
  });

  type Bucket = {
    accountId: string;
    accountName: string;
    accountType: string;
    accountCategory: string;
    rowCount: number;
    totalDebit: number;
    totalCredit: number;
    totalSigned: number;
    samplePrograms: string[];
  };

  const byAccount = new Map<string, Bucket>();
  for (const r of rows) {
    const key = `${r.accountId}::${r.accountName || ''}`;
    let b = byAccount.get(key);
    if (!b) {
      b = {
        accountId: String(r.accountId || ''),
        accountName: String(r.accountName || ''),
        accountType: String(r.accountType || ''),
        accountCategory: String(r.accountCategory || ''),
        rowCount: 0,
        totalDebit: 0,
        totalCredit: 0,
        totalSigned: 0,
        samplePrograms: [],
      };
      byAccount.set(key, b);
    }
    b.rowCount += 1;
    b.totalDebit += Number(r.debitAmount || 0);
    b.totalCredit += Number(r.creditAmount || 0);
    b.totalSigned += Number(r.signedAmount || 0);
    if (r.sourceProgram && !b.samplePrograms.includes(String(r.sourceProgram))) {
      if (b.samplePrograms.length < 5) b.samplePrograms.push(String(r.sourceProgram));
    }
  }

  const accountIds = Array.from(byAccount.values()).map((b) => b.accountId).filter(Boolean);
  const mappings = await prisma.accountMapping.findMany({
    where: { companyId, accountId: { in: accountIds } },
    select: {
      accountId: true,
      accountName: true,
      targetField: true,
      accountClassification: true,
    },
  });
  const mappingByAccountId = new Map<string, (typeof mappings)[number]>();
  for (const m of mappings) {
    if (m.accountId) mappingByAccountId.set(String(m.accountId), m);
  }

  const sorted = Array.from(byAccount.values()).sort(
    (a, b) => Math.abs(b.totalSigned) - Math.abs(a.totalSigned),
  );

  let totalDebit = 0;
  let totalCredit = 0;
  let totalSigned = 0;
  let revenueLikeSigned = 0;
  let revenueAccountsTouched = 0;
  let unmappedRevenueSigned = 0;

  const accountsOut = sorted.map((b) => {
    const mapping = mappingByAccountId.get(b.accountId);
    const isRevenueLike =
      /revenue|sales|income/i.test(b.accountType || '') ||
      /revenue|sales|income/i.test(b.accountCategory || '') ||
      /revenue|sales|income/i.test(b.accountName || '');

    if (isRevenueLike) {
      revenueAccountsTouched += 1;
      revenueLikeSigned += b.totalSigned;
      if (!mapping) unmappedRevenueSigned += b.totalSigned;
    }
    totalDebit += b.totalDebit;
    totalCredit += b.totalCredit;
    totalSigned += b.totalSigned;

    return {
      accountId: b.accountId,
      accountName: b.accountName,
      accountType: b.accountType,
      accountCategory: b.accountCategory,
      isRevenueLike,
      mapped: !!mapping,
      mappedTargetField: mapping?.targetField || null,
      mappedClassification: mapping?.accountClassification || null,
      mappedAccountName: mapping?.accountName || null,
      rowCount: b.rowCount,
      totalDebit: b.totalDebit,
      totalCredit: b.totalCredit,
      totalSigned: b.totalSigned,
      samplePrograms: b.samplePrograms,
    };
  });

  // Sample journal entries for the largest revenue-like account.
  const largestRevenue = sorted.find((b) => {
    return (
      /revenue|sales|income/i.test(b.accountType || '') ||
      /revenue|sales|income/i.test(b.accountCategory || '') ||
      /revenue|sales|income/i.test(b.accountName || '')
    );
  });
  const sampleEntries = largestRevenue
    ? rows
        .filter((r) => String(r.accountId || '') === largestRevenue.accountId)
        .sort(
          (a, b) =>
            Math.abs(Number(b.signedAmount || 0)) - Math.abs(Number(a.signedAmount || 0)),
        )
        .slice(0, 15)
        .map((r) => ({
          transNum: r.transNum,
          ref: r.ref,
          signedAmount: Number(r.signedAmount || 0),
          debitAmount: Number(r.debitAmount || 0),
          creditAmount: Number(r.creditAmount || 0),
          sourceProgram: r.sourceProgram,
          description: r.description,
          transDate: r.transDate,
          distDate: r.distDate,
        }))
    : [];

  // DFS cross-check.
  const dfs = await prisma.dailyFinancialSnapshot.findFirst({
    where: { companyId, frequency: 'daily', snapshotDate: start },
    select: { revenue: true, cogsTotal: true, expense: true, ar: true, snapshotDate: true },
  });

  return NextResponse.json({
    companyId,
    date: dateStr,
    glFactRowCount: rows.length,
    accountCount: accountsOut.length,
    totals: {
      debit: totalDebit,
      credit: totalCredit,
      signed: totalSigned,
    },
    revenueRollup: {
      accountsTouched: revenueAccountsTouched,
      totalSigned: revenueLikeSigned,
      unmappedSigned: unmappedRevenueSigned,
    },
    largestRevenueAccount: largestRevenue
      ? {
          accountId: largestRevenue.accountId,
          accountName: largestRevenue.accountName,
          totalSigned: largestRevenue.totalSigned,
          mapped: !!mappingByAccountId.get(largestRevenue.accountId),
        }
      : null,
    sampleEntriesForLargestRevenueAccount: sampleEntries,
    dailyFinancialSnapshot: dfs
      ? {
          snapshotDate: dfs.snapshotDate,
          revenue: Number(dfs.revenue || 0),
          cogsTotal: Number(dfs.cogsTotal || 0),
          expense: Number(dfs.expense || 0),
          ar: Number(dfs.ar || 0),
        }
      : null,
    accounts: accountsOut,
  });
}
