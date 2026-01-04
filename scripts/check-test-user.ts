import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUser() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'corelyticsdevtest@test.com' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mfaEnabled: true,
        passwordHash: true
      }
    });

    if (!user) {
      console.log('❌ User not found: corelyticsdevtest@test.com');
      console.log('');
      console.log('Available users:');
      const allUsers = await prisma.user.findMany({
        select: { email: true, name: true, role: true },
        take: 10
      });
      allUsers.forEach(u => console.log(`  - ${u.email} (${u.role})`));
    } else {
      console.log('✅ User found!');
      console.log('  Email:', user.email);
      console.log('  Name:', user.name);
      console.log('  Role:', user.role);
      console.log('  MFA Enabled:', user.mfaEnabled);
      console.log('  Has Password:', !!user.passwordHash);
      console.log('  Password Hash (first 20 chars):', user.passwordHash?.substring(0, 20) + '...');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUser();

