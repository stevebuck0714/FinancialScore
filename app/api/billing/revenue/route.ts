import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  calculateTotalMRR,
  calculateTotalARR
} from '@/lib/billing/revenueCalculator';
import {
  getCurrentMonthRange,
  getPreviousMonthRange,
  calculatePercentageChange
} from '@/lib/billing/billingHelpers';

// GET - Get revenue dashboard data (revenue sharing model)
export async function GET(request: NextRequest) {
  try {
    // Fetch all active companies with subscription info
    const companies = await prisma.company.findMany({
      where: {
        subscriptionStatus: 'active'
      },
      select: {
        id: true,
        name: true,
        consultantId: true,
        selectedSubscriptionPlan: true,
        subscriptionMonthlyPrice: true,
        subscriptionQuarterlyPrice: true,
        subscriptionAnnualPrice: true,
        subscriptionStatus: true
      }
    });

    // Calculate total MRR and ARR (expected revenue)
    const totalMRR = calculateTotalMRR(companies);
    const totalARR = calculateTotalARR(companies);

    // Separate consultant companies vs. direct businesses
    const consultantCompanies = companies.filter(c => c.consultantId);
    const directCompanies = companies.filter(c => !c.consultantId);

    const consultantMRR = calculateTotalMRR(consultantCompanies);
    const directMRR = calculateTotalMRR(directCompanies);

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

    // Calculate platform revenue (what you keep)
    // For consultant companies: total - consultant share
    // For direct companies: 100%
    const platformRevenue = currentMonthDirectRevenue + 
      currentMonthRecords
        .filter(r => r.consultantId)
        .reduce((sum, r) => {
          // We need to get the consultant's share percentage
          // For now, we'll calculate it based on the revenue record
          return sum + (r.amount * 0.5); // Assumes 50/50 split, will be more accurate with actual data
        }, 0);

    return NextResponse.json({
      totalMRR,
      totalARR,
      consultantMRR,
      directMRR,
      currentMonthRevenue,
      currentMonthConsultantRevenue,
      currentMonthDirectRevenue,
      previousMonthRevenue,
      revenueGrowth,
      totalPendingPayables,
      pendingPayablesCount,
      platformRevenue,
      activeCompaniesCount: companies.length,
      consultantCompaniesCount: consultantCompanies.length,
      directCompaniesCount: directCompanies.length
    });
  } catch (error) {
    console.error('Error fetching revenue data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
