require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser() {
  try {
    const user = await prisma.user.findFirst({
      where: { email: 'test@example.com' }
    });

    console.log('User details:');
    console.log(JSON.stringify(user, null, 2));

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error checking user:', error);
    await prisma.$disconnect();
  }
}

checkUser();




