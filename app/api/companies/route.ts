import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, validateCompanyAccess, validateConsultantAccess, getCompanyAccessFilter } from "@/lib/tenant-security";
import { auditCompanyOperation, auditForbiddenAccess } from "@/lib/audit-logger";

// GET all companies (optionally filtered by consultant or company ID)
export async function GET(request: NextRequest) {
  try {
    console.log("🔍 Companies API called");
    
    // SECURITY: Require authentication
    const context = await requireAuth();
    
    const { searchParams } = new URL(request.url);
    const consultantId = searchParams.get("consultantId");
    const companyId = searchParams.get("companyId");
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!)
      : undefined;

    // SECURITY: Build where clause based on user access
    let where: any = await getCompanyAccessFilter();

    // SECURITY: Validate consultant access if consultantId filter is requested
    if (consultantId) {
      const hasAccess = await validateConsultantAccess(consultantId);
      if (!hasAccess) {
        await auditForbiddenAccess('Company', consultantId, 'READ_BY_CONSULTANT');
        return NextResponse.json(
          { error: 'Forbidden: Access to this consultant denied' },
          { status: 403 }
        );
      }
      where.consultantId = consultantId;
    }

    // SECURITY: Validate company access if specific companyId is requested
    if (companyId) {
      const hasAccess = await validateCompanyAccess(companyId);
      if (!hasAccess) {
        await auditForbiddenAccess('Company', companyId, 'READ');
        return NextResponse.json(
          { error: 'Forbidden: Access to this company denied' },
          { status: 403 }
        );
      }
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
        // Always include pricing fields - they're needed for payment logic
        subscriptionMonthlyPrice: true,
        subscriptionQuarterlyPrice: true,
        subscriptionAnnualPrice: true,
        // Skip affiliateCode in production (not needed)
        ...(process.env.NODE_ENV === "production"
          ? {}
          : {
              affiliateCode: true,
            }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    console.log(`Retrieved ${companies.length} companies for user ${context.email}`);

    // AUDIT: Log company access (only log if viewing specific company)
    if (companyId && companies.length > 0) {
      await auditCompanyOperation('COMPANY_VIEWED', companyId);
    }

    return NextResponse.json({ companies });
  } catch (error: any) {
    console.error("Error fetching companies:", error);
    return NextResponse.json(
      { error: "Failed to fetch companies", details: error.message },
      { status: 500 },
    );
  }
}

// POST create new company
export async function POST(request: NextRequest) {
  console.log("🔍 ===== API COMPANIES POST REQUEST RECEIVED =====");
  console.log("🔍 NODE_ENV:", process.env.NODE_ENV);
  try {
    console.log("🔍 ===== STARTING COMPANY CREATION =====");

    // SECURITY: Require authentication
    let context;
    try {
      context = await requireAuth();
      console.log("🔍 Authenticated user:", context.email, "Role:", context.role, "ConsultantId:", context.consultantId);
    } catch (authError) {
      console.error("❌ Authentication failed:", authError);
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    }

    let requestBody;
    try {
      requestBody = await request.json();
      console.log("🔍 Request body parsed successfully");
    } catch (parseError) {
      console.error("❌ Failed to parse request JSON:", parseError);
      return NextResponse.json(
        {
          error: "Invalid JSON in request body",
          debug: { nodeEnv: process.env.NODE_ENV },
        },
        { status: 400 },
      );
    }

    const {
      name,
      consultantId,
      addressStreet,
      addressCity,
      addressState,
      addressZip,
      addressCountry,
      industrySector,
      affiliateCode,
      linesOfBusiness,
    } = requestBody;

    console.log("🔍 Received data:", {
      name,
      consultantId,
      addressStreet,
      addressCity,
      addressState,
      addressZip,
      addressCountry,
      industrySector,
      affiliateCode,
    });

    if (!name || !consultantId) {
      console.error("❌ Missing required fields:", {
        name: !!name,
        consultantId: !!consultantId,
      });
      return NextResponse.json(
        { error: "Company name and consultant ID required" },
        { status: 400 },
      );
    }

    // Actually save companies to database
    console.log("🔍 Creating company in database");
    console.log("🔍 Environment:", process.env.NODE_ENV);

    // STAGING/DEV: Full pricing logic
    // Get consultant to check their type
    console.log("🔍 Looking up consultant with ID:", consultantId);
    const consultant = await prisma.consultant.findUnique({
      where: { id: consultantId },
      select: { type: true, id: true, userId: true },
    });
    console.log("🔍 Consultant lookup result:", consultant);

    if (!consultant) {
      console.error("❌ Consultant not found:", consultantId);
      return NextResponse.json(
        { error: "Consultant not found" },
        { status: 404 },
      );
    }

    // SECURITY: Validate consultant access - ensure user can create companies for this consultant
    console.log("🔍 Validating consultant access:");
    console.log("   User role:", context.role);
    console.log("   User consultantId:", context.consultantId);
    console.log("   Target consultantId:", consultantId);
    
    // Site admins can create companies for any consultant
    if (context.role === 'SITEADMIN') {
      console.log("✅ Site admin access - validation passed");
    } 
    // Consultants can only create companies for themselves
    else if (context.role === 'CONSULTANT') {
      if (context.consultantId !== consultantId) {
        console.error("❌ Consultant trying to create company for different consultant");
        console.error("   User consultantId:", context.consultantId);
        console.error("   Requested consultantId:", consultantId);
        await auditForbiddenAccess('Company', consultantId, 'CREATE_FOR_CONSULTANT');
        return NextResponse.json(
          { 
            error: 'Forbidden: You can only create companies for yourself',
            debug: {
              userRole: context.role,
              userConsultantId: context.consultantId,
              targetConsultantId: consultantId
            }
          },
          { status: 403 }
        );
      }
      console.log("✅ Consultant access validated - creating company for self");
    } 
    // Other roles cannot create companies
    else {
      console.error("❌ User role cannot create companies:", context.role);
      await auditForbiddenAccess('Company', consultantId, 'CREATE_FOR_CONSULTANT');
      return NextResponse.json(
        { error: 'Forbidden: Only consultants and site admins can create companies' },
        { status: 403 }
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
      console.log("🔍 Validating affiliate code:", affiliateCode.toUpperCase());

      try {
        // First, find the affiliate code without include to avoid relationship issues
        const affiliateCodeBasic = await prisma.affiliateCode.findUnique({
          where: { code: affiliateCode.toUpperCase() },
        });
        console.log(
          "🔍 Basic affiliate code lookup completed:",
          !!affiliateCodeBasic,
        );

        if (!affiliateCodeBasic) {
          console.error(
            "❌ Affiliate code not found:",
            affiliateCode.toUpperCase(),
          );
          return NextResponse.json(
            { error: `Invalid affiliate code: ${affiliateCode}` },
            { status: 400 },
          );
        }

        console.log("🔍 Affiliate code found:", {
          id: affiliateCodeBasic.id,
          code: affiliateCodeBasic.code,
          affiliateId: affiliateCodeBasic.affiliateId,
          isActive: affiliateCodeBasic.isActive,
        });

        // Now get the affiliate relationship separately
        console.log("🔍 Looking up affiliate relationship...");
        const affiliate = await prisma.affiliate.findUnique({
          where: { id: affiliateCodeBasic.affiliateId },
        });
        console.log("🔍 Affiliate lookup completed:", !!affiliate);

        if (!affiliate) {
          console.error(
            "❌ Affiliate not found for affiliateId:",
            affiliateCodeBasic.affiliateId,
          );
          return NextResponse.json(
            {
              error: `Invalid affiliate code: ${affiliateCode} (affiliate not found)`,
            },
            { status: 400 },
          );
        }

        console.log("🔍 Affiliate details:", {
          id: affiliate.id,
          name: affiliate.name,
          isActive: affiliate.isActive,
        });

        // Check if affiliate code is active
        if (!affiliateCodeBasic.isActive) {
          console.error("❌ Affiliate code is not active");
          return NextResponse.json(
            { error: "This affiliate code is no longer active" },
            { status: 400 },
          );
        }

        // Check if affiliate is active
        if (!affiliate.isActive) {
          console.error("❌ Affiliate is not active");
          return NextResponse.json(
            { error: "This affiliate is no longer active" },
            { status: 400 },
          );
        }

        // Check expiration
        if (
          affiliateCodeBasic.expiresAt &&
          new Date(affiliateCodeBasic.expiresAt) < new Date()
        ) {
          console.error("❌ Affiliate code has expired");
          return NextResponse.json(
            { error: "This affiliate code has expired" },
            { status: 400 },
          );
        }

        // Check usage limits
        if (
          affiliateCodeBasic.maxUses &&
          affiliateCodeBasic.currentUses >= affiliateCodeBasic.maxUses
        ) {
          console.error("❌ Affiliate code has reached max uses");
          return NextResponse.json(
            {
              error:
                "This affiliate code has reached its maximum number of uses",
            },
            { status: 400 },
          );
        }

        // Increment usage count
        console.log("🔍 Incrementing affiliate code usage count");
        await prisma.affiliateCode.update({
          where: { id: affiliateCodeBasic.id },
          data: { currentUses: affiliateCodeBasic.currentUses + 1 },
        });

        // Use affiliate pricing - ensure $0 values are stored as 0, not null
        monthlyPrice = affiliateCodeBasic.monthlyPrice ?? 0;
        quarterlyPrice = affiliateCodeBasic.quarterlyPrice ?? 0;
        annualPrice = affiliateCodeBasic.annualPrice ?? 0;
        affiliateId = affiliateCodeBasic.affiliateId;
        validatedAffiliateCode = affiliateCodeBasic.code;
        useAffiliatePricing = true;

        console.log("🔍 Using affiliate pricing:", {
          monthlyPrice,
          quarterlyPrice,
          annualPrice,
          affiliateId,
          affiliateCode: validatedAffiliateCode,
          isFree: monthlyPrice === 0 && quarterlyPrice === 0 && annualPrice === 0
        });
      } catch (affiliateError) {
        console.error(
          "❌ Database error during affiliate code validation:",
          affiliateError,
        );
        console.error("❌ Error details:", {
          message: affiliateError.message,
          code: affiliateError.code,
          name: affiliateError.name,
          stack: affiliateError.stack,
        });
        return NextResponse.json(
          {
            error: "Database error validating affiliate code",
            details: affiliateError.message,
            type: affiliateError.name,
            code: affiliateError.code,
            stack: affiliateError.stack,
            affiliateCode: affiliateCode,
            timestamp: new Date().toISOString(),
          },
          { status: 500 },
        );
      }
    }

    // If affiliate code was provided but validation didn't set useAffiliatePricing, return error
    if (affiliateCode && !useAffiliatePricing) {
      console.error(
        "❌ Affiliate code provided but validation failed silently",
        { affiliateCode, monthlyPrice, quarterlyPrice, annualPrice }
      );
      return NextResponse.json(
        { error: `Invalid affiliate code: ${affiliateCode}` },
        { status: 400 },
      );
    }

    // Fetch default pricing from SystemSettings (only if no affiliate code)
    if (!affiliateCode) {
      console.log(
        "🔍 No affiliate code provided, fetching default pricing from SystemSettings...",
      );

      let defaultPricing = null;

      try {
        defaultPricing = await prisma.systemSettings.findUnique({
          where: { key: "default_pricing" },
        });
        console.log("🔍 SystemSettings lookup result:", defaultPricing);

        // If no settings exist, create with defaults
        if (!defaultPricing) {
          console.log(
            "🔍 No default pricing found, creating new SystemSettings record...",
          );
          defaultPricing = await prisma.systemSettings.create({
            data: {
              key: "default_pricing",
              businessMonthlyPrice: 195,
              businessQuarterlyPrice: 500,
              businessAnnualPrice: 1750,
              consultantMonthlyPrice: 195,
              consultantQuarterlyPrice: 500,
              consultantAnnualPrice: 1750,
            },
          });
          console.log(
            "🔍 SystemSettings created successfully:",
            defaultPricing,
          );
        }

        // Use appropriate default pricing based on user type
        if (defaultPricing) {
          // Individual businesses get business pricing, consultants get consultant pricing
          const isBusinessUser = consultant?.type === "business";
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

        console.log("🔍 Final pricing:", {
          monthlyPrice,
          quarterlyPrice,
          annualPrice,
        });
      } catch (settingsError) {
        console.error("❌ Error with SystemSettings lookup:", settingsError);
        console.log("🔍 Using fallback pricing due to SystemSettings error");
        // Use fallback pricing
        monthlyPrice = 195;
        quarterlyPrice = 500;
        annualPrice = 1750;
      }
    }

    console.log("🔍 About to create company with final data:", {
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
      affiliateId: affiliateId,
    });

    try {
      const company = await prisma.company.create({
        data: {
          name,
          consultant: {
            connect: { id: consultantId },
          },
          addressStreet,
          addressCity,
          addressState,
          addressZip,
          addressCountry,
          industrySector,
          // STORE FINAL PRICING PERMANENTLY - AFFILIATE CODES WORK IN BOTH ENVIRONMENTS
          // Always store pricing fields regardless of environment for affiliate codes
          // Ensure $0 values are stored as 0, not null
          subscriptionMonthlyPrice: monthlyPrice ?? 0,
          subscriptionQuarterlyPrice: quarterlyPrice ?? 0,
          subscriptionAnnualPrice: annualPrice ?? 0,
          subscriptionStatus:
            monthlyPrice === 0 &&
            quarterlyPrice === 0 &&
            annualPrice === 0
              ? "free"
              : "active",
          // Store pricing in userDefinedAllocations (only for affiliate codes, not for default pricing)
          // Only store userDefinedAllocations if affiliate code was used
          userDefinedAllocations: useAffiliatePricing ? {
            subscriptionPricing: {
              monthly: monthlyPrice ?? 0,
              quarterly: quarterlyPrice ?? 0,
              annual: annualPrice ?? 0,
              isFree:
                (monthlyPrice ?? 0) === 0 &&
                (quarterlyPrice ?? 0) === 0 &&
                (annualPrice ?? 0) === 0,
              source: "affiliate_code",
              createdAt: new Date().toISOString(),
            },
          } : undefined,
          // DO NOT store affiliate code or affiliate ID with company
          // Affiliate codes are used ONLY to determine pricing, then discarded
        },
        select: {
          id: true,
          name: true,
          consultant: {
            select: { id: true },
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
          createdAt: true,
        },
      });

      console.log("🔍 Company created successfully:", company);

      // AUDIT: Log company creation
      await auditCompanyOperation('COMPANY_CREATED', company.id);

      // Transform the response to include consultantId (pricing is now stored in DB)
      const transformedCompany = {
        ...company,
        consultantId: company.consultant?.id,
        // Pricing is now stored permanently in database fields
      };

      console.log("🔍 ===== COMPANY CREATION COMPLETED SUCCESSFULLY =====");
      console.log("🔍 Returning response with company data");

      const response = NextResponse.json(
        { company: transformedCompany },
        { status: 201 },
      );
      console.log("🔍 Response created successfully");
      return response;
    } catch (companyCreateError) {
      console.error("❌ ===== COMPANY CREATION FAILED =====");
      console.error("❌ Error creating company:", companyCreateError);
      console.error("❌ Company create error details:", {
        message: companyCreateError.message,
        code: companyCreateError.code,
        meta: companyCreateError.meta,
        stack: companyCreateError.stack,
      });
      // Return detailed error directly instead of throwing
      return NextResponse.json(
        {
          error: "Company creation failed",
          details: companyCreateError.message,
          type: companyCreateError.name,
          code: companyCreateError.code,
          meta: companyCreateError.meta,
          affiliateCode: affiliateCode,
          timestamp: new Date().toISOString(),
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("❌ ===== MAIN CATCH BLOCK =====");
    console.error("❌ Error type:", typeof error);
    console.error("❌ Error name:", error?.name);
    console.error("❌ Error message:", error?.message);
    console.error("❌ Error stack:", error?.stack);
    console.error(
      "❌ Full error:",
      JSON.stringify(error, Object.getOwnPropertyNames(error)),
    );

    // Return detailed error for debugging
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
        type: error?.name || "Unknown",
        code: error?.code || "Unknown",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

// PATCH update company details or LOB settings
export async function PATCH(request: NextRequest) {
  try {
    console.log("🔄 ===== PATCH REQUEST RECEIVED =====");
    
    // SECURITY: Require authentication
    const context = await requireAuth();
    console.log("🔄 Authenticated user:", context.email, "Role:", context.role);
    
    const body = await request.json();
    console.log("🔄 Request body:", body);

    // Handle both formats: { id, ...fields } (from frontend) and { companyId, ...lobFields } (legacy)
    const { id, companyId, ...updateFields } = body;
    const targetCompanyId = id || companyId;

    if (!targetCompanyId) {
      console.error("❌ No company ID provided (neither id nor companyId)");
      return NextResponse.json(
        { error: "Company ID required" },
        { status: 400 },
      );
    }

    // SECURITY: Validate company access
    const hasAccess = await validateCompanyAccess(targetCompanyId);
    if (!hasAccess) {
      console.error("❌ User does not have access to company:", targetCompanyId);
      await auditForbiddenAccess('Company', targetCompanyId, 'UPDATE');
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to update this company' },
        { status: 403 }
      );
    }

    console.log("🔄 Target company ID:", targetCompanyId);
    console.log("🔄 Update fields:", updateFields);

    // Prepare update data - allow all valid company fields
    const updateData: any = {};

    // Address fields
    if (updateFields.addressStreet !== undefined)
      updateData.addressStreet = updateFields.addressStreet;
    if (updateFields.addressCity !== undefined)
      updateData.addressCity = updateFields.addressCity;
    if (updateFields.addressState !== undefined)
      updateData.addressState = updateFields.addressState;
    if (updateFields.addressZip !== undefined)
      updateData.addressZip = updateFields.addressZip;
    if (updateFields.addressCountry !== undefined)
      updateData.addressCountry = updateFields.addressCountry;

    // Industry sector
    if (updateFields.industrySector !== undefined)
      updateData.industrySector = updateFields.industrySector;

    // Name
    if (updateFields.name !== undefined) updateData.name = updateFields.name;

    // Lines of Business and allocations (legacy LOB endpoint usage)
    if (updateFields.linesOfBusiness !== undefined)
      updateData.linesOfBusiness = updateFields.linesOfBusiness;
    if (updateFields.headcountAllocations !== undefined)
      updateData.headcountAllocations = updateFields.headcountAllocations;
    if (updateFields.userDefinedAllocations !== undefined)
      updateData.userDefinedAllocations = updateFields.userDefinedAllocations;

    console.log("🔄 Final update data:", updateData);

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
      createdAt: true,
    };

    // Select headcountAllocations if it exists (now that database column is added)
    if (process.env.NODE_ENV !== "development") {
      selectFields.headcountAllocations = true;
    }

    console.log("🔄 Select fields:", selectFields);

    const company = await prisma.company.update({
      where: { id: targetCompanyId },
      data: updateData,
      select: selectFields,
    });

    console.log("✅ Company updated successfully:", company);
    
    // AUDIT: Log company update
    await auditCompanyOperation('COMPANY_UPDATED', targetCompanyId);
    
    return NextResponse.json({ company }, { status: 200 });
  } catch (error: any) {
    console.error("❌ ===== PATCH ERROR =====");
    console.error("❌ Error updating company:", error);
    console.error("❌ Error details:", {
      message: error.message,
      code: error.code,
      meta: error.meta,
      name: error.name,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: "Failed to update company", details: error.message },
      { status: 500 },
    );
  }
}

// DELETE company
export async function DELETE(request: NextRequest) {
  try {
    // SECURITY: Require authentication
    const context = await requireAuth();
    console.log("🗑️ Authenticated user:", context.email, "Role:", context.role);
    
    return NextResponse.json(
      { error: "DELETE function temporarily disabled" },
      { status: 500 },
    );
  } catch (error: any) {
    console.error("❌ DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete company", details: error.message },
      { status: 500 }
    );
  }
}
