import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - Revenue by consultant report (revenue sharing model)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Get all consultants
    const consultants = await prisma.consultant.findMany({
      select: {
        id: true,
        fullName: true,
        companyName: true,
        revenueSharePercentage: true
      }
    });

    const report = [];

    for (const consultant of consultants) {
      // Get revenue records for this consultant
      const where: any = {
        consultantId: consultant.id,
        paymentStatus: 'received'
      };

      if (startDate && endDate) {
        where.paymentDate = {
          gte: new Date(startDate),
          lte: new Date(endDate)
        };
      }

      const revenueRecords = await prisma.revenueRecord.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              selectedSubscriptionPlan: true,
              commercialBillingMethod: true,
              commercialPaymentStatus: true,
              commercialInvoiceNumber: true
            }
          }
        },
        orderBy: {
          paymentDate: 'desc'
        }
      });

      const referralWhere: any = {
        paymentStatus: 'received',
        serviceType: { in: ['setup_fee', 'core'] },
        company: {
          referralPartnerConsultantId: consultant.id
        }
      };

      if (startDate && endDate) {
        referralWhere.paymentDate = {
          gte: new Date(startDate),
          lte: new Date(endDate)
        };
      }

      const referralRecords = await prisma.revenueRecord.findMany({
        where: referralWhere,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              selectedSubscriptionPlan: true,
              referralSetupFeePercentage: true,
              referralRecurringFeePercentage: true,
              commercialBillingMethod: true,
              commercialPaymentStatus: true,
              commercialInvoiceNumber: true
            }
          }
        },
        orderBy: {
          paymentDate: 'desc'
        }
      });

      if (revenueRecords.length === 0 && referralRecords.length === 0) continue;

      const ownedRevenue = revenueRecords.reduce((sum, r) => sum + r.amount, 0);
      const ownedConsultantShare = (ownedRevenue * consultant.revenueSharePercentage) / 100;
      const referralRevenue = referralRecords.reduce((sum, r) => sum + r.amount, 0);
      const referralShare = referralRecords.reduce((sum, r) => {
        const percentage = r.serviceType === 'setup_fee'
          ? r.company.referralSetupFeePercentage
          : r.company.referralRecurringFeePercentage;
        return sum + ((r.amount * Number(percentage || 0)) / 100);
      }, 0);
      const totalRevenue = ownedRevenue + referralRevenue;
      const consultantShare = ownedConsultantShare + referralShare;
      const platformShare = totalRevenue - consultantShare;

      // Group by company
      const companiesMap = new Map();
      revenueRecords.forEach(record => {
        const companyId = record.companyId;
        if (!companiesMap.has(companyId)) {
          companiesMap.set(companyId, {
            id: record.company.id,
            name: record.company.name,
            totalRevenue: 0,
            recordCount: 0,
            commercialBillingMethod: record.company.commercialBillingMethod,
            commercialPaymentStatus: record.company.commercialPaymentStatus,
            commercialInvoiceNumber: record.company.commercialInvoiceNumber
          });
        }
        const companyData = companiesMap.get(companyId);
        companyData.totalRevenue += record.amount;
        companyData.recordCount += 1;
      });
      referralRecords.forEach(record => {
        const companyId = record.companyId;
        if (!companiesMap.has(companyId)) {
          companiesMap.set(companyId, {
            id: record.company.id,
            name: record.company.name,
            totalRevenue: 0,
            recordCount: 0,
            referralRevenue: 0,
            commercialBillingMethod: record.company.commercialBillingMethod,
            commercialPaymentStatus: record.company.commercialPaymentStatus,
            commercialInvoiceNumber: record.company.commercialInvoiceNumber
          });
        }
        const companyData = companiesMap.get(companyId);
        companyData.totalRevenue += record.amount;
        companyData.referralRevenue = (companyData.referralRevenue || 0) + record.amount;
        companyData.recordCount += 1;
      });

      report.push({
        consultantId: consultant.id,
        consultantName: consultant.fullName,
        companyName: consultant.companyName || '',
        revenueSharePercentage: consultant.revenueSharePercentage,
        ownedRevenue,
        ownedConsultantShare,
        referralRevenue,
        referralShare,
        totalRevenue,
        consultantShare,
        platformShare,
        recordCount: revenueRecords.length + referralRecords.length,
        companies: Array.from(companiesMap.values()),
        revenueRecords,
        referralRecords
      });
    }

    // Sort by total revenue descending
    report.sort((a, b) => b.totalRevenue - a.totalRevenue);

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Error generating consultant revenue report:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
