import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Checking operational data frequencies...\n');

    // Get first company
    const company = await prisma.company.findFirst({
      orderBy: { createdAt: 'asc' }
    });

    if (!company) {
      return NextResponse.json({ error: 'No companies found' }, { status: 404 });
    }

    // Check Customer Sales by frequency
    const customerDaily = await prisma.customerSalesSnapshot.count({
      where: { companyId: company.id, frequency: 'daily' }
    });
    const customerWeekly = await prisma.customerSalesSnapshot.count({
      where: { companyId: company.id, frequency: 'weekly' }
    });
    const customerMonthly = await prisma.customerSalesSnapshot.count({
      where: { companyId: company.id, frequency: 'monthly' }
    });

    // Check Product Sales by frequency
    const productDaily = await prisma.productSalesSnapshot.count({
      where: { companyId: company.id, frequency: 'daily' }
    });
    const productWeekly = await prisma.productSalesSnapshot.count({
      where: { companyId: company.id, frequency: 'weekly' }
    });
    const productMonthly = await prisma.productSalesSnapshot.count({
      where: { companyId: company.id, frequency: 'monthly' }
    });

    // Check Inventory by frequency
    const inventoryDaily = await prisma.inventorySnapshot.count({
      where: { companyId: company.id, frequency: 'daily' }
    });
    const inventoryWeekly = await prisma.inventorySnapshot.count({
      where: { companyId: company.id, frequency: 'weekly' }
    });
    const inventoryMonthly = await prisma.inventorySnapshot.count({
      where: { companyId: company.id, frequency: 'monthly' }
    });

    // Check Cash by frequency
    const cashDaily = await prisma.cashSnapshot.count({
      where: { companyId: company.id, frequency: 'daily' }
    });
    const cashWeekly = await prisma.cashSnapshot.count({
      where: { companyId: company.id, frequency: 'weekly' }
    });
    const cashMonthly = await prisma.cashSnapshot.count({
      where: { companyId: company.id, frequency: 'monthly' }
    });

    // Get sample daily customer data
    const sampleCustomerDaily = await prisma.customerSalesSnapshot.findMany({
      where: { companyId: company.id, frequency: 'daily' },
      orderBy: { snapshotDate: 'desc' },
      take: 5,
      select: {
        snapshotDate: true,
        customerName: true,
        revenue: true,
        frequency: true
      }
    });

    const totalRecords = customerDaily + customerWeekly + customerMonthly +
                        productDaily + productWeekly + productMonthly +
                        inventoryDaily + inventoryWeekly + inventoryMonthly +
                        cashDaily + cashWeekly + cashMonthly;

    let status = 'ok';
    let message = '';
    
    if (totalRecords === 0) {
      status = 'no_data';
      message = 'No operational data found! Run: npx ts-node prisma/seed-operational-data.ts';
    } else if (customerDaily === 0 && productDaily === 0 && inventoryDaily === 0) {
      status = 'missing_frequencies';
      message = 'Only monthly data found. Daily/weekly data missing! Run: npx ts-node prisma/seed-operational-data.ts';
    } else {
      message = 'All frequencies have data!';
    }

    return NextResponse.json({
      status,
      message,
      company: {
        id: company.id,
        name: company.name
      },
      counts: {
        customerSales: {
          daily: customerDaily,
          weekly: customerWeekly,
          monthly: customerMonthly,
          total: customerDaily + customerWeekly + customerMonthly
        },
        productSales: {
          daily: productDaily,
          weekly: productWeekly,
          monthly: productMonthly,
          total: productDaily + productWeekly + productMonthly
        },
        inventory: {
          daily: inventoryDaily,
          weekly: inventoryWeekly,
          monthly: inventoryMonthly,
          total: inventoryDaily + inventoryWeekly + inventoryMonthly
        },
        cash: {
          daily: cashDaily,
          weekly: cashWeekly,
          monthly: cashMonthly,
          total: cashDaily + cashWeekly + cashMonthly
        }
      },
      sampleDailyData: sampleCustomerDaily,
      totalRecords
    });

  } catch (error: any) {
    console.error('❌ Error checking operational data:', error);
    return NextResponse.json(
      { error: 'Failed to check operational data', details: error.message },
      { status: 500 }
    );
  }
}

