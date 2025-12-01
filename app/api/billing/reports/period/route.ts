import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calculatePeriodRevenue } from '@/lib/billing/revenueCalculator';
import { getDateRangeForPeriod } from '@/lib/billing/billingHelpers';

// GET - Revenue by time period report
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodType = searchParams.get('periodType') as 'month' | 'quarter' | 'year' || 'month';
    const periodsCount = parseInt(searchParams.get('periodsCount') || '12');

    const report: any[] = [];

    for (let i = 0; i < periodsCount; i++) {
      const offset = -(periodsCount - 1 - i); // Start from oldest period
      const { start, end } = getDateRangeForPeriod(periodType, offset);

      // Fetch invoices for this period
      const invoices = await prisma.invoice.findMany({
        where: {
          billingPeriodStart: {
            gte: start,
            lte: end
          }
        },
        select: {
          amount: true,
          status: true,
          billingPeriodStart: true,
          billingPeriodEnd: true,
          planType: true
        }
      });

      const totalRevenue = calculatePeriodRevenue(invoices, start, end);
      const totalInvoices = invoices.filter(inv => inv.status === 'paid').length;
      const pendingRevenue = invoices
        .filter(inv => inv.status === 'pending' || inv.status === 'overdue')
        .reduce((sum, inv) => sum + inv.amount, 0);

      report.push({
        period: `${start.toLocaleString('default', { month: 'short' })} ${start.getFullYear()}`,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        totalRevenue,
        totalInvoices,
        pendingRevenue,
        invoices: invoices.length
      });
    }

    return NextResponse.json({ report, periodType });
  } catch (error) {
    console.error('Error generating period revenue report:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

