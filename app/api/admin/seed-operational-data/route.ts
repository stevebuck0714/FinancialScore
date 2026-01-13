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

    // Generate AR Aging snapshots (monthly + daily)
    if (dataType === 'all' || dataType === 'ar') {
      console.log('📊 Generating AR Aging snapshots (daily + monthly)...');
      
      const arSnapshots = [];
      const today = new Date();
      
      // Monthly AR Aging
      for (let i = 0; i < monthsBack; i++) {
        const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        
        const totalAR = 50000 + Math.random() * 100000;
        const current = totalAR * (0.5 + Math.random() * 0.2);
        const days1to30 = totalAR * (0.15 + Math.random() * 0.1);
        const days31to60 = totalAR * (0.05 + Math.random() * 0.05);
        const days61to90 = totalAR * (0.02 + Math.random() * 0.03);
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
      
      // Daily AR Aging (last 90 days)
      let baseAR = 80000 + Math.random() * 70000;
      for (let i = 90; i >= 0; i--) {
        const snapshotDate = new Date(today);
        snapshotDate.setDate(today.getDate() - i);
        snapshotDate.setHours(0, 0, 0, 0);
        
        baseAR += (Math.random() - 0.5) * 5000;
        const totalAR = Math.max(baseAR, 40000);
        const current = totalAR * (0.55 + Math.random() * 0.1);
        const days1to30 = totalAR * (0.15 + Math.random() * 0.1);
        const days31to60 = totalAR * (0.08 + Math.random() * 0.05);
        const days61to90 = totalAR * (0.03 + Math.random() * 0.04);
        const days90plus = totalAR - current - days1to30 - days31to60 - days61to90;
        
        arSnapshots.push({
          companyId,
          snapshotDate,
          frequency: 'daily',
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
      
      await prisma.aRAgingSnapshot.deleteMany({ where: { companyId } });
      await prisma.aRAgingSnapshot.createMany({ data: arSnapshots });
      
      results.seeded.arSnapshots = arSnapshots.length;
      console.log(`✅ Created ${arSnapshots.length} AR Aging snapshots (${monthsBack} monthly + 91 daily)`);
    }

    // Generate AP Aging snapshots (monthly + daily)
    if (dataType === 'all' || dataType === 'ap') {
      console.log('📊 Generating AP Aging snapshots (daily + monthly)...');
      
      const apSnapshots = [];
      const today = new Date();
      
      // Monthly AP Aging
      for (let i = 0; i < monthsBack; i++) {
        const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        
        const totalAP = 30000 + Math.random() * 70000;
        const current = totalAP * (0.6 + Math.random() * 0.2);
        const days1to30 = totalAP * (0.1 + Math.random() * 0.1);
        const days31to60 = totalAP * (0.03 + Math.random() * 0.05);
        const days61to90 = totalAP * (0.01 + Math.random() * 0.02);
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
      
      // Daily AP Aging (last 90 days)
      let baseAP = 50000 + Math.random() * 50000;
      for (let i = 90; i >= 0; i--) {
        const snapshotDate = new Date(today);
        snapshotDate.setDate(today.getDate() - i);
        snapshotDate.setHours(0, 0, 0, 0);
        
        baseAP += (Math.random() - 0.5) * 4000;
        const totalAP = Math.max(baseAP, 30000);
        const current = totalAP * (0.65 + Math.random() * 0.1);
        const days1to30 = totalAP * (0.12 + Math.random() * 0.08);
        const days31to60 = totalAP * (0.05 + Math.random() * 0.05);
        const days61to90 = totalAP * (0.02 + Math.random() * 0.03);
        const days90plus = totalAP - current - days1to30 - days31to60 - days61to90;
        
        apSnapshots.push({
          companyId,
          snapshotDate,
          frequency: 'daily',
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
      
      await prisma.aPAgingSnapshot.deleteMany({ where: { companyId } });
      await prisma.aPAgingSnapshot.createMany({ data: apSnapshots });
      
      results.seeded.apSnapshots = apSnapshots.length;
      console.log(`✅ Created ${apSnapshots.length} AP Aging snapshots (${monthsBack} monthly + 91 daily)`);
    }

    // Generate Customer Sales snapshots
    if (dataType === 'all' || dataType === 'customerSales') {
      console.log('📊 Generating Customer Sales snapshots...');
      
      const customerSalesSnapshots = [];
      const customers = [
        { id: 'CUST001', name: 'Acme Corporation' },
        { id: 'CUST002', name: 'Global Industries' },
        { id: 'CUST003', name: 'Tech Solutions Inc' },
        { id: 'CUST004', name: 'ABC Manufacturing' },
        { id: 'CUST005', name: 'XYZ Services' },
      ];
      
      const today = new Date();
      for (let i = 0; i < monthsBack; i++) {
        const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        
        customers.forEach(customer => {
          const revenue = 10000 + Math.random() * 40000;
          const invoiceCount = Math.floor(2 + Math.random() * 8);
          
          customerSalesSnapshots.push({
            companyId,
            snapshotDate,
            frequency: 'monthly',
            customerId: customer.id,
            customerName: customer.name,
            revenue,
            invoiceCount,
            avgInvoiceSize: revenue / invoiceCount,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        });
      }
      
      await prisma.customerSalesSnapshot.deleteMany({ where: { companyId } });
      await prisma.customerSalesSnapshot.createMany({ data: customerSalesSnapshots });
      
      results.seeded.customerSalesSnapshots = customerSalesSnapshots.length;
      console.log(`✅ Created ${customerSalesSnapshots.length} Customer Sales snapshots`);
    }

    // Generate Product Sales snapshots
    if (dataType === 'all' || dataType === 'productSales') {
      console.log('📊 Generating Product Sales snapshots...');
      
      const productSalesSnapshots = [];
      const products = [
        { id: 'PROD001', name: 'Premium Widget', sku: 'WDG-001' },
        { id: 'PROD002', name: 'Standard Service', sku: 'SVC-100' },
        { id: 'PROD003', name: 'Deluxe Package', sku: 'PKG-200' },
        { id: 'PROD004', name: 'Basic License', sku: 'LIC-001' },
      ];
      
      const today = new Date();
      for (let i = 0; i < monthsBack; i++) {
        const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        
        products.forEach(product => {
          const quantitySold = 10 + Math.random() * 90;
          const revenue = quantitySold * (100 + Math.random() * 400);
          const cogs = revenue * (0.3 + Math.random() * 0.2);
          
          productSalesSnapshots.push({
            companyId,
            snapshotDate,
            frequency: 'monthly',
            itemId: product.id,
            itemName: product.name,
            sku: product.sku,
            quantitySold,
            revenue,
            cogs,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        });
      }
      
      await prisma.productSalesSnapshot.deleteMany({ where: { companyId } });
      await prisma.productSalesSnapshot.createMany({ data: productSalesSnapshots });
      
      results.seeded.productSalesSnapshots = productSalesSnapshots.length;
      console.log(`✅ Created ${productSalesSnapshots.length} Product Sales snapshots`);
    }

    // Generate Inventory snapshots
    if (dataType === 'all' || dataType === 'inventory') {
      console.log('📦 Generating Inventory snapshots...');
      
      const inventorySnapshots = [];
      const inventoryItems = [
        { id: 'INV001', name: 'Raw Materials', sku: 'RAW-001' },
        { id: 'INV002', name: 'Finished Goods', sku: 'FIN-001' },
        { id: 'INV003', name: 'Components', sku: 'CMP-001' },
      ];
      
      const today = new Date();
      for (let i = 0; i < monthsBack; i++) {
        const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        
        inventoryItems.forEach(item => {
          const qtyOnHand = 100 + Math.random() * 400;
          const avgCost = 20 + Math.random() * 80;
          const assetValue = qtyOnHand * avgCost;
          
          inventorySnapshots.push({
            companyId,
            snapshotDate,
            frequency: 'monthly',
            itemId: item.id,
            itemName: item.name,
            sku: item.sku,
            qtyOnHand,
            assetValue,
            avgCost,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        });
      }
      
      await prisma.inventorySnapshot.deleteMany({ where: { companyId } });
      await prisma.inventorySnapshot.createMany({ data: inventorySnapshots });
      
      results.seeded.inventorySnapshots = inventorySnapshots.length;
      console.log(`✅ Created ${inventorySnapshots.length} Inventory snapshots`);
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

