import { PrismaClient } from '@prisma/client';
import { createMonthlyRecords } from './lib/quickbooks-parser';

const prisma = new PrismaClient();

async function main() {
  // Find "live test 11" company
  const company = await prisma.company.findFirst({
    where: {
      name: {
        contains: 'live test 11',
        mode: 'insensitive'
      }
    }
  });

  if (!company) {
    console.log('❌ Company "live test 11" not found');
    return;
  }

  console.log(`✅ Found company: ${company.name} (ID: ${company.id})`);
  console.log(`   Lines of Business:`, company.linesOfBusiness);

  // Get the most recent financial record with QB data
  const financialRecord = await prisma.financialRecord.findFirst({
    where: { companyId: company.id },
    orderBy: { createdAt: 'desc' }
  });

  if (!financialRecord) {
    console.log('❌ No financial records found');
    return;
  }

  console.log(`\n✅ Found financial record from ${financialRecord.createdAt}`);

  // Get account mappings
  const accountMappings = await prisma.accountMapping.findMany({
    where: { companyId: company.id },
    select: {
      qbAccount: true,
      qbAccountId: true,
      targetField: true,
      lobAllocations: true,
    },
  });

  console.log(`\n✅ Found ${accountMappings.length} account mappings`);
  const mappingsWithLOB = accountMappings.filter(m => m.lobAllocations);
  console.log(`   ${mappingsWithLOB.length} have LOB allocations`);

  // Extract QB data from raw data
  const rawData = financialRecord.rawData as any;
  const plData = rawData?.profitAndLoss;
  const bsData = rawData?.balanceSheet;

  if (!plData || !bsData) {
    console.log('❌ P&L or Balance Sheet data not found in raw data');
    return;
  }

  console.log('\n🔄 Processing QB data with LOB allocations...\n');

  // Process the data with LOB allocations
  const parsedRecords = createMonthlyRecords(
    plData,
    bsData,
    accountMappings as any
  );

  console.log(`\n✅ Processed ${parsedRecords.length} monthly records`);

  // Show breakdown for the most recent month with revenue
  const recentMonthWithRevenue = parsedRecords
    .filter(r => r.revenue > 0)
    .sort((a, b) => b.monthDate.getTime() - a.monthDate.getTime())[0];

  if (recentMonthWithRevenue) {
    console.log(`\n📊 DETAILED BREAKDOWN FOR ${recentMonthWithRevenue.monthDate.toISOString().substring(0, 7)}`);
    console.log(`${'='.repeat(70)}`);
    
    console.log(`\n💰 REVENUE: $${recentMonthWithRevenue.revenue.toFixed(2)}`);
    if (recentMonthWithRevenue.revenueBreakdown) {
      console.log('   LOB Breakdown:');
      for (const [lob, amount] of Object.entries(recentMonthWithRevenue.revenueBreakdown)) {
        const percentage = (amount as number / recentMonthWithRevenue.revenue * 100).toFixed(1);
        console.log(`     - ${lob}: $${(amount as number).toFixed(2)} (${percentage}%)`);
      }
    } else {
      console.log('   ⚠️  No LOB breakdown available');
    }

    console.log(`\n💸 EXPENSES: $${recentMonthWithRevenue.expense.toFixed(2)}`);
    if (recentMonthWithRevenue.expenseBreakdown) {
      console.log('   LOB Breakdown:');
      for (const [lob, amount] of Object.entries(recentMonthWithRevenue.expenseBreakdown)) {
        const percentage = recentMonthWithRevenue.expense > 0 
          ? (amount as number / recentMonthWithRevenue.expense * 100).toFixed(1)
          : '0.0';
        console.log(`     - ${lob}: $${(amount as number).toFixed(2)} (${percentage}%)`);
      }
    } else {
      console.log('   ⚠️  No LOB breakdown available');
    }

    console.log(`\n🏭 COGS: $${recentMonthWithRevenue.cogsTotal.toFixed(2)}`);
    if (recentMonthWithRevenue.cogsBreakdown) {
      console.log('   LOB Breakdown:');
      for (const [lob, amount] of Object.entries(recentMonthWithRevenue.cogsBreakdown)) {
        const percentage = recentMonthWithRevenue.cogsTotal > 0
          ? (amount as number / recentMonthWithRevenue.cogsTotal * 100).toFixed(1)
          : '0.0';
        console.log(`     - ${lob}: $${(amount as number).toFixed(2)} (${percentage}%)`);
      }
    } else {
      console.log('   ⚠️  No LOB breakdown available');
    }

    // Show all field breakdowns
    if (recentMonthWithRevenue.lobBreakdowns) {
      console.log(`\n📋 ALL FIELD BREAKDOWNS:`);
      console.log(`${'='.repeat(70)}`);
      const breakdowns = recentMonthWithRevenue.lobBreakdowns as any;
      const fieldNames = Object.keys(breakdowns).sort();
      
      for (const fieldName of fieldNames) {
        const lobBreakdown = breakdowns[fieldName];
        const total = Object.values(lobBreakdown).reduce((sum: number, val) => sum + (val as number), 0);
        
        if (total > 0) {
          console.log(`\n${fieldName}: $${total.toFixed(2)}`);
          for (const [lob, amount] of Object.entries(lobBreakdown)) {
            if ((amount as number) > 0) {
              const pct = (amount as number / total * 100).toFixed(1);
              console.log(`  - ${lob}: $${(amount as number).toFixed(2)} (${pct}%)`);
            }
          }
        }
      }
    }
  }

  // Show sample of a few months
  console.log(`\n\n📅 MONTHLY REVENUE BREAKDOWN (Last 6 months with revenue):`);
  console.log(`${'='.repeat(70)}`);
  
  const monthsWithRevenue = parsedRecords
    .filter(r => r.revenue > 0)
    .sort((a, b) => b.monthDate.getTime() - a.monthDate.getTime())
    .slice(0, 6);

  for (const record of monthsWithRevenue) {
    const month = record.monthDate.toISOString().substring(0, 7);
    console.log(`\n${month}: Total Revenue = $${record.revenue.toFixed(2)}`);
    if (record.revenueBreakdown) {
      for (const [lob, amount] of Object.entries(record.revenueBreakdown)) {
        console.log(`  ${lob}: $${(amount as number).toFixed(2)}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);


