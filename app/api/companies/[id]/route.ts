import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditCompanyOperation, auditForbiddenAccess } from '@/lib/audit-logger';
import prisma from '@/lib/prisma';

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
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireAuth();
    const normalizedRole = String(context.role || '').toUpperCase();
    const { id: companyId } = await params;

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'Company ID is required' }, { status: 400 });
    }

    const hasDeleteConfirmation = request.headers.get('x-confirm-delete') === 'true';
    if (!hasDeleteConfirmation) {
      await auditForbiddenAccess('Company', companyId, 'DELETE_MISSING_CONFIRMATION');
      return NextResponse.json(
        { success: false, error: 'Delete confirmation header is required.' },
        { status: 400 }
      );
    }

    if (normalizedRole !== 'SITEADMIN' && normalizedRole !== 'CONSULTANT') {
      await auditForbiddenAccess('Company', companyId, 'DELETE');
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only consultants and site admins can remove companies.' },
        { status: 403 }
      );
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('Company', companyId, 'DELETE');
      return NextResponse.json(
        { success: false, error: 'Forbidden: Access to this company denied' },
        { status: 403 }
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      await auditCompanyOperation('COMPANY_DELETED', companyId, {
        mode: 'hard-delete',
        result: 'already-removed',
      });
      return NextResponse.json({
        success: true,
        hardDelete: true,
        message: 'Company was already removed.',
      });
    }

    // Hard delete all data scoped to this company.
    // Some models do not have FK cascades, so we explicitly clean them.
    await prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.deleteMany({ where: { companyId } });
      await tx.customerSalesSnapshot.deleteMany({ where: { companyId } });
      await tx.aRAgingSnapshot.deleteMany({ where: { companyId } });
      await tx.aPAgingSnapshot.deleteMany({ where: { companyId } });
      await tx.productSalesSnapshot.deleteMany({ where: { companyId } });
      await tx.inventorySnapshot.deleteMany({ where: { companyId } });
      await tx.cashSnapshot.deleteMany({ where: { companyId } });

      // Keep this explicit even when some tables have FK cascade.
      await tx.subscriptionEvent.deleteMany({ where: { companyId } });
      await tx.subscription.deleteMany({ where: { companyId } });
      await tx.revenueRecord.deleteMany({ where: { companyId } });
      await tx.companyProfile.deleteMany({ where: { companyId } });
      await tx.financialRecord.deleteMany({ where: { companyId } });
      await tx.assessmentRecord.deleteMany({ where: { companyId } });
      await tx.user.deleteMany({ where: { companyId } });
      await tx.accountingConnection.deleteMany({ where: { companyId } });
      await tx.accountMapping.deleteMany({ where: { companyId } });
      await tx.apiSyncLog.deleteMany({ where: { companyId } });
      await tx.companyDocumentChunk.deleteMany({ where: { companyId } });
      await tx.companyDocument.deleteMany({ where: { companyId } });
      await (tx as any).dataRoomDocument.deleteMany({ where: { companyId } });
      await tx.loan.deleteMany({ where: { companyId } });

      await tx.company.delete({ where: { id: companyId } });
    });

    console.log(`Hard-deleted company ${companyId} requested by ${context.email}`);
    await auditCompanyOperation('COMPANY_DELETED', companyId, {
      mode: 'hard-delete',
      deletedBy: context.email,
      deletedByRole: normalizedRole,
    });
    return NextResponse.json({
      success: true,
      hardDelete: true,
      message: 'Company and related data deleted successfully.',
    });
  } catch (error: any) {
    console.error('Error in delete operation:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Delete operation failed',
    }, { status: 500 });
  }
}

