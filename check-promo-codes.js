const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkPromoCodes() {
  try {
    console.log('Checking promo codes PROMO2026 and PROMOFREE...\n');

    const promoCodes = await prisma.affiliateCode.findMany({
      where: {
        code: {
          in: ['PROMO2026', 'PROMOFREE']
        }
      },
      select: {
        code: true,
        monthlyPrice: true,
        quarterlyPrice: true,
        annualPrice: true,
        currentUses: true,
        isActive: true
      }
    });

    if (promoCodes.length === 0) {
      console.log('❌ No promo codes found!');
      return;
    }

    promoCodes.forEach(code => {
      console.log(`📋 Code: ${code.code}`);
      console.log(`   Monthly: $${code.monthlyPrice}`);
      console.log(`   Quarterly: $${code.quarterlyPrice}`);
      console.log(`   Annual: $${code.annualPrice}`);
      console.log(`   Uses: ${code.currentUses}`);
      console.log(`   Active: ${code.isActive ? '✅' : '❌'}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPromoCodes();


