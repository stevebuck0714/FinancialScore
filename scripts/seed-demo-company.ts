/**
 * Seed Operational Data for Demonstration Company (Production)
 * 
 * Usage:
 * 1. Set your production DATABASE_URL in .env or pass it directly
 * 2. Run: npx ts-node scripts/seed-demo-company.ts <companyId>
 * 
 * Example:
 * DATABASE_URL="your-prod-db-url" npx ts-node scripts/seed-demo-company.ts cmj0apf5000qtqhbcrcvb0d8f
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get company ID from command line argument
const companyId = process.argv[2];

if (!companyId) {
  console.error('❌ Error: Company ID is required');
  console.log('Usage: npx ts-node scripts/seed-demo-company.ts <companyId>');
  process.exit(1);
}

console.log('🌱 Seeding operational data for Demonstration Company...');
console.log('📊 Company ID:', companyId);
console.log('🗄️  Database:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'unknown');

// Confirm this is intentional
async function confirmSeeding() {
  console.log('\n⚠️  This will add operational data to the specified company.');
  console.log('⚠️  Make sure this is the correct company ID!');
  console.log('\nStarting in 3 seconds...\n');
  
  await new Promise(resolve => setTimeout(resolve, 3000));
}

async function seedOperationalData() {
  try {
    await confirmSeeding();

    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true }
    });

    if (!company) {
      console.error('❌ Company not found with ID:', companyId);
      process.exit(1);
    }

    console.log('✅ Company found:', company.name);
    console.log('\n🧹 Clearing existing operational data...\n');

    // Clear existing operational data for this company
    const deleted = await Promise.all([
      prisma.customerSalesSnapshot.deleteMany({ where: { companyId } }),
      prisma.aRAgingSnapshot.deleteMany({ where: { companyId } }),
      prisma.aPAgingSnapshot.deleteMany({ where: { companyId } }),
      prisma.productSalesSnapshot.deleteMany({ where: { companyId } }),
      prisma.inventorySnapshot.deleteMany({ where: { companyId } }),
      prisma.cashSnapshot.deleteMany({ where: { companyId } })
    ]);

    console.log('🗑️  Deleted existing records:');
    console.log(`   - Customer Sales: ${deleted[0].count}`);
    console.log(`   - AR Aging: ${deleted[1].count}`);
    console.log(`   - AP Aging: ${deleted[2].count}`);
    console.log(`   - Product Sales: ${deleted[3].count}`);
    console.log(`   - Inventory: ${deleted[4].count}`);
    console.log(`   - Cash: ${deleted[5].count}`);
    console.log('');

    // Generate data for the past 12 months
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 12);

    console.log('📅 Generating data from', startDate.toISOString().split('T')[0], 'to', endDate.toISOString().split('T')[0]);
    console.log('');

    // Base values for scaling
    const baseMonthlyRevenue = 450000;
    const baseARTotal = 180000;
    const baseAPTotal = 120000;
    const baseInventoryValue = 250000;
    const baseCashBalance = 150000;

    let totalRecords = 0;

    // Generate monthly data for each month
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const monthStart = new Date(currentDate);
      const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      console.log(`📆 Processing ${monthStart.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}...`);

      // Monthly variance (±30%)
      const monthlyVariance = 0.7 + Math.random() * 0.6;

      // 1. Monthly Customer Sales
      const monthlyRevenue = Math.round(baseMonthlyRevenue * monthlyVariance);
      await prisma.customerSalesSnapshot.create({
        data: {
          companyId,
          snapshotDate: monthStart,
          frequency: 'monthly',
          customerId: 'demo-customer-1',
          customerName: 'Acme Corporation',
          revenue: monthlyRevenue * 0.4,
          invoiceCount: 8 + Math.floor(Math.random() * 5),
          avgInvoiceSize: 0,
        }
      });
      await prisma.customerSalesSnapshot.create({
        data: {
          companyId,
          snapshotDate: monthStart,
          frequency: 'monthly',
          customerId: 'demo-customer-2',
          customerName: 'Global Industries',
          revenue: monthlyRevenue * 0.35,
          invoiceCount: 6 + Math.floor(Math.random() * 4),
          avgInvoiceSize: 0,
        }
      });
      await prisma.customerSalesSnapshot.create({
        data: {
          companyId,
          snapshotDate: monthStart,
          frequency: 'monthly',
          customerId: 'demo-customer-3',
          customerName: 'Tech Solutions Inc',
          revenue: monthlyRevenue * 0.25,
          invoiceCount: 5 + Math.floor(Math.random() * 3),
          avgInvoiceSize: 0,
        }
      });
      totalRecords += 3;

      // 2. Monthly AR Aging
      const arTotal = Math.round(baseARTotal * monthlyVariance);
      await prisma.aRAgingSnapshot.create({
        data: {
          companyId,
          snapshotDate: monthStart,
          frequency: 'monthly',
          totalAR: arTotal,
          current: arTotal * 0.70,
          days1to30: arTotal * 0.15,
          days31to60: arTotal * 0.10,
          days61to90: arTotal * 0.03,
          days90plus: arTotal * 0.02
        }
      });
      totalRecords += 1;

      // 3. Monthly AP Aging
      const apTotal = Math.round(baseAPTotal * monthlyVariance);
      await prisma.aPAgingSnapshot.create({
        data: {
          companyId,
          snapshotDate: monthStart,
          frequency: 'monthly',
          totalAP: apTotal,
          current: apTotal * 0.75,
          days1to30: apTotal * 0.15,
          days31to60: apTotal * 0.07,
          days61to90: apTotal * 0.02,
          days90plus: apTotal * 0.01
        }
      });
      totalRecords += 1;

      // 4. Monthly Product Sales
      await prisma.productSalesSnapshot.create({
        data: {
          companyId,
          snapshotDate: monthStart,
          frequency: 'monthly',
          itemId: 'prod-001',
          itemName: 'Premium Widget',
          sku: 'WIDGET-001',
          quantitySold: 120 + Math.floor(Math.random() * 40),
          revenue: monthlyRevenue * 0.45,
          cogs: monthlyRevenue * 0.45 * 0.35,
          grossMargin: monthlyRevenue * 0.45 * 0.65,
          grossMarginPct: 65
        }
      });
      await prisma.productSalesSnapshot.create({
        data: {
          companyId,
          snapshotDate: monthStart,
          frequency: 'monthly',
          itemId: 'prod-002',
          itemName: 'Standard Widget',
          sku: 'WIDGET-002',
          quantitySold: 200 + Math.floor(Math.random() * 60),
          revenue: monthlyRevenue * 0.35,
          cogs: monthlyRevenue * 0.35 * 0.40,
          grossMargin: monthlyRevenue * 0.35 * 0.60,
          grossMarginPct: 60
        }
      });
      await prisma.productSalesSnapshot.create({
        data: {
          companyId,
          snapshotDate: monthStart,
          frequency: 'monthly',
          itemId: 'prod-003',
          itemName: 'Basic Widget',
          sku: 'WIDGET-003',
          quantitySold: 300 + Math.floor(Math.random() * 80),
          revenue: monthlyRevenue * 0.20,
          cogs: monthlyRevenue * 0.20 * 0.45,
          grossMargin: monthlyRevenue * 0.20 * 0.55,
          grossMarginPct: 55
        }
      });
      totalRecords += 3;

      // 5. Monthly Inventory
      const invValue = Math.round(baseInventoryValue * monthlyVariance);
      await prisma.inventorySnapshot.create({
        data: {
          companyId,
          snapshotDate: monthStart,
          frequency: 'monthly',
          itemId: 'inv-001',
          itemName: 'Premium Widget',
          sku: 'WIDGET-001',
          qtyOnHand: 450 + Math.floor(Math.random() * 100),
          assetValue: invValue * 0.40,
          avgCost: 220
        }
      });
      await prisma.inventorySnapshot.create({
        data: {
          companyId,
          snapshotDate: monthStart,
          frequency: 'monthly',
          itemId: 'inv-002',
          itemName: 'Standard Widget',
          sku: 'WIDGET-002',
          qtyOnHand: 800 + Math.floor(Math.random() * 150),
          assetValue: invValue * 0.35,
          avgCost: 110
        }
      });
      await prisma.inventorySnapshot.create({
        data: {
          companyId,
          snapshotDate: monthStart,
          frequency: 'monthly',
          itemId: 'inv-003',
          itemName: 'Basic Widget',
          sku: 'WIDGET-003',
          qtyOnHand: 1200 + Math.floor(Math.random() * 200),
          assetValue: invValue * 0.25,
          avgCost: 52
        }
      });
      totalRecords += 3;

      // 6. Monthly Cash
      const cashBalance = Math.round(baseCashBalance * monthlyVariance);
      await prisma.cashSnapshot.create({
        data: {
          companyId,
          snapshotDate: monthStart,
          frequency: 'monthly',
          accountId: 'cash-001',
          accountName: 'Operating Account',
          accountNumber: '****1234',
          cashBalance: cashBalance * 0.70,
          changeAmount: null,
          changePercent: null
        }
      });
      await prisma.cashSnapshot.create({
        data: {
          companyId,
          snapshotDate: monthStart,
          frequency: 'monthly',
          accountId: 'cash-002',
          accountName: 'Savings Account',
          accountNumber: '****5678',
          cashBalance: cashBalance * 0.30,
          changeAmount: null,
          changePercent: null
        }
      });
      totalRecords += 2;

      // Generate weekly data for this month (4 weeks)
      for (let week = 0; week < 4; week++) {
        const weekDate = new Date(monthStart);
        weekDate.setDate(weekDate.getDate() + (week * 7));
        
        if (weekDate > endDate) break;

        const weeklyVariance = 0.85 + Math.random() * 0.3;
        const weeklyRevenue = Math.round((monthlyRevenue / 4) * weeklyVariance);

        // Weekly snapshots (simplified - just one record per category)
        await prisma.customerSalesSnapshot.create({
          data: {
            companyId,
            snapshotDate: weekDate,
            frequency: 'weekly',
            customerId: 'demo-customer-all',
            customerName: 'All Customers',
            revenue: weeklyRevenue,
            invoiceCount: 15 + Math.floor(Math.random() * 8),
            avgInvoiceSize: 0,
          }
        });

        await prisma.productSalesSnapshot.create({
          data: {
            companyId,
            snapshotDate: weekDate,
            frequency: 'weekly',
            itemId: 'prod-all',
            itemName: 'All Products',
            sku: 'ALL',
            quantitySold: 150 + Math.floor(Math.random() * 50),
            revenue: weeklyRevenue,
            cogs: weeklyRevenue * 0.38,
            grossMargin: weeklyRevenue * 0.62,
            grossMarginPct: 62
          }
        });

        totalRecords += 2;
      }

      // Generate daily data for the last 90 days
      if (monthStart >= new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000)) {
        const daysInMonth = monthEnd.getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          const dayDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
          
          if (dayDate > endDate) break;
          if (dayDate < new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000)) continue;

          const dailyVariance = 0.90 + Math.random() * 0.2;
          const dailyRevenue = Math.round((monthlyRevenue / 30) * dailyVariance);

          // Daily snapshots
          await prisma.customerSalesSnapshot.create({
            data: {
              companyId,
              snapshotDate: dayDate,
              frequency: 'daily',
              customerId: 'demo-customer-all',
              customerName: 'All Customers',
              revenue: dailyRevenue,
              invoiceCount: 2 + Math.floor(Math.random() * 3),
              avgInvoiceSize: 0,
            }
          });

          await prisma.productSalesSnapshot.create({
            data: {
              companyId,
              snapshotDate: dayDate,
              frequency: 'daily',
              itemId: 'prod-all',
              itemName: 'All Products',
              sku: 'ALL',
              quantitySold: 20 + Math.floor(Math.random() * 10),
              revenue: dailyRevenue,
              cogs: dailyRevenue * 0.38,
              grossMargin: dailyRevenue * 0.62,
              grossMarginPct: 62
            }
          });

          totalRecords += 2;
        }
      }

      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    console.log('');
    console.log('✅ Seeding completed successfully!');
    console.log('📊 Total records created:', totalRecords);
    console.log('');
    console.log('Summary:');
    console.log('  - 12 months of monthly data');
    console.log('  - ~48 weeks of weekly data');
    console.log('  - ~90 days of daily data');
    console.log('  - 6 operational categories: Customer Sales, AR, AP, Products, Inventory, Cash');

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeding
seedOperationalData()
  .then(() => {
    console.log('');
    console.log('🎉 Done! You can now view the operational data in the Operations section.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

