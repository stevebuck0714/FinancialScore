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

interface CashAccount {
  name: string;
  baseBalance: number;
}

// Helper function to generate date ranges
function generateDateRanges() {
  const now = new Date();
  
  // Monthly: Last 12 months
  const monthly: Date[] = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthly.push(date);
  }
  
  // Weekly: Last 16 weeks (about 4 months)
  const weekly: Date[] = [];
  for (let i = 15; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - (i * 7));
    // Set to start of week (Monday)
    const dayOfWeek = date.getDay();
    const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const weekStart = new Date(date.setDate(diff));
    weekly.push(weekStart);
  }
  
  // Daily: Last 90 days
  const daily: Date[] = [];
  for (let i = 89; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    daily.push(date);
  }
  
  return { monthly, weekly, daily };
}

async function main() {
  console.log('🌱 Starting operational data seed with daily, weekly, and monthly frequencies...\n');

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

  // Generate date ranges for all frequencies
  const dateRanges = generateDateRanges();
  
  console.log(`📅 Generating data for:`);
  console.log(`   • ${dateRanges.monthly.length} months`);
  console.log(`   • ${dateRanges.weekly.length} weeks`);
  console.log(`   • ${dateRanges.daily.length} days\n`);

  // Clear existing operational data for this company
  console.log('🧹 Clearing existing operational data...');
  await prisma.customerSalesSnapshot.deleteMany({ where: { companyId: company.id } });
  await prisma.aRAgingSnapshot.deleteMany({ where: { companyId: company.id } });
  await prisma.aPAgingSnapshot.deleteMany({ where: { companyId: company.id } });
  await prisma.productSalesSnapshot.deleteMany({ where: { companyId: company.id } });
  await prisma.inventorySnapshot.deleteMany({ where: { companyId: company.id } });
  await prisma.cashSnapshot.deleteMany({ where: { companyId: company.id } });
  console.log('✅ Cleared existing data\n');

  let totalRecords = 0;

  // Generate data for each frequency type
  for (const [frequency, dates] of Object.entries(dateRanges)) {
    console.log(`\n📊 Generating ${frequency.toUpperCase()} data (${dates.length} periods)...`);
    
    // Adjust variance based on frequency (daily has less variance than monthly)
    const varianceMultiplier = frequency === 'daily' ? 0.05 : frequency === 'weekly' ? 0.15 : 0.4;
    
    for (const date of dates) {
      // 1. Customer Sales Snapshots
      const customerSalesRecords = customerSales.map((customer, index) => {
        const variance = 1.0 + (Math.random() - 0.5) * varianceMultiplier;
        const dailyFactor = frequency === 'daily' ? 1/30 : frequency === 'weekly' ? 1/4 : 1;
        return {
          companyId: company.id,
          snapshotDate: date,
          frequency: frequency,
          customerId: `CUST-${index + 1}`,
          customerName: customer.customerName,
          revenue: Math.round(customer.revenue * variance * dailyFactor),
          invoiceCount: Math.max(1, Math.round(customer.invoiceCount * variance * dailyFactor)),
          avgInvoiceSize: customer.avgInvoiceSize
        };
      });

      await prisma.customerSalesSnapshot.createMany({
        data: customerSalesRecords
      });

      // 2. AR Aging Snapshot
      const arVariance = 1.0 + (Math.random() - 0.5) * (varianceMultiplier * 0.5);
      await prisma.aRAgingSnapshot.create({
        data: {
          companyId: company.id,
          snapshotDate: date,
          frequency: frequency,
          totalAR: Math.round(arAging.totalAR * arVariance),
          current: Math.round(arAging.current * arVariance),
          days1to30: Math.round(arAging.days1to30 * arVariance),
          days31to60: Math.round(arAging.days31to60 * arVariance),
          days61to90: Math.round(arAging.days61to90 * arVariance),
          days90plus: Math.round(arAging.days90plus * arVariance)
        }
      });

      // 3. AP Aging Snapshot
      const apVariance = 1.0 + (Math.random() - 0.5) * (varianceMultiplier * 0.5);
      await prisma.aPAgingSnapshot.create({
        data: {
          companyId: company.id,
          snapshotDate: date,
          frequency: frequency,
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
        const variance = 1.0 + (Math.random() - 0.5) * varianceMultiplier;
        const dailyFactor = frequency === 'daily' ? 1/30 : frequency === 'weekly' ? 1/4 : 1;
        const revenue = Math.round(product.revenue * variance * dailyFactor);
        const cogs = Math.round(product.cogs * variance * dailyFactor);
        return {
          companyId: company.id,
          snapshotDate: date,
          frequency: frequency,
          itemId: `ITEM-${index + 1}`,
          itemName: product.itemName,
          sku: product.sku,
          quantitySold: Math.max(1, Math.round(product.quantitySold * variance * dailyFactor)),
          revenue: revenue,
          cogs: cogs,
          grossMargin: revenue - cogs,
          grossMarginPct: revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0
        };
      });

      await prisma.productSalesSnapshot.createMany({
        data: productSalesRecords
      });

      // 5. Inventory Snapshots (less variance, changes gradually)
      const inventoryRecords = inventory.map((item, index) => {
        const variance = 1.0 + (Math.random() - 0.5) * (varianceMultiplier * 0.3);
        const qtyOnHand = Math.round(item.qtyOnHand * variance);
        return {
          companyId: company.id,
          snapshotDate: date,
          frequency: frequency,
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

      // 6. Cash Snapshots (create 3-5 bank accounts)
      const bankAccounts = [
        { name: 'Operating Account', baseBalance: 250000 },
        { name: 'Payroll Account', baseBalance: 150000 },
        { name: 'Savings Account', baseBalance: 500000 },
        { name: 'Credit Line', baseBalance: -50000 }
      ];

      const cashRecords = bankAccounts.map((account, index) => {
        const variance = 1.0 + (Math.random() - 0.5) * (varianceMultiplier * 0.8);
        return {
          companyId: company.id,
          snapshotDate: date,
          frequency: frequency,
          accountId: `BANK-${index + 1}`,
          accountName: account.name,
          cashBalance: Math.round(account.baseBalance * variance)
        };
      });

      await prisma.cashSnapshot.createMany({
        data: cashRecords
      });

      totalRecords += customerSalesRecords.length + 1 + 1 + productSalesRecords.length + inventoryRecords.length + cashRecords.length;
    }
    
    console.log(`  ✅ ${frequency}: Created data for ${dates.length} periods`);
  }

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   Company: ${company.name}`);
  console.log(`   Total Records Created: ${totalRecords.toLocaleString()}`);
  console.log('\n   By Frequency:');
  console.log(`   • Monthly: ${dateRanges.monthly.length} periods`);
  console.log(`   • Weekly: ${dateRanges.weekly.length} periods`);
  console.log(`   • Daily: ${dateRanges.daily.length} periods`);
  console.log('\n   Data Types:');
  console.log(`   • Customer Sales`);
  console.log(`   • AR Aging`);
  console.log(`   • AP Aging`);
  console.log(`   • Product Sales`);
  console.log(`   • Inventory`);
  console.log(`   • Cash (NEW!)`);
  console.log('\n✅ Charts can now display daily, weekly, or monthly trends!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });









