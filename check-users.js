// Check users in database
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
  try {
    console.log('DATABASE:', process.env.DATABASE_URL?.includes('cold-frost') ? 'DEV (cold-frost)' : 'PROD (orange-poetry)');

    const users = await prisma.user.findMany({
      select: {
        email: true,
        role: true,
        name: true
      }
    });

    console.log('Users in database:');
    users.forEach(user => {
      console.log(`- ${user.email} (${user.role}) - ${user.name}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();