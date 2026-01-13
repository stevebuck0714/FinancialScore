import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding operational data...');

  // Get a test company (or use the first one)
  const company = await prisma.company.findFirst();
  
  if (!company) {
    console.error('❌ No company found. Please create a company first.');
    return;
  }

  console.log(`Using company: ${company.name} (${company.id})`);

  // Generate dates for the last 6 months
  const months: Date[] = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    date.setDate(1); // First day of month
    date.setHours(0, 0, 0, 0);
    months.push(date);
  }

  // ====================
  // Customer Sales Data
  // ====================
  console.log('\n📊 Creating Customer Sales snapshots...');
  
  const customers = [
    { id: 'CUST001', name: 'Acme Corporation' },
    { id: 'CUST002', name: 'GlobalTech Industries' },
    { id: 'CUST003', name: 'Smith & Associates' },
    { id: 'CUST004', name: 'Premier Solutions LLC' },
    { id: 'CUST005', name: 'Regional Services Inc' },
  ];

  for (const month of months) {
    for (const customer of customers) {
      const baseRevenue = Math.random() * 50000 + 10000; // $10k-$60k
      const invoiceCount = Math.floor(Math.random() * 8) + 2; // 2-10 invoices
      
      await prisma.customerSalesSnapshot.create({
        data: {
          companyId: company.id,
          month,
          customerId: customer.id,
          customerName: customer.name,
          revenue: parseFloat(baseRevenue.toFixed(2)),
          invoiceCount,
          avgInvoiceSize: parseFloat((baseRevenue / invoiceCount).toFixed(2)),
        },
      });
    }
  }
  console.log(`✅ Created ${months.length * customers.length} customer sales records`);

  // ====================
  // AR Aging Data
  // ====================
  console.log('\n📊 Creating AR Aging snapshots...');
  
  for (const month of months) {
    const totalAR = Math.random() * 150000 + 50000; // $50k-$200k
    const current = totalAR * (0.6 + Math.random() * 0.2); // 60-80%
    const days1to30 = totalAR * (0.1 + Math.random() * 0.1); // 10-20%
    const days31to60 = totalAR * (0.05 + Math.random() * 0.05); // 5-10%
    const days61to90 = totalAR * (0.02 + Math.random() * 0.03); // 2-5%
    const days90plus = totalAR - current - days1to30 - days31to60 - days61to90;

    await prisma.aRAgingSnapshot.create({
      data: {
        companyId: company.id,
        month,
        totalAR: parseFloat(totalAR.toFixed(2)),
        current: parseFloat(current.toFixed(2)),
        days1to30: parseFloat(days1to30.toFixed(2)),
        days31to60: parseFloat(days31to60.toFixed(2)),
        days61to90: parseFloat(days61to90.toFixed(2)),
        days90plus: parseFloat(Math.max(0, days90plus).toFixed(2)),
      },
    });
  }
  console.log(`✅ Created ${months.length} AR aging records`);

  // ====================
  // AP Aging Data
  // ====================
  console.log('\n📊 Creating AP Aging snapshots...');
  
  for (const month of months) {
    const totalAP = Math.random() * 100000 + 30000; // $30k-$130k
    const current = totalAP * (0.7 + Math.random() * 0.2); // 70-90%
    const days1to30 = totalAP * (0.05 + Math.random() * 0.1); // 5-15%
    const days31to60 = totalAP * (0.02 + Math.random() * 0.03); // 2-5%
    const days61to90 = totalAP * (0.01 + Math.random() * 0.02); // 1-3%
    const days90plus = totalAP - current - days1to30 - days31to60 - days61to90;

    await prisma.aPAgingSnapshot.create({
      data: {
        companyId: company.id,
        month,
        totalAP: parseFloat(totalAP.toFixed(2)),
        current: parseFloat(current.toFixed(2)),
        days1to30: parseFloat(days1to30.toFixed(2)),
        days31to60: parseFloat(days31to60.toFixed(2)),
        days61to90: parseFloat(days61to90.toFixed(2)),
        days90plus: parseFloat(Math.max(0, days90plus).toFixed(2)),
      },
    });
  }
  console.log(`✅ Created ${months.length} AP aging records`);

  // ====================
  // Product Sales Data
  // ====================
  console.log('\n📊 Creating Product Sales snapshots...');
  
  const products = [
    { id: 'PROD001', name: 'Premium Service Package', sku: 'PSP-001' },
    { id: 'PROD002', name: 'Standard Consulting', sku: 'SC-002' },
    { id: 'PROD003', name: 'Training Workshop', sku: 'TW-003' },
    { id: 'PROD004', name: 'Implementation Support', sku: 'IS-004' },
    { id: 'PROD005', name: 'Maintenance Contract', sku: 'MC-005' },
  ];

  for (const month of months) {
    for (const product of products) {
      const quantitySold = Math.floor(Math.random() * 50) + 10; // 10-60 units
      const revenue = (Math.random() * 5000 + 1000) * quantitySold; // Revenue based on qty
      const cogs = revenue * (0.3 + Math.random() * 0.2); // 30-50% COGS
      const grossMargin = revenue - cogs;
      const grossMarginPct = (grossMargin / revenue) * 100;

      await prisma.productSalesSnapshot.create({
        data: {
          companyId: company.id,
          month,
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
  }
  console.log(`✅ Created ${months.length * products.length} product sales records`);

  // ====================
  // Inventory Data
  // ====================
  console.log('\n📊 Creating Inventory snapshots...');
  
  const inventoryItems = [
    { id: 'INV001', name: 'Raw Material A', sku: 'RM-A-001' },
    { id: 'INV002', name: 'Raw Material B', sku: 'RM-B-002' },
    { id: 'INV003', name: 'Finished Product X', sku: 'FP-X-003' },
    { id: 'INV004', name: 'Finished Product Y', sku: 'FP-Y-004' },
    { id: 'INV005', name: 'Packaging Materials', sku: 'PKG-005' },
  ];

  for (const month of months) {
    for (const item of inventoryItems) {
      const qtyOnHand = Math.floor(Math.random() * 500) + 100; // 100-600 units
      const avgCost = Math.random() * 50 + 10; // $10-$60 per unit
      const assetValue = qtyOnHand * avgCost;

      await prisma.inventorySnapshot.create({
        data: {
          companyId: company.id,
          month,
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
  console.log(`✅ Created ${months.length * inventoryItems.length} inventory records`);

  console.log('\n✅ Operational data seeding completed!');
  console.log('\n📈 Summary:');
  console.log(`  - Customer Sales: ${months.length * customers.length} records`);
  console.log(`  - AR Aging: ${months.length} records`);
  console.log(`  - AP Aging: ${months.length} records`);
  console.log(`  - Product Sales: ${months.length * products.length} records`);
  console.log(`  - Inventory: ${months.length * inventoryItems.length} records`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

