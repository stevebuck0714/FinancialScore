import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { provisionDemoWorkspace } from '@/lib/demo-provisioning';

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const requestedCompanyId = String(body?.companyId || '').trim();
    const force = body?.force === true;

    const companyId = requestedCompanyId || context.companyId || '';
    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId is required' },
        { status: 400 }
      );
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: access denied for this company' },
        { status: 403 }
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        subscriptionStatus: true,
        affiliateCode: true,
      },
    });

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    const subscriptionStatus = String(company.subscriptionStatus || '').toLowerCase();
    const affiliateCode = String(company.affiliateCode || '').trim().toUpperCase();
    const isDemoCompany =
      subscriptionStatus.startsWith('demo') || affiliateCode === 'SEVENDAYDEMO';

    if (!isDemoCompany && !(context.role === 'SITEADMIN' && force)) {
      return NextResponse.json(
        {
          error:
            'Reseed is limited to demo companies. Site admin may set force=true for non-demo.',
        },
        { status: 400 }
      );
    }

    await provisionDemoWorkspace({
      companyId: company.id,
      userId: context.userId,
      userEmail: context.email,
      companyName: company.name,
    });

    return NextResponse.json({
      success: true,
      companyId: company.id,
      companyName: company.name,
      message: 'Demo workspace re-seeded successfully',
    });
  } catch (error: any) {
    if (String(error?.message || '').includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Demo re-seed failed:', error);
    return NextResponse.json(
      { error: 'Failed to re-seed demo workspace', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
