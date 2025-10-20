const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true
    }
  });
  
  console.log('Total users:', users.length);
  users.forEach(u => {
    console.log(`- ${u.email} (${u.role}) - ${u.name}`);
  });
  
  await prisma.$disconnect();
}

checkUsers();
