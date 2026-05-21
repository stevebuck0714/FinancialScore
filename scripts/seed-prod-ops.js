// Seed production operational data
const { PrismaClient } = require('@prisma/client');
const { requireDatabaseUrl } = require('./require-database-url');

const PROD_DB_URL = requireDatabaseUrl();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: PROD_DB_URL,
    },
  },
});

async function seedProductionData() {
  console.log('🔍 Finding "Demonstration Company" in production...\n');
  
  try {
    // Find the company
    const companies = await prisma.company.findMany({
      where: {
        name: {
          contains: 'Demonstration',
          mode: 'insensitive',
        },
      },
      include: {
        users: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });
    
    if (companies.length === 0) {
      console.error('❌ No "Demonstration Company" found in production');
      process.exit(1);
    }
    
    console.log(`✅ Found ${companies.length} company(ies):\n`);
    companies.forEach((c) => {
      console.log(`📊 Company: ${c.name}`);
      console.log(`   ID: ${c.id}`);
      console.log(`   Owners: ${c.users.map(u => u.email).join(', ')}`);
      console.log('');
    });
    
    const companyId = companies[0].id;
    const monthsBack = 12;
    
    console.log('🌱 Seeding operational data...\n');
    console.log('📊 Company ID:', companyId);
    console.log('📅 Months back:', monthsBack);
    console.log('');
    
    // 1. Daily cash snapshots
    console.log('💰 Generating daily cash snapshots...');
    const cashSnapshots = [];
    const today = new Date();
    const daysToGenerate = monthsBack * 30;
    let currentBalance = 75000;
    
    for (let i = daysToGenerate; i >= 0; i--) {
      const snapshotDate = new Date(today);
      snapshotDate.setDate(today.getDate() - i);
      snapshotDate.setHours(0, 0, 0, 0);
      
      const dailyChange = (Math.random() - 0.3) * 15000;
      currentBalance += dailyChange;
      currentBalance = Math.max(currentBalance, 5000);
      
      if (i % 7 === 0) currentBalance -= 10000;
      if (snapshotDate.getDate() === 1) currentBalance -= 6000;
      
      cashSnapshots.push({
        companyId,
        snapshotDate,
        frequency: 'daily',
        accountId: 'CASH_MAIN',
        accountName: 'Operating Cash',
        cashBalance: currentBalance,
        changeAmount: dailyChange,
        changePercent: ((dailyChange / (currentBalance - dailyChange)) * 100),
      });
    }
    
    await prisma.cashSnapshot.deleteMany({ where: { companyId } });
    await prisma.cashSnapshot.createMany({ data: cashSnapshots });
    console.log(`✅ Created ${cashSnapshots.length} daily cash snapshots`);
    
    // 2. AR Aging (monthly + daily)
    console.log('📊 Generating AR Aging snapshots (daily + monthly)...');
    const arSnapshots = [];
    
    // Monthly
    for (let i = 0; i < monthsBack; i++) {
      const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const totalAR = 80000 + Math.random() * 70000;
      const current = totalAR * 0.6;
      const days1to30 = totalAR * 0.2;
      const days31to60 = totalAR * 0.1;
      const days61to90 = totalAR * 0.05;
      const days90plus = totalAR * 0.05;
      
      arSnapshots.push({
        companyId, snapshotDate, frequency: 'monthly',
        totalAR, current, days1to30, days31to60, days61to90, days90plus,
      });
    }
    
    // Daily (last 91 days)
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
        companyId, snapshotDate, frequency: 'daily',
        totalAR, current, days1to30, days31to60, days61to90, days90plus: Math.max(days90plus, 0),
      });
    }
    
    await prisma.aRAgingSnapshot.deleteMany({ where: { companyId } });
    await prisma.aRAgingSnapshot.createMany({ data: arSnapshots });
    console.log(`✅ Created ${arSnapshots.length} AR Aging snapshots (${monthsBack} monthly + 91 daily)`);
    
    // 3. AP Aging (monthly + daily)
    console.log('📊 Generating AP Aging snapshots (daily + monthly)...');
    const apSnapshots = [];
    
    // Monthly
    for (let i = 0; i < monthsBack; i++) {
      const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const totalAP = 50000 + Math.random() * 50000;
      const current = totalAP * 0.7;
      const days1to30 = totalAP * 0.15;
      const days31to60 = totalAP * 0.08;
      const days61to90 = totalAP * 0.04;
      const days90plus = totalAP * 0.03;
      
      apSnapshots.push({
        companyId, snapshotDate, frequency: 'monthly',
        totalAP, current, days1to30, days31to60, days61to90, days90plus,
      });
    }
    
    // Daily (last 91 days)
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
        companyId, snapshotDate, frequency: 'daily',
        totalAP, current, days1to30, days31to60, days61to90, days90plus: Math.max(days90plus, 0),
      });
    }
    
    await prisma.aPAgingSnapshot.deleteMany({ where: { companyId } });
    await prisma.aPAgingSnapshot.createMany({ data: apSnapshots });
    console.log(`✅ Created ${apSnapshots.length} AP Aging snapshots (${monthsBack} monthly + 91 daily)`);
    
    // 4. Customer Sales
    console.log('📊 Generating Customer Sales snapshots...');
    const customerSalesSnapshots = [];
    const customers = [
      { id: 'CUST001', name: 'Acme Corporation' },
      { id: 'CUST002', name: 'Global Industries' },
      { id: 'CUST003', name: 'Tech Solutions Inc' },
      { id: 'CUST004', name: 'ABC Manufacturing' },
      { id: 'CUST005', name: 'XYZ Services' },
    ];
    
    for (let i = 0; i < monthsBack; i++) {
      const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      customers.forEach(customer => {
        const revenue = 10000 + Math.random() * 40000;
        const invoiceCount = Math.floor(2 + Math.random() * 8);
        customerSalesSnapshots.push({
          companyId, snapshotDate, frequency: 'monthly',
          customerId: customer.id, customerName: customer.name,
          revenue, invoiceCount, avgInvoiceSize: revenue / invoiceCount,
        });
      });
    }
    
    await prisma.customerSalesSnapshot.deleteMany({ where: { companyId } });
    await prisma.customerSalesSnapshot.createMany({ data: customerSalesSnapshots });
    console.log(`✅ Created ${customerSalesSnapshots.length} Customer Sales snapshots`);
    
    // 5. Product Sales
    console.log('📊 Generating Product Sales snapshots...');
    const productSalesSnapshots = [];
    const products = [
      { id: 'PROD001', name: 'Premium Widget', sku: 'WDG-001' },
      { id: 'PROD002', name: 'Standard Service', sku: 'SVC-100' },
      { id: 'PROD003', name: 'Deluxe Package', sku: 'PKG-200' },
      { id: 'PROD004', name: 'Basic License', sku: 'LIC-001' },
    ];
    
    for (let i = 0; i < monthsBack; i++) {
      const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      products.forEach(product => {
        const quantitySold = 10 + Math.random() * 90;
        const revenue = quantitySold * (100 + Math.random() * 400);
        const cogs = revenue * (0.3 + Math.random() * 0.2);
        productSalesSnapshots.push({
          companyId, snapshotDate, frequency: 'monthly',
          itemId: product.id, itemName: product.name, sku: product.sku,
          quantitySold, revenue, cogs,
        });
      });
    }
    
    await prisma.productSalesSnapshot.deleteMany({ where: { companyId } });
    await prisma.productSalesSnapshot.createMany({ data: productSalesSnapshots });
    console.log(`✅ Created ${productSalesSnapshots.length} Product Sales snapshots`);
    
    // 6. Inventory
    console.log('📦 Generating Inventory snapshots...');
    const inventorySnapshots = [];
    const inventoryItems = [
      { id: 'INV001', name: 'Raw Materials', sku: 'RAW-001' },
      { id: 'INV002', name: 'Finished Goods', sku: 'FIN-001' },
      { id: 'INV003', name: 'Components', sku: 'CMP-001' },
    ];
    
    for (let i = 0; i < monthsBack; i++) {
      const snapshotDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      inventoryItems.forEach(item => {
        const qtyOnHand = 100 + Math.random() * 400;
        const avgCost = 20 + Math.random() * 80;
        const assetValue = qtyOnHand * avgCost;
        inventorySnapshots.push({
          companyId, snapshotDate, frequency: 'monthly',
          itemId: item.id, itemName: item.name, sku: item.sku,
          qtyOnHand, assetValue, avgCost,
        });
      });
    }
    
    await prisma.inventorySnapshot.deleteMany({ where: { companyId } });
    await prisma.inventorySnapshot.createMany({ data: inventorySnapshots });
    console.log(`✅ Created ${inventorySnapshots.length} Inventory snapshots`);
    
    console.log('\n✅ Production operational data seeding complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedProductionData();

