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
    // Fetch all companies (subscription fields don't exist in production DB)
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        consultantId: true
        // subscription fields don't exist in production DB
        // selectedSubscriptionPlan: true,
        // subscriptionMonthlyPrice: true,
        // subscriptionQuarterlyPrice: true,
        // subscriptionAnnualPrice: true,
        // subscriptionStatus: true
      }
    });

    // Since subscription fields don't exist, use default revenue calculations
    // Assume standard pricing: $195/month for consultants, $195/month for direct (can be adjusted)
    const defaultMonthlyPrice = 195;

    // Separate consultant companies vs. direct businesses
    const consultantCompanies = companies.filter(c => c.consultantId);
    const directCompanies = companies.filter(c => !c.consultantId);

    // Calculate revenue based on company count * default pricing
    const totalMRR = companies.length * defaultMonthlyPrice;
    const totalARR = totalMRR * 12;

    const consultantMRR = consultantCompanies.length * defaultMonthlyPrice;
    const directMRR = directCompanies.length * defaultMonthlyPrice;

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
    // For consultant companies: assume 50/50 split
    // For direct companies: 100%
    const consultantSplit = 0.5; // 50% goes to consultant, 50% to platform
    const platformRevenue = currentMonthDirectRevenue +
      (currentMonthConsultantRevenue * (1 - consultantSplit));

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
