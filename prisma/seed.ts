import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/auth';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create Site Administrator
  const siteAdminEmail = process.env.SITEADMIN_EMAIL || 'siteadministrator@venturis.com';
  const siteAdminPassword = process.env.SITEADMIN_PASSWORD || 'Venturis0801$';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: siteAdminEmail }
  });

  if (existingAdmin) {
    console.log('✓ Site administrator already exists');
  } else {
    const hashedPassword = await hashPassword(siteAdminPassword);
    
    const siteAdmin = await prisma.user.create({
      data: {
        email: siteAdminEmail,
        passwordHash: hashedPassword,
        name: 'Site Administrator',
        role: 'SITEADMIN'
      }
    });

    console.log('✓ Created site administrator:', siteAdmin.email);
  }

  console.log('✅ Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


