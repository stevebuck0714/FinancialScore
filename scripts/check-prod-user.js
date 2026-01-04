// Check if user exists in production
const { PrismaClient } = require('@prisma/client');

const PROD_DB_URL = 'postgresql://neondb_owner:npg_F3ow2VZjNQXi@ep-orange-poetry-aejcxvms-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: PROD_DB_URL,
    },
  },
});

async function checkUser() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'corelyticstest5@yahoo.com' },
      include: {
        company: true,
      },
    });
    
    if (!user) {
      console.log('❌ User corelyticstest5@yahoo.com does NOT exist in production');
      console.log('\nYou need to:');
      console.log('1. Go to https://dashboard.corelytics.com');
      console.log('2. Click "Sign Up"');
      console.log('3. Register with corelyticstest5@yahoo.com');
    } else {
      console.log('✅ User EXISTS in production');
      console.log('Email:', user.email);
      console.log('Name:', user.name);
      console.log('Role:', user.role);
      console.log('MFA Enabled:', user.mfaEnabled);
      console.log('Company:', user.company?.name);
      console.log('\nIf login fails, the password might be wrong.');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkUser();

