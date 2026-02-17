import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSectorMockProfile } from '@/lib/operations/sector-mock-data';

export async function POST(request: NextRequest) {
  try {
    const { companyId, dataType = 'all', monthsBack = 12, secret, sectorCategory } = await request.json();

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

    const profile = getSectorMockProfile(sectorCategory || (company as any)?.industrySectorCategory || '01');

    // Helpers (keep deterministic-ish per company)
    const makeNames = (prefix: string, count: number, kind: 'C' | 'P' | 'V') =>
      Array.from({ length: count }, (_, i) => ({
        id: `${kind}${String(i + 1).padStart(3, '0')}`,
        name: `${prefix} ${String(i + 1).padStart(2, '0')}`,
      }));

    const results: any = {
      companyId,
      companyName: company.name,
      sectorCategory: profile.sectorCategory,
      seeded: {},
    };

    // Generate daily cash snapshots
    if (dataType === 'all' || dataType === 'cash') {
      console.log('💰 Generating daily cash snapshots...');
      
      const cashSnapshots = [];
      const today = new Date();
      const daysToGenerate = monthsBack * 30; // Approximate days
      
      // Starting cash balance (scale slightly by sector)
      let currentBalance = (50000 + Math.random() * 50000) * (profile.scale || 1); // $50k-$100k starting
      
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

        const accounts = (profile.cashAccounts && profile.cashAccounts.length > 0) ? profile.cashAccounts : ['Operating Cash'];
        accounts.forEach((accountName, idx) => {
          // Split across accounts so "total cash" has components.
          const splitPct = accounts.length === 1 ? 1 : idx === 0 ? 0.78 : 0.22;
          cashSnapshots.push({
            companyId,
            snapshotDate,
            frequency: 'daily',
            accountId: `CASH_${idx + 1}`,
            accountName,
            cashBalance: currentBalance * splitPct,
            changeAmount: dailyChange * splitPct,
            changePercent: ((dailyChange / Math.max(1, (currentBalance - dailyChange))) * 100),
            createdAt: new Date(),
          });
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
      const customers = makeNames(profile.customerPrefix, 18, 'C');
      
      const today = new Date();
      for (let i = 0; i < monthsBack; i++) {
        const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        
        const idxFromOldest = monthsBack - 1 - i;
        customers.forEach((customer, cIdx) => {
          // Add mild seasonality and a customer mix.
          const base = (9000 + cIdx * 1200) * (profile.scale || 1);
          const seasonal = 1 + Math.sin(idxFromOldest / 2.2) * 0.08;
          const revenue = base * seasonal * (0.85 + Math.random() * 0.45);
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
      const products = Array.from({ length: 28 }, (_, i) => {
        const n = String(i + 1).padStart(2, '0');
        return {
          id: `ITEM_${n}`,
          name: `${profile.productPrefix} ${n}`,
          sku: `${profile.sectorCategory}-${n}`,
        };
      });

      // Create a few intentionally "problem" items to enable drill-down analysis.
      const buildInventoryIds = new Set(products.slice(0, 4).map((p) => p.id)); // inventory rising, sales slowing
      const fastMoverIds = new Set(products.slice(4, 8).map((p) => p.id)); // strong sales, tighter inventory
      
      const today = new Date();
      for (let i = 0; i < monthsBack; i++) {
        const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        
        const idxFromOldest = monthsBack - 1 - i;
        products.forEach((product, pIdx) => {
          const baseUnits = (18 + pIdx * 3) * (profile.scale || 1);
          const season = 1 + Math.sin(idxFromOldest / 2.0) * 0.06;
          const noise = 0.85 + Math.random() * 0.45;

          let trendMult = 1;
          if (buildInventoryIds.has(product.id)) trendMult = Math.max(0.6, 1 - idxFromOldest * 0.02);
          if (fastMoverIds.has(product.id)) trendMult = 1 + idxFromOldest * 0.015;

          const quantitySold = Math.max(0, baseUnits * season * noise * trendMult);
          const price = 90 + Math.random() * 520; // $90 - $610 unit price
          const revenue = quantitySold * price;
          const cogs = revenue * (0.35 + Math.random() * 0.25);
          
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
            grossMargin: revenue - cogs,
            grossMarginPct: revenue > 0 ? ((revenue - cogs) / revenue) * 100 : null,
            createdAt: new Date(),
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
      const inventoryItems = Array.from({ length: 28 }, (_, i) => {
        const n = String(i + 1).padStart(2, '0');
        return {
          id: `ITEM_${n}`, // align with productSales itemIds for drill-down
          name: `${profile.productPrefix} ${n}`,
          sku: `${profile.sectorCategory}-${n}`,
        };
      });

      const buildInventoryIds = new Set(inventoryItems.slice(0, 4).map((p) => p.id));
      const fastMoverIds = new Set(inventoryItems.slice(4, 8).map((p) => p.id));
      
      const today = new Date();
      for (let i = 0; i < monthsBack; i++) {
        const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        
        const idxFromOldest = monthsBack - 1 - i;
        inventoryItems.forEach((item, itemIdx) => {
          const baseQty = (90 + itemIdx * 12) * (profile.scale || 1);
          let trendMult = 1;
          if (buildInventoryIds.has(item.id)) trendMult = 1 + idxFromOldest * 0.06; // rising on-hand
          if (fastMoverIds.has(item.id)) trendMult = Math.max(0.55, 1 - idxFromOldest * 0.035); // tightening inventory

          const qtyOnHand = Math.max(0, baseQty * trendMult * (0.85 + Math.random() * 0.4));
          const avgCost = (18 + (itemIdx % 7) * 6 + Math.random() * 25) * (profile.scale || 1);
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

