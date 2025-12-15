// Debug which database the app is actually connecting to
console.log('=== DATABASE CONNECTION DEBUG ===');
console.log('Current working directory:', process.cwd());
console.log('DATABASE_URL env var:', process.env.DATABASE_URL);

// Try to connect to the database and see what users exist
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function debugConnection() {
  try {
    console.log('\n=== TESTING DATABASE CONNECTION ===');

    // Try to find the admin user
    const user = await prisma.user.findUnique({
      where: { email: 'admin@dev.local' }
    });

    if (user) {
      console.log('✅ Admin user FOUND in database');
      console.log('User details:', {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      });
    } else {
      console.log('❌ Admin user NOT FOUND in database');

      // Check what users do exist
      const allUsers = await prisma.user.findMany();
      console.log(`Found ${allUsers.length} users in database:`);
      allUsers.forEach(u => console.log(`  - ${u.email} (${u.role})`));
    }

  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    console.error('This suggests the DATABASE_URL is not pointing to the correct database');
  } finally {
    await prisma.$disconnect();
  }
}

debugConnection();



