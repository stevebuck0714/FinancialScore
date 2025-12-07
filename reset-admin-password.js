// Reset admin password
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('./lib/auth');
const prisma = new PrismaClient();

async function resetPassword() {
  try {
    console.log('DATABASE:', process.env.DATABASE_URL?.includes('cold-frost') ? 'DEV (cold-frost)' : 'PROD (orange-poetry)');

    const hashedPassword = await hashPassword('DevAdmin123!');

    const user = await prisma.user.update({
      where: { email: 'admin@dev.local' },
      data: { passwordHash: hashedPassword }
    });

    console.log('Password reset for:', user.email);
    console.log('You can now login with: admin@dev.local / DevAdmin123!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();
