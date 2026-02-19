import dotenv from 'dotenv';

async function main() {
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env' });

  const { default: prisma } = await import('../lib/prisma');

  const settings = await prisma.systemSettings.upsert({
    where: { key: 'default_pricing' },
    update: {
      businessMonthlyPrice: 195,
      businessQuarterlyPrice: 500,
      businessAnnualPrice: 1750,
      businessSetupFee: 0,
      consultantMonthlyPrice: 195,
      consultantQuarterlyPrice: 500,
      consultantAnnualPrice: 1750,
      consultantSetupFee: 0,
    },
    create: {
      key: 'default_pricing',
      businessMonthlyPrice: 195,
      businessQuarterlyPrice: 500,
      businessAnnualPrice: 1750,
      businessSetupFee: 0,
      consultantMonthlyPrice: 195,
      consultantQuarterlyPrice: 500,
      consultantAnnualPrice: 1750,
      consultantSetupFee: 0,
    },
    select: {
      key: true,
      businessMonthlyPrice: true,
      businessQuarterlyPrice: true,
      businessAnnualPrice: true,
      businessSetupFee: true,
      consultantMonthlyPrice: true,
      consultantQuarterlyPrice: true,
      consultantAnnualPrice: true,
      consultantSetupFee: true,
      updatedAt: true,
    },
  });

  console.log('✅ Upserted settings:', settings);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ test-settings-upsert failed:', err?.message || err);
  process.exit(1);
});

