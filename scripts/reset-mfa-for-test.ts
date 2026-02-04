import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

function getTargetEmail(): string {
  const args = process.argv.slice(2);
  const emailArgIndex = args.findIndex((arg) => arg === '--email');
  if (emailArgIndex !== -1 && args[emailArgIndex + 1]) {
    return args[emailArgIndex + 1];
  }

  return process.env.RESET_MFA_EMAIL || 'corelyticsdevtest@test.com';
}

async function resetMFA() {
  try {
    const targetEmail = getTargetEmail();
    const result = await prisma.user.update({
      where: { email: targetEmail },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        backupCodes: null
      }
    });

    console.log('✅ MFA reset for:', result.email);
    console.log('   mfaEnabled:', result.mfaEnabled);
    console.log('   mfaSecret:', result.mfaSecret);
    console.log('   backupCodes:', result.backupCodes);
    console.log('\n🔐 Ready for MFA enrollment test!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetMFA();

