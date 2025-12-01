import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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
              selectedSubscriptionPlan: true
            }
          }
        },
        orderBy: {
          paymentDate: 'desc'
        }
      });

      if (revenueRecords.length === 0) continue;

      const totalRevenue = revenueRecords.reduce((sum, r) => sum + r.amount, 0);
      const consultantShare = (totalRevenue * consultant.revenueSharePercentage) / 100;
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
            recordCount: 0
          });
        }
        const companyData = companiesMap.get(companyId);
        companyData.totalRevenue += record.amount;
        companyData.recordCount += 1;
      });

      report.push({
        consultantId: consultant.id,
        consultantName: consultant.fullName,
        companyName: consultant.companyName || '',
        revenueSharePercentage: consultant.revenueSharePercentage,
        totalRevenue,
        consultantShare,
        platformShare,
        recordCount: revenueRecords.length,
        companies: Array.from(companiesMap.values()),
        revenueRecords
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
