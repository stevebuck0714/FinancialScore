const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    console.log('🔍 Checking for existing admin user...');

    // Check if admin already exists
    const existing = await prisma.user.findUnique({
      where: { email: 'admin@dev.local' }
    });

    if (existing) {
      console.log('✅ Admin user already exists:', existing.email);
      return;
    }

    console.log('📝 Creating admin user...');

    // Create admin user
    const hashedPassword = await bcrypt.hash('DevAdmin123!', 10);

    const newUser = await prisma.user.create({
      data: {
        id: 'admin-user-' + Date.now(),
        email: 'admin@dev.local',
        passwordHash: hashedPassword,
        name: 'Dev Administrator',
        role: 'SITEADMIN',
        userType: null,
        companyId: null,
        consultantId: null,
        isPrimaryContact: false
      }
    });

    console.log('✅ Admin user created successfully!');
    console.log('   Email: admin@dev.local');
    console.log('   Password: DevAdmin123!');
    console.log('   Role: SITEADMIN');

  } catch (err) {
    console.error('❌ Error creating admin user:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();


