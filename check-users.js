const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
  try {
    console.log('\n=== Checking Database Users ===\n');
    
    const users = await prisma.user.findMany({
      include: {
        consultant: true
      }
    });
    
    console.log(`Total users in database: ${users.length}\n`);
    
    users.forEach(user => {
      console.log('---');
      console.log(`Email: ${user.email}`);
      console.log(`Name: ${user.name}`);
      console.log(`Role: ${user.role}`);
      console.log(`Has Consultant Profile: ${user.consultant ? 'Yes' : 'No'}`);
      if (user.consultant) {
        console.log(`Consultant ID: ${user.consultant.id}`);
      }
    });
    
    const consultants = await prisma.consultant.findMany();
    console.log(`\nTotal consultants: ${consultants.length}`);
    
    const companies = await prisma.company.findMany();
    console.log(`Total companies: ${companies.length}`);
    
    console.log('\n=== Done ===\n');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();


