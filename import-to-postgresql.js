/**
 * Import benchmarks into PostgreSQL
 * Run this AFTER updating Prisma schema and running migrations
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function importBenchmarks() {
  try {
    console.log('🔄 Starting PostgreSQL import...\n');
    
    // Check if benchmark export file exists
    if (!fs.existsSync('benchmark-export.json')) {
      console.error('❌ benchmark-export.json not found!');
      console.log('   Please run: node migrate-to-postgresql.js first');
      process.exit(1);
    }
    
    // Read the exported data
    const benchmarks = JSON.parse(fs.readFileSync('benchmark-export.json', 'utf8'));
    console.log(`📊 Found ${benchmarks.length} benchmarks to import\n`);
    
    // Delete existing benchmarks (if any)
    console.log('🗑️  Clearing existing benchmarks...');
    await prisma.industryBenchmark.deleteMany({});
    console.log('✅ Cleared\n');
    
    // Import benchmarks in batches
    console.log('📥 Importing benchmarks...');
    const batchSize = 100;
    let imported = 0;
    
    for (let i = 0; i < benchmarks.length; i += batchSize) {
      const batch = benchmarks.slice(i, i + batchSize);
      
      await prisma.industryBenchmark.createMany({
        data: batch.map(b => ({
          id: b.id,
          industryId: b.industryId,
          industrySector: b.industrySector,
          industryDescription: b.industryDescription,
          assetSize: b.assetSize,
          metricType: b.metricType,
          currentRatio: b.currentRatio,
          quickRatio: b.quickRatio,
          currentLiabilitiesToNetWorth: b.currentLiabilitiesToNetWorth,
          currentLiabilitiesToInventory: b.currentLiabilitiesToInventory,
          totalLiabilitiesToNetWorth: b.totalLiabilitiesToNetWorth,
          fixedAssetsToNetWorth: b.fixedAssetsToNetWorth,
          debtToNetWorth: b.debtToNetWorth,
          grossProfitMargin: b.grossProfitMargin,
          operatingProfitMargin: b.operatingProfitMargin,
          netProfitMargin: b.netProfitMargin,
          returnOnAssets: b.returnOnAssets,
          returnOnNetWorth: b.returnOnNetWorth,
          salesToInventory: b.salesToInventory,
          salesToWorkingCapital: b.salesToWorkingCapital,
          salesToTotalAssets: b.salesToTotalAssets,
          collectionPeriod: b.collectionPeriod,
          paymentPeriod: b.paymentPeriod,
          salesGrowth: b.salesGrowth,
          ebitdaMargin: b.ebitdaMargin,
          cashFlowToDebt: b.cashFlowToDebt,
          inventoryTurnover: b.inventoryTurnover,
          receivablesTurnover: b.receivablesTurnover,
          payablesTurnover: b.payablesTurnover,
          workingCapitalTurnover: b.workingCapitalTurnover,
          assetTurnover: b.assetTurnover,
          operatingCycle: b.operatingCycle,
          cashConversionCycle: b.cashConversionCycle,
          debtServiceCoverageRatio: b.debtServiceCoverageRatio,
          createdAt: new Date(b.createdAt),
          updatedAt: new Date(b.updatedAt)
        })),
        skipDuplicates: true
      });
      
      imported += batch.length;
      console.log(`   Imported ${imported} / ${benchmarks.length}...`);
    }
    
    console.log('\n✅ Import complete!\n');
    
    // Verify import
    const count = await prisma.industryBenchmark.count();
    console.log(`📊 Verification: ${count} benchmarks in PostgreSQL database\n`);
    
    if (count === benchmarks.length) {
      console.log('🎉 Success! All benchmarks imported successfully!\n');
    } else {
      console.log('⚠️  Warning: Count mismatch. Please verify data.\n');
    }
    
  } catch (error) {
    console.error('❌ Error during import:', error);
  } finally {
    await prisma.$disconnect();
  }
}

importBenchmarks();

