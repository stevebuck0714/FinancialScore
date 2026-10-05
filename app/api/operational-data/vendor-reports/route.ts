import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { formatEstDate } from '@/lib/time/eastern';
import { ensureProductRevenueTables } from '@/lib/operations/product-revenue-actual-db';
import { ensureVendorMonthlyForecastTables, assertVendorsForecastAccess } from '@/lib/operations/vendor-monthly-forecast-db';
import { buildMockVendorReportsPayload } from '@/lib/operations/sector-mock-data';

export const dynamic = 'force-dynamic';

type ForecastRow = {
  vendorId: string;
  vendorName: string;
  itemSku: string;
  productionType: string | null;
  forecastQty: unknown;
  actualQty: unknown;
};

type PriceRow = {
  itemSku: string;
  contractPrice: number | null;
  sgpPrice: number | null;
};

function asYear(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100
    ? parsed
    : Number(formatEstDate(new Date()).slice(0, 4));
}

function qtyForMonth(value: unknown, month: number): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const candidate = Number((value as Record<string, unknown>)[String(month)]);
  return Number.isFinite(candidate) ? candidate : 0;
}

function recentMonthNumbers(): number[] {
  const month = Number(formatEstDate(new Date()).slice(5, 7));
  return Array.from({ length: 6 }, (_, index) => ((month - 6 + index + 12) % 12) + 1);
}

