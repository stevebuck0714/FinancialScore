import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST - Validate affiliate code
export async function POST(request: NextRequest) {
  try {
    // Check if affiliate tables exist
    try {
      await prisma.affiliate.findFirst({ take: 1 });
    } catch (tableError) {
      console.log('Affiliate tables not available in production');
      return NextResponse.json(
        { error: 'Affiliate functionality not available in production environment' },
        { status: 503 }
      );
    }

    const { affiliateId, affiliateCode } = await request.json();

    if (!affiliateId || !affiliateCode) {
      return NextResponse.json(
        { error: 'Affiliate ID and code are required' },
        { status: 400 }
      );
    }

    // Find the affiliate and code
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      include: {
        codes: {
          where: { code: affiliateCode.toUpperCase() }
        }
      }
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: 'Affiliate not found' },
        { status: 404 }
      );
    }

    if (!affiliate.isActive) {
      return NextResponse.json(
        { error: 'This affiliate is no longer active' },
        { status: 400 }
      );
    }

    const code = affiliate.codes[0];
    if (!code) {
      return NextResponse.json(
        { error: 'Invalid affiliate code' },
        { status: 400 }
      );
    }

    if (!code.isActive) {
      return NextResponse.json(
        { error: 'This code is no longer active' },
        { status: 400 }
      );
    }

    if (code.expiresAt && new Date(code.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'This code has expired' },
        { status: 400 }
      );
    }

    if (code.maxUses && code.currentUses >= code.maxUses) {
      return NextResponse.json(
        { error: 'This code has reached its maximum number of uses' },
        { status: 400 }
      );
    }

    // Return the code-specific pricing
    return NextResponse.json({
      valid: true,
      monthlyPrice: code.monthlyPrice,
      quarterlyPrice: code.quarterlyPrice,
      annualPrice: code.annualPrice,
      affiliateName: affiliate.name
    });
  } catch (error) {
    console.error('Error validating affiliate code:', error);
    return NextResponse.json(
      { error: 'Failed to validate code' },
      { status: 500 }
    );
  }
}
