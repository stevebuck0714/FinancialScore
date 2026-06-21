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
      },
      include: {
        company: {
          select: {
            referralPartnerConsultantId: true,
            referralSetupFeePercentage: true,
            referralRecurringFeePercentage: true
          }
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
    const currentMonthReferralAttributedRevenue = currentMonthRecords
      .filter((record) =>
        !!record.company?.referralPartnerConsultantId &&
        ['setup_fee', 'core'].includes(record.serviceType || 'core')
      )
      .reduce((sum, record) => sum + record.amount, 0);
    const currentMonthReferralPayableEstimate = currentMonthRecords.reduce((sum, record) => {
      if (!record.company?.referralPartnerConsultantId) return sum;
      const serviceType = record.serviceType || 'core';
      if (serviceType !== 'setup_fee' && serviceType !== 'core') return sum;
      const percentage = serviceType === 'setup_fee'
        ? record.company.referralSetupFeePercentage
        : record.company.referralRecurringFeePercentage;
      return sum + ((record.amount * Number(percentage || 0)) / 100);
    }, 0);

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
    const totalPendingReferralPayables = pendingPayables
      .filter((p) => p.payableType === 'referral_partner')
      .reduce((sum, p) => sum + p.payableAmount, 0);
    const pendingReferralPayablesCount = pendingPayables.filter((p) => p.payableType === 'referral_partner').length;

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
    const commercialCompanies = await prisma.company.findMany({
      select: {
        commercialBillingMethod: true,
        commercialPaymentStatus: true,
      }
    });
    const companyCountsByBillingMethod = commercialCompanies.reduce<Record<string, number>>((acc, company) => {
      const key = company.commercialBillingMethod || 'usaepay';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const companyCountsByPaymentStatus = commercialCompanies.reduce<Record<string, number>>((acc, company) => {
      const key = company.commercialPaymentStatus || 'not_billed';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      totalMRR,
      totalARR,
      consultantMRR,
      directMRR,
      currentMonthRevenue,
      currentMonthConsultantRevenue,
      currentMonthDirectRevenue,
      currentMonthRevenueByService,
      currentMonthReferralAttributedRevenue,
      currentMonthReferralPayableEstimate,
      previousMonthRevenue,
      revenueGrowth,
      totalPendingPayables,
      pendingPayablesCount,
      totalPendingReferralPayables,
      pendingReferralPayablesCount,
      platformRevenue,
      activeCompaniesCount,
      consultantCompaniesCount,
      directCompaniesCount,
      companyCountsByBillingMethod,
      companyCountsByPaymentStatus
    });
  } catch (error) {
    console.error('Error fetching revenue data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
