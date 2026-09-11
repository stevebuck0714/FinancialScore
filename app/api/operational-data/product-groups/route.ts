import { NextRequest, NextResponse } from 'next/server';
import { asForecastYear, assertProductsForecastAccess, ensureProductRevenueTables } from '@/lib/operations/product-revenue-actual-db';
import { loadProductGroupDataset } from '@/lib/operations/product-group-reports';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const denied = await assertProductsForecastAccess(companyId);
    if (denied) return denied;

    await ensureProductRevenueTables();
    const year = asForecastYear(request.nextUrl.searchParams.get('year'));
    const dataset = await loadProductGroupDataset({ companyId, year });
    const historyLines = await prisma.productRevenueLine.findMany({
      where: { companyId },
      select: { year: true, customerGroup: true, actualRevenue: true },
      orderBy: [{ year: 'asc' }, { customerGroup: 'asc' }],
    });
    const historyByGroup = new Map<string, { key: string; label: string; values: Record<string, number>; total: number }>();
    const monthKeys = new Set<string>();
    for (const line of historyLines) {
      const group = String(line.customerGroup || '').trim() || 'Unassigned';
      const bucket = historyByGroup.get(group) || { key: group, label: group, values: {}, total: 0 };
      const actualRevenue = line.actualRevenue && typeof line.actualRevenue === 'object' && !Array.isArray(line.actualRevenue)
        ? line.actualRevenue as Record<string, unknown>
        : {};
      for (let month = 1; month <= 12; month += 1) {
        const value = Number(actualRevenue[String(month)] || 0);
        if (!Number.isFinite(value) || value === 0) continue;
        const monthKey = `${line.year}-${String(month).padStart(2, '0')}`;
        bucket.values[monthKey] = Number(bucket.values[monthKey] || 0) + value;
        bucket.total += value;
        monthKeys.add(monthKey);
      }
      historyByGroup.set(group, bucket);
    }
    const salesHistory = {
      months: Array.from(monthKeys).sort().map((monthKey) => ({
        monthKey,
        monthLabel: new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      })),
      rows: Array.from(historyByGroup.values())
        .filter((row) => row.total !== 0)
        .sort((left, right) => right.total - left.total),
    };
    return NextResponse.json({ ...dataset, salesHistory });
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : '';
    return NextResponse.json(
      { error: message || 'Failed to load group reports' },
      { status: 500 }
    );
  }
}
