// Comprehensive affiliate code check
// Run this in Vercel dashboard or production environment

const { PrismaClient } = require('@prisma/client');

async function checkAffiliateCodes() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Checking affiliate code: VCFREE2025');
    const code = await prisma.affiliateCode.findUnique({
      where: { code: 'VCFREE2025' },
      include: {
        affiliate: {
          select: {
            id: true,
            name: true,
            isActive: true
          }
        }
      }
    });

    console.log('VCFREE2025 exists:', !!code);
    if (code) {
      console.log('Full code details:', {
        id: code.id,
        code: code.code,
        isActive: code.isActive,
        affiliateId: code.affiliateId,
        affiliate: code.affiliate,
        expiresAt: code.expiresAt,
        maxUses: code.maxUses,
        currentUses: code.currentUses,
        monthlyPrice: code.monthlyPrice,
        quarterlyPrice: code.quarterlyPrice,
        annualPrice: code.annualPrice
      });

      // Check if affiliate exists separately
      console.log('🔍 Checking affiliate separately...');
      const affiliate = await prisma.affiliate.findUnique({
        where: { id: code.affiliateId },
        select: { id: true, name: true, isActive: true }
      });
      console.log('Affiliate lookup result:', affiliate);

      // Check expiration
      if (code.expiresAt) {
        const now = new Date();
        const expires = new Date(code.expiresAt);
        console.log('Expiration check:', {
          expiresAt: code.expiresAt,
          now: now.toISOString(),
          isExpired: expires < now
        });
      }

      // Check usage limits
      if (code.maxUses) {
        console.log('Usage check:', {
          currentUses: code.currentUses,
          maxUses: code.maxUses,
          isAtLimit: code.currentUses >= code.maxUses
        });
      }
    } else {
      console.log('❌ VCFREE2025 not found in database');
    }

    console.log('\n🔍 Checking PROMO2025 (for comparison):');
    const promoCode = await prisma.affiliateCode.findUnique({
      where: { code: 'PROMO2025' },
      include: { affiliate: true }
    });
    console.log('PROMO2025 exists:', !!promoCode);

    console.log('\n🔍 All affiliate codes (first 10):');
    const allCodes = await prisma.affiliateCode.findMany({
      take: 10,
      select: {
        code: true,
        isActive: true,
        affiliate: { select: { name: true, isActive: true } },
        expiresAt: true,
        maxUses: true,
        currentUses: true
      }
    });
    console.log('All codes:', allCodes);

  } catch (error) {
    console.error('❌ Database error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta
    });
  } finally {
    await prisma.$disconnect();
  }
}

checkAffiliateCodes();
