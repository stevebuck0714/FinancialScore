import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET all companies (optionally filtered by consultant or company ID)
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Companies API called');
    const { searchParams } = new URL(request.url);
    const consultantId = searchParams.get('consultantId');
    const companyId = searchParams.get('companyId');

    console.log('🔍 Query params:', { consultantId, companyId });

    // Build where clause - if consultantId provided, filter by it; if companyId provided, filter by that; otherwise return all companies
    const where = consultantId ? { consultantId } : companyId ? { id: companyId } : {};

    console.log('🔍 Where clause:', where);

    const companies = await prisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
        addressStreet: true,
        addressCity: true,
        addressState: true,
        addressZip: true,
        addressCountry: true,
        industrySector: true,
        linesOfBusiness: true,
        // userDefinedAllocations: true, // Column doesn't exist in production DB
        affiliateCode: true,
        subscriptionStatus: true,
        subscriptionStartDate: true,
        nextBillingDate: true,
        selectedSubscriptionPlan: true,
        consultantId: true,
        affiliateId: true,
        createdAt: true,
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            userType: true
          }
        },
        _count: {
          select: {
            users: true,
            financialRecords: true,
            assessmentRecords: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json({ companies });
  } catch (error) {
    console.error('❌ Error fetching companies:', error);
    console.error('❌ Error details:', error instanceof Error ? error.message : 'Unknown error');
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST create new company
export async function POST(request: NextRequest) {
  try {
    const { name, consultantId, addressStreet, addressCity, addressState, addressZip, addressCountry, industrySector, affiliateCode } = await request.json();

    if (!name || !consultantId) {
      return NextResponse.json(
        { error: 'Company name and consultant ID required' },
        { status: 400 }
      );
    }

    // Get consultant to check their type
    const consultant = await prisma.consultant.findUnique({
      where: { id: consultantId },
      select: { type: true }
    });

    let monthlyPrice: number;
    let quarterlyPrice: number;
    let annualPrice: number;
    let affiliateId: string | undefined;
    let validatedAffiliateCode: string | undefined;

    // If affiliate code is provided, validate and use affiliate pricing
    if (affiliateCode) {
      const affiliateCodeRecord = await prisma.affiliateCode.findUnique({
        where: { code: affiliateCode.toUpperCase() },
        include: {
          affiliate: true
        }
      });

      if (!affiliateCodeRecord) {
        return NextResponse.json(
          { error: 'Invalid affiliate code' },
          { status: 400 }
        );
      }

      if (!affiliateCodeRecord.isActive) {
        return NextResponse.json(
          { error: 'This affiliate code is no longer active' },
          { status: 400 }
        );
      }

      if (!affiliateCodeRecord.affiliate.isActive) {
        return NextResponse.json(
          { error: 'This affiliate is no longer active' },
          { status: 400 }
        );
      }

      if (affiliateCodeRecord.expiresAt && new Date(affiliateCodeRecord.expiresAt) < new Date()) {
        return NextResponse.json(
          { error: 'This affiliate code has expired' },
          { status: 400 }
        );
      }

      if (affiliateCodeRecord.maxUses && affiliateCodeRecord.currentUses >= affiliateCodeRecord.maxUses) {
        return NextResponse.json(
          { error: 'This affiliate code has reached its maximum number of uses' },
          { status: 400 }
        );
      }

      // Use affiliate pricing
      monthlyPrice = affiliateCodeRecord.monthlyPrice;
      quarterlyPrice = affiliateCodeRecord.quarterlyPrice;
      annualPrice = affiliateCodeRecord.annualPrice;
      affiliateId = affiliateCodeRecord.affiliateId;
      validatedAffiliateCode = affiliateCodeRecord.code;

      // Increment usage count
      await prisma.affiliateCode.update({
        where: { id: affiliateCodeRecord.id },
        data: { currentUses: affiliateCodeRecord.currentUses + 1 }
      });
    } else {
    // Fetch default pricing from SystemSettings
    let defaultPricing = await prisma.systemSettings.findUnique({
      where: { key: 'default_pricing' }
    });

    // If no settings exist, create with defaults
    if (!defaultPricing) {
      defaultPricing = await prisma.systemSettings.create({
        data: {
          key: 'default_pricing',
          businessMonthlyPrice: 195,
          businessQuarterlyPrice: 500,
          businessAnnualPrice: 1750,
          consultantMonthlyPrice: 195,
          consultantQuarterlyPrice: 500,
          consultantAnnualPrice: 1750
        }
      });
    }

    // Use consultant pricing for regular consultants, business pricing for business consultants
    const isBusinessConsultant = consultant?.type === 'business';
      monthlyPrice = isBusinessConsultant 
      ? (defaultPricing.businessMonthlyPrice ?? 195)
      : (defaultPricing.consultantMonthlyPrice ?? 195);
      quarterlyPrice = isBusinessConsultant
      ? (defaultPricing.businessQuarterlyPrice ?? 500)
      : (defaultPricing.consultantQuarterlyPrice ?? 500);
      annualPrice = isBusinessConsultant
      ? (defaultPricing.businessAnnualPrice ?? 1750)
      : (defaultPricing.consultantAnnualPrice ?? 1750);
    }

    const company = await prisma.company.create({
      data: {
        name,
        consultantId,
        addressStreet,
        addressCity,
        addressState,
        addressZip,
        addressCountry,
        industrySector,
        subscriptionMonthlyPrice: monthlyPrice,
        subscriptionQuarterlyPrice: quarterlyPrice,
        subscriptionAnnualPrice: annualPrice,
        affiliateCode: validatedAffiliateCode,
        affiliateId: affiliateId
      }
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    console.error('❌ Error creating company:', error);
    console.error('❌ Error details:', error instanceof Error ? error.message : 'Unknown error');
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE company
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    await prisma.company.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting company:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT update company pricing
export async function PUT(request: NextRequest) {
  try {
    const { 
      id, 
      subscriptionMonthly,
      subscriptionQuarterly,
      subscriptionAnnual
    } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (subscriptionMonthly !== undefined) updateData.subscriptionMonthlyPrice = subscriptionMonthly;
    if (subscriptionQuarterly !== undefined) updateData.subscriptionQuarterlyPrice = subscriptionQuarterly;
    if (subscriptionAnnual !== undefined) updateData.subscriptionAnnualPrice = subscriptionAnnual;

    const company = await prisma.company.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({ company });
  } catch (error) {
    console.error('Error updating company pricing:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH update company
export async function PATCH(request: NextRequest) {
  try {
    const {
      id,
      companyId, // Alternative way to specify company ID
      addressStreet,
      addressCity,
      addressState,
      addressZip,
      addressCountry,
      industrySector,
      name,
      linesOfBusiness,
      // userDefinedAllocations, // Column doesn't exist in production DB
      subscriptionMonthlyPrice,
      subscriptionQuarterlyPrice,
      subscriptionAnnualPrice,
      selectedSubscriptionPlan
    } = await request.json();

    const targetCompanyId = id || companyId;

    if (!targetCompanyId) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    const company = await prisma.company.update({
      where: { id: targetCompanyId },
      data: {
        ...(name && { name }),
        ...(addressStreet !== undefined && { addressStreet }),
        ...(addressCity !== undefined && { addressCity }),
        ...(addressState !== undefined && { addressState }),
        ...(addressZip !== undefined && { addressZip }),
        ...(addressCountry !== undefined && { addressCountry }),
        ...(industrySector !== undefined && { industrySector }),
        ...(linesOfBusiness !== undefined && { linesOfBusiness }),
        // ...(userDefinedAllocations !== undefined && { userDefinedAllocations }), // Column doesn't exist in production DB
        ...(subscriptionMonthlyPrice !== undefined && { subscriptionMonthlyPrice }),
        ...(subscriptionQuarterlyPrice !== undefined && { subscriptionQuarterlyPrice }),
        ...(subscriptionAnnualPrice !== undefined && { subscriptionAnnualPrice }),
        ...(selectedSubscriptionPlan !== undefined && { selectedSubscriptionPlan })
      }
    });

    return NextResponse.json({ company });
  } catch (error) {
    console.error('Error updating company:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

