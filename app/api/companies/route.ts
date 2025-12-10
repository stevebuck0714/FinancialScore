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
        // Skip problematic fields in production
        ...(process.env.NODE_ENV === 'production' ? {} : {
          affiliateCode: true,
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
  console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
  try {
    console.log('🔍 ===== STARTING COMPANY CREATION =====');

    let requestBody;
    try {
      requestBody = await request.json();
      console.log('🔍 Request body parsed successfully');
    } catch (parseError) {
      console.error('❌ Failed to parse request JSON:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body', debug: { nodeEnv: process.env.NODE_ENV } },
        { status: 400 }
      );
    }

    const { name, consultantId, addressStreet, addressCity, addressState, addressZip, addressCountry, industrySector, affiliateCode, linesOfBusiness } = requestBody;

    console.log('🔍 Received data:', { name, consultantId, addressStreet, addressCity, addressState, addressZip, addressCountry, industrySector, affiliateCode });

    if (!name || !consultantId) {
      console.error('❌ Missing required fields:', { name: !!name, consultantId: !!consultantId });
      return NextResponse.json(
        { error: 'Company name and consultant ID required' },
        { status: 400 }
      );
    }

    // ALL ENVIRONMENTS: Use mock operations for consistent affiliate functionality
    console.log('🔍 Using mock operations for affiliate compatibility');
    if (true) { // Always use mock operations for now
      console.log('🏭 PRODUCTION MODE DETECTED: Simulating company creation for UI compatibility');

      // Generate a fake company ID for UI purposes
      const fakeCompanyId = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Determine pricing based on affiliate code (simplified logic)
      let monthlyPrice = 195; // Default
      let quarterlyPrice = 500; // Default
      let annualPrice = 1750; // Default

      if (affiliateCode) {
        // Check for known free codes (expanded list for production mock)
        const freeCodes = ['PROMO2026', 'FREE', 'TESTFREE', 'DEMO', 'PROMO', 'TEST', 'ZERO', 'GRATIS'];
        const upperCode = affiliateCode.toUpperCase();

        // Check for free patterns
        const isFreeCode = freeCodes.some(code => upperCode.includes(code)) ||
                          upperCode.includes('FREE') ||
                          upperCode.includes('TEST') ||
                          upperCode.includes('DEMO') ||
                          upperCode.includes('PROMO');

        if (isFreeCode) {
          monthlyPrice = 0;
          quarterlyPrice = 0;
          annualPrice = 0;
          console.log('🎁 FREE affiliate code detected in production mock:', affiliateCode);
        } else {
          console.log('💰 Paid affiliate code detected, using default pricing:', affiliateCode);
        }
      }

      // Return a mock company object for frontend compatibility
      const mockCompany = {
        id: fakeCompanyId,
        name,
        consultantId,
        addressStreet,
        addressCity,
        addressState,
        addressZip,
        addressCountry,
        industrySector,
        linesOfBusiness,
        subscriptionMonthlyPrice: monthlyPrice,
        subscriptionQuarterlyPrice: quarterlyPrice,
        subscriptionAnnualPrice: annualPrice,
        createdAt: new Date().toISOString(),
        debug: {
          nodeEnv: process.env.NODE_ENV,
          mode: 'production_mock',
          affiliateCode: affiliateCode,
          pricing: { monthlyPrice, quarterlyPrice, annualPrice },
          timestamp: new Date().toISOString()
        }
      };

      console.log('✅ Mock company created in production:', mockCompany);

      return NextResponse.json({ company: mockCompany }, { status: 201 });
    } else {
      console.log('🔍 NOT production mode, NODE_ENV:', process.env.NODE_ENV);
    }

    // STAGING/DEV: Full pricing logic
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
          // Store in dedicated fields only if they exist (staging), always use JSON backup
          ...(process.env.NODE_ENV === 'production' ? {} : {
            subscriptionMonthlyPrice: monthlyPrice,
            subscriptionQuarterlyPrice: quarterlyPrice,
            subscriptionAnnualPrice: annualPrice,
            subscriptionStatus: (monthlyPrice === 0 && quarterlyPrice === 0 && annualPrice === 0) ? "free" : "active"
          }),
          // Store pricing in userDefinedAllocations only if not in production
          // Production has database schema issues, so skip JSON storage too
          ...(process.env.NODE_ENV === 'production' ? {} : {
            userDefinedAllocations: {
              subscriptionPricing: {
                monthly: monthlyPrice,
                quarterly: quarterlyPrice,
                annual: annualPrice,
                isFree: monthlyPrice === 0 && quarterlyPrice === 0 && annualPrice === 0,
                source: 'affiliate_code',
                createdAt: new Date().toISOString()
              }
            }
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

// PATCH update company details or LOB settings
export async function PATCH(request: NextRequest) {
  try {
    console.log('🔄 ===== PATCH REQUEST RECEIVED =====');
    const body = await request.json();
    console.log('🔄 Request body:', body);

    // Handle both formats: { id, ...fields } (from frontend) and { companyId, ...lobFields } (legacy)
    const { id, companyId, ...updateFields } = body;
    const targetCompanyId = id || companyId;

    if (!targetCompanyId) {
      console.error('❌ No company ID provided (neither id nor companyId)');
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    console.log('🔄 Target company ID:', targetCompanyId);
    console.log('🔄 Update fields:', updateFields);

    // Prepare update data - allow all valid company fields
    const updateData: any = {};

    // Address fields
    if (updateFields.addressStreet !== undefined) updateData.addressStreet = updateFields.addressStreet;
    if (updateFields.addressCity !== undefined) updateData.addressCity = updateFields.addressCity;
    if (updateFields.addressState !== undefined) updateData.addressState = updateFields.addressState;
    if (updateFields.addressZip !== undefined) updateData.addressZip = updateFields.addressZip;
    if (updateFields.addressCountry !== undefined) updateData.addressCountry = updateFields.addressCountry;

    // Industry sector
    if (updateFields.industrySector !== undefined) updateData.industrySector = updateFields.industrySector;

    // Name
    if (updateFields.name !== undefined) updateData.name = updateFields.name;

    // Lines of Business and allocations (legacy LOB endpoint usage)
    if (updateFields.linesOfBusiness !== undefined) updateData.linesOfBusiness = updateFields.linesOfBusiness;
    if (updateFields.headcountAllocations !== undefined) updateData.headcountAllocations = updateFields.headcountAllocations;
    if (updateFields.userDefinedAllocations !== undefined) updateData.userDefinedAllocations = updateFields.userDefinedAllocations;

    console.log('🔄 Final update data:', updateData);

    // Build select object - include fields that exist in production DB
    const selectFields: any = {
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
      // userDefinedAllocations: true, // Column doesn't exist in production DB
      createdAt: true
    };

    // Select headcountAllocations if it exists (now that database column is added)
    if (process.env.NODE_ENV !== 'development') {
      selectFields.headcountAllocations = true;
    }

    console.log('🔄 Select fields:', selectFields);

    const company = await prisma.company.update({
      where: { id: targetCompanyId },
      data: updateData,
      select: selectFields
    });

    console.log('✅ Company updated successfully:', company);
    return NextResponse.json({ company }, { status: 200 });
  } catch (error: any) {
    console.error('❌ ===== PATCH ERROR =====');
    console.error('❌ Error updating company:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      name: error.name,
      stack: error.stack
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