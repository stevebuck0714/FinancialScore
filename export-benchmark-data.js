const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function exportBenchmarkData() {
  try {
    console.log('Exporting benchmark data...');
    
    // Get all benchmark data
    const benchmarks = await prisma.industryBenchmark.findMany({
      orderBy: [
        { industryId: 'asc' },
        { metricName: 'asc' }
      ]
    });
    
    console.log(`Found ${benchmarks.length} benchmark records`);
    
    // Create a JSON file with the data
    const data = {
      benchmarks: benchmarks,
      exportDate: new Date().toISOString(),
      totalRecords: benchmarks.length
    };
    
    fs.writeFileSync('benchmark-data.json', JSON.stringify(data, null, 2));
    console.log('Benchmark data exported to benchmark-data.json');
    
    // Also create a SQL insert script
    let sqlScript = '-- Benchmark Data Import Script\n';
    sqlScript += '-- Generated on ' + new Date().toISOString() + '\n\n';
    sqlScript += '-- Clear existing data\n';
    sqlScript += 'DELETE FROM "IndustryBenchmark";\n\n';
    sqlScript += '-- Insert benchmark data\n';
    
    benchmarks.forEach(benchmark => {
      const values = [
        benchmark.id,
        benchmark.industryId,
        `'${benchmark.industryName.replace(/'/g, "''")}'`,
        `'${benchmark.assetSizeCategory.replace(/'/g, "''")}'`,
        `'${benchmark.metricName.replace(/'/g, "''")}'`,
        benchmark.fiveYearValue !== null ? benchmark.fiveYearValue : 'NULL'
      ].join(', ');
      
      sqlScript += `INSERT INTO "IndustryBenchmark" (id, "industryId", "industryName", "assetSizeCategory", "metricName", "fiveYearValue") VALUES (${values});\n`;
    });
    
    fs.writeFileSync('benchmark-data.sql', sqlScript);
    console.log('SQL import script created: benchmark-data.sql');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

exportBenchmarkData();
