const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// These are standalone businesses that were incorrectly created as consultants
const fakeConsultantEmails = [
  'affiliatebusiness@testest.com',
  'affiliatetestbusiness@test.com',
  'register@test.com'
];

async function main() {
  console.log('=== Cleaning up fake consultant records ===\n');

  for (const email of fakeConsultantEmails) {
    console.log(`Processing: ${email}`);
    
    try {
      // Find the user
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          primaryConsultant: true,
          consultantFirm: {
            include: {
              companies: true
            }
          }
        }
      });

      if (!user) {
        console.log(`  ⚠ User not found, skipping\n`);
        continue;
      }

      // Get the consultant record (either as primary or team member)
      const consultant = user.primaryConsultant || user.consultantFirm;
      
      if (!consultant) {
        console.log(`  ⚠ No consultant record found, skipping\n`);
        continue;
      }

      console.log(`  Found consultant: ${consultant.fullName} (ID: ${consultant.id})`);

      // Find the company that belongs to this fake consultant
      const company = consultant.companies?.[0];
      
      if (company) {
        console.log(`  Found company: ${company.name} (ID: ${company.id})`);
        
        // 1. Update company to remove consultant link
        await prisma.company.update({
          where: { id: company.id },
          data: { consultantId: null }
        });
        console.log(`  ✓ Set company.consultantId to NULL`);

        // 2. Update user: change role to USER, link to company, remove consultant link
        await prisma.user.update({
          where: { id: user.id },
          data: {
            role: 'USER',
            companyId: company.id,
            consultantId: null
          }
        });
        console.log(`  ✓ Updated user role to USER and linked to company`);

        // 3. Delete the fake consultant record
        await prisma.consultant.delete({
          where: { id: consultant.id }
        });
        console.log(`  ✓ Deleted fake consultant record`);
      } else {
        console.log(`  ⚠ No company found for this consultant`);
        
        // Still update user and delete consultant
        await prisma.user.update({
          where: { id: user.id },
          data: {
            role: 'USER',
            consultantId: null
          }
        });
        console.log(`  ✓ Updated user role to USER`);

        await prisma.consultant.delete({
          where: { id: consultant.id }
        });
        console.log(`  ✓ Deleted fake consultant record`);
      }

      console.log(`  ✅ Done!\n`);
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}\n`);
    }
  }

  console.log('=== Cleanup complete ===');
}

main().catch(console.error).finally(() => prisma.$disconnect());

