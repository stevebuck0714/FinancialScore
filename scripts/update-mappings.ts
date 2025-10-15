import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateMappings() {
  const companyId = 'cmgmttbfh0004qhgwm6vd9oa5'; // Your company ID
  
  // Mapping of old detail accounts to their "Total" equivalents
  const accountUpdates: { [key: string]: string } = {
    'Accounting': 'Total Legal & Professional Fees',
    'Bookkeeper': 'Total Legal & Professional Fees',
    'Lawyer': 'Total Legal & Professional Fees',
    'Advertising': 'Total Advertising',
    'Equipment Rental': 'Total Equipment Rental',
    'Fuel': 'Total Automobile',
    'Insurance': 'Total Insurance',
    'Meals and Entertainment': 'Total Meals and Entertainment',
    'Office Expenses': 'Total Office Expenses',
    'Rent or Lease': 'Total Rent or Lease',
    'Gas and Electric': 'Total Utilities',
    'Telephone': 'Total Utilities',
    'Equipment Repairs': 'Total Maintenance and Repair',
    'Miscellaneous': 'Total Other Expenses',
    // Add any other mappings from your console logs
  };
  
  const mappings = await prisma.accountMapping.findMany({
    where: { companyId }
  });
  
  console.log(`Found ${mappings.length} existing mappings`);
  
  for (const mapping of mappings) {
    const newAccount = accountUpdates[mapping.qbAccount];
    if (newAccount) {
      console.log(`Updating: "${mapping.qbAccount}" -> "${newAccount}"`);
      await prisma.accountMapping.update({
        where: { id: mapping.id },
        data: { qbAccount: newAccount }
      });
    } else {
      console.log(`Keeping: "${mapping.qbAccount}" (no update needed)`);
    }
  }
  
  console.log('✅ Mappings updated!');
}

updateMappings()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

