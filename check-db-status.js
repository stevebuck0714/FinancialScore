const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Checking staging-exact database (cold-frost.db)...');

    // Check users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });

    console.log(`\n👥 Users (${users.length} found):`);
    if (users.length === 0) {
      console.log('❌ NO USERS - Database appears empty of user data');
    } else {
      users.forEach((user, index) => {
        console.log(`  ${index + 1}. ${user.email} (${user.role}) - ${user.name}`);
      });
    }

    // Check tables
    const tables = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`;
    console.log(`\n📊 Database Tables (${tables.length} total):`);
    tables.slice(0, 15).forEach(table => console.log(`  - ${table.name}`));
    if (tables.length > 15) console.log(`  ... and ${tables.length - 15} more tables`);

    // Check if key tables exist
    const keyTables = ['User', 'Company', 'Consultant', 'FinancialRecord'];
    console.log(`\n🔑 Key Tables Status:`);
    keyTables.forEach(tableName => {
      const exists = tables.some(t => t.name === tableName);
      console.log(`  ${exists ? '✅' : '❌'} ${tableName}`);
    });

  } catch (err) {
    console.error('❌ Database check failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();


