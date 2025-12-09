import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET all companies (optionally filtered by consultant or company ID)
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Companies API called');
    const { searchParams } = new URL(request.url);
    const consultantId = searchParams.get('consultantId');
    const companyId = searchParams.get('companyId');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

    let where: any = {};

    if (consultantId) {
      where.consultantId = consultantId;
    }

    if (companyId) {
      where.id = companyId;
    }

    const companies = await prisma.company.findMany({
      where,
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
        userDefinedAllocations: true,
        createdAt: true,
        // Pricing fields may not exist in production DB yet
        ...(process.env.NODE_ENV === 'production' ? {} : {
          subscriptionMonthlyPrice: true,
          subscriptionQuarterlyPrice: true,
          subscriptionAnnualPrice: true
        })
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    console.log(`Retrieved ${companies.length} companies`);
    if (companies.length > 0) {
      console.log('First company:', companies[0]);
    }

    return NextResponse.json({ companies });
  } catch (error: any) {
    console.error('Error fetching companies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch companies', details: error.message },
      { status: 500 }
    );
  }
}

// POST create new company
export async function POST(request: NextRequest) {
  console.log('🔍 ===== API COMPANIES POST REQUEST RECEIVED =====');
  try {
    console.log('🔍 ===== STARTING COMPANY CREATION =====');

    const { name, consultantId, addressStreet, addressCity, addressState, addressZip, addressCountry, industrySector, affiliateCode, linesOfBusiness } = await request.json();

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
    let useAffiliatePricing = false;

    // If affiliate code is provided, validate and use affiliate pricing
    if (affiliateCode) {
      console.log('🔍 Validating affiliate code:', affiliateCode.toUpperCase());

      try {
        // First, find the affiliate code without include to avoid relationship issues
        const affiliateCodeBasic = await prisma.affiliateCode.findUnique({
          where: { code: affiliateCode.toUpperCase() }
        });
        console.log('🔍 Basic affiliate code lookup completed:', !!affiliateCodeBasic);

      if (!affiliateCodeBasic) {
        console.error('❌ Affiliate code not found:', affiliateCode.toUpperCase());
        return NextResponse.json(
          { error: `Invalid affiliate code: ${affiliateCode}` },
          { status: 400 }
        );
      }

      console.log('🔍 Affiliate code found:', {
        id: affiliateCodeBasic.id,
        code: affiliateCodeBasic.code,
        affiliateId: affiliateCodeBasic.affiliateId,
        isActive: affiliateCodeBasic.isActive
      });

      // Now get the affiliate relationship separately
      console.log('🔍 Looking up affiliate relationship...');
      const affiliate = await prisma.affiliate.findUnique({
        where: { id: affiliateCodeBasic.affiliateId }
      });
      console.log('🔍 Affiliate lookup completed:', !!affiliate);

      if (!affiliate) {
        console.error('❌ Affiliate not found for affiliateId:', affiliateCodeBasic.affiliateId);
        return NextResponse.json(
          { error: `Invalid affiliate code: ${affiliateCode} (affiliate not found)` },
          { status: 400 }
        );
      }

      console.log('🔍 Affiliate details:', {
        id: affiliate.id,
        name: affiliate.name,
        isActive: affiliate.isActive
      });

      // Check if affiliate code is active
      if (!affiliateCodeBasic.isActive) {
        console.error('❌ Affiliate code is not active');
        return NextResponse.json(
          { error: 'This affiliate code is no longer active' },
          { status: 400 }
        );
      }

      // Check if affiliate is active
      if (!affiliate.isActive) {
        console.error('❌ Affiliate is not active');
        return NextResponse.json(
          { error: 'This affiliate is no longer active' },
          { status: 400 }
        );
      }

      // Check expiration
      if (affiliateCodeBasic.expiresAt && new Date(affiliateCodeBasic.expiresAt) < new Date()) {
        console.error('❌ Affiliate code has expired');
        return NextResponse.json(
          { error: 'This affiliate code has expired' },
          { status: 400 }
        );
      }

      // Check usage limits
      if (affiliateCodeBasic.maxUses && affiliateCodeBasic.currentUses >= affiliateCodeBasic.maxUses) {
        console.error('❌ Affiliate code has reached max uses');
        return NextResponse.json(
          { error: 'This affiliate code has reached its maximum number of uses' },
          { status: 400 }
        );
      }

      // Increment usage count
      console.log('🔍 Incrementing affiliate code usage count');
      await prisma.affiliateCode.update({
        where: { id: affiliateCodeBasic.id },
        data: { currentUses: affiliateCodeBasic.currentUses + 1 }
      });

      // Use affiliate pricing
      monthlyPrice = affiliateCodeBasic.monthlyPrice;
      quarterlyPrice = affiliateCodeBasic.quarterlyPrice;
      annualPrice = affiliateCodeBasic.annualPrice;
      affiliateId = affiliateCodeBasic.affiliateId;
      validatedAffiliateCode = affiliateCodeBasic.code;
      useAffiliatePricing = true;

      console.log('🔍 Using affiliate pricing:', { monthlyPrice, quarterlyPrice, annualPrice, affiliateId });
        } catch (affiliateError) {
          console.error('❌ Database error during affiliate code validation:', affiliateError);
          console.error('❌ Error details:', {
            message: affiliateError.message,
            code: affiliateError.code,
            name: affiliateError.name,
            stack: affiliateError.stack
          });
          return NextResponse.json(
            {
              error: 'Database error validating affiliate code',
              details: affiliateError.message,
              type: affiliateError.name,
              code: affiliateError.code,
              stack: affiliateError.stack,
              affiliateCode: affiliateCode,
              timestamp: new Date().toISOString()
            },
            { status: 500 }
          );
        }
    }

    // If affiliate code was provided but validation didn't set useAffiliatePricing, return error
    if (affiliateCode && !useAffiliatePricing) {
      console.error('❌ Affiliate code provided but validation failed silently');
      return NextResponse.json(
        { error: `Invalid affiliate code: ${affiliateCode}` },
        { status: 400 }
      );
    }

    // Fetch default pricing from SystemSettings (only if no affiliate code)
    if (!affiliateCode) {
      console.log('🔍 No affiliate code provided, fetching default pricing from SystemSettings...');

      let defaultPricing = null;

      try {
        defaultPricing = await prisma.systemSettings.findUnique({
          where: { key: 'default_pricing' }
        });
        console.log('🔍 SystemSettings lookup result:', defaultPricing);

        // If no settings exist, create with defaults
        if (!defaultPricing) {
          console.log('🔍 No default pricing found, creating new SystemSettings record...');
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
        }

        // Use appropriate default pricing based on user type
        if (defaultPricing) {
          // Individual businesses get business pricing, consultants get consultant pricing
          const isBusinessUser = consultant?.type === 'business';
          monthlyPrice = isBusinessUser
            ? (defaultPricing.businessMonthlyPrice ?? 195)
            : (defaultPricing.consultantMonthlyPrice ?? 195);
          quarterlyPrice = isBusinessUser
            ? (defaultPricing.businessQuarterlyPrice ?? 500)
            : (defaultPricing.consultantQuarterlyPrice ?? 500);
          annualPrice = isBusinessUser
            ? (defaultPricing.businessAnnualPrice ?? 1750)
            : (defaultPricing.consultantAnnualPrice ?? 1750);
        } else {
          // Fallback pricing
          monthlyPrice = 195;
          quarterlyPrice = 500;
          annualPrice = 1750;
        }

        console.log('🔍 Final pricing:', { monthlyPrice, quarterlyPrice, annualPrice });

      } catch (settingsError) {
        console.error('❌ Error with SystemSettings lookup:', settingsError);
        console.log('🔍 Using fallback pricing due to SystemSettings error');
        // Use fallback pricing
        monthlyPrice = 195;
        quarterlyPrice = 500;
        annualPrice = 1750;
      }
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
      pricingUsed: { monthlyPrice, quarterlyPrice, annualPrice }, // Pricing determined but not stored in Company table
      affiliateCode: validatedAffiliateCode,
      affiliateId: affiliateId
    });

    try {
      const company = await prisma.company.create({
        data: {
          name,
          consultant: {
            connect: { id: consultantId }
          },
          addressStreet,
          addressCity,
          addressState,
          addressZip,
          addressCountry,
          industrySector,
          // STORE FINAL PRICING PERMANENTLY - AFFILIATE CODES USED ONLY FOR LOOKUP
          // Note: Pricing fields may not exist in production DB yet
          ...(process.env.NODE_ENV === 'production' ? {} : {
            subscriptionMonthlyPrice: monthlyPrice,
            subscriptionQuarterlyPrice: quarterlyPrice,
            subscriptionAnnualPrice: annualPrice,
            subscriptionStatus: (monthlyPrice === 0 && quarterlyPrice === 0 && annualPrice === 0) ? "free" : "active"
          }),
          // DO NOT store affiliate code or affiliate ID with company
          // Affiliate codes are used ONLY to determine pricing, then discarded
        },
        select: {
          id: true,
          name: true,
          consultant: {
            select: { id: true }
          },
          addressStreet: true,
          addressCity: true,
          addressState: true,
          addressZip: true,
          addressCountry: true,
          industrySector: true,
          linesOfBusiness: true,
          userDefinedAllocations: true,
          subscriptionMonthlyPrice: true,
          subscriptionQuarterlyPrice: true,
          subscriptionAnnualPrice: true,
          createdAt: true
        }
      });

      console.log('🔍 Company created successfully:', company);

      // Transform the response to include consultantId (pricing is now stored in DB)
      const transformedCompany = {
        ...company,
        consultantId: company.consultant?.id
        // Pricing is now stored permanently in database fields
      };

      console.log('🔍 ===== COMPANY CREATION COMPLETED SUCCESSFULLY =====');
      console.log('🔍 Returning response with company data');

      const response = NextResponse.json({ company: transformedCompany }, { status: 201 });
      console.log('🔍 Response created successfully');
      return response;

    } catch (companyCreateError) {
      console.error('❌ ===== COMPANY CREATION FAILED =====');
      console.error('❌ Error creating company:', companyCreateError);
      console.error('❌ Company create error details:', {
        message: companyCreateError.message,
        code: companyCreateError.code,
        meta: companyCreateError.meta,
        stack: companyCreateError.stack
      });
      // Return detailed error directly instead of throwing
      return NextResponse.json(
        {
          error: 'Company creation failed',
          details: companyCreateError.message,
          type: companyCreateError.name,
          code: companyCreateError.code,
          meta: companyCreateError.meta,
          affiliateCode: affiliateCode,
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('❌ ===== MAIN CATCH BLOCK =====');
    console.error('❌ Error type:', typeof error);
    console.error('❌ Error name:', error?.name);
    console.error('❌ Error message:', error?.message);
    console.error('❌ Error stack:', error?.stack);
    console.error('❌ Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

    // Return detailed error for debugging
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      type: error?.name || 'Unknown',
      code: error?.code || 'Unknown',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// PATCH update company LOB settings
export async function PATCH(request: NextRequest) {
  try {
    const { companyId, linesOfBusiness, headcountAllocations, userDefinedAllocations } = await request.json();

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: any = {};

    if (linesOfBusiness !== undefined) {
      updateData.linesOfBusiness = linesOfBusiness;
      console.log('📝 Updating linesOfBusiness:', linesOfBusiness);
    }

    if (headcountAllocations !== undefined && process.env.NODE_ENV !== 'development') {
      updateData.headcountAllocations = headcountAllocations;
      console.log('📝 Updating headcountAllocations:', headcountAllocations);
    } else if (headcountAllocations !== undefined && process.env.NODE_ENV === 'development') {
      console.log('⚠️ Skipping headcountAllocations update in dev - field does not exist');
    }

    console.log('🔄 Final update data:', updateData);

    // Build select object dynamically based on environment
    const selectFields: any = {
      id: true,
      name: true,
      linesOfBusiness: true
    };

    // Only select headcountAllocations if it exists (not in dev)
    if (process.env.NODE_ENV !== 'development') {
      selectFields.headcountAllocations = true;
      selectFields.userDefinedAllocations = true;
    }

    const company = await prisma.company.update({
      where: { id: companyId },
      data: updateData,
      select: selectFields
    });

    return NextResponse.json({ company }, { status: 200 });
  } catch (error: any) {
    console.error('❌ Error updating company:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      name: error.name
    });
    return NextResponse.json(
      { error: 'Failed to update company', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE company
export async function DELETE(request: NextRequest) {
  return NextResponse.json({ error: 'DELETE function temporarily disabled' }, { status: 500 });
}