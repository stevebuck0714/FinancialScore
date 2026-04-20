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

  // DFS cross-check + provenance.
  const dfs = await prisma.dailyFinancialSnapshot.findFirst({
    where: { companyId, frequency: 'daily', snapshotDate: start },
    select: {
      revenue: true,
      cogsTotal: true,
      expense: true,
      ar: true,
      snapshotDate: true,
      sourcePlatform: true,
      sourceRunId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Per-account breakdown for the same day from DailyFinancialMappedLine.
  // This is what the Daily Financials UI uses for the line-by-line P&L
  // breakdown ("Finished Goods Sales: $0" etc.). If the aggregate revenue
  // is $2.7M but the mapped-line rows show none of it, we know exactly
  // where the number is/isn't living.
  const mappedLineDelegate: any = (prisma as any).dailyFinancialMappedLine;
  let mappedLines: any[] = [];
  let mappedLinesByTarget: Array<{ targetField: string; rowCount: number; sumAmount: number }> = [];
  if (mappedLineDelegate?.findMany) {
    mappedLines = await mappedLineDelegate.findMany({
      where: {
        companyId,
        frequency: 'daily',
        snapshotDate: { gte: start, lte: end },
      },
      select: {
        snapshotDate: true,
        sourceAccountName: true,
        sourceAccountId: true,
        sourceAccountType: true,
        targetField: true,
        amount: true,
        sourcePlatform: true,
        sourceRunId: true,
      },
      orderBy: { amount: 'desc' },
      take: 200,
    });
    const byTarget = new Map<string, { rowCount: number; sumAmount: number }>();
    for (const line of mappedLines) {
      const t = String(line.targetField || '');
      const b = byTarget.get(t) || { rowCount: 0, sumAmount: 0 };
      b.rowCount += 1;
      b.sumAmount += Number(line.amount || 0);
      byTarget.set(t, b);
    }
    mappedLinesByTarget = Array.from(byTarget.entries())
      .map(([targetField, v]) => ({ targetField, ...v }))
      .sort((a, b) => Math.abs(b.sumAmount) - Math.abs(a.sumAmount));
  }

  // Recent DFS import runs that touched this date — tells us which platform
  // / run wrote the current value into DFS (operational-sync vs raw ingest
  // vs daily-bs-from-gl rebuild).
  const importRunDelegate: any = (prisma as any).dailyFinancialImportRun;
  let importRuns: any[] = [];
  if (importRunDelegate?.findMany) {
    importRuns = await importRunDelegate.findMany({
      where: {
        companyId,
        snapshotDate: { gte: start, lte: end },
      },
      select: {
        platform: true,
        runType: true,
        status: true,
        snapshotDate: true,
        startedAt: true,
        finishedAt: true,
        recordsIngested: true,
        errorMessage: true,
      },
      orderBy: { startedAt: 'desc' },
      take: 25,
    });
  }

  // Operational sales source cross-check: ProductSalesSnapshot is what
  // operational-sync.ts uses as `revenueFromOps` and the DFS revenue field
  // is `Math.max(revenueFromOps, revenueFromGl)`. If GL says zero but DFS
  // says $X, then $X is parked here.
  const productSalesAgg = await (prisma as any).productSalesSnapshot.aggregate({
    where: { companyId, frequency: 'daily', snapshotDate: { gte: start, lte: end } },
    _sum: { revenue: true, cogs: true },
    _count: { _all: true },
  });
  const customerSalesAgg = await (prisma as any).customerSalesSnapshot.aggregate({
    where: { companyId, frequency: 'daily', snapshotDate: { gte: start, lte: end } },
    _sum: { revenue: true, cogs: true },
    _count: { _all: true },
  });
  const topCustomerSalesRows = await (prisma as any).customerSalesSnapshot.findMany({
    where: { companyId, frequency: 'daily', snapshotDate: { gte: start, lte: end } },
    select: {
      snapshotDate: true,
      customerId: true,
      customerName: true,
      revenue: true,
      cogs: true,
      invoiceCount: true,
    },
    orderBy: { revenue: 'desc' },
    take: 15,
  });
  const topProductSalesRows = await (prisma as any).productSalesSnapshot.findMany({
    where: { companyId, frequency: 'daily', snapshotDate: { gte: start, lte: end } },
    select: {
      snapshotDate: true,
      itemId: true,
      itemName: true,
      sku: true,
      revenue: true,
      cogs: true,
      quantitySold: true,
    },
    orderBy: { revenue: 'desc' },
    take: 15,
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
          sourcePlatform: (dfs as any).sourcePlatform || null,
          sourceRunId: (dfs as any).sourceRunId || null,
          createdAt: (dfs as any).createdAt || null,
          updatedAt: (dfs as any).updatedAt || null,
        }
      : null,
    dailyFinancialMappedLines: {
      rowCount: mappedLines.length,
      byTargetField: mappedLinesByTarget,
      sampleRows: mappedLines.slice(0, 30).map((l: any) => ({
        snapshotDate: l.snapshotDate,
        sourceAccountName: l.sourceAccountName,
        sourceAccountId: l.sourceAccountId,
        sourceAccountType: l.sourceAccountType,
        targetField: l.targetField,
        amount: Number(l.amount || 0),
        sourcePlatform: l.sourcePlatform,
        sourceRunId: l.sourceRunId,
      })),
    },
    dailyFinancialImportRuns: importRuns.map((r: any) => ({
      platform: r.platform,
      runType: r.runType,
      status: r.status,
      snapshotDate: r.snapshotDate,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      recordsIngested: Number(r.recordsIngested || 0),
      errorMessage: r.errorMessage || null,
    })),
    operationalSales: {
      productSalesSnapshot: {
        rowCount: Number(productSalesAgg?._count?._all || 0),
        sumRevenue: Number(productSalesAgg?._sum?.revenue || 0),
        sumCogs: Number(productSalesAgg?._sum?.cogs || 0),
      },
      customerSalesSnapshot: {
        rowCount: Number(customerSalesAgg?._count?._all || 0),
        sumRevenue: Number(customerSalesAgg?._sum?.revenue || 0),
        sumCogs: Number(customerSalesAgg?._sum?.cogs || 0),
      },
      topCustomersByRevenue: topCustomerSalesRows.map((r: any) => ({
        snapshotDate: r.snapshotDate,
        customerId: r.customerId,
        customerName: r.customerName,
        revenue: Number(r.revenue || 0),
        cogs: Number(r.cogs || 0),
        invoiceCount: Number(r.invoiceCount || 0),
      })),
      topProductsByRevenue: topProductSalesRows.map((r: any) => ({
        snapshotDate: r.snapshotDate,
        itemId: r.itemId,
        itemName: r.itemName,
        sku: r.sku,
        revenue: Number(r.revenue || 0),
        cogs: Number(r.cogs || 0),
        quantitySold: Number(r.quantitySold || 0),
      })),
    },
    accounts: accountsOut,
  });
}
