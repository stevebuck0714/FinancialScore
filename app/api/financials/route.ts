import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { auditFinancialAccess, auditForbiddenAccess } from '@/lib/audit-logger';
import { financialQuerySchema, validateInput } from '@/lib/validation-schemas';
import { withPrismaReconnectRetry } from '@/lib/prisma-retry';

// Financial data must always be live - never cache at the Next.js fetch cache or
// CDN edge layer. Without this, the App Router's default fetch cache can serve a
// stale snapshot from Vercel's edge to /api/financials callers (e.g. the parent
// page's monthly-data loader), causing reports to display old months even after
// new data has been published. See docs/DAILY_TRIAL_BALANCE_MONTH_END_PUBLISH_PLAN.md
// for the broader two-lane data architecture this guarantees.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

// GET financial records for a company
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const includeRawData = searchParams.get('includeRawData') === 'true';
    const includeAllRecords = searchParams.get('includeAllRecords') === 'true';

    // Validate input
    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // SECURITY: Validate tenant access
    try {
      await requireCompanyAccess(companyId);
    } catch (error) {
      await auditForbiddenAccess('FinancialRecord', companyId, 'READ');
      return NextResponse.json(
        { error: 'Forbidden: Access to this company denied' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    // Fetch records (user has validated access)
    const records = await withPrismaReconnectRetry(
      () =>
        prisma.financialRecord.findMany({
          where: { companyId },
          select: {
            id: true,
            companyId: true,
            uploadedByUserId: true,
            fileName: true,
            fileUrl: true,
            rawData: includeRawData,
            columnMapping: true,
            createdAt: true,
            updatedAt: true,
            monthlyData: {
              orderBy: { monthDate: 'asc' }
            },
          },
          orderBy: { createdAt: 'desc' },
          ...(includeAllRecords ? {} : { take: 1 }),
        }),
      'financials.get.findMany'
    );

    // AUDIT: Log financial data access
    if (records.length > 0) {
      await auditFinancialAccess('FINANCIAL_RECORD_VIEWED', records[0].id, companyId);
    }

    return NextResponse.json({ records }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching financial records:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// POST create/upload new financial record
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, uploadedByUserId, fileName, rawData, columnMapping, monthlyData } = body;

    // Validate required fields
    if (!companyId || !uploadedByUserId || !fileName || !rawData || !columnMapping) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // SECURITY: Validate tenant access
    try {
      await requireCompanyAccess(companyId);
    } catch (error) {
      await auditForbiddenAccess('FinancialRecord', companyId, 'CREATE');
      return NextResponse.json(
        { error: 'Forbidden: Access to this company denied' },
        { status: 403 }
      );
    }

    // SECURITY: Validate uploaded by user matches authenticated user
    const context = await requireCompanyAccess(companyId);
    if (uploadedByUserId !== context.userId && context.role !== 'SITEADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Cannot upload as another user' },
        { status: 403 }
      );
    }

    // Delete previous financial records for this company
    await prisma.financialRecord.deleteMany({
      where: { companyId }
    });

    // Create new financial record with monthly data
    const financialRecord = await prisma.financialRecord.create({
      data: {
        companyId,
        uploadedByUserId,
        fileName,
        rawData,
        columnMapping,
        monthlyData: {
          create: monthlyData.map((month: any) => {
            // Handle date from monthDate or date field
            const dateValue = month.monthDate || month.date;
            const parsedDate = new Date(dateValue);
            
            // Validate the date is valid
            if (isNaN(parsedDate.getTime())) {
              console.error(`Invalid date for month record: ${dateValue}`, month);
              throw new Error(`Invalid date: ${dateValue}`);
            }
            
            const derivedRevenueBreakdown =
              month.revenueBreakdown && typeof month.revenueBreakdown === "object"
                ? month.revenueBreakdown
                : Object.keys(month).reduce((acc: Record<string, number>, key) => {
                    if (key.startsWith("rev_")) {
                      const value = Number(month[key] || 0);
                      if (value !== 0) acc[key] = value;
                    }
                    return acc;
                  }, {});

            const derivedCogsBreakdown =
              month.cogsBreakdown && typeof month.cogsBreakdown === "object"
                ? month.cogsBreakdown
                : Object.keys(month).reduce((acc: Record<string, number>, key) => {
                    if (key.startsWith("cogs_")) {
                      const value = Number(month[key] || 0);
                      if (value !== 0) acc[key] = value;
                    }
                    return acc;
                  }, {});
            const derivedExpenseBreakdown =
              month.expenseBreakdown && typeof month.expenseBreakdown === "object"
                ? { ...month.expenseBreakdown }
                : {};
            if (Number(month.nonOperatingExpense || 0) !== 0) {
              derivedExpenseBreakdown.nonOperatingExpense = Number(month.nonOperatingExpense || 0);
            }

            return {
            companyId: companyId,
            monthDate: parsedDate,
            revenue: month.revenue || 0,
            revenueBreakdown:
              Object.keys(derivedRevenueBreakdown).length > 0 ? derivedRevenueBreakdown : null,
            expense: month.expense || 0,
            expenseBreakdown:
              Object.keys(derivedExpenseBreakdown).length > 0 ? derivedExpenseBreakdown : null,
            cogsPayroll: month.cogsPayroll || 0,
            cogsOwnerPay: month.cogsOwnerPay || 0,
            cogsContractors: month.cogsContractors || 0,
            cogsMaterials: month.cogsMaterials || 0,
            cogsCommissions: month.cogsCommissions || 0,
            cogsOther: month.cogsOther || 0,
            cogsTotal: month.cogsTotal || 0,
            cogsBreakdown: Object.keys(derivedCogsBreakdown).length > 0 ? derivedCogsBreakdown : null,
            payroll: month.payroll || 0,
            ownerBasePay: month.ownerBasePay || 0,
            benefits: month.benefits || 0,
            insurance: month.insurance || 0,
            professionalFees: month.professionalFees || 0,
            subcontractors: month.subcontractors || 0,
            rent: month.rent || 0,
            taxLicense: month.taxLicense || 0,
            stateIncomeTaxes: month.stateIncomeTaxes || 0,
            federalIncomeTaxes: month.federalIncomeTaxes || 0,
            phoneComm: month.phoneComm || 0,
            infrastructure: month.infrastructure || 0,
            autoTravel: month.autoTravel || 0,
            salesExpense: month.salesExpense || 0,
            marketing: month.marketing || 0,
            trainingCert: month.trainingCert || 0,
            mealsEntertainment: month.mealsEntertainment || 0,
            interestExpense: month.interestExpense || 0,
            depreciationAmortization: month.depreciationAmortization || 0,
            otherExpense: month.otherExpense || 0,
            nonOperatingIncome: month.nonOperatingIncome || 0,
            extraordinaryItems: month.extraordinaryItems || 0,
            cash: month.cash || 0,
            ar: month.ar || 0,
            inventory: month.inventory || 0,
            otherCA: month.otherCA || 0,
            tca: month.tca || 0,
            fixedAssets: month.fixedAssets || 0,
            otherAssets: month.otherAssets || 0,
            totalAssets: month.totalAssets || 0,
            ap: month.ap || 0,
            // Preserve line-of-credit values even when this runtime client does not expose a dedicated `loc` create field.
            otherCL: (month.otherCL || 0) + (month.loc || 0),
            tcl: month.tcl || 0,
            ltd: month.ltd || 0,
            totalLiab: month.totalLiab || 0,
            ownersCapital: month.ownersCapital || 0,
            ownersDraw: month.ownersDraw || 0,
            commonStock: month.commonStock || 0,
            preferredStock: month.preferredStock || 0,
            retainedEarnings: month.retainedEarnings || 0,
            additionalPaidInCapital: month.additionalPaidInCapital || 0,
            treasuryStock: month.treasuryStock || 0,
            totalEquity: month.totalEquity || 0,
            totalLAndE: month.totalLAndE || 0,
            lobBreakdowns: month.lobBreakdowns || null
};})
        }
      },
      include: {
        monthlyData: {
          orderBy: { monthDate: 'asc' }
        }
      }
    });

    // AUDIT: Log financial record creation
    await auditFinancialAccess('FINANCIAL_RECORD_CREATED', financialRecord.id, companyId, {
      fileName,
      monthCount: financialRecord.monthlyData.length,
    });

    console.log(`✅ Financial record created with ${financialRecord.monthlyData.length} months of data`);

    return NextResponse.json({ record: financialRecord }, { status: 201 });
  } catch (error) {
    console.error('Error creating financial record:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}

// DELETE financial record
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Record ID required' },
        { status: 400 }
      );
    }

    // SECURITY: First, check if record exists and get its companyId
    const record = await prisma.financialRecord.findUnique({
      where: { id },
      select: { id: true, companyId: true, fileName: true }
    });

    if (!record) {
      return NextResponse.json(
        { error: 'Record not found' },
        { status: 404 }
      );
    }

    // SECURITY: Validate tenant access to the company
    try {
      await requireCompanyAccess(record.companyId);
    } catch (error) {
      await auditForbiddenAccess('FinancialRecord', id, 'DELETE');
      return NextResponse.json(
        { error: 'Forbidden: Access to this company denied' },
        { status: 403 }
      );
    }

    // Delete the record (cascading delete will handle monthly data)
    await prisma.financialRecord.delete({
      where: { id }
    });

    // AUDIT: Log deletion
    await auditFinancialAccess('FINANCIAL_RECORD_DELETED', id, record.companyId, {
      fileName: record.fileName,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting financial record:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

