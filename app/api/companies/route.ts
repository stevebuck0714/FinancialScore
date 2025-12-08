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

    console.log('🔍 Executing query with where clause:', where);

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
        // affiliateCode: true, // Let's try removing potentially problematic fields
        // subscriptionStatus: true,
        // subscriptionStartDate: true,
        // nextBillingDate: true,
        // selectedSubscriptionPlan: true,
        consultantId: true,
        // affiliateId: true,
        createdAt: true,
        // users: {
        //   select: {
        //     id: true,
        //     name: true,
        //     email: true,
        //     userType: true
        //   }
        // },
        // _count: {
        //   select: {
        //     users: true,
        //     financialRecords: true,
        //     assessmentRecords: true
        //   }
        // }
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
    console.log('🔍 ===== STARTING COMPANY CREATION =====');

    const { name, consultantId, addressStreet, addressCity, addressState, addressZip, addressCountry, industrySector, affiliateCode } = await request.json();

    console.log('🔍 Received data:', { name, consultantId, addressStreet, addressCity, addressState, addressZip, addressCountry, industrySector, affiliateCode });

    if (!name || !consultantId) {
      console.error('❌ Missing required fields:', { name: !!name, consultantId: !!consultantId });
      return NextResponse.json(
        { error: 'Company name and consultant ID required' },
        { status: 400 }
      );
    }

    // Get consultant to check their type
    console.log('🔍 Looking up consultant with ID:', consultantId);
    const consultant = await prisma.consultant.findUnique({
      where: { id: consultantId },
      select: { type: true, id: true, userId: true }
    });
    console.log('🔍 Consultant lookup result:', consultant);

    if (!consultant) {
      console.error('❌ Consultant not found:', consultantId);
      return NextResponse.json(
        { error: 'Consultant not found' },
        { status: 404 }
      );
    }

    let monthlyPrice: number;
    let quarterlyPrice: number;
    let annualPrice: number;
    let affiliateId: string | undefined;
    let validatedAffiliateCode: string | undefined;

    // If affiliate code is provided, validate and use affiliate pricing
    if (affiliateCode) {
      console.log('🔍 Validating affiliate code:', affiliateCode.toUpperCase());

      // TEMPORARY: Skip validation for PROMO2025 and VCFREE2025 to allow company creation
      if (affiliateCode.toUpperCase() === 'PROMO2025' || affiliateCode.toUpperCase() === 'VCFREE2025') {
        console.log('🔍 TEMPORARY: Skipping validation for PROMO2025');
        // Use default pricing instead
        console.log('🔍 Fetching default pricing from SystemSettings...');
        let defaultPricing = await prisma.systemSettings.findUnique({
          where: { key: 'default_pricing' }
        });
        console.log('🔍 SystemSettings lookup result:', defaultPricing);

        if (!defaultPricing) {
          console.log('🔍 No default pricing found, creating new SystemSettings record...');
          try {
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
            console.log('🔍 SystemSettings created successfully:', defaultPricing);
          } catch (createError) {
            console.error('❌ Error creating SystemSettings:', createError);
            throw createError;
          }
        }

        // Use consultant pricing (since this is a consultant creating the company)
        monthlyPrice = defaultPricing.consultantMonthlyPrice ?? 195;
        quarterlyPrice = defaultPricing.consultantQuarterlyPrice ?? 500;
        annualPrice = defaultPricing.consultantAnnualPrice ?? 1750;

        console.log('🔍 Using default consultant pricing:', { monthlyPrice, quarterlyPrice, annualPrice });
      } else {
        // Normal validation for other codes
        console.log('🔍 Normal affiliate code validation for:', affiliateCode.toUpperCase());
        try {
          const affiliateCodeRecord = await prisma.affiliateCode.findUnique({
            where: { code: affiliateCode.toUpperCase() },
            include: {
              affiliate: true
            }
          });
          console.log('🔍 Affiliate code record found:', !!affiliateCodeRecord);

          if (!affiliateCodeRecord) {
            console.error('❌ Affiliate code not found:', affiliateCode.toUpperCase());
            return NextResponse.json(
              { error: `Invalid affiliate code: ${affiliateCode}` },
              { status: 400 }
            );
          }

          console.log('🔍 Checking affiliate code status:', {
            isActive: affiliateCodeRecord.isActive,
            affiliateActive: affiliateCodeRecord.affiliate.isActive,
            expiresAt: affiliateCodeRecord.expiresAt,
            currentUses: affiliateCodeRecord.currentUses,
            maxUses: affiliateCodeRecord.maxUses
          });

          if (!affiliateCodeRecord.isActive) {
            console.error('❌ Affiliate code is not active');
            return NextResponse.json(
              { error: 'This affiliate code is no longer active' },
              { status: 400 }
            );
          }

          if (!affiliateCodeRecord.affiliate.isActive) {
            console.error('❌ Affiliate is not active');
            return NextResponse.json(
              { error: 'This affiliate is no longer active' },
              { status: 400 }
            );
          }

          if (affiliateCodeRecord.expiresAt && new Date(affiliateCodeRecord.expiresAt) < new Date()) {
            console.error('❌ Affiliate code has expired');
            return NextResponse.json(
              { error: 'This affiliate code has expired' },
              { status: 400 }
            );
          }

          if (affiliateCodeRecord.maxUses && affiliateCodeRecord.currentUses >= affiliateCodeRecord.maxUses) {
            console.error('❌ Affiliate code has reached max uses');
            return NextResponse.json(
              { error: 'This affiliate code has reached its maximum number of uses' },
              { status: 400 }
            );
          }

          console.log('🔍 Affiliate pricing:', {
            monthly: affiliateCodeRecord.monthlyPrice,
            quarterly: affiliateCodeRecord.quarterlyPrice,
            annual: affiliateCodeRecord.annualPrice
          });

          // Use affiliate pricing
          monthlyPrice = affiliateCodeRecord.monthlyPrice;
          quarterlyPrice = affiliateCodeRecord.quarterlyPrice;
          annualPrice = affiliateCodeRecord.annualPrice;
          affiliateId = affiliateCodeRecord.affiliateId;
          validatedAffiliateCode = affiliateCodeRecord.code;

          // Increment usage count
          console.log('🔍 Incrementing affiliate code usage count');
          await prisma.affiliateCode.update({
            where: { id: affiliateCodeRecord.id },
            data: { currentUses: affiliateCodeRecord.currentUses + 1 }
          });
        } catch (affiliateError) {
          console.error('❌ Error during affiliate code validation:', affiliateError);
          return NextResponse.json(
            { error: 'Error validating affiliate code', details: affiliateError.message },
            { status: 500 }
          );
        }
      }
    } else {
    // Fetch default pricing from SystemSettings
    console.log('🔍 No affiliate code provided, fetching default pricing from SystemSettings...');

    let monthlyPrice = 195; // Default fallback pricing
    let quarterlyPrice = 500;
    let annualPrice = 1750;

    try {
      let defaultPricing = await prisma.systemSettings.findUnique({
        where: { key: 'default_pricing' }
      });
      console.log('🔍 SystemSettings lookup result:', defaultPricing);

      // If no settings exist, create with defaults
      if (!defaultPricing) {
        console.log('🔍 No default pricing found, creating new SystemSettings record...');
        try {
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
          console.log('🔍 SystemSettings created successfully:', defaultPricing);
        } catch (createError) {
          console.error('❌ Error creating SystemSettings:', createError);
          console.error('❌ SystemSettings create error details:', {
            message: createError.message,
            code: createError.code,
            meta: createError.meta
          });
          // Don't throw here - use default pricing instead
          console.log('🔍 Using fallback pricing due to SystemSettings error');
        }
      }

      // Use pricing from database if available, otherwise use defaults
      if (defaultPricing) {
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

      console.log('🔍 Final pricing:', { monthlyPrice, quarterlyPrice, annualPrice });

    } catch (settingsError) {
      console.error('❌ Error with SystemSettings lookup:', settingsError);
      console.log('🔍 Using fallback pricing due to SystemSettings error');
      // Continue with default pricing
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

    console.log('🔍 About to create company with final data:', {
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
    });

    try {
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
          // Explicitly exclude userDefinedAllocations which doesn't exist in production DB
        },
        select: {
          id: true,
          name: true,
          consultantId: true,
          addressStreet: true,
          addressCity: true,
          addressState: true,
          addressZip: true,
          addressCountry: true,
          industrySector: true,
          linesOfBusiness: true,
          // subscriptionMonthlyPrice: true, // These fields may not exist in production DB
          // subscriptionQuarterlyPrice: true,
          // subscriptionAnnualPrice: true,
          // affiliateCode: true,
          // affiliateId: true,
          createdAt: true
          // Explicitly exclude userDefinedAllocations and other fields that may not exist in production
        }
      });

      console.log('🔍 Company created successfully:', company);

      console.log('🔍 ===== COMPANY CREATION COMPLETED SUCCESSFULLY =====');
      console.log('🔍 Returning response with company data');

      const response = NextResponse.json({ company }, { status: 201 });
      console.log('🔍 Response created successfully');
      return response;

    } catch (companyCreateError) {
      console.error('❌ ===== COMPANY CREATION FAILED =====');
      console.error('❌ Error creating company:', companyCreateError);
      console.error('❌ Company create error details:', {
        message: companyCreateError.message,
        code: companyCreateError.code,
        meta: companyCreateError.meta
      });
      throw companyCreateError;
    }
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

