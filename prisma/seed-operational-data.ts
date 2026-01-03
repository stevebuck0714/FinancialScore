import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface CustomerSalesData {
  customerName: string;
  revenue: number;
  invoiceCount: number;
  avgInvoiceSize: number;
}

interface ARAgingData {
  totalAR: number;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
}

interface APAgingData {
  totalAP: number;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
}

interface ProductSalesData {
  itemName: string;
  sku: string;
  quantitySold: number;
  revenue: number;
  cogs: number;
  grossMargin: number;
  grossMarginPct: number;
}

interface InventoryData {
  itemName: string;
  sku: string;
  qtyOnHand: number;
  assetValue: number;
  avgCost: number;
}

async function main() {
  console.log('🌱 Starting operational data seed...\n');

  // Load sample data files
  const customerSales: CustomerSalesData[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'sample-data', 'customer-sales.json'), 'utf-8')
  );
  const arAging: ARAgingData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'sample-data', 'ar-aging.json'), 'utf-8')
  );
  const apAging: APAgingData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'sample-data', 'ap-aging.json'), 'utf-8')
  );
  const productSales: ProductSalesData[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'sample-data', 'product-sales.json'), 'utf-8')
  );
  const inventory: InventoryData[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'sample-data', 'inventory.json'), 'utf-8')
  );

  // Get first company for testing (or specify company ID)
  const company = await prisma.company.findFirst({
    orderBy: { createdAt: 'asc' }
  });

  if (!company) {
    console.error('❌ No companies found in database. Please create a company first.');
    return;
  }

  console.log(`✅ Using company: ${company.name} (${company.id})\n`);

  // Generate 12 months of historical data
  const months: Date[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(date);
  }

  console.log(`📅 Generating data for ${months.length} months...\n`);

  // Clear existing operational data for this company
  console.log('🧹 Clearing existing operational data...');
  await prisma.customerSalesSnapshot.deleteMany({ where: { companyId: company.id } });
  await prisma.aRAgingSnapshot.deleteMany({ where: { companyId: company.id } });
  await prisma.aPAgingSnapshot.deleteMany({ where: { companyId: company.id } });
  await prisma.productSalesSnapshot.deleteMany({ where: { companyId: company.id } });
  await prisma.inventorySnapshot.deleteMany({ where: { companyId: company.id } });
  console.log('✅ Cleared existing data\n');

  // Seed data for each month
  for (const month of months) {
    console.log(`📊 Seeding data for ${month.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}...`);

    // 1. Customer Sales Snapshots
    const customerSalesRecords = customerSales.map((customer, index) => {
      // Add some variance month-to-month (±20%)
      const variance = 0.8 + Math.random() * 0.4;
      return {
        companyId: company.id,
        month: month,
        customerId: `CUST-${index + 1}`,
        customerName: customer.customerName,
        revenue: Math.round(customer.revenue * variance),
        invoiceCount: Math.round(customer.invoiceCount * variance),
        avgInvoiceSize: customer.avgInvoiceSize
      };
    });

    await prisma.customerSalesSnapshot.createMany({
      data: customerSalesRecords
    });

    // 2. AR Aging Snapshot
    const arVariance = 0.85 + Math.random() * 0.3;
    await prisma.aRAgingSnapshot.create({
      data: {
        companyId: company.id,
        month: month,
        totalAR: Math.round(arAging.totalAR * arVariance),
        current: Math.round(arAging.current * arVariance),
        days1to30: Math.round(arAging.days1to30 * arVariance),
        days31to60: Math.round(arAging.days31to60 * arVariance),
        days61to90: Math.round(arAging.days61to90 * arVariance),
        days90plus: Math.round(arAging.days90plus * arVariance)
      }
    });

    // 3. AP Aging Snapshot
    const apVariance = 0.85 + Math.random() * 0.3;
    await prisma.aPAgingSnapshot.create({
      data: {
        companyId: company.id,
        month: month,
        totalAP: Math.round(apAging.totalAP * apVariance),
        current: Math.round(apAging.current * apVariance),
        days1to30: Math.round(apAging.days1to30 * apVariance),
        days31to60: Math.round(apAging.days31to60 * apVariance),
        days61to90: Math.round(apAging.days61to90 * apVariance),
        days90plus: Math.round(apAging.days90plus * apVariance)
      }
    });

    // 4. Product Sales Snapshots
    const productSalesRecords = productSales.map((product, index) => {
      const variance = 0.8 + Math.random() * 0.4;
      const revenue = Math.round(product.revenue * variance);
      const cogs = Math.round(product.cogs * variance);
      return {
        companyId: company.id,
        month: month,
        itemId: `ITEM-${index + 1}`,
        itemName: product.itemName,
        sku: product.sku,
        quantitySold: Math.round(product.quantitySold * variance),
        revenue: revenue,
        cogs: cogs,
        grossMargin: revenue - cogs,
        grossMarginPct: ((revenue - cogs) / revenue) * 100
      };
    });

    await prisma.productSalesSnapshot.createMany({
      data: productSalesRecords
    });

    // 5. Inventory Snapshots (less variance, inventory changes more gradually)
    const inventoryRecords = inventory.map((item, index) => {
      const variance = 0.9 + Math.random() * 0.2;
      const qtyOnHand = Math.round(item.qtyOnHand * variance);
      return {
        companyId: company.id,
        month: month,
        itemId: `ITEM-INV-${index + 1}`,
        itemName: item.itemName,
        sku: item.sku,
        qtyOnHand: qtyOnHand,
        assetValue: Math.round(qtyOnHand * item.avgCost),
        avgCost: item.avgCost
      };
    });

    await prisma.inventorySnapshot.createMany({
      data: inventoryRecords
    });

    console.log(`  ✅ Created ${customerSalesRecords.length} customer sales records`);
    console.log(`  ✅ Created AR aging snapshot`);
    console.log(`  ✅ Created AP aging snapshot`);
    console.log(`  ✅ Created ${productSalesRecords.length} product sales records`);
    console.log(`  ✅ Created ${inventoryRecords.length} inventory records\n`);
  }

  console.log('🎉 Seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   Company: ${company.name}`);
  console.log(`   Months: ${months.length}`);
  console.log(`   Customer Sales Records: ${customerSales.length * months.length}`);
  console.log(`   AR Aging Records: ${months.length}`);
  console.log(`   AP Aging Records: ${months.length}`);
  console.log(`   Product Sales Records: ${productSales.length * months.length}`);
  console.log(`   Inventory Records: ${inventory.length * months.length}`);
  console.log('\n✅ You can now build UI components with this data!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


