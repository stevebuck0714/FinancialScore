import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '@/lib/tenant-security';

const prisma = new PrismaClient();

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
    const { id: companyId } = await params;
    const { userDefinedAllocations } = await request.json();

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'Company ID is required' }, { status: 400 });
    }

    console.log(`Updating company ${companyId} with userDefinedAllocations:`, userDefinedAllocations);

    // Update the company's userDefinedAllocations
    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: {
        userDefinedAllocations: userDefinedAllocations
      },
      select: {
        id: true,
        name: true,
        userDefinedAllocations: true
      }
    });

    console.log(`Successfully updated company ${companyId} permanent pricing`);

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
  } finally {
    await prisma.$disconnect();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireAuth();
    const { id: companyId } = await params;
    console.warn(`Blocked DELETE for company ${companyId} requested by ${context.email}`);
    return NextResponse.json(
      {
        success: false,
        error: 'Company deletion is disabled by policy.',
      },
      { status: 403 }
    );
  } catch (error: any) {
    console.error('Error in delete operation:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Delete operation failed',
    }, { status: 500 });
  } finally {
    try {
      await prisma.$disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
  }
}

