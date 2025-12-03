const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const consultants = await prisma.consultant.findMany({
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          consultantId: true
        }
      }
    },
    orderBy: { fullName: 'asc' }
  });

  console.log('');
  console.log('=== CONSULTANTS LIST ===');
  console.log('');
  
  consultants.forEach(c => {
    console.log('ID: ' + c.id);
    console.log('  Full Name: ' + c.fullName);
    console.log('  Company Name: ' + (c.companyName || '(none)'));
    console.log('  User Email: ' + c.user.email);
    console.log('  User Name: ' + c.user.name);
    console.log('');
  });
  
  console.log('Total: ' + consultants.length + ' consultants');
}

main().catch(console.error).finally(() => prisma.$disconnect());

