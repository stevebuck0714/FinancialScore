import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetPassword() {
  const email = 'corelyticsdevtest@test.com';
  const newPassword = 'Corelytics1$';

  try {
    console.log('🔐 Resetting password for:', email);
    
    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    // Update user
    const user = await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        mfaEnabled: false,
        mfaSecret: null,
        backupCodes: null
      }
    });

    console.log('✅ Password reset successful!');
    console.log('  Email:', user.email);
    console.log('  Password:', newPassword);
    console.log('  MFA Enabled:', user.mfaEnabled);
    console.log('');
    console.log('🔐 You can now login with these credentials');
  } catch (error: any) {
    if (error.code === 'P2025') {
      console.error('❌ User not found:', email);
      console.log('');
      console.log('💡 Would you like to create this user instead?');
    } else {
      console.error('❌ Error:', error.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();

