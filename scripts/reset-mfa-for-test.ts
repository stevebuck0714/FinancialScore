import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const prisma = new PrismaClient();

async function resetMFA() {
  try {
    const result = await prisma.user.update({
      where: { email: 'corelyticsdevtest@test.com' },
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