function monthLabel(month: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2024, month - 1, 1)));
}

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });

    const denied = await assertVendorsForecastAccess(companyId);
    if (denied) return denied;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { forceOperationalMockData: true, industrySectorCategory: true },
    });
    if (company?.forceOperationalMockData) {
      return NextResponse.json(buildMockVendorReportsPayload(companyId, company.industrySectorCategory));
    }

    await Promise.all([ensureVendorMonthlyForecastTables(), ensureProductRevenueTables()]);
    const year = asYear(request.nextUrl.searchParams.get('year'));
    const months = recentMonthNumbers();
    const latestSnapshot = await prisma.vendorSnapshot.findFirst({
      where: { companyId },
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    });
    const [snapshots, payments, forecastRows, prices] = await Promise.all([
      latestSnapshot
        ? prisma.vendorSnapshot.findMany({
            where: { companyId, snapshotDate: latestSnapshot.snapshotDate },
            select: {
              vendorId: true, vendorName: true, termsCode: true, status: true, lastPurchaseDate: true,
              purchaseYtd: true, purchaseLastYear: true, payYtd: true, payLastYear: true,
            },
            orderBy: { purchaseYtd: 'desc' },
          })
        : [],
      prisma.aPPaymentFact.findMany({
        where: {
          companyId,
          paymentDate: { gte: new Date(Date.UTC(year, Number(formatEstDate(new Date()).slice(5, 7)) - 6, 1)) },
        },
        select: { vendorId: true, vendorName: true, paymentDate: true, paidAmountHome: true },
        orderBy: { paymentDate: 'asc' },
      }),
      prisma.$queryRawUnsafe<ForecastRow[]>(
        `SELECT "vendorId", "vendorName", "itemSku", "productionType", "forecastQty", "actualQty"
           FROM "VendorMonthlyForecastLine"
          WHERE "companyId" = $1 AND "year" = $2`,
        companyId, year
      ),
      prisma.$queryRawUnsafe<PriceRow[]>(
        `SELECT "itemSku", "contractPrice", "sgpPrice"
           FROM "ProductRevenuePrice"
          WHERE "companyId" = $1 AND "year" = $2`,
        companyId, year
      ),
    ]);

    const priceBySku = new Map<string, PriceRow>();
    prices.forEach((row) => {
      const existing = priceBySku.get(row.itemSku);
      if (!existing || Number(row.contractPrice || 0) > Number(existing.contractPrice || 0)) priceBySku.set(row.itemSku, row);
    });
    const paymentByVendor = new Map<string, number>();
    const paymentsByMonth = new Map<string, Map<number, number>>();
    payments.forEach((payment) => {
      const key = payment.vendorId || payment.vendorName;
      const amount = Number(payment.paidAmountHome || 0);
      paymentByVendor.set(key, (paymentByVendor.get(key) || 0) + amount);
      const month = payment.paymentDate.getUTCMonth() + 1;
      const totals = paymentsByMonth.get(key) || new Map<number, number>();
      totals.set(month, (totals.get(month) || 0) + amount);
      paymentsByMonth.set(key, totals);
    });

    const catalog = snapshots.map((snapshot) => ({
      vendorId: snapshot.vendorId,
      vendorName: snapshot.vendorName,
      termsCode: snapshot.termsCode || '—',
      status: snapshot.status || '—',
      lastPurchaseDate: snapshot.lastPurchaseDate?.toISOString().slice(0, 10) || null,
      purchaseYtd: Number(snapshot.purchaseYtd || 0),
      purchaseLastYear: Number(snapshot.purchaseLastYear || 0),
      payYtd: Number(snapshot.payYtd || 0),
      payLastYear: Number(snapshot.payLastYear || 0),
    }));
    const itemVolumePricing = forecastRows.map((row) => {
      const price = priceBySku.get(row.itemSku);
      const actual6mo = months.reduce((sum, month) => sum + qtyForMonth(row.actualQty, month), 0);
      const forecast6mo = months.reduce((sum, month) => sum + qtyForMonth(row.forecastQty, month), 0);
      return {
        vendorName: row.vendorName,
        itemSku: row.itemSku,
        actual6mo,
        forecast6mo,
        contractPrice: Number(price?.contractPrice || 0),
        sgpPrice: Number(price?.sgpPrice || 0),
      };
    }).sort((a, b) => b.actual6mo - a.actual6mo || b.forecast6mo - a.forecast6mo);

    const paymentHistory = Array.from(
      new Set([...catalog.map((row) => row.vendorId), ...paymentByVendor.keys()])
    ).map((vendorKey) => {
      const snapshot = catalog.find((row) => row.vendorId === vendorKey);
      const paymentMonths = paymentsByMonth.get(vendorKey) || new Map<number, number>();
      return {
        vendorName: snapshot?.vendorName || payments.find((row) => (row.vendorId || row.vendorName) === vendorKey)?.vendorName || vendorKey,
        totalPaid: paymentByVendor.get(vendorKey) || 0,
        months: months.map((month) => ({ month: monthLabel(month), amount: paymentMonths.get(month) || 0 })),
      };
    }).sort((a, b) => b.totalPaid - a.totalPaid);

    const totalSpend = paymentHistory.reduce((sum, row) => sum + row.totalPaid, 0);
    const concentration = paymentHistory.slice(0, 10).map((row) => ({
      vendorName: row.vendorName,
      spend: row.totalPaid,
      sharePct: totalSpend ? (row.totalPaid / totalSpend) * 100 : 0,
    }));
    const priceChanges = itemVolumePricing
      .filter((row) => row.contractPrice || row.sgpPrice)
      .map((row) => ({
        vendorName: row.vendorName,
        itemSku: row.itemSku,
        contractPrice: row.contractPrice,
        sgpPrice: row.sgpPrice,
        variance: row.sgpPrice - row.contractPrice,
        variancePct: row.contractPrice ? ((row.sgpPrice - row.contractPrice) / row.contractPrice) * 100 : 0,
      }))
      .sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct));
    const spendCategories = new Map<string, number>();
    forecastRows.forEach((row) => {
      const price = Number(priceBySku.get(row.itemSku)?.contractPrice || 0);
      const volume = months.reduce((sum, month) => sum + qtyForMonth(row.actualQty, month), 0);
      const category = row.productionType || 'Uncategorized';
      spendCategories.set(category, (spendCategories.get(category) || 0) + volume * price);
    });

    return NextResponse.json({
      year,
      asOf: latestSnapshot?.snapshotDate.toISOString() || null,
      hasData: Boolean(snapshots.length || payments.length || forecastRows.length),
      catalog,
      itemVolumePricing,
      paymentHistory,
      concentration,
      priceChanges,
      spendByItemCategory: [...spendCategories.entries()]
        .map(([category, spend]) => ({ category, spend }))
        .sort((a, b) => b.spend - a.spend),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load vendor reports' }, { status: 500 });
  }
}
