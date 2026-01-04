import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { companyId, dataType = 'all', monthsBack = 12, secret } = await request.json();

    // Simple auth check using CRON_SECRET
    const expectedSecret = process.env.CRON_SECRET || 'dev-secret-change-me';
    if (secret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      );
    }

    console.log('🌱 Seeding operational data for company:', companyId);
    console.log('📊 Data type:', dataType);
    console.log('📅 Months back:', monthsBack);

    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    const results: any = {
      companyId,
      companyName: company.name,
      seeded: {},
    };

    // Generate daily cash snapshots
    if (dataType === 'all' || dataType === 'cash') {
      console.log('💰 Generating daily cash snapshots...');
      
      const cashSnapshots = [];
      const today = new Date();
      const daysToGenerate = monthsBack * 30; // Approximate days
      
      // Starting cash balance
      let currentBalance = 50000 + Math.random() * 50000; // $50k-$100k starting
      
      for (let i = daysToGenerate; i >= 0; i--) {
        const snapshotDate = new Date(today);
        snapshotDate.setDate(today.getDate() - i);
        snapshotDate.setHours(0, 0, 0, 0);
        
        // Daily cash flow variation (-$5k to +$10k)
        const dailyChange = (Math.random() - 0.3) * 15000;
        currentBalance += dailyChange;
        
        // Ensure balance doesn't go negative
        currentBalance = Math.max(currentBalance, 5000);
        
        // Weekly payroll dip (every 7 days)
        if (i % 7 === 0) {
          currentBalance -= 8000 + Math.random() * 4000; // $8k-$12k payroll
        }
        
        // Monthly rent payment (around day 1 of month)
        if (snapshotDate.getDate() === 1) {
          currentBalance -= 5000 + Math.random() * 3000; // $5k-$8k rent
        }
        
        cashSnapshots.push({
          companyId,
          snapshotDate,
          frequency: 'daily',
          accountId: 'CASH_MAIN',
          accountName: 'Operating Cash',
          cashBalance: currentBalance,
          changeAmount: dailyChange,
          changePercent: ((dailyChange / (currentBalance - dailyChange)) * 100),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      
      // Delete existing cash snapshots for this company
      await prisma.cashSnapshot.deleteMany({
        where: { companyId },
      });
      
      // Insert new snapshots
      await prisma.cashSnapshot.createMany({
        data: cashSnapshots,
      });
      
      results.seeded.cashSnapshots = cashSnapshots.length;
      console.log(`✅ Created ${cashSnapshots.length} daily cash snapshots`);
    }

    // Generate AR Aging snapshots (monthly)
    if (dataType === 'all' || dataType === 'ar') {
      console.log('📊 Generating AR Aging snapshots...');
      
      const arSnapshots = [];
      const today = new Date();
      
      for (let i = 0; i < monthsBack; i++) {
        const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        
        // Generate realistic AR aging data
        const totalAR = 50000 + Math.random() * 100000; // $50k-$150k
        const current = totalAR * (0.5 + Math.random() * 0.2); // 50-70%
        const days1to30 = totalAR * (0.15 + Math.random() * 0.1); // 15-25%
        const days31to60 = totalAR * (0.05 + Math.random() * 0.05); // 5-10%
        const days61to90 = totalAR * (0.02 + Math.random() * 0.03); // 2-5%
        const days90plus = totalAR - current - days1to30 - days31to60 - days61to90;
        
        arSnapshots.push({
          companyId,
          snapshotDate,
          frequency: 'monthly',
          totalAR,
          current,
          days1to30,
          days31to60,
          days61to90,
          days90plus: Math.max(days90plus, 0),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      
      // Delete existing AR snapshots
      await prisma.aRAgingSnapshot.deleteMany({
        where: { companyId },
      });
      
      // Insert new snapshots
      await prisma.aRAgingSnapshot.createMany({
        data: arSnapshots,
      });
      
      results.seeded.arSnapshots = arSnapshots.length;
      console.log(`✅ Created ${arSnapshots.length} AR Aging snapshots`);
    }

    // Generate AP Aging snapshots (monthly)
    if (dataType === 'all' || dataType === 'ap') {
      console.log('📊 Generating AP Aging snapshots...');
      
      const apSnapshots = [];
      const today = new Date();
      
      for (let i = 0; i < monthsBack; i++) {
        const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        
        // Generate realistic AP aging data
        const totalAP = 30000 + Math.random() * 70000; // $30k-$100k
        const current = totalAP * (0.6 + Math.random() * 0.2); // 60-80%
        const days1to30 = totalAP * (0.1 + Math.random() * 0.1); // 10-20%
        const days31to60 = totalAP * (0.03 + Math.random() * 0.05); // 3-8%
        const days61to90 = totalAP * (0.01 + Math.random() * 0.02); // 1-3%
        const days90plus = totalAP - current - days1to30 - days31to60 - days61to90;
        
        apSnapshots.push({
          companyId,
          snapshotDate,
          frequency: 'monthly',
          totalAP,
          current,
          days1to30,
          days31to60,
          days61to90,
          days90plus: Math.max(days90plus, 0),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      
      // Delete existing AP snapshots
      await prisma.aPAgingSnapshot.deleteMany({
        where: { companyId },
      });
      
      // Insert new snapshots
      await prisma.aPAgingSnapshot.createMany({
        data: apSnapshots,
      });
      
      results.seeded.apSnapshots = apSnapshots.length;
      console.log(`✅ Created ${apSnapshots.length} AP Aging snapshots`);
    }

    console.log('✅ Operational data seeding complete');
    return NextResponse.json({
      success: true,
      message: 'Operational data seeded successfully',
      results,
    });

  } catch (error) {
    console.error('❌ Error seeding operational data:', error);
    return NextResponse.json(
      { error: 'Failed to seed operational data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

