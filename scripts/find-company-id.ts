/**
 * Find Company ID by Name
 * 
 * Usage:
 * DATABASE_URL="your-prod-db-url" npx ts-node scripts/find-company-id.ts "Company Name"
 * 
 * Example:
 * DATABASE_URL="your-prod-db-url" npx ts-node scripts/find-company-id.ts "Demonstration Company"
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const searchTerm = process.argv[2];

if (!searchTerm) {
  console.error('❌ Error: Company name is required');
  console.log('Usage: npx ts-node scripts/find-company-id.ts "Company Name"');
  process.exit(1);
}

async function findCompany() {
  try {
    console.log('🔍 Searching for companies matching:', searchTerm);
    console.log('🗄️  Database:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'unknown');
    console.log('');

    const companies = await prisma.company.findMany({
      where: {
        name: {
          contains: searchTerm,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            monthlyFinancials: true,
            users: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    if (companies.length === 0) {
      console.log('❌ No companies found matching:', searchTerm);
      console.log('');
      console.log('💡 Try a partial name or check spelling');
    } else {
      console.log(`✅ Found ${companies.length} company/companies:\n`);
      
      companies.forEach((company, index) => {
        console.log(`${index + 1}. ${company.name}`);
        console.log(`   ID: ${company.id}`);
        console.log(`   Status: ${company.status}`);
        console.log(`   Created: ${company.createdAt.toISOString().split('T')[0]}`);
        console.log(`   Monthly Records: ${company._count.monthlyFinancials}`);
        console.log(`   Users: ${company._count.users}`);
        console.log('');
      });

      if (companies.length === 1) {
        console.log('📋 To seed this company, run:');
        console.log(`   DATABASE_URL="your-prod-url" npx ts-node scripts/seed-demo-company.ts ${companies[0].id}`);
        console.log('');
      }
    }

  } catch (error) {
    console.error('❌ Error searching for company:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

findCompany()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

