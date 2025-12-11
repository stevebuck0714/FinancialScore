// Create test user for company creation testing
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('./lib/auth');
const prisma = new PrismaClient();

async function createUser() {
  try {
    const hashedPassword = await hashPassword('Test123!');

    const user = await prisma.user.create({
      data: {
        email: 'corelyticsdevtest@test.com',
        passwordHash: hashedPassword,
        name: 'Corelytics Dev Test',
        role: 'CONSULTANT'
      }
    });

    console.log('Created user:', user.email);

    const consultant = await prisma.consultant.create({
      data: {
        userId: user.id,
        fullName: 'Corelytics Dev Test',
        type: 'business'
      }
    });

    console.log('Created consultant:', consultant.id);
    console.log('You can now log in with: corelyticsdevtest@test.com / Test123!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createUser();







