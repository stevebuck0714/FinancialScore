import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, validateCompanyAccess, validateConsultantAccess, getCompanyAccessFilter } from "@/lib/tenant-security";
import { auditCompanyOperation, auditForbiddenAccess } from "@/lib/audit-logger";
import { sendAccountingSystemSelectionNotification } from "@/lib/email";
import { listAccessibleCompaniesForUser } from "@/lib/user-company-access";
import { DATAROOM_DEFAULT_FOLDERS } from "@/lib/dataroom/constants";
import { privateCacheHeaders } from "@/lib/http-cache";
import { resolveCompanyIndustrySectorCategory } from "@/lib/industry-sector-resolver";
import { buildCompanyAddOnAllocations } from "@/lib/affiliate-add-ons";

async function hasCompanyColumn(columnName: string): Promise<boolean> {
  // Guard against generated Prisma client drift:
  // if the local Prisma client doesn't know a field, selecting it will throw
  // even if the DB column exists.
  const runtimeCompanyModel = ((prisma as any)?._runtimeDataModel?.models?.Company || null) as
    | { fields?: Array<{ name?: string }> }
    | null;
  if (runtimeCompanyModel?.fields?.length) {
    const supportsField = runtimeCompanyModel.fields.some((field) => field?.name === columnName);
    if (!supportsField) {
      return false;
    }
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'Company'
          AND column_name = ${columnName}
      ) as "exists"
    `;
    return rows[0]?.exists === true;
  } catch (error) {
    console.warn(`Could not verify Company.${columnName} column`, error);
    return false;
  }
}

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
    let where: any = {
      ...(await getCompanyAccessFilter()),
      // Hide legacy soft-deleted companies from all listings.
      NOT: {
        name: {
          contains: ' (DELETED)',
        },
      },
    };

    // SECURITY: Validate consultant access if consultantId filter is requested.
    // IMPORTANT: For consultant users, listing should include all companies they can access
    // (owned + explicitly granted via UserCompanyAccess), not just owned companies.
    // For site admins filtering by consultantId (preview mode), include both:
    // - companies owned by that consultant (company.consultantId), and
    // - companies accessible to the consultant's primary user via UserCompanyAccess.
    if (consultantId) {
      const hasAccess = await validateConsultantAccess(consultantId);
      if (!hasAccess) {
        await auditForbiddenAccess('Company', consultantId, 'READ_BY_CONSULTANT');
        return NextResponse.json(
          { error: 'Forbidden: Access to this consultant denied' },
          { status: 403 }
        );
      }
      if (context.role === 'SITEADMIN') {
        let consultantUserId: string | null = null;
        try {
          const consultantRecord = await (prisma as any).consultant?.findUnique?.({
            where: { id: consultantId },
            select: {
              userId: true,
              user: { select: { id: true } },
            },
          });
          consultantUserId = consultantRecord?.userId || consultantRecord?.user?.id || null;
        } catch (error) {
          console.warn('Could not resolve consultant primary user for access-based company filter', error);
        }

        let accessibleCompanyIds: string[] = [];
        if (consultantUserId) {
          try {
            const accessible = await listAccessibleCompaniesForUser(consultantUserId);
            accessibleCompanyIds = accessible.map((c) => c.companyId).filter(Boolean);
          } catch (error) {
            console.warn('Could not resolve consultant access-based companies', error);
          }
        }

        where = accessibleCompanyIds.length > 0
          ? {
              ...where,
              OR: [
                { consultantId },
                { id: { in: accessibleCompanyIds } },
              ],
            }
          : {
              ...where,
              consultantId,
            };
      }
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

    const [
      includeIndustrySectorCategory,
      includeAccountingSystem,
      includeCompanySizeCategory,
      includeSetupFee,
      includeTier1SupportOwner,
      includeTier1SupportConsultantId,
      includeTier1SupportContactEmail,
      includeHasRealOperationalData,
      includeRealDataActivatedAt,
      includeForceOperationalMockData,
      includeReferralPartnerConsultantId,
      includeReferralPartnerId,
      includeReferralSetupFeePercentage,
      includeReferralRecurringFeePercentage,
      includeCommercialBillingMethod,
      includeCommercialPaymentStatus,
      includeCommercialInvoiceNumber,
      includeCommercialInvoiceUrl,
      includeCommercialInvoiceDate,
      includeCommercialPaymentDate,
      includeCommercialNextDueDate,
      includeCommercialTermsNotes,
      includeBaseCurrency,
      includeReportingCurrency,
      includeLocale,
    ] = await Promise.all([
      hasCompanyColumn("industrySectorCategory"),
      hasCompanyColumn("accountingSystem"),
      hasCompanyColumn("companySizeCategory"),
      hasCompanyColumn("subscriptionSetupFee"),
      hasCompanyColumn("tier1SupportOwner"),
      hasCompanyColumn("tier1SupportConsultantId"),
      hasCompanyColumn("tier1SupportContactEmail"),
      hasCompanyColumn("hasRealOperationalData"),
      hasCompanyColumn("realDataActivatedAt"),
      hasCompanyColumn("forceOperationalMockData"),
      hasCompanyColumn("referralPartnerConsultantId"),
      hasCompanyColumn("referralPartnerId"),
      hasCompanyColumn("referralSetupFeePercentage"),
      hasCompanyColumn("referralRecurringFeePercentage"),
      hasCompanyColumn("commercialBillingMethod"),
      hasCompanyColumn("commercialPaymentStatus"),
      hasCompanyColumn("commercialInvoiceNumber"),
      hasCompanyColumn("commercialInvoiceUrl"),
      hasCompanyColumn("commercialInvoiceDate"),
      hasCompanyColumn("commercialPaymentDate"),
      hasCompanyColumn("commercialNextDueDate"),
      hasCompanyColumn("commercialTermsNotes"),
      hasCompanyColumn("baseCurrency"),
      hasCompanyColumn("reportingCurrency"),
      hasCompanyColumn("locale"),
    ]);
    let companies;
    try {
      companies = await prisma.company.findMany({
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
          ...(includeIndustrySectorCategory ? { industrySectorCategory: true } : {}),
          ...(includeAccountingSystem ? { accountingSystem: true } : {}),
          ...(includeCompanySizeCategory ? { companySizeCategory: true } : {}),
          ...(includeBaseCurrency ? { baseCurrency: true } : {}),
          ...(includeReportingCurrency ? { reportingCurrency: true } : {}),
          ...(includeLocale ? { locale: true } : {}),
          linesOfBusiness: true,
          userDefinedAllocations: true,
          createdAt: true,
          // Always include pricing fields - they're needed for payment logic
          subscriptionMonthlyPrice: true,
          subscriptionQuarterlyPrice: true,
          subscriptionAnnualPrice: true,
          selectedSubscriptionPlan: true,
          ...(includeSetupFee ? { subscriptionSetupFee: true } : {}),
          ...(includeTier1SupportOwner ? { tier1SupportOwner: true } : {}),
          ...(includeTier1SupportConsultantId ? { tier1SupportConsultantId: true } : {}),
          ...(includeTier1SupportContactEmail ? { tier1SupportContactEmail: true } : {}),
          ...(includeHasRealOperationalData ? { hasRealOperationalData: true } : {}),
          ...(includeRealDataActivatedAt ? { realDataActivatedAt: true } : {}),
          ...(includeForceOperationalMockData ? { forceOperationalMockData: true } : {}),
          ...(includeReferralPartnerConsultantId ? { referralPartnerConsultantId: true } : {}),
          ...(includeReferralPartnerId ? { referralPartnerId: true } : {}),
          ...(includeReferralSetupFeePercentage ? { referralSetupFeePercentage: true } : {}),
          ...(includeReferralRecurringFeePercentage ? { referralRecurringFeePercentage: true } : {}),
          ...(includeCommercialBillingMethod ? { commercialBillingMethod: true } : {}),
          ...(includeCommercialPaymentStatus ? { commercialPaymentStatus: true } : {}),
          ...(includeCommercialInvoiceNumber ? { commercialInvoiceNumber: true } : {}),
          ...(includeCommercialInvoiceUrl ? { commercialInvoiceUrl: true } : {}),
          ...(includeCommercialInvoiceDate ? { commercialInvoiceDate: true } : {}),
          ...(includeCommercialPaymentDate ? { commercialPaymentDate: true } : {}),
          ...(includeCommercialNextDueDate ? { commercialNextDueDate: true } : {}),
          ...(includeCommercialTermsNotes ? { commercialTermsNotes: true } : {}),
          affiliateCode: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    } catch (error) {
      console.warn("Companies API: fallback select used", error);
      companies = await prisma.company.findMany({
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
          ...(includeIndustrySectorCategory ? { industrySectorCategory: true } : {}),
          ...(includeAccountingSystem ? { accountingSystem: true } : {}),
          ...(includeCompanySizeCategory ? { companySizeCategory: true } : {}),
          ...(includeBaseCurrency ? { baseCurrency: true } : {}),
          ...(includeReportingCurrency ? { reportingCurrency: true } : {}),
          ...(includeLocale ? { locale: true } : {}),
          linesOfBusiness: true,
          userDefinedAllocations: true,
          createdAt: true,
          subscriptionMonthlyPrice: true,
          subscriptionQuarterlyPrice: true,
          subscriptionAnnualPrice: true,
          selectedSubscriptionPlan: true,
          ...(includeSetupFee ? { subscriptionSetupFee: true } : {}),
          ...(includeTier1SupportOwner ? { tier1SupportOwner: true } : {}),
          ...(includeTier1SupportConsultantId ? { tier1SupportConsultantId: true } : {}),
          ...(includeTier1SupportContactEmail ? { tier1SupportContactEmail: true } : {}),
          ...(includeHasRealOperationalData ? { hasRealOperationalData: true } : {}),
          ...(includeRealDataActivatedAt ? { realDataActivatedAt: true } : {}),
          ...(includeForceOperationalMockData ? { forceOperationalMockData: true } : {}),
          ...(includeReferralPartnerConsultantId ? { referralPartnerConsultantId: true } : {}),
          ...(includeReferralPartnerId ? { referralPartnerId: true } : {}),
          ...(includeReferralSetupFeePercentage ? { referralSetupFeePercentage: true } : {}),
          ...(includeReferralRecurringFeePercentage ? { referralRecurringFeePercentage: true } : {}),
          ...(includeCommercialBillingMethod ? { commercialBillingMethod: true } : {}),
          ...(includeCommercialPaymentStatus ? { commercialPaymentStatus: true } : {}),
          ...(includeCommercialInvoiceNumber ? { commercialInvoiceNumber: true } : {}),
          ...(includeCommercialInvoiceUrl ? { commercialInvoiceUrl: true } : {}),
          ...(includeCommercialInvoiceDate ? { commercialInvoiceDate: true } : {}),
          ...(includeCommercialPaymentDate ? { commercialPaymentDate: true } : {}),
          ...(includeCommercialNextDueDate ? { commercialNextDueDate: true } : {}),
          ...(includeCommercialTermsNotes ? { commercialTermsNotes: true } : {}),
          affiliateCode: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    }

    const companiesWithResolvedSector = companies.map((company: any) => ({
      ...company,
      rawIndustrySectorCategory: company.industrySectorCategory || null,
      industrySectorCategory: resolveCompanyIndustrySectorCategory(company),
    }));

    console.log(`Retrieved ${companies.length} companies for user ${context.email}`);

    // AUDIT: Log company access (only log if viewing specific company)
    if (companyId && companies.length > 0) {
      await auditCompanyOperation('COMPANY_VIEWED', companyId);
    }

    return NextResponse.json({ companies: companiesWithResolvedSector }, { headers: privateCacheHeaders(companyId ? 30 : 60, 180) });
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
      affiliateCode,
      linesOfBusiness,
      tier1SupportOwner,
      tier1SupportConsultantId,
      tier1SupportContactEmail,
    } = requestBody;

    const nameTrimmed = typeof name === "string" ? name.trim() : "";
    const rawConsultantId =
      consultantId === null || consultantId === undefined || consultantId === ""
        ? ""
        : String(consultantId).trim();
    const isStandaloneBusiness = !rawConsultantId;

    console.log("🔍 Received data:", {
      name: nameTrimmed,
      consultantId: rawConsultantId || null,
      isStandaloneBusiness,
      addressStreet,
      addressCity,
      addressState,
      addressZip,
      addressCountry,
      affiliateCode,
    });

    if (!nameTrimmed) {
      console.error("❌ Missing company name");
      return NextResponse.json({ error: "Company name required" }, { status: 400 });
    }

    if (isStandaloneBusiness && context.role !== "SITEADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Only site administrators can create a business without a consultant" },
        { status: 403 },
      );
    }

    // Industry data is collected after company creation in the details flow.

    // Actually save companies to database
    console.log("🔍 Creating company in database");
    console.log("🔍 Environment:", process.env.NODE_ENV);

    // STAGING/DEV: Full pricing logic — resolve consultant when this company belongs to one
    let consultant: { type: string; id: string; userId: string } | null = null;
    if (!isStandaloneBusiness) {
      console.log("🔍 Looking up consultant with ID:", rawConsultantId);
      consultant = await prisma.consultant.findUnique({
        where: { id: rawConsultantId },
        select: { type: true, id: true, userId: true },
      });
      console.log("🔍 Consultant lookup result:", consultant);

      if (!consultant) {
        console.error("❌ Consultant not found:", rawConsultantId);
        return NextResponse.json({ error: "Consultant not found" }, { status: 404 });
      }

      // SECURITY: Validate consultant access - ensure user can create companies for this consultant
      console.log("🔍 Validating consultant access:");
      console.log("   User role:", context.role);
      console.log("   User consultantId:", context.consultantId);
      console.log("   Target consultantId:", rawConsultantId);

      if (context.role === "SITEADMIN") {
        console.log("✅ Site admin access - validation passed");
      } else if (context.role === "CONSULTANT") {
        if (context.consultantId !== rawConsultantId) {
          console.error("❌ Consultant trying to create company for different consultant");
          await auditForbiddenAccess("Company", rawConsultantId, "CREATE_FOR_CONSULTANT");
          return NextResponse.json(
            {
              error: "Forbidden: You can only create companies for yourself",
              debug: {
                userRole: context.role,
                userConsultantId: context.consultantId,
                targetConsultantId: rawConsultantId,
              },
            },
            { status: 403 },
          );
        }
        console.log("✅ Consultant access validated - creating company for self");
      } else {
        console.error("❌ User role cannot create companies:", context.role);
        await auditForbiddenAccess("Company", rawConsultantId, "CREATE_FOR_CONSULTANT");
        return NextResponse.json(
          { error: "Forbidden: Only consultants and site admins can create companies" },
          { status: 403 },
        );
      }
    } else {
      console.log("✅ Standalone business — site admin only (validated above)");
    }

    let monthlyPrice: number;
    let quarterlyPrice: number;
    let annualPrice: number;
    let setupFee: number = 0;
    let affiliateId: string | undefined;
    let validatedAffiliateCode: string | undefined;
    let useAffiliatePricing = false;
    let affiliateAddOnDefaults: unknown = null;

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
        setupFee = affiliateCodeBasic.setupFee ?? 0;
        affiliateId = affiliateCodeBasic.affiliateId;
        validatedAffiliateCode = affiliateCodeBasic.code;
        useAffiliatePricing = true;
        affiliateAddOnDefaults = affiliateCodeBasic.addOnDefaults || null;

        console.log("🔍 Using affiliate pricing:", {
          monthlyPrice,
          quarterlyPrice,
          annualPrice,
          setupFee,
          affiliateId,
          affiliateCode: validatedAffiliateCode,
          isFree: monthlyPrice === 0 && quarterlyPrice === 0 && annualPrice === 0 && setupFee === 0
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
              businessSetupFee: 0,
              consultantMonthlyPrice: 195,
              consultantQuarterlyPrice: 500,
              consultantAnnualPrice: 1750,
              consultantSetupFee: 0,
            },
          });
          console.log(
            "🔍 SystemSettings created successfully:",
            defaultPricing,
          );
        }

        // Use appropriate default pricing based on user type
        if (defaultPricing) {
          // Standalone + business-type consultants use business pricing; consulting firms use consultant pricing
          const isBusinessUser = !consultant || consultant.type === "business";
          monthlyPrice = isBusinessUser
            ? (defaultPricing.businessMonthlyPrice ?? 195)
            : (defaultPricing.consultantMonthlyPrice ?? 195);
          quarterlyPrice = isBusinessUser
            ? (defaultPricing.businessQuarterlyPrice ?? 500)
            : (defaultPricing.consultantQuarterlyPrice ?? 500);
          annualPrice = isBusinessUser
            ? (defaultPricing.businessAnnualPrice ?? 1750)
            : (defaultPricing.consultantAnnualPrice ?? 1750);
          setupFee = isBusinessUser
            ? (defaultPricing.businessSetupFee ?? 0)
            : (defaultPricing.consultantSetupFee ?? 0);
        } else {
          // Fallback pricing
          monthlyPrice = 195;
          quarterlyPrice = 500;
          annualPrice = 1750;
          setupFee = 0;
        }

        console.log("🔍 Final pricing:", {
          monthlyPrice,
          quarterlyPrice,
          annualPrice,
          setupFee,
        });
      } catch (settingsError) {
        console.error("❌ Error with SystemSettings lookup:", settingsError);
        console.log("🔍 Using fallback pricing due to SystemSettings error");
        // Use fallback pricing
        monthlyPrice = 195;
        quarterlyPrice = 500;
        annualPrice = 1750;
        setupFee = 0;
      }
    }
    let dataRoomMonthlyPrice = 195;
    let dataRoomQuarterlyPrice = 500;
    let dataRoomAnnualPrice = 1750;
    try {
      let defaultDataRoomPricing = await prisma.systemSettings.findUnique({
        where: { key: "default_dataroom_pricing" },
      });
      if (!defaultDataRoomPricing) {
        defaultDataRoomPricing = await prisma.systemSettings.create({
          data: {
            key: "default_dataroom_pricing",
            businessMonthlyPrice: 195,
            businessQuarterlyPrice: 500,
            businessAnnualPrice: 1750,
            businessSetupFee: 0,
            consultantMonthlyPrice: 195,
            consultantQuarterlyPrice: 500,
            consultantAnnualPrice: 1750,
            consultantSetupFee: 0,
          },
        });
      }
      const isBusinessUser = !consultant || consultant.type === "business";
      dataRoomMonthlyPrice = Number(isBusinessUser ? (defaultDataRoomPricing.businessMonthlyPrice ?? 195) : (defaultDataRoomPricing.consultantMonthlyPrice ?? 195));
      dataRoomQuarterlyPrice = Number(isBusinessUser ? (defaultDataRoomPricing.businessQuarterlyPrice ?? 500) : (defaultDataRoomPricing.consultantQuarterlyPrice ?? 500));
      dataRoomAnnualPrice = Number(isBusinessUser ? (defaultDataRoomPricing.businessAnnualPrice ?? 1750) : (defaultDataRoomPricing.consultantAnnualPrice ?? 1750));
    } catch (error) {
      console.warn("Could not load default DataRoom pricing, using fallback.", error);
    }

    console.log("🔍 About to create company with final data:", {
      name: nameTrimmed,
      consultantId: rawConsultantId || null,
      addressStreet,
      addressCity,
      addressState,
      addressZip,
      addressCountry,
      pricingUsed: { monthlyPrice, quarterlyPrice, annualPrice }, // Pricing determined but not stored in Company table
      setupFee,
      affiliateCode: validatedAffiliateCode,
      affiliateId: affiliateId,
    });

    const includeSetupFee = await hasCompanyColumn("subscriptionSetupFee");
    const includeTier1SupportOwner = await hasCompanyColumn("tier1SupportOwner");
    const includeTier1SupportConsultantId = await hasCompanyColumn("tier1SupportConsultantId");
    const includeTier1SupportContactEmail = await hasCompanyColumn("tier1SupportContactEmail");

    const normalizedTier1SupportOwner =
      typeof tier1SupportOwner === "string"
        ? tier1SupportOwner.trim().toUpperCase()
        : null;
    if (
      normalizedTier1SupportOwner &&
      normalizedTier1SupportOwner !== "CORELYTICS" &&
      normalizedTier1SupportOwner !== "CONSULTANT"
    ) {
      return NextResponse.json(
        { error: "tier1SupportOwner must be CORELYTICS or CONSULTANT" },
        { status: 400 },
      );
    }

    // Consultant-originated company defaults to consultant-owned Tier 1.
    const finalTier1SupportOwner =
      normalizedTier1SupportOwner || (rawConsultantId ? "CONSULTANT" : "CORELYTICS");
    const finalTier1SupportConsultantId =
      finalTier1SupportOwner === "CONSULTANT"
        ? (typeof tier1SupportConsultantId === "string" && tier1SupportConsultantId.trim()) || rawConsultantId || null
        : null;
    const finalTier1SupportContactEmail =
      finalTier1SupportOwner === "CONSULTANT" && typeof tier1SupportContactEmail === "string"
        ? tier1SupportContactEmail.trim().toLowerCase() || null
        : null;

    if (finalTier1SupportOwner === "CONSULTANT" && !finalTier1SupportConsultantId) {
      return NextResponse.json(
        { error: "tier1SupportConsultantId is required when tier1SupportOwner is CONSULTANT" },
        { status: 400 },
      );
    }

    if (finalTier1SupportOwner === "CONSULTANT" && finalTier1SupportConsultantId) {
      const supportConsultant = await prisma.consultant.findUnique({
        where: { id: finalTier1SupportConsultantId },
        select: { id: true },
      });
      if (!supportConsultant) {
        return NextResponse.json(
          { error: "Tier 1 support consultant not found" },
          { status: 400 },
        );
      }
    }

    try {
      const baseUserDefinedAllocations = useAffiliatePricing
        ? {
            subscriptionPricing: {
              monthly: monthlyPrice ?? 0,
              quarterly: quarterlyPrice ?? 0,
              annual: annualPrice ?? 0,
              isFree:
                (monthlyPrice ?? 0) === 0 &&
                (quarterlyPrice ?? 0) === 0 &&
                (annualPrice ?? 0) === 0 &&
                (setupFee ?? 0) === 0,
              setupFee: setupFee ?? 0,
              source: "affiliate_code",
              createdAt: new Date().toISOString(),
            },
          }
        : {};
      const addOnAllocations = buildCompanyAddOnAllocations({
        addOnDefaults: affiliateAddOnDefaults,
        dataRoomPricing: {
          monthly: dataRoomMonthlyPrice,
          quarterly: dataRoomQuarterlyPrice,
          annual: dataRoomAnnualPrice,
        },
      });
      const company = await prisma.company.create({
        data: {
          name: nameTrimmed,
          ...(rawConsultantId
            ? {
                consultant: {
                  connect: { id: rawConsultantId },
                },
              }
            : {}),
          addressStreet,
          addressCity,
          addressState,
          addressZip,
          addressCountry,
          // STORE FINAL PRICING PERMANENTLY - AFFILIATE CODES WORK IN BOTH ENVIRONMENTS
          // Always store pricing fields regardless of environment for affiliate codes
          // Ensure $0 values are stored as 0, not null
          subscriptionMonthlyPrice: monthlyPrice ?? 0,
          subscriptionQuarterlyPrice: quarterlyPrice ?? 0,
          subscriptionAnnualPrice: annualPrice ?? 0,
          ...(includeSetupFee ? { subscriptionSetupFee: setupFee ?? 0 } : {}),
          subscriptionStatus:
            monthlyPrice === 0 &&
            quarterlyPrice === 0 &&
            annualPrice === 0 &&
            (setupFee ?? 0) === 0
              ? "free"
              : "active",
          ...(includeTier1SupportOwner
            ? { tier1SupportOwner: finalTier1SupportOwner }
            : {}),
          ...(includeTier1SupportConsultantId
            ? { tier1SupportConsultantId: finalTier1SupportConsultantId }
            : {}),
          ...(includeTier1SupportContactEmail
            ? { tier1SupportContactEmail: finalTier1SupportContactEmail }
            : {}),
          userDefinedAllocations: {
            ...baseUserDefinedAllocations,
            ...addOnAllocations,
          } as any,
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
          linesOfBusiness: true,
          userDefinedAllocations: true,
          subscriptionMonthlyPrice: true,
          subscriptionQuarterlyPrice: true,
          subscriptionAnnualPrice: true,
          ...(includeSetupFee ? { subscriptionSetupFee: true } : {}),
          ...(includeTier1SupportOwner ? { tier1SupportOwner: true } : {}),
          ...(includeTier1SupportConsultantId ? { tier1SupportConsultantId: true } : {}),
          ...(includeTier1SupportContactEmail ? { tier1SupportContactEmail: true } : {}),
          createdAt: true,
        },
      });

      console.log("🔍 Company created successfully:", company);

      // AUDIT: Log company creation
      await auditCompanyOperation('COMPANY_CREATED', company.id);

      // Transform the response to include consultantId (pricing is now stored in DB)
      const transformedCompany = {
        ...company,
        consultantId: (company as any).consultant?.id ?? null,
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

    const existingCompany = await prisma.company.findUnique({
      where: { id: targetCompanyId },
      select: { id: true, name: true, accountingSystem: true, userDefinedAllocations: true },
    });
    if (!existingCompany) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
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
    if (updateFields.industrySector !== undefined) {
      if (!updateFields.industrySector) {
        return NextResponse.json(
          { error: "Industry Group is required" },
          { status: 400 },
        );
      }
      updateData.industrySector = updateFields.industrySector;
    }
    if (updateFields.industrySectorCategory !== undefined) {
      if (!updateFields.industrySectorCategory) {
        return NextResponse.json(
          { error: "Industry Sector is required" },
          { status: 400 },
        );
      }
      try {
        const sectorCategoryColumn = await prisma.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'Company'
              AND column_name = 'industrySectorCategory'
          ) as "exists"
        `;
        if (sectorCategoryColumn[0]?.exists) {
          updateData.industrySectorCategory = updateFields.industrySectorCategory;
        } else {
          console.warn('Company update: industrySectorCategory column missing, skipping update');
        }
      } catch (error) {
        console.warn('Company update: could not verify industrySectorCategory column, skipping update', error);
      }
    }
    if (updateFields.accountingSystem !== undefined) {
      if (!updateFields.accountingSystem || typeof updateFields.accountingSystem !== 'string') {
        return NextResponse.json(
          { error: "Accounting System is required" },
          { status: 400 },
        );
      }
      try {
        const accountingSystemColumn = await prisma.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'Company'
              AND column_name = 'accountingSystem'
          ) as "exists"
        `;
        if (accountingSystemColumn[0]?.exists) {
          updateData.accountingSystem = updateFields.accountingSystem;
        } else {
          console.warn('Company update: accountingSystem column missing, skipping update');
        }
      } catch (error) {
        console.warn('Company update: could not verify accountingSystem column, skipping update', error);
      }
    }
    if (updateFields.companySizeCategory !== undefined) {
      try {
        const companySizeColumn = await prisma.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'Company'
              AND column_name = 'companySizeCategory'
          ) as "exists"
        `;
        if (companySizeColumn[0]?.exists) {
          updateData.companySizeCategory = updateFields.companySizeCategory;
        } else {
          console.warn('Company update: companySizeCategory column missing, skipping update');
        }
      } catch (error) {
        console.warn('Company update: could not verify companySizeCategory column, skipping update', error);
      }
    }

    // Multi-currency: base (home) + optional reporting currency
    const {
      isSupportedCurrency,
      normalizeCurrencyCode,
      localeForCurrency,
      DEFAULT_BASE_CURRENCY,
    } = await import('@/lib/constants/currencies');

    if (updateFields.baseCurrency !== undefined) {
      if (!(await hasCompanyColumn('baseCurrency'))) {
        return NextResponse.json(
          { error: 'baseCurrency column is not available in this environment' },
          { status: 400 }
        );
      }
      const nextBase = normalizeCurrencyCode(updateFields.baseCurrency, DEFAULT_BASE_CURRENCY);
      if (!isSupportedCurrency(nextBase)) {
        return NextResponse.json({ error: 'Unsupported baseCurrency' }, { status: 400 });
      }
      updateData.baseCurrency = nextBase;
      if (updateFields.locale === undefined && (await hasCompanyColumn('locale'))) {
        updateData.locale = localeForCurrency(nextBase);
      }
    }

    if (updateFields.reportingCurrency !== undefined) {
      if (!(await hasCompanyColumn('reportingCurrency'))) {
        return NextResponse.json(
          { error: 'reportingCurrency column is not available in this environment' },
          { status: 400 }
        );
      }
      if (updateFields.reportingCurrency === null || updateFields.reportingCurrency === '') {
        updateData.reportingCurrency = null;
      } else {
        const nextReporting = normalizeCurrencyCode(String(updateFields.reportingCurrency));
        if (!isSupportedCurrency(nextReporting)) {
          return NextResponse.json({ error: 'Unsupported reportingCurrency' }, { status: 400 });
        }
        updateData.reportingCurrency = nextReporting;
      }
    }

    // Guard: reporting must differ from effective base
    if (updateData.reportingCurrency) {
      const effectiveBase =
        updateData.baseCurrency ||
        (await hasCompanyColumn('baseCurrency')
          ? (
              await prisma.company.findUnique({
                where: { id: targetCompanyId },
                select: { baseCurrency: true },
              })
            )?.baseCurrency
          : null) ||
        DEFAULT_BASE_CURRENCY;
      if (String(updateData.reportingCurrency).toUpperCase() === String(effectiveBase).toUpperCase()) {
        return NextResponse.json(
          { error: 'reportingCurrency must differ from baseCurrency (or leave blank)' },
          { status: 400 }
        );
      }
    }

    if (updateFields.locale !== undefined && (await hasCompanyColumn('locale'))) {
      const locale = String(updateFields.locale || '').trim();
      if (locale) updateData.locale = locale;
    }

    // Tier 1 support routing
    const tier1SupportOwnerColumnExists = await hasCompanyColumn('tier1SupportOwner');
    const tier1SupportConsultantIdColumnExists = await hasCompanyColumn('tier1SupportConsultantId');
    const tier1SupportContactEmailColumnExists = await hasCompanyColumn('tier1SupportContactEmail');
    const hasTier1SupportUpdate =
      updateFields.tier1SupportOwner !== undefined ||
      updateFields.tier1SupportConsultantId !== undefined ||
      updateFields.tier1SupportContactEmail !== undefined;

    if (hasTier1SupportUpdate) {
      if (!tier1SupportOwnerColumnExists || !tier1SupportConsultantIdColumnExists || !tier1SupportContactEmailColumnExists) {
        return NextResponse.json(
          { error: "Tier 1 support routing columns are not available in this environment" },
          { status: 400 },
        );
      }

      const nextOwnerRaw =
        updateFields.tier1SupportOwner !== undefined
          ? String(updateFields.tier1SupportOwner || '').trim().toUpperCase()
          : undefined;
      const nextOwner = nextOwnerRaw ?? undefined;
      if (nextOwner !== undefined && nextOwner !== 'CORELYTICS' && nextOwner !== 'CONSULTANT') {
        return NextResponse.json(
          { error: "tier1SupportOwner must be CORELYTICS or CONSULTANT" },
          { status: 400 },
        );
      }

      const requestedConsultantId =
        updateFields.tier1SupportConsultantId === undefined
          ? undefined
          : (updateFields.tier1SupportConsultantId || null);
      const requestedSupportContactEmail =
        updateFields.tier1SupportContactEmail === undefined
          ? undefined
          : (typeof updateFields.tier1SupportContactEmail === 'string'
              ? updateFields.tier1SupportContactEmail.trim().toLowerCase()
              : null);

      const currentSupportRows = await prisma.$queryRaw<
        Array<{
          tier1SupportOwner: string | null;
          tier1SupportConsultantId: string | null;
          tier1SupportContactEmail: string | null;
          consultantId: string | null;
        }>
      >`
        SELECT "tier1SupportOwner", "tier1SupportConsultantId", "tier1SupportContactEmail", "consultantId"
        FROM "Company"
        WHERE "id" = ${targetCompanyId}
        LIMIT 1
      `;
      const currentSupportRouting = currentSupportRows[0] || null;

      const effectiveOwner =
        nextOwner ??
        (currentSupportRouting?.tier1SupportOwner
          ? String(currentSupportRouting.tier1SupportOwner).toUpperCase()
          : (currentSupportRouting?.consultantId ? 'CONSULTANT' : 'CORELYTICS'));

      let effectiveConsultantId: string | null =
        requestedConsultantId === undefined
          ? (currentSupportRouting?.tier1SupportConsultantId || null)
          : requestedConsultantId;
      let effectiveSupportContactEmail: string | null =
        requestedSupportContactEmail === undefined
          ? (currentSupportRouting?.tier1SupportContactEmail || null)
          : requestedSupportContactEmail;

      if (effectiveOwner === 'CONSULTANT') {
        if (!effectiveConsultantId) {
          effectiveConsultantId = currentSupportRouting?.consultantId || null;
        }
        if (!effectiveConsultantId) {
          return NextResponse.json(
            { error: "tier1SupportConsultantId is required when tier1SupportOwner is CONSULTANT" },
            { status: 400 },
          );
        }
        const supportConsultant = await prisma.consultant.findUnique({
          where: { id: effectiveConsultantId },
          select: { id: true },
        });
        if (!supportConsultant) {
          return NextResponse.json(
            { error: "Tier 1 support consultant not found" },
            { status: 400 },
          );
        }
      } else {
        effectiveConsultantId = null;
        effectiveSupportContactEmail = null;
      }

      updateData.tier1SupportOwner = effectiveOwner;
      updateData.tier1SupportConsultantId = effectiveConsultantId;
      updateData.tier1SupportContactEmail = effectiveSupportContactEmail;
    }

    const hasOperationalDataModeUpdate =
      updateFields.forceOperationalMockData !== undefined ||
      updateFields.hasRealOperationalData !== undefined;
    if (hasOperationalDataModeUpdate) {
      if (context.role !== 'SITEADMIN') {
        return NextResponse.json(
          { error: "Only site admins can update operational data mode settings" },
          { status: 403 },
        );
      }

      const forceOperationalMockDataColumnExists = await hasCompanyColumn('forceOperationalMockData');
      const hasRealOperationalDataColumnExists = await hasCompanyColumn('hasRealOperationalData');
      const realDataActivatedAtColumnExists = await hasCompanyColumn('realDataActivatedAt');

      if (updateFields.forceOperationalMockData !== undefined) {
        if (!forceOperationalMockDataColumnExists) {
          return NextResponse.json(
            { error: "forceOperationalMockData column is not available in this environment" },
            { status: 400 },
          );
        }
        updateData.forceOperationalMockData = Boolean(updateFields.forceOperationalMockData);
      }

      if (updateFields.hasRealOperationalData !== undefined) {
        if (!hasRealOperationalDataColumnExists) {
          return NextResponse.json(
            { error: "hasRealOperationalData column is not available in this environment" },
            { status: 400 },
          );
        }
        const hasReal = Boolean(updateFields.hasRealOperationalData);
        updateData.hasRealOperationalData = hasReal;
        if (realDataActivatedAtColumnExists) {
          updateData.realDataActivatedAt = hasReal ? new Date() : null;
        }
      }
    }

    // Name
    if (updateFields.name !== undefined) updateData.name = updateFields.name;

    // DataRoom settings (stored in userDefinedAllocations.dataRoom)
    const hasDataRoomSettingsUpdate =
      updateFields.dataRoomEnabledByAdmin !== undefined ||
      updateFields.dataRoomMonthlyPrice !== undefined ||
      updateFields.dataRoomQuarterlyPrice !== undefined ||
      updateFields.dataRoomAnnualPrice !== undefined;
    if (hasDataRoomSettingsUpdate) {
      const currentUDA =
        existingCompany?.userDefinedAllocations &&
        typeof existingCompany.userDefinedAllocations === 'object' &&
        !Array.isArray(existingCompany.userDefinedAllocations)
          ? (existingCompany.userDefinedAllocations as Record<string, any>)
          : {};
      const currentDataRoom =
        currentUDA.dataRoom &&
        typeof currentUDA.dataRoom === 'object' &&
        !Array.isArray(currentUDA.dataRoom)
          ? (currentUDA.dataRoom as Record<string, any>)
          : {};
      const currentPricing =
        currentDataRoom.pricing &&
        typeof currentDataRoom.pricing === 'object' &&
        !Array.isArray(currentDataRoom.pricing)
          ? (currentDataRoom.pricing as Record<string, any>)
          : {};

      const nextEnabled =
        updateFields.dataRoomEnabledByAdmin !== undefined
          ? Boolean(updateFields.dataRoomEnabledByAdmin)
          : Boolean(currentDataRoom.enabledByAdmin);
      const nextMonthly =
        updateFields.dataRoomMonthlyPrice !== undefined
          ? Number(updateFields.dataRoomMonthlyPrice)
          : Number(currentPricing.monthly ?? 0);
      const nextQuarterly =
        updateFields.dataRoomQuarterlyPrice !== undefined
          ? Number(updateFields.dataRoomQuarterlyPrice)
          : Number(currentPricing.quarterly ?? 0);
      const nextAnnual =
        updateFields.dataRoomAnnualPrice !== undefined
          ? Number(updateFields.dataRoomAnnualPrice)
          : Number(currentPricing.annual ?? 0);

      updateData.userDefinedAllocations = {
        ...currentUDA,
        dataRoom: {
          ...currentDataRoom,
          enabledByAdmin: nextEnabled,
          pricing: {
            ...currentPricing,
            monthly: Number.isFinite(nextMonthly) ? nextMonthly : 0,
            quarterly: Number.isFinite(nextQuarterly) ? nextQuarterly : 0,
            annual: Number.isFinite(nextAnnual) ? nextAnnual : 0,
          },
          folders:
            nextEnabled
              ? (Array.isArray(currentDataRoom.folders) && currentDataRoom.folders.length > 0
                  ? currentDataRoom.folders
                  : DATAROOM_DEFAULT_FOLDERS)
              : currentDataRoom.folders,
          documentIndex: Array.isArray(currentDataRoom.documentIndex) ? currentDataRoom.documentIndex : [],
        },
      };
    }

    // Valuation settings (stored in userDefinedAllocations.valuation)
    const hasValuationSettingsUpdate =
      updateFields.valuationEnabledByAdmin !== undefined ||
      updateFields.valuationMonthlyPrice !== undefined ||
      updateFields.valuationQuarterlyPrice !== undefined ||
      updateFields.valuationAnnualPrice !== undefined;
    if (hasValuationSettingsUpdate) {
      const currentUDA =
        updateData.userDefinedAllocations &&
        typeof updateData.userDefinedAllocations === 'object' &&
        !Array.isArray(updateData.userDefinedAllocations)
          ? (updateData.userDefinedAllocations as Record<string, any>)
          : (
              existingCompany?.userDefinedAllocations &&
              typeof existingCompany.userDefinedAllocations === 'object' &&
              !Array.isArray(existingCompany.userDefinedAllocations)
                ? (existingCompany.userDefinedAllocations as Record<string, any>)
                : {}
            );
      const currentValuation =
        currentUDA.valuation &&
        typeof currentUDA.valuation === 'object' &&
        !Array.isArray(currentUDA.valuation)
          ? (currentUDA.valuation as Record<string, any>)
          : {};
      const currentPricing =
        currentValuation.pricing &&
        typeof currentValuation.pricing === 'object' &&
        !Array.isArray(currentValuation.pricing)
          ? (currentValuation.pricing as Record<string, any>)
          : {};
      const currentSubscription =
        currentValuation.subscription &&
        typeof currentValuation.subscription === 'object' &&
        !Array.isArray(currentValuation.subscription)
          ? (currentValuation.subscription as Record<string, any>)
          : {};

      const nextEnabled =
        updateFields.valuationEnabledByAdmin !== undefined
          ? Boolean(updateFields.valuationEnabledByAdmin)
          : (typeof currentValuation.enabledByAdmin === 'boolean' ? currentValuation.enabledByAdmin : true);
      const nextMonthly =
        updateFields.valuationMonthlyPrice !== undefined
          ? Number(updateFields.valuationMonthlyPrice)
          : Number(currentPricing.monthly ?? 0);
      const nextQuarterly =
        updateFields.valuationQuarterlyPrice !== undefined
          ? Number(updateFields.valuationQuarterlyPrice)
          : Number(currentPricing.quarterly ?? 0);
      const nextAnnual =
        updateFields.valuationAnnualPrice !== undefined
          ? Number(updateFields.valuationAnnualPrice)
          : Number(currentPricing.annual ?? 0);

      updateData.userDefinedAllocations = {
        ...currentUDA,
        valuation: {
          ...currentValuation,
          enabledByAdmin: nextEnabled,
          pricing: {
            ...currentPricing,
            monthly: Number.isFinite(nextMonthly) ? nextMonthly : 0,
            quarterly: Number.isFinite(nextQuarterly) ? nextQuarterly : 0,
            annual: Number.isFinite(nextAnnual) ? nextAnnual : 0,
          },
          subscription: {
            status: String(currentSubscription.status || 'inactive').toLowerCase(),
            ...currentSubscription,
          },
        },
      };
    }

    // Digital Presence settings (stored in userDefinedAllocations.digitalPresence)
    const hasDigitalPresenceSettingsUpdate =
      updateFields.digitalPresenceEnabledByAdmin !== undefined ||
      updateFields.digitalPresenceMonthlyPrice !== undefined ||
      updateFields.digitalPresenceQuarterlyPrice !== undefined ||
      updateFields.digitalPresenceAnnualPrice !== undefined;
    if (hasDigitalPresenceSettingsUpdate) {
      const currentUDA =
        updateData.userDefinedAllocations &&
        typeof updateData.userDefinedAllocations === 'object' &&
        !Array.isArray(updateData.userDefinedAllocations)
          ? (updateData.userDefinedAllocations as Record<string, any>)
          : (
              existingCompany?.userDefinedAllocations &&
              typeof existingCompany.userDefinedAllocations === 'object' &&
              !Array.isArray(existingCompany.userDefinedAllocations)
                ? (existingCompany.userDefinedAllocations as Record<string, any>)
                : {}
            );
      const currentDigitalPresence =
        currentUDA.digitalPresence &&
        typeof currentUDA.digitalPresence === 'object' &&
        !Array.isArray(currentUDA.digitalPresence)
          ? (currentUDA.digitalPresence as Record<string, any>)
          : {};
      const currentPricing =
        currentDigitalPresence.pricing &&
        typeof currentDigitalPresence.pricing === 'object' &&
        !Array.isArray(currentDigitalPresence.pricing)
          ? (currentDigitalPresence.pricing as Record<string, any>)
          : {};
      const currentSubscription =
        currentDigitalPresence.subscription &&
        typeof currentDigitalPresence.subscription === 'object' &&
        !Array.isArray(currentDigitalPresence.subscription)
          ? (currentDigitalPresence.subscription as Record<string, any>)
          : {};

      const nextEnabled =
        updateFields.digitalPresenceEnabledByAdmin !== undefined
          ? Boolean(updateFields.digitalPresenceEnabledByAdmin)
          : Boolean(currentDigitalPresence.enabledByAdmin);
      const nextMonthly =
        updateFields.digitalPresenceMonthlyPrice !== undefined
          ? Number(updateFields.digitalPresenceMonthlyPrice)
          : Number(currentPricing.monthly ?? 0);
      const nextQuarterly =
        updateFields.digitalPresenceQuarterlyPrice !== undefined
          ? Number(updateFields.digitalPresenceQuarterlyPrice)
          : Number(currentPricing.quarterly ?? 0);
      const nextAnnual =
        updateFields.digitalPresenceAnnualPrice !== undefined
          ? Number(updateFields.digitalPresenceAnnualPrice)
          : Number(currentPricing.annual ?? 0);

      updateData.userDefinedAllocations = {
        ...currentUDA,
        digitalPresence: {
          ...currentDigitalPresence,
          enabledByAdmin: nextEnabled,
          pricing: {
            ...currentPricing,
            monthly: Number.isFinite(nextMonthly) ? nextMonthly : 0,
            quarterly: Number.isFinite(nextQuarterly) ? nextQuarterly : 0,
            annual: Number.isFinite(nextAnnual) ? nextAnnual : 0,
          },
          subscription: {
            status: String(currentSubscription.status || 'inactive').toLowerCase(),
            ...currentSubscription,
          },
        },
      };
    }

    // Custom Reports settings (stored in userDefinedAllocations.customReports)
    const hasCustomReportsSettingsUpdate = updateFields.customReportsEnabledByAdmin !== undefined;
    if (hasCustomReportsSettingsUpdate) {
      if (context.role !== 'SITEADMIN') {
        return NextResponse.json(
          { error: "Only site admins can update Custom Reports settings" },
          { status: 403 },
        );
      }

      const currentUDA =
        updateData.userDefinedAllocations &&
        typeof updateData.userDefinedAllocations === 'object' &&
        !Array.isArray(updateData.userDefinedAllocations)
          ? (updateData.userDefinedAllocations as Record<string, any>)
          : (
              existingCompany?.userDefinedAllocations &&
              typeof existingCompany.userDefinedAllocations === 'object' &&
              !Array.isArray(existingCompany.userDefinedAllocations)
                ? (existingCompany.userDefinedAllocations as Record<string, any>)
                : {}
            );
      const currentCustomReports =
        currentUDA.customReports &&
        typeof currentUDA.customReports === 'object' &&
        !Array.isArray(currentUDA.customReports)
          ? (currentUDA.customReports as Record<string, any>)
          : {};

      updateData.userDefinedAllocations = {
        ...currentUDA,
        customReports: {
          ...currentCustomReports,
          enabledByAdmin: Boolean(updateFields.customReportsEnabledByAdmin),
        },
      };
    }

    const hasOperationalHubConfigUpdate = updateFields.operationalHubConfig !== undefined;
    if (hasOperationalHubConfigUpdate) {
      if (context.role !== 'SITEADMIN') {
        return NextResponse.json(
          { error: "Only site admins can update operational hub customization settings" },
          { status: 403 },
        );
      }

      const currentUDA =
        existingCompany?.userDefinedAllocations &&
        typeof existingCompany.userDefinedAllocations === 'object' &&
        !Array.isArray(existingCompany.userDefinedAllocations)
          ? (existingCompany.userDefinedAllocations as Record<string, any>)
          : {};

      const nextOperationalHubConfig =
        updateFields.operationalHubConfig &&
        typeof updateFields.operationalHubConfig === 'object' &&
        !Array.isArray(updateFields.operationalHubConfig)
          ? (updateFields.operationalHubConfig as Record<string, any>)
          : null;

      const nextUDA = { ...currentUDA };
      if (nextOperationalHubConfig) {
        nextUDA.operationalHub = nextOperationalHubConfig;
      } else {
        delete nextUDA.operationalHub;
      }

      updateData.userDefinedAllocations = nextUDA;
    }

    // Lines of Business and allocations (legacy LOB endpoint usage)
    if (updateFields.linesOfBusiness !== undefined)
      updateData.linesOfBusiness = updateFields.linesOfBusiness;
    if (updateFields.headcountAllocations !== undefined)
      updateData.headcountAllocations = updateFields.headcountAllocations;
    if (updateFields.userDefinedAllocations !== undefined)
      updateData.userDefinedAllocations = updateFields.userDefinedAllocations;

    console.log("🔄 Final update data:", updateData);

    // Build select object - include fields that exist in production DB
    const columnExists = async (columnName: string) => {
      try {
        const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'Company'
              AND column_name = ${columnName}
          ) as "exists"
        `;
        return rows[0]?.exists === true;
      } catch (error) {
        console.warn(`Company update: could not verify ${columnName} column`, error);
        return false;
      }
    };

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
      userDefinedAllocations: true,
      createdAt: true,
    };

    if (await columnExists('industrySectorCategory')) {
      selectFields.industrySectorCategory = true;
    }
    if (await columnExists('accountingSystem')) {
      selectFields.accountingSystem = true;
    }
    if (await columnExists('companySizeCategory')) {
      selectFields.companySizeCategory = true;
    }
    if (await columnExists('tier1SupportOwner')) {
      selectFields.tier1SupportOwner = true;
    }
    if (await columnExists('tier1SupportConsultantId')) {
      selectFields.tier1SupportConsultantId = true;
    }
    if (await columnExists('tier1SupportContactEmail')) {
      selectFields.tier1SupportContactEmail = true;
    }
    if (await columnExists('hasRealOperationalData')) {
      selectFields.hasRealOperationalData = true;
    }
    if (await columnExists('realDataActivatedAt')) {
      selectFields.realDataActivatedAt = true;
    }
    if (await columnExists('forceOperationalMockData')) {
      selectFields.forceOperationalMockData = true;
    }
    if (await columnExists('baseCurrency')) {
      selectFields.baseCurrency = true;
    }
    if (await columnExists('reportingCurrency')) {
      selectFields.reportingCurrency = true;
    }
    if (await columnExists('locale')) {
      selectFields.locale = true;
    }

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

    let fxBackfill: Record<string, unknown> | null = null;
    if (updateData.reportingCurrency) {
      try {
        const { ensureCompanyReportingRates } = await import('@/lib/fx');
        fxBackfill = (await ensureCompanyReportingRates(targetCompanyId)) as Record<string, unknown>;
      } catch (fxError: any) {
        console.warn('FX backfill after currency update failed:', fxError?.message || fxError);
        fxBackfill = { error: fxError?.message || String(fxError) };
      }
    }

    const requestedAccountingSystem =
      typeof updateFields.accountingSystem === 'string'
        ? updateFields.accountingSystem.trim()
        : null;
    const previousAccountingSystem = (existingCompany.accountingSystem || '').trim();
    const accountingSystemChanged =
      !!requestedAccountingSystem && requestedAccountingSystem !== previousAccountingSystem;

    // Notify site admins only when accounting system is newly selected/changed.
    if (accountingSystemChanged) {
      try {
        const siteAdmins = await prisma.user.findMany({
          where: { role: 'SITEADMIN' },
          select: { email: true },
        });
        const recipients = siteAdmins.map((admin) => admin.email).filter(Boolean);
        if (recipients.length > 0) {
          await sendAccountingSystemSelectionNotification({
            recipients,
            companyName: existingCompany.name,
            companyId: existingCompany.id,
            accountingSystem: requestedAccountingSystem,
            changedByEmail: context.email,
            changedByRole: context.role,
          });
        }
      } catch (notificationError) {
        console.error('⚠️ Failed to send accounting system selection notification:', notificationError);
      }
    }
    
    const companyWithResolvedSector = {
      ...company,
      rawIndustrySectorCategory: (company as any).industrySectorCategory || null,
      industrySectorCategory: resolveCompanyIndustrySectorCategory(company),
    };

    return NextResponse.json({
      company: companyWithResolvedSector,
      ...(fxBackfill ? { fxBackfill } : {}),
    }, { status: 200 });
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

// PUT update company subscription pricing (site admin)
export async function PUT(request: NextRequest) {
  try {
    const context = await requireAuth();

    if (context.role !== 'SITEADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Only site administrators can update pricing' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      id,
      subscriptionMonthly,
      subscriptionQuarterly,
      subscriptionAnnual,
      subscriptionSetupFee,
      affiliateCode,
      referralPartnerId,
      referralPartnerConsultantId,
      referralSetupFeePercentage,
      referralRecurringFeePercentage,
      commercialBillingMethod,
      commercialPaymentStatus,
      commercialInvoiceNumber,
      commercialInvoiceUrl,
      commercialInvoiceDate,
      commercialPaymentDate,
      commercialNextDueDate,
      commercialTermsNotes,
    } = body || {};

    if (!id) {
      return NextResponse.json({ error: 'Company ID required' }, { status: 400 });
    }

    // SECURITY: Validate company access (site admin should pass, but keep consistent)
    const hasAccess = await validateCompanyAccess(id);
    if (!hasAccess) {
      await auditForbiddenAccess('Company', id, 'UPDATE_PRICING');
      return NextResponse.json({ error: 'Forbidden: Access denied' }, { status: 403 });
    }

    const monthly = Number(subscriptionMonthly);
    const quarterly = Number(subscriptionQuarterly);
    const annual = Number(subscriptionAnnual);
    const setupFee = subscriptionSetupFee === undefined ? undefined : Number(subscriptionSetupFee);

    if (![monthly, quarterly, annual].every((v) => Number.isFinite(v) && v >= 0)) {
      return NextResponse.json({ error: 'Invalid pricing values' }, { status: 400 });
    }
    if (setupFee !== undefined && (!Number.isFinite(setupFee) || setupFee < 0)) {
      return NextResponse.json({ error: 'Invalid setup fee value' }, { status: 400 });
    }
    const normalizedAffiliateCode = affiliateCode === undefined
      ? undefined
      : String(affiliateCode || '').trim().toUpperCase();
    const normalizedReferralPartnerConsultantId = referralPartnerConsultantId === undefined
      ? undefined
      : String(referralPartnerConsultantId || '').trim() || null;
    const normalizedReferralPartnerId = referralPartnerId === undefined
      ? undefined
      : String(referralPartnerId || '').trim() || null;
    const setupReferralPercent = referralSetupFeePercentage === undefined
      ? undefined
      : Number(referralSetupFeePercentage);
    const recurringReferralPercent = referralRecurringFeePercentage === undefined
      ? undefined
      : Number(referralRecurringFeePercentage);

    if (setupReferralPercent !== undefined && (!Number.isFinite(setupReferralPercent) || setupReferralPercent < 0 || setupReferralPercent > 100)) {
      return NextResponse.json({ error: 'Invalid setup referral percentage' }, { status: 400 });
    }
    if (recurringReferralPercent !== undefined && (!Number.isFinite(recurringReferralPercent) || recurringReferralPercent < 0 || recurringReferralPercent > 100)) {
      return NextResponse.json({ error: 'Invalid recurring referral percentage' }, { status: 400 });
    }
    if (normalizedReferralPartnerConsultantId) {
      const referralPartner = await prisma.consultant.findUnique({
        where: { id: normalizedReferralPartnerConsultantId },
        select: { id: true },
      });
      if (!referralPartner) {
        return NextResponse.json({ error: 'Referral partner consultant not found' }, { status: 400 });
      }
    }
    if (normalizedReferralPartnerId) {
      const referralPartner = await (prisma as any).referralPartner?.findUnique?.({
        where: { id: normalizedReferralPartnerId },
        select: { id: true },
      });
      if (!referralPartner) {
        return NextResponse.json({ error: 'Referral partner not found' }, { status: 400 });
      }
    }
    const allowedBillingMethods = new Set(['usaepay', 'quickbooks_invoice', 'manual_external', 'no_platform_payment']);
    const allowedPaymentStatuses = new Set(['not_billed', 'invoiced', 'paid', 'overdue', 'waived', 'no_payment_required', 'external_paid']);
    const normalizedBillingMethod = commercialBillingMethod === undefined
      ? undefined
      : String(commercialBillingMethod || '').trim().toLowerCase();
    const normalizedPaymentStatus = commercialPaymentStatus === undefined
      ? undefined
      : String(commercialPaymentStatus || '').trim().toLowerCase();
    if (normalizedBillingMethod !== undefined && !allowedBillingMethods.has(normalizedBillingMethod)) {
      return NextResponse.json({ error: 'Invalid billing method' }, { status: 400 });
    }
    if (normalizedPaymentStatus !== undefined && !allowedPaymentStatuses.has(normalizedPaymentStatus)) {
      return NextResponse.json({ error: 'Invalid payment status' }, { status: 400 });
    }
    const parseOptionalDate = (value: unknown) => {
      if (value === undefined) return undefined;
      if (value === null || value === '') return null;
      return new Date(String(value));
    };
    const parsedCommercialInvoiceDate = parseOptionalDate(commercialInvoiceDate);
    const parsedCommercialPaymentDate = parseOptionalDate(commercialPaymentDate);
    const parsedCommercialNextDueDate = parseOptionalDate(commercialNextDueDate);
    if (parsedCommercialInvoiceDate instanceof Date && Number.isNaN(parsedCommercialInvoiceDate.getTime())) {
      return NextResponse.json({ error: 'Invalid commercial invoice date' }, { status: 400 });
    }
    if (parsedCommercialPaymentDate instanceof Date && Number.isNaN(parsedCommercialPaymentDate.getTime())) {
      return NextResponse.json({ error: 'Invalid commercial payment date' }, { status: 400 });
    }
    if (parsedCommercialNextDueDate instanceof Date && Number.isNaN(parsedCommercialNextDueDate.getTime())) {
      return NextResponse.json({ error: 'Invalid commercial next due date' }, { status: 400 });
    }
    const includeCommercialInvoiceDate = await hasCompanyColumn("commercialInvoiceDate");
    const includeCommercialNextDueDate = await hasCompanyColumn("commercialNextDueDate");
    const includeReferralPartnerId = await hasCompanyColumn("referralPartnerId");

    const company = await prisma.company.update({
      where: { id },
      data: {
        subscriptionMonthlyPrice: monthly,
        subscriptionQuarterlyPrice: quarterly,
        subscriptionAnnualPrice: annual,
        ...(setupFee !== undefined ? { subscriptionSetupFee: setupFee } : {}),
        ...(normalizedAffiliateCode !== undefined ? { affiliateCode: normalizedAffiliateCode || null } : {}),
        ...(includeReferralPartnerId && normalizedReferralPartnerId !== undefined ? { referralPartnerId: normalizedReferralPartnerId } : {}),
        ...(normalizedReferralPartnerConsultantId !== undefined ? { referralPartnerConsultantId: normalizedReferralPartnerConsultantId } : {}),
        ...(setupReferralPercent !== undefined ? { referralSetupFeePercentage: setupReferralPercent } : {}),
        ...(recurringReferralPercent !== undefined ? { referralRecurringFeePercentage: recurringReferralPercent } : {}),
        ...(normalizedBillingMethod !== undefined ? { commercialBillingMethod: normalizedBillingMethod } : {}),
        ...(normalizedPaymentStatus !== undefined ? { commercialPaymentStatus: normalizedPaymentStatus } : {}),
        ...(commercialInvoiceNumber !== undefined ? { commercialInvoiceNumber: String(commercialInvoiceNumber || '').trim() || null } : {}),
        ...(commercialInvoiceUrl !== undefined ? { commercialInvoiceUrl: String(commercialInvoiceUrl || '').trim() || null } : {}),
        ...(includeCommercialInvoiceDate && parsedCommercialInvoiceDate !== undefined ? { commercialInvoiceDate: parsedCommercialInvoiceDate } : {}),
        ...(parsedCommercialPaymentDate !== undefined ? { commercialPaymentDate: parsedCommercialPaymentDate } : {}),
        ...(includeCommercialNextDueDate && parsedCommercialNextDueDate !== undefined ? { commercialNextDueDate: parsedCommercialNextDueDate } : {}),
        ...(commercialTermsNotes !== undefined ? { commercialTermsNotes: String(commercialTermsNotes || '').trim() || null } : {}),
        // Reset selected plan so the UI doesn't show a stale selection.
        selectedSubscriptionPlan: null,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        consultantId: true,
        subscriptionMonthlyPrice: true,
        subscriptionQuarterlyPrice: true,
        subscriptionAnnualPrice: true,
        subscriptionSetupFee: true,
        affiliateCode: true,
        ...(includeReferralPartnerId ? { referralPartnerId: true } : {}),
        referralPartnerConsultantId: true,
        referralSetupFeePercentage: true,
        referralRecurringFeePercentage: true,
        commercialBillingMethod: true,
        commercialPaymentStatus: true,
        commercialInvoiceNumber: true,
        commercialInvoiceUrl: true,
        ...(includeCommercialInvoiceDate ? { commercialInvoiceDate: true } : {}),
        commercialPaymentDate: true,
        ...(includeCommercialNextDueDate ? { commercialNextDueDate: true } : {}),
        commercialTermsNotes: true,
        selectedSubscriptionPlan: true,
      },
    });

    await auditCompanyOperation('COMPANY_PRICING_UPDATED', id);

    return NextResponse.json({ company }, { status: 200 });
  } catch (error: any) {
    console.error('Error updating company pricing:', error);
    return NextResponse.json(
      { error: 'Failed to update pricing', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE company
export async function DELETE(request: NextRequest) {
  try {
    // SECURITY: Require authentication
    const context = await requireAuth();
    console.log("🗑️ Authenticated user:", context.email, "Role:", context.role);

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("id") || searchParams.get("companyId");
    if (!companyId) {
      return NextResponse.json(
        { error: "Company ID required" },
        { status: 400 },
      );
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess("Company", companyId, "DELETE");
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to delete this company" },
        { status: 403 },
      );
    }

    const existing = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 },
      );
    }

    // Soft delete to avoid destructive cascades and keep auditability.
    const deletedName = `${existing.name} (DELETED ${new Date().toISOString()})`;
    const company = await prisma.company.update({
      where: { id: companyId },
      data: { name: deletedName, consultantId: null },
      select: { id: true, name: true },
    });

    await auditCompanyOperation("COMPANY_DELETED", companyId);

    return NextResponse.json({ success: true, company }, { status: 200 });
  } catch (error: any) {
    console.error("❌ DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete company", details: error.message },
      { status: 500 }
    );
  }
}
