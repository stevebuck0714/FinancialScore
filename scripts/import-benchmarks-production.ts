import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function importBenchmarks() {
  try {
    console.log('🚀 Starting benchmark import...\n');

    // Check existing
    const existingCount = await prisma.industryBenchmark.count();
    console.log(`Current benchmarks in database: ${existingCount}\n`);

    // Read SQL file
    const sqlPath = path.join(process.cwd(), 'benchmark-data.sql');
    console.log('📄 Reading benchmark-data.sql...');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Parse INSERT statements and extract data
    console.log('📊 Parsing data...');
    const insertRegex = /INSERT INTO "IndustryBenchmark" \([^)]+\) VALUES \(([^)]+)\)/g;
    let match;
    const records = [];
    
    while ((match = insertRegex.exec(sqlContent)) !== null) {
      const values = match[1].split(',').map(v => v.trim().replace(/^'|'$/g, ''));
      
      // Skip the first value (id)
      const [_, industryId, industryName, assetSizeCategory, metricName, fiveYearValue] = values;
      
      records.push({
        industryId: industryId.replace(/'/g, ''),
        industryName: industryName.replace(/'/g, ''),
        assetSizeCategory: assetSizeCategory.replace(/'/g, ''),
        metricName: metricName.replace(/'/g, ''),
        fiveYearValue: fiveYearValue === 'NULL' ? null : parseFloat(fiveYearValue)
      });
      
      if (records.length % 10000 === 0) {
        console.log(`   Parsed ${records.length} records...`);
      }
    }

    console.log(`\n✅ Parsed ${records.length} records\n`);
    console.log('💾 Importing to database in batches...');

    // Import in batches of 1000
    const batchSize = 1000;
    let imported = 0;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      await prisma.industryBenchmark.createMany({
        data: batch,
        skipDuplicates: true
      });
      
      imported += batch.length;
      console.log(`   ✓ Imported ${imported}/${records.length} records...`);
    }

    // Final verification
    const finalCount = await prisma.industryBenchmark.count();
    const industries = await prisma.industryBenchmark.groupBy({
      by: ['industryId'],
    });
    
    console.log(`\n✅ Import complete!`);
    console.log(`   Total benchmarks in DB: ${finalCount.toLocaleString()}`);
    console.log(`   Unique industries: ${industries.length}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

importBenchmarks();


