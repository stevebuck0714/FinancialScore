import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      database: 'unknown',
      affiliateCodes: {
        total: 0,
        active: 0,
        free: 0
      },
      knownFreeCodes: [] as string[]
    };

    // Test database connection
    try {
      await prisma.$queryRaw`SELECT 1 as test`;
      results.database = 'connected';
    } catch (dbError) {
      results.database = 'error';
      console.error('Database health check failed:', dbError);
    }

    // Count affiliate codes
    try {
      const totalCodes = await prisma.affiliateCode.count();
      const activeCodes = await prisma.affiliateCode.count({
        where: { isActive: true }
      });
      const freeCodes = await prisma.affiliateCode.count({
        where: {
          isActive: true,
          monthlyPrice: 0,
          quarterlyPrice: 0,
          annualPrice: 0
        }
      });

      results.affiliateCodes = {
        total: totalCodes,
        active: activeCodes,
        free: freeCodes
      };

      // Check for known free codes
      const knownCodes = await prisma.affiliateCode.findMany({
        where: {
          code: { in: ['PROMO2025', 'FREETRIAL', 'DEMO'] },
          isActive: true
        },
        select: {
          code: true,
          monthlyPrice: true,
          quarterlyPrice: true,
          annualPrice: true
        }
      });

      results.knownFreeCodes = knownCodes
        .filter(code => code.monthlyPrice === 0 && code.quarterlyPrice === 0 && code.annualPrice === 0)
        .map(code => code.code);

    } catch (countError) {
      console.error('Affiliate code count failed:', countError);
      results.affiliateCodes = { total: -1, active: -1, free: -1 };
    }

    const isHealthy = results.database === 'connected' && results.affiliateCodes.total >= 0;

    return NextResponse.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      ...results
    }, {
      status: isHealthy ? 200 : 503
    });

  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
