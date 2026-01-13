import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding enhanced operational data with multiple frequencies...');

  // Get the first company or use a specific one
  const company = await prisma.company.findFirst();
  
  if (!company) {
    console.error('❌ No company found. Please create a company first.');
    return;
  }

  console.log(`Using company: ${company.name} (${company.id})`);

  // Generate dates for different frequencies
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Daily data: last 90 days
  const dailyDates: Date[] = [];
  for (let i = 89; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dailyDates.push(date);
  }

  // Weekly data: last 26 weeks (6 months)
  const weeklyDates: Date[] = [];
  for (let i = 25; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - (i * 7));
    weeklyDates.push(date);
  }

  // Monthly data: last 12 months
  const monthlyDates: Date[] = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(today);
    date.setMonth(date.getMonth() - i);
    date.setDate(1);
    monthlyDates.push(date);
  }

  const customers = [
    { id: 'CUST001', name: 'Acme Corporation' },
    { id: 'CUST002', name: 'GlobalTech Industries' },
    { id: 'CUST003', name: 'Smith & Associates' },
    { id: 'CUST004', name: 'Premier Solutions LLC' },
    { id: 'CUST005', name: 'Regional Services Inc' },
  ];

  const products = [
    { id: 'PROD001', name: 'Premium Service Package', sku: 'PSP-001' },
    { id: 'PROD002', name: 'Standard Consulting', sku: 'SC-002' },
    { id: 'PROD003', name: 'Training Workshop', sku: 'TW-003' },
    { id: 'PROD004', name: 'Implementation Support', sku: 'IS-004' },
    { id: 'PROD005', name: 'Maintenance Contract', sku: 'MC-005' },
  ];

  const inventoryItems = [
    { id: 'INV001', name: 'Raw Material A', sku: 'RM-A-001' },
    { id: 'INV002', name: 'Raw Material B', sku: 'RM-B-002' },
    { id: 'INV003', name: 'Finished Product X', sku: 'FP-X-003' },
    { id: 'INV004', name: 'Finished Product Y', sku: 'FP-Y-004' },
    { id: 'INV005', name: 'Packaging Materials', sku: 'PKG-005' },
  ];

  // ====================
  // MONTHLY DATA
  // ====================
  console.log('\n📊 Creating MONTHLY data...');
  
  for (const date of monthlyDates) {
    // Customer Sales
    for (const customer of customers) {
      const baseRevenue = Math.random() * 50000 + 10000;
      const invoiceCount = Math.floor(Math.random() * 8) + 2;
      
      await prisma.customerSalesSnapshot.create({
        data: {
          companyId: company.id,
          snapshotDate: date,
          frequency: 'monthly',
          customerId: customer.id,
          customerName: customer.name,
          revenue: parseFloat(baseRevenue.toFixed(2)),
          invoiceCount,
          avgInvoiceSize: parseFloat((baseRevenue / invoiceCount).toFixed(2)),
        },
      });
    }

    // AR Aging
    const totalAR = Math.random() * 150000 + 50000;
    const current = totalAR * (0.6 + Math.random() * 0.2);
    const days1to30 = totalAR * (0.1 + Math.random() * 0.1);
    const days31to60 = totalAR * (0.05 + Math.random() * 0.05);
    const days61to90 = totalAR * (0.02 + Math.random() * 0.03);
    const days90plus = totalAR - current - days1to30 - days31to60 - days61to90;

    await prisma.aRAgingSnapshot.create({
      data: {
        companyId: company.id,
        snapshotDate: date,
        frequency: 'monthly',
        totalAR: parseFloat(totalAR.toFixed(2)),
        current: parseFloat(current.toFixed(2)),
        days1to30: parseFloat(days1to30.toFixed(2)),
        days31to60: parseFloat(days31to60.toFixed(2)),
        days61to90: parseFloat(days61to90.toFixed(2)),
        days90plus: parseFloat(Math.max(0, days90plus).toFixed(2)),
      },
    });

    // AP Aging
    const totalAP = Math.random() * 100000 + 30000;
    const currentAP = totalAP * (0.7 + Math.random() * 0.2);
    const days1to30AP = totalAP * (0.05 + Math.random() * 0.1);
    const days31to60AP = totalAP * (0.02 + Math.random() * 0.03);
    const days61to90AP = totalAP * (0.01 + Math.random() * 0.02);
    const days90plusAP = totalAP - currentAP - days1to30AP - days31to60AP - days61to90AP;

    await prisma.aPAgingSnapshot.create({
      data: {
        companyId: company.id,
        snapshotDate: date,
        frequency: 'monthly',
        totalAP: parseFloat(totalAP.toFixed(2)),
        current: parseFloat(currentAP.toFixed(2)),
        days1to30: parseFloat(days1to30AP.toFixed(2)),
        days31to60: parseFloat(days31to60AP.toFixed(2)),
        days61to90: parseFloat(days61to90AP.toFixed(2)),
        days90plus: parseFloat(Math.max(0, days90plusAP).toFixed(2)),
      },
    });

    // Product Sales
    for (const product of products) {
      const quantitySold = Math.floor(Math.random() * 50) + 10;
      const revenue = (Math.random() * 5000 + 1000) * quantitySold;
      const cogs = revenue * (0.3 + Math.random() * 0.2);
      const grossMargin = revenue - cogs;
      const grossMarginPct = (grossMargin / revenue) * 100;

      await prisma.productSalesSnapshot.create({
        data: {
          companyId: company.id,
          snapshotDate: date,
          frequency: 'monthly',
          itemId: product.id,
          itemName: product.name,
          sku: product.sku,
          quantitySold,
          revenue: parseFloat(revenue.toFixed(2)),
          cogs: parseFloat(cogs.toFixed(2)),
          grossMargin: parseFloat(grossMargin.toFixed(2)),
          grossMarginPct: parseFloat(grossMarginPct.toFixed(2)),
        },
      });
    }

    // Inventory
    for (const item of inventoryItems) {
      const qtyOnHand = Math.floor(Math.random() * 500) + 100;
      const avgCost = Math.random() * 50 + 10;
      const assetValue = qtyOnHand * avgCost;

      await prisma.inventorySnapshot.create({
        data: {
          companyId: company.id,
          snapshotDate: date,
          frequency: 'monthly',
          itemId: item.id,
          itemName: item.name,
          sku: item.sku,
          qtyOnHand,
          assetValue: parseFloat(assetValue.toFixed(2)),
          avgCost: parseFloat(avgCost.toFixed(2)),
        },
      });
    }
  }
  
  console.log(`✅ Created monthly data: ${monthlyDates.length} periods`);

  // ====================
  // WEEKLY DATA
  // ====================
  console.log('\n📊 Creating WEEKLY data...');
  
  for (const date of weeklyDates) {
    // Customer Sales (weekly)
    for (const customer of customers) {
      const baseRevenue = (Math.random() * 50000 + 10000) / 4; // ~1/4 of monthly
      const invoiceCount = Math.floor(Math.random() * 3) + 1;
      
      await prisma.customerSalesSnapshot.create({
        data: {
          companyId: company.id,
          snapshotDate: date,
          frequency: 'weekly',
          customerId: customer.id,
          customerName: customer.name,
          revenue: parseFloat(baseRevenue.toFixed(2)),
          invoiceCount,
          avgInvoiceSize: parseFloat((baseRevenue / invoiceCount).toFixed(2)),
        },
      });
    }

    // AR/AP Aging (weekly snapshots)
    const totalARWeekly = Math.random() * 150000 + 50000;
    const currentWeekly = totalARWeekly * (0.6 + Math.random() * 0.2);
    
    await prisma.aRAgingSnapshot.create({
      data: {
        companyId: company.id,
        snapshotDate: date,
        frequency: 'weekly',
        totalAR: parseFloat(totalARWeekly.toFixed(2)),
        current: parseFloat(currentWeekly.toFixed(2)),
        days1to30: parseFloat((totalARWeekly * 0.15).toFixed(2)),
        days31to60: parseFloat((totalARWeekly * 0.08).toFixed(2)),
        days61to90: parseFloat((totalARWeekly * 0.04).toFixed(2)),
        days90plus: parseFloat((totalARWeekly * 0.03).toFixed(2)),
      },
    });

    const totalAPWeekly = Math.random() * 100000 + 30000;
    await prisma.aPAgingSnapshot.create({
      data: {
        companyId: company.id,
        snapshotDate: date,
        frequency: 'weekly',
        totalAP: parseFloat(totalAPWeekly.toFixed(2)),
        current: parseFloat((totalAPWeekly * 0.8).toFixed(2)),
        days1to30: parseFloat((totalAPWeekly * 0.1).toFixed(2)),
        days31to60: parseFloat((totalAPWeekly * 0.05).toFixed(2)),
        days61to90: parseFloat((totalAPWeekly * 0.03).toFixed(2)),
        days90plus: parseFloat((totalAPWeekly * 0.02).toFixed(2)),
      },
    });
  }
  
  console.log(`✅ Created weekly data: ${weeklyDates.length} periods`);

  // ====================
  // DAILY DATA (last 90 days)
  // ====================
  console.log('\n📊 Creating DAILY data (last 90 days)...');
  
  for (const date of dailyDates) {
    // Daily AR/AP snapshots (most important for daily tracking)
    const totalARDaily = Math.random() * 150000 + 50000;
    const currentDaily = totalARDaily * (0.6 + Math.random() * 0.2);
    
    await prisma.aRAgingSnapshot.create({
      data: {
        companyId: company.id,
        snapshotDate: date,
        frequency: 'daily',
        totalAR: parseFloat(totalARDaily.toFixed(2)),
        current: parseFloat(currentDaily.toFixed(2)),
        days1to30: parseFloat((totalARDaily * 0.15).toFixed(2)),
        days31to60: parseFloat((totalARDaily * 0.08).toFixed(2)),
        days61to90: parseFloat((totalARDaily * 0.04).toFixed(2)),
        days90plus: parseFloat((totalARDaily * 0.03).toFixed(2)),
      },
    });

    const totalAPDaily = Math.random() * 100000 + 30000;
    await prisma.aPAgingSnapshot.create({
      data: {
        companyId: company.id,
        snapshotDate: date,
        frequency: 'daily',
        totalAP: parseFloat(totalAPDaily.toFixed(2)),
        current: parseFloat((totalAPDaily * 0.8).toFixed(2)),
        days1to30: parseFloat((totalAPDaily * 0.1).toFixed(2)),
        days31to60: parseFloat((totalAPDaily * 0.05).toFixed(2)),
        days61to90: parseFloat((totalAPDaily * 0.03).toFixed(2)),
        days90plus: parseFloat((totalAPDaily * 0.02).toFixed(2)),
      },
    });
  }
  
  console.log(`✅ Created daily data: ${dailyDates.length} periods`);

  console.log('\n✅ Enhanced operational data seeding completed!');
  console.log('\n📈 Summary:');
  console.log(`  Monthly Data:`);
  console.log(`    - Customer Sales: ${monthlyDates.length * customers.length} records`);
  console.log(`    - AR Aging: ${monthlyDates.length} records`);
  console.log(`    - AP Aging: ${monthlyDates.length} records`);
  console.log(`    - Product Sales: ${monthlyDates.length * products.length} records`);
  console.log(`    - Inventory: ${monthlyDates.length * inventoryItems.length} records`);
  console.log(`  Weekly Data:`);
  console.log(`    - Customer Sales: ${weeklyDates.length * customers.length} records`);
  console.log(`    - AR Aging: ${weeklyDates.length} records`);
  console.log(`    - AP Aging: ${weeklyDates.length} records`);
  console.log(`  Daily Data (90 days):`);
  console.log(`    - AR Aging: ${dailyDates.length} records`);
  console.log(`    - AP Aging: ${dailyDates.length} records`);
  
  const totalRecords = 
    (monthlyDates.length * (customers.length + 1 + 1 + products.length + inventoryItems.length)) +
    (weeklyDates.length * (customers.length + 1 + 1)) +
    (dailyDates.length * 2);
  
  console.log(`\n  Total Records: ${totalRecords}`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

