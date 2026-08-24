import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditCompanyOperation, auditForbiddenAccess } from '@/lib/audit-logger';
import prisma from '@/lib/prisma';

const COMPANY_SCOPED_TABLE_DELETE_ORDER = [
  'FinancialForecastBudgetArchive',
  'FinancialForecastInputSettings',
  'CustomReport',
  'UserCompanyAccess',
  'CompanyDocumentChunk',
  'DataRoomDocument',
  'CompanyDocument',
  'MonthlyFinancial',
  'FinancialRecord',
  'AssessmentRecord',
  'CompanyProfile',
  'AccountingConnection',
  'OperationalSystemConnection',
  'PlatosClosetMonthlyFact',
  'PlatosClosetWorkbookSnapshot',
  'ApiSyncLog',
  'PulseExecBriefingCache',
  'PulseDailySummary',
  'InforSyncTaskAttempt',
  'InforSyncTask',
  'InforSyncRun',
  'InforRawRecord',
  'InforRawBatch',
  'InforRawCompleteness',
  'InforItemOverviewCache',
  'AccountMapping',
  'XeroTransaction',
  'PaymentTransaction',
  'SubscriptionEvent',
  'Subscription',
  'RevenueRecord',
  'Loan',
  'CustomerSalesSnapshot',
  'ARAgingSnapshot',
  'AROpenInvoiceSnapshot',
  'ARPaymentFact',
  'GLTransactionFact',
  'APTransactionFact',
  'ARTransactionFact',
  'ARInvoiceDetail',
  'ARInvoiceOriginMap',
  'CustomerContractStatus',
  'CustomerCashFlow',
  'CustomerOrderLineSnapshot',
  'CustomerOrderLineFilled',
  'CustomerOrderLineFilledBackfill',
  'SalesInvoiceHeaderSnapshot',
  'APOpenBillSnapshot',
  'APPaymentFact',
  'APAgingSnapshot',
  'VendorSnapshot',
  'ProductSalesSnapshot',
  'CompanyItemDutyApplication',
  'CompanyItemDuty',
  'InventorySnapshot',
  'CashSnapshot',
  'DailyFinancialSnapshot',
  'DailyFinancialImportRun',
  'FinancialMonthPublish',
  'DailyFinancialMappedLine',
  'BalanceSheetAnchor',
  'BalanceSheetAccountAnchor',
] as const;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function getExistingCompanyScopedTables(): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ tableName: string }>>(
    `SELECT tablename AS "tableName"
     FROM pg_catalog.pg_tables
     WHERE schemaname = 'public'
       AND tablename = ANY($1::text[])`,
    COMPANY_SCOPED_TABLE_DELETE_ORDER as unknown as string[],
  );
  return new Set(rows.map((row) => row.tableName));
}

async function deleteCompanyScopedRows(tx: any, tableName: string, companyId: string) {
  await tx.$executeRawUnsafe(
    `DELETE FROM ${quoteIdentifier(tableName)} WHERE "companyId" = $1`,
    companyId,
  );
}

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

    // Hard delete all data scoped to this company. Some tables are manual or
    // recently added migrations in prod, so guard each cleanup by table existence.
    const existingCompanyScopedTables = await getExistingCompanyScopedTables();
    await prisma.$transaction(async (tx) => {
      for (const tableName of COMPANY_SCOPED_TABLE_DELETE_ORDER) {
        if (!existingCompanyScopedTables.has(tableName)) continue;
        await deleteCompanyScopedRows(tx, tableName, companyId);
      }

      // Remove direct company users after document rows so uploadedBy FKs do not
      // depend on database-specific cascade behavior.
      await tx.user.deleteMany({ where: { companyId } });

      await tx.company.delete({ where: { id: companyId } });
    }, { timeout: 30000, maxWait: 10000 });

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

