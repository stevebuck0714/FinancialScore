import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  console.log('📦 Adding operational data tables...\n');

  const sql = fs.readFileSync('add-operational-tables.sql', 'utf-8');
  
  // Split by statement and execute each one
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(statement);
      console.log('✅ Executed statement');
    } catch (error: any) {
      // Ignore "already exists" errors
      if (error.message.includes('already exists')) {
        console.log('⚠️  Table already exists, skipping');
      } else {
        console.error('❌ Error:', error.message);
      }
    }
  }

  console.log('\n✅ Operational tables created successfully!');
  console.log('\nNext step: Run npx prisma generate');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

