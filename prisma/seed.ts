import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/auth';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create Site Administrator
  const siteAdminEmail = process.env.SITEADMIN_EMAIL || 'siteadministrator@venturis.com';
  const siteAdminPassword = process.env.SITEADMIN_PASSWORD || 'Venturis0801$';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: siteAdminEmail }
  });

  if (existingAdmin) {
    console.log('✓ Site administrator already exists');
  } else {
    const hashedPassword = await hashPassword(siteAdminPassword);
    
    const siteAdmin = await prisma.user.create({
      data: {
        email: siteAdminEmail,
        passwordHash: hashedPassword,
        name: 'Site Administrator',
        role: 'SITEADMIN'
      }
    });

    console.log('✓ Created site administrator:', siteAdmin.email);
  }

  // Import benchmark data if available
  await importBenchmarkData();

  console.log('✅ Seeding completed!');
}

async function importBenchmarkData() {
  try {
    const benchmarkCount = await prisma.industryBenchmark.count();
    
    if (benchmarkCount > 0) {
      console.log(`✓ Benchmark data already exists (${benchmarkCount} records)`);
      return;
    }

    console.log('📊 Importing benchmark data...');
    
    // Check if benchmark-data.sql exists
    const sqlPath = path.join(process.cwd(), 'benchmark-data.sql');
    
    if (fs.existsSync(sqlPath)) {
      console.log('Found benchmark-data.sql, importing...');
      
      // Read and execute the SQL file
      const sqlContent = fs.readFileSync(sqlPath, 'utf8');
      
      // Split into individual statements and execute
      const statements = sqlContent
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
      
      for (const statement of statements) {
        if (statement.includes('INSERT INTO "IndustryBenchmark"')) {
          await prisma.$executeRawUnsafe(statement);
        }
      }
      
      const finalCount = await prisma.industryBenchmark.count();
      console.log(`✓ Imported ${finalCount} benchmark records`);
    } else {
      console.log('⚠️  benchmark-data.sql not found. Benchmark data will need to be imported separately.');
      console.log('   Run: node scripts/import-benchmarks.ts to import benchmark data');
    }
  } catch (error) {
    console.error('❌ Error importing benchmark data:', error);
    console.log('   You can import benchmark data later using: node scripts/import-benchmarks.ts');
  }
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


