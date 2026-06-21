import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  getCurrentMonthRange,
  getPreviousMonthRange,
  calculatePercentageChange
} from '@/lib/billing/billingHelpers';

// GET - Get revenue dashboard data (revenue sharing model)
export async function GET() {
  try {
    // Get current month revenue (actual payments received)
    const currentMonthRange = getCurrentMonthRange();
    const currentMonthRecords = await prisma.revenueRecord.findMany({
      where: {
        paymentStatus: 'received',
        paymentDate: {
          gte: currentMonthRange.start,
          lte: currentMonthRange.end
        }
      }
    });

    const currentMonthRevenue = currentMonthRecords.reduce((sum, r) => sum + r.amount, 0);
    const currentMonthConsultantRevenue = currentMonthRecords
      .filter(r => r.consultantId)
      .reduce((sum, r) => sum + r.amount, 0);
    const currentMonthDirectRevenue = currentMonthRecords
      .filter(r => !r.consultantId)
      .reduce((sum, r) => sum + r.amount, 0);
    const currentMonthRevenueByService = currentMonthRecords.reduce<Record<string, number>>((acc, record) => {
      const serviceType = record.serviceType || 'core';
      acc[serviceType] = (acc[serviceType] || 0) + record.amount;
      return acc;
    }, {});

    // MRR/ARR derived from actual current month revenue
    const totalMRR = currentMonthRevenue;
    const totalARR = totalMRR * 12;
    const consultantMRR = currentMonthConsultantRevenue;
    const directMRR = currentMonthDirectRevenue;

    // Get previous month revenue for comparison
    const previousMonthRange = getPreviousMonthRange();
    const previousMonthRecords = await prisma.revenueRecord.findMany({
      where: {
        paymentStatus: 'received',
        paymentDate: {
          gte: previousMonthRange.start,
          lte: previousMonthRange.end
        }
      }
    });

    const previousMonthRevenue = previousMonthRecords.reduce((sum, r) => sum + r.amount, 0);
    const revenueGrowth = calculatePercentageChange(currentMonthRevenue, previousMonthRevenue);

    // Get pending consultant payables
    const pendingPayables = await prisma.consultantPayable.findMany({
      where: {
        status: 'pending'
      }
    });

    const totalPendingPayables = pendingPayables.reduce((sum, p) => sum + p.payableAmount, 0);
    const pendingPayablesCount = pendingPayables.length;

    // Platform revenue = total revenue minus what's owed to consultants
    const platformRevenue = currentMonthRevenue - totalPendingPayables;

    // Count only companies that have paid (have at least one received revenue record)
    const payingCompanyIds = await prisma.revenueRecord.findMany({
      where: { paymentStatus: 'received' },
      select: { companyId: true, consultantId: true },
      distinct: ['companyId'],
    });
    const consultantCompaniesCount = payingCompanyIds.filter(r => r.consultantId).length;
    const directCompaniesCount = payingCompanyIds.filter(r => !r.consultantId).length;
    const activeCompaniesCount = payingCompanyIds.length;

    return NextResponse.json({
      totalMRR,
      totalARR,
      consultantMRR,
      directMRR,
      currentMonthRevenue,
      currentMonthConsultantRevenue,
      currentMonthDirectRevenue,
      currentMonthRevenueByService,
      previousMonthRevenue,
      revenueGrowth,
      totalPendingPayables,
      pendingPayablesCount,
      platformRevenue,
      activeCompaniesCount,
      consultantCompaniesCount,
      directCompaniesCount
    });
  } catch (error) {
    console.error('Error fetching revenue data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
