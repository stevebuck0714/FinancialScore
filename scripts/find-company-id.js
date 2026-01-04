// Find company ID by name or email
require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findCompany() {
  try {
    const searchTerm = process.argv[2] || '2nd free test';
    
    console.log(`🔍 Searching for company: "${searchTerm}"\n`);
    
    // Search by company name
    const companies = await prisma.company.findMany({
      where: {
        name: {
          contains: searchTerm,
          mode: 'insensitive',
        },
      },
      include: {
        users: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });
    
    if (companies.length === 0) {
      console.log('❌ No companies found matching:', searchTerm);
      console.log('\nTrying to find by email...\n');
      
      // Try by email
      const userCompanies = await prisma.company.findMany({
        where: {
          users: {
            some: {
              email: {
                contains: searchTerm,
                mode: 'insensitive',
              },
            },
          },
        },
        include: {
          users: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      });
      
      if (userCompanies.length === 0) {
        console.log('❌ No companies found for email:', searchTerm);
        process.exit(1);
      }
      
      console.log(`✅ Found ${userCompanies.length} company(ies):\n`);
      userCompanies.forEach((c) => {
        console.log(`📊 Company: ${c.name}`);
        console.log(`   ID: ${c.id}`);
        console.log(`   Owners: ${c.users.map(u => u.email).join(', ')}`);
        console.log('');
      });
    } else {
      console.log(`✅ Found ${companies.length} company(ies):\n`);
      companies.forEach((c) => {
        console.log(`📊 Company: ${c.name}`);
        console.log(`   ID: ${c.id}`);
        console.log(`   Owners: ${c.users.map(u => u.email).join(', ')}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

findCompany();

