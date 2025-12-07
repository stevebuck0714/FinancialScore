// Check which database we're connected to
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  console.log('DATABASE:', process.env.DATABASE_URL?.includes('cold-frost') ? 'DEV (cold-frost)' : 'PROD (orange-poetry)');
  console.log('Consultant count:', await prisma.consultant.count());
  console.log('User count:', await prisma.user.count());
  console.log('SystemSettings:', await prisma.systemSettings.findMany());
  await prisma.$disconnect();
}

check();
