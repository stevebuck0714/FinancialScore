import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireSiteAdmin, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';


// MANUAL WORKAROUND: If you need to delete companies immediately,
// you can run this SQL directly in your database:

// For company ID 'your-company-id':
/*
UPDATE "Company"
SET "name" = CONCAT("name", ' (DELETED)'),
    "consultantId" = NULL
WHERE "id" = 'your-company-id';
*/

// Or for full deletion:
/*
DELETE FROM "PaymentTransaction" WHERE "companyId" = 'your-company-id';
DELETE FROM "RevenueRecord" WHERE "companyId" = 'your-company-id';
DELETE FROM "SubscriptionEvent" WHERE "companyId" = 'your-company-id';
DELETE FROM "Subscription" WHERE "companyId" = 'your-company-id';
DELETE FROM "CompanyProfile" WHERE "companyId" = 'your-company-id';
DELETE FROM "FinancialRecord" WHERE "companyId" = 'your-company-id';
DELETE FROM "AssessmentRecord" WHERE "companyId" = 'your-company-id';
DELETE FROM "User" WHERE "companyId" = 'your-company-id';
DELETE FROM "AccountingConnection" WHERE "companyId" = 'your-company-id';
DELETE FROM "AccountMapping" WHERE "companyId" = 'your-company-id';
DELETE FROM "Company" WHERE "id" = 'your-company-id';
*/

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireAuth();
    const { id: companyId } = await params;
    const body = await request.json();
    const { userDefinedAllocations, subscriptionMonthlyPrice, subscriptionQuarterlyPrice, subscriptionAnnualPrice } = body;

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'Company ID is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('Company', companyId, 'PATCH');
      return NextResponse.json(
        { success: false, error: 'Forbidden: Access to this company denied' },
        { status: 403 },
      );
    }

    console.log(`Updating company ${companyId} pricing`, {
      requestedBy: context.email,
      hasUserDefinedAllocations: !!userDefinedAllocations,
      subscriptionMonthlyPrice,
      subscriptionQuarterlyPrice,
      subscriptionAnnualPrice,
    });

    // NOTE: Do not write userDefinedAllocations here because some production
    // environments do not have that column yet.
    const pricingFromAllocations = userDefinedAllocations?.subscriptionPricing;
    const nextMonthly =
      subscriptionMonthlyPrice ??
      pricingFromAllocations?.monthly;
    const nextQuarterly =
      subscriptionQuarterlyPrice ??
      pricingFromAllocations?.quarterly;
    const nextAnnual =
      subscriptionAnnualPrice ??
      pricingFromAllocations?.annual;

    const updateData: any = {};
    if (nextMonthly !== undefined) updateData.subscriptionMonthlyPrice = nextMonthly;
    if (nextQuarterly !== undefined) updateData.subscriptionQuarterlyPrice = nextQuarterly;
    if (nextAnnual !== undefined) updateData.subscriptionAnnualPrice = nextAnnual;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: "No supported fields provided for update" },
        { status: 400 },
      );
    }

    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: updateData,
      select: {
        id: true,
        name: true,
        subscriptionMonthlyPrice: true,
        subscriptionQuarterlyPrice: true,
        subscriptionAnnualPrice: true,
      }
    });

    console.log(`Successfully updated company ${companyId} pricing`);

    return NextResponse.json({
      success: true,
      company: updatedCompany
    });

  } catch (error: any) {
    console.error('Database error updating company:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireSiteAdmin();
    const { id: companyId } = await params;

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'Company ID is required' }, { status: 400 });
    }

    console.log(`🛡️ Company delete requested by site admin: ${context.email}`);
    console.log(`Processing delete for company ${companyId} in ${process.env.NODE_ENV} environment (VERCEL_ENV: ${process.env.VERCEL_ENV})`);

    // PRODUCTION: Actually delete companies from database (same as staging)
    console.log('Production: Actually deleting company from database');
    // Continue with deletion logic below

    // STAGING/PREVIEW/DEV: Actually delete the company from database
    console.log(`🔥 STAGING/DEV: Actually deleting company ${companyId} from database`);
    console.log(`Environment check: NODE_ENV = ${process.env.NODE_ENV}, VERCEL_ENV = ${process.env.VERCEL_ENV}`);

    try {
      console.log(`🗑️ Starting deletion cascade for company ${companyId}`);

      // Check if company exists before deletion
      const companyExists = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true, consultantId: true }
      });

      if (!companyExists) {
        console.log(`❌ Company ${companyId} does not exist in database`);
        return NextResponse.json({
          success: true,
          message: 'Company was already deleted.',
          deleted: true
        });
      }

      console.log(`📋 Company exists: ${companyExists.name} (consultantId: ${companyExists.consultantId})`);

      // Delete related records first to avoid foreign key constraints
      console.log(`🗑️ Deleting PaymentTransaction records...`);
      const paymentDeleted = await prisma.$executeRaw`DELETE FROM "PaymentTransaction" WHERE "companyId" = ${companyId}`;
      console.log(`✅ Deleted ${paymentDeleted} PaymentTransaction records`);

      console.log(`🗑️ Deleting RevenueRecord records...`);
      const revenueDeleted = await prisma.$executeRaw`DELETE FROM "RevenueRecord" WHERE "companyId" = ${companyId}`;
      console.log(`✅ Deleted ${revenueDeleted} RevenueRecord records`);

      console.log(`🗑️ Deleting SubscriptionEvent records...`);
      const subscriptionEventDeleted = await prisma.$executeRaw`DELETE FROM "SubscriptionEvent" WHERE "companyId" = ${companyId}`;
      console.log(`✅ Deleted ${subscriptionEventDeleted} SubscriptionEvent records`);

      console.log(`🗑️ Deleting Subscription records...`);
      const subscriptionDeleted = await prisma.$executeRaw`DELETE FROM "Subscription" WHERE "companyId" = ${companyId}`;
      console.log(`✅ Deleted ${subscriptionDeleted} Subscription records`);

      console.log(`🗑️ Deleting CompanyProfile records...`);
      const profileDeleted = await prisma.$executeRaw`DELETE FROM "CompanyProfile" WHERE "companyId" = ${companyId}`;
      console.log(`✅ Deleted ${profileDeleted} CompanyProfile records`);

      console.log(`🗑️ Deleting FinancialRecord records...`);
      const financialDeleted = await prisma.$executeRaw`DELETE FROM "FinancialRecord" WHERE "companyId" = ${companyId}`;
      console.log(`✅ Deleted ${financialDeleted} FinancialRecord records`);

      console.log(`🗑️ Deleting AssessmentRecord records...`);
      const assessmentDeleted = await prisma.$executeRaw`DELETE FROM "AssessmentRecord" WHERE "companyId" = ${companyId}`;
      console.log(`✅ Deleted ${assessmentDeleted} AssessmentRecord records`);

      console.log(`🗑️ Deleting User records...`);
      const userDeleted = await prisma.$executeRaw`DELETE FROM "User" WHERE "companyId" = ${companyId}`;
      console.log(`✅ Deleted ${userDeleted} User records`);

      console.log(`🗑️ Deleting AccountingConnection records...`);
      const accountingDeleted = await prisma.$executeRaw`DELETE FROM "AccountingConnection" WHERE "companyId" = ${companyId}`;
      console.log(`✅ Deleted ${accountingDeleted} AccountingConnection records`);

      console.log(`🗑️ Deleting AccountMapping records...`);
      const mappingDeleted = await prisma.$executeRaw`DELETE FROM "AccountMapping" WHERE "companyId" = ${companyId}`;
      console.log(`✅ Deleted ${mappingDeleted} AccountMapping records`);

      // Finally delete the company
      console.log(`🗑️ Deleting the Company record...`);
      const companyDeleted = await prisma.$executeRaw`DELETE FROM "Company" WHERE "id" = ${companyId}`;
      console.log(`✅ Deleted ${companyDeleted} Company record`);

      if (companyDeleted === 0) {
        console.log(`❌ Company ${companyId} was not found for deletion (might have been deleted already)`);
      } else {
        console.log(`🎉 Successfully deleted company ${companyId} from database`);
      }

      return NextResponse.json({
        success: true,
        message: 'Company has been permanently deleted.',
        deleted: true,
        recordsDeleted: {
          paymentTransactions: paymentDeleted,
          revenueRecords: revenueDeleted,
          subscriptionEvents: subscriptionEventDeleted,
          subscriptions: subscriptionDeleted,
          companyProfiles: profileDeleted,
          financialRecords: financialDeleted,
          assessmentRecords: assessmentDeleted,
          users: userDeleted,
          accountingConnections: accountingDeleted,
          accountMappings: mappingDeleted,
          companies: companyDeleted
        }
      });
    } catch (dbError: any) {
      console.error('❌ Database error during delete:', dbError);
      console.error('Stack trace:', dbError.stack);
      throw dbError;
    }

  } catch (error: any) {
    console.error('Error in delete operation:', error);
    const status = error?.message?.includes('Unauthorized')
      ? 401
      : error?.message?.includes('Forbidden')
      ? 403
      : 500;
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to delete company' },
      { status },
    );
  }
}

