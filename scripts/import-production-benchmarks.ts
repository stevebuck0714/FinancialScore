import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function importBenchmarks() {
  try {
    console.log('🚀 Starting benchmark import to production database...\n');

    // Check if benchmarks already exist
    const existingCount = await prisma.industryBenchmark.count();
    
    if (existingCount > 0) {
      console.log(`⚠️  Database already has ${existingCount} benchmarks.`);
      console.log('   Do you want to continue? This will add more records.');
      console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Read the SQL file
    const sqlPath = path.join(process.cwd(), 'benchmark-data.sql');
    
    if (!fs.existsSync(sqlPath)) {
      console.error('❌ benchmark-data.sql not found!');
      console.log('   Make sure you have extracted the file from benchmark-data.zip');
      process.exit(1);
    }

    console.log('📄 Reading benchmark-data.sql...');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split into individual INSERT statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && stmt.includes('INSERT INTO "IndustryBenchmark"'));

    console.log(`   Found ${statements.length} INSERT statements\n`);

    // Execute each INSERT statement
    let imported = 0;
    const batchSize = 100;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      try {
        await prisma.$executeRawUnsafe(statement + ';');
        imported++;
        
        if (imported % batchSize === 0) {
          console.log(`   ✓ Imported ${imported}/${statements.length} statements...`);
        }
      } catch (error: any) {
        // Skip duplicate errors (in case some data already exists)
        if (!error.message?.includes('Unique constraint')) {
          console.error(`   Error on statement ${i}:`, error.message);
        }
      }
    }

    console.log(`\n✅ Import complete!`);
    console.log(`   Imported ${imported} statements`);

    // Verify
    const finalCount = await prisma.industryBenchmark.count();
    const industries = await prisma.industryBenchmark.groupBy({
      by: ['industryId'],
    });
    
    console.log(`\n📊 Database verification:`);
    console.log(`   Total benchmarks: ${finalCount.toLocaleString()}`);
    console.log(`   Unique industries: ${industries.length}`);

  } catch (error) {
    console.error('❌ Fatal error during import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

importBenchmarks()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


