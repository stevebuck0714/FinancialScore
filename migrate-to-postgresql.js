/**
 * SQLite to PostgreSQL Migration Script
 * Exports benchmark data from SQLite and prepares for PostgreSQL import
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, 'prisma', 'dev.db');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Starting SQLite to PostgreSQL Migration...\n');

// Export Benchmarks
console.log('📊 Exporting IndustryBenchmark data...');
db.all('SELECT * FROM IndustryBenchmark', (err, benchmarks) => {
  if (err) {
    console.error('❌ Error exporting benchmarks:', err);
    return;
  }
  
  console.log(`✅ Found ${benchmarks.length} benchmark records`);
  
  // Save as JSON for easy import
  fs.writeFileSync(
    'benchmark-export.json',
    JSON.stringify(benchmarks, null, 2)
  );
  console.log('✅ Saved to: benchmark-export.json\n');
  
  // Create PostgreSQL-compatible SQL insert statements
  const sqlStatements = benchmarks.map(b => {
    return `INSERT INTO "IndustryBenchmark" (
      "id", "industryId", "industrySector", "industryDescription", 
      "assetSize", "metricType", "currentRatio", "quickRatio", 
      "currentLiabilitiesToNetWorth", "currentLiabilitiesToInventory", 
      "totalLiabilitiesToNetWorth", "fixedAssetsToNetWorth", 
      "debtToNetWorth", "grossProfitMargin", "operatingProfitMargin", 
      "netProfitMargin", "returnOnAssets", "returnOnNetWorth", 
      "salesToInventory", "salesToWorkingCapital", "salesToTotalAssets", 
      "collectionPeriod", "paymentPeriod", "salesGrowth", 
      "ebitdaMargin", "cashFlowToDebt", "inventoryTurnover", 
      "receivablesTurnover", "payablesTurnover", "workingCapitalTurnover", 
      "assetTurnover", "operatingCycle", "cashConversionCycle", 
      "debtServiceCoverageRatio", "createdAt", "updatedAt"
    ) VALUES (
      '${b.id}', '${b.industryId}', '${b.industrySector || ''}', '${(b.industryDescription || '').replace(/'/g, "''")}',
      '${b.assetSize}', '${b.metricType}', ${b.currentRatio}, ${b.quickRatio},
      ${b.currentLiabilitiesToNetWorth}, ${b.currentLiabilitiesToInventory},
      ${b.totalLiabilitiesToNetWorth}, ${b.fixedAssetsToNetWorth},
      ${b.debtToNetWorth}, ${b.grossProfitMargin}, ${b.operatingProfitMargin},
      ${b.netProfitMargin}, ${b.returnOnAssets}, ${b.returnOnNetWorth},
      ${b.salesToInventory}, ${b.salesToWorkingCapital}, ${b.salesToTotalAssets},
      ${b.collectionPeriod}, ${b.paymentPeriod}, ${b.salesGrowth},
      ${b.ebitdaMargin}, ${b.cashFlowToDebt}, ${b.inventoryTurnover},
      ${b.receivablesTurnover}, ${b.payablesTurnover}, ${b.workingCapitalTurnover},
      ${b.assetTurnover}, ${b.operatingCycle}, ${b.cashConversionCycle},
      ${b.debtServiceCoverageRatio}, '${b.createdAt}', '${b.updatedAt}'
    );`;
  });
  
  fs.writeFileSync('benchmark-import.sql', sqlStatements.join('\n\n'));
  console.log('✅ Created SQL import file: benchmark-import.sql\n');
  
  console.log('📋 Summary:');
  console.log(`   - Total benchmarks: ${benchmarks.length}`);
  console.log(`   - Files created: benchmark-export.json, benchmark-import.sql`);
  console.log('\n✅ Migration preparation complete!\n');
  
  db.close();
});

