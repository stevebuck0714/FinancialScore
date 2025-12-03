const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({
    include: {
      consultant: {
        select: { fullName: true, companyName: true }
      },
      users: {
        select: { id: true, name: true, email: true }
      },
      _count: {
        select: { users: true }
      }
    },
    orderBy: { name: 'asc' }
  });

  console.log('');
  console.log('=== COMPANIES LIST ===');
  console.log('');
  
  companies.forEach(c => {
    console.log('Company: ' + c.name);
    console.log('  ID: ' + c.id);
    if (c.consultant) {
      console.log('  Managed by: ' + c.consultant.fullName + ' (' + c.consultant.companyName + ')');
    } else {
      console.log('  Managed by: (Standalone - no consultant)');
    }
    console.log('  Users (' + c._count.users + '):');
    if (c.users.length > 0) {
      c.users.forEach(u => {
        console.log('    - ' + u.name + ' <' + u.email + '>');
      });
    } else {
      console.log('    (none)');
    }
    console.log('');
  });
  
  console.log('Total: ' + companies.length + ' companies');
}

main().catch(console.error).finally(() => prisma.$disconnect());
