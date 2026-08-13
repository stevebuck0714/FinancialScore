import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { auditFinancialAccess, auditForbiddenAccess } from '@/lib/audit-logger';
import { financialQuerySchema, validateInput } from '@/lib/validation-schemas';
import { withPrismaReconnectRetry } from '@/lib/prisma-retry';
import { hashCacheParts, readDerivedApiCache, writeDerivedApiCache } from '@/lib/derived-api-cache';
import { privateCacheHeaders } from '@/lib/http-cache';
import { presentCompanyJson } from '@/lib/currency/api-response';

const FINANCIALS_CACHE_TTL_SECONDS = 120;

const isQuickBooksDesktopFamily = (value: unknown): boolean => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'QUICKBOOKS_DESKTOP' || normalized === 'QUICKBOOKS_ENTERPRISE';
};

const toNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

function monthlyNetIncome(row: any): number {
  return (
    toNumber(row?.revenue) -
    toNumber(row?.cogsTotal) -
    toNumber(row?.expense) +
    toNumber(row?.nonOperatingIncome) -
    toNumber(row?.nonOperatingExpense) +
    toNumber(row?.extraordinaryItems) -
    toNumber(row?.stateIncomeTaxes) -
    toNumber(row?.federalIncomeTaxes)
  );
}

function withQbdCurrentYearNetIncome(records: any[], enabled: boolean): any[] {
  if (!enabled) return records;
  return records.map((record) => {
    const ytdByYear = new Map<number, number>();
    const monthlyData = Array.isArray(record?.monthlyData)
      ? record.monthlyData.map((row: any) => {
          const monthDate = row?.monthDate ? new Date(row.monthDate) : null;
          if (!monthDate || Number.isNaN(monthDate.getTime())) return row;
          const year = monthDate.getUTCFullYear();
          const currentYearNetIncome = Number(ytdByYear.get(year) || 0) + monthlyNetIncome(row);
          ytdByYear.set(year, currentYearNetIncome);
          const totalEquity =
            toNumber(row.ownersCapital) +
            toNumber(row.ownersDraw) +
            toNumber(row.commonStock) +
            toNumber(row.preferredStock) +
            toNumber(row.retainedEarnings) +
            currentYearNetIncome +
            toNumber(row.additionalPaidInCapital) +
            toNumber(row.treasuryStock);
          const totalLiab = toNumber(row.totalLiab);
          return {
            ...row,
            currentYearNetIncome,
            totalEquity,
            totalLAndE: totalLiab + totalEquity,
          };
        })
      : record?.monthlyData;
    return { ...record, monthlyData };
  });
}

async function buildFinancialsDataVersion(companyId: string): Promise<string> {
  const [financialRows, monthlyRows, publishRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT COUNT(*)::text AS count, MAX("updatedAt") AS "maxUpdatedAt", MAX("createdAt") AS "maxCreatedAt"
       FROM "FinancialRecord"
       WHERE "companyId" = $1`,
      companyId
    ).catch((error: any) => [{ unavailable: true, error: String(error?.message || error).slice(0, 120) }]),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT
         COUNT(*)::text AS count,
         MAX("createdAt") AS "maxCreatedAt",
         MAX("monthDate") AS "maxMonthDate",
         SUM("commonStock")::text AS "commonStockChecksum",
         SUM("totalEquity")::text AS "totalEquityChecksum",
         SUM("totalLAndE")::text AS "totalLAndEChecksum"
       FROM "MonthlyFinancial"
       WHERE "companyId" = $1`,
      companyId
    ).catch((error: any) => [{ unavailable: true, error: String(error?.message || error).slice(0, 120) }]),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT COUNT(*)::text AS count, MAX("updatedAt") AS "maxUpdatedAt", MAX("monthStart") AS "maxMonthStart"
       FROM "FinancialMonthPublish"
       WHERE "companyId" = $1`,
      companyId
    ).catch((error: any) => [{ unavailable: true, error: String(error?.message || error).slice(0, 120) }]),
  ]);
  return hashCacheParts([financialRows, monthlyRows, publishRows]);
}

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
        { status: 400 }
      );
    }

    // SECURITY: Validate tenant access
    try {
      await requireCompanyAccess(companyId);
    } catch (error) {
      await auditForbiddenAccess('FinancialRecord', companyId, 'READ');
      return NextResponse.json(
        { error: 'Forbidden: Access to this company denied' },
        { status: 403 }
      );
    }

    const cacheableRequest = !includeRawData;
    const cacheContext = cacheableRequest
      ? {
          namespace: 'financials',
          cacheKey: hashCacheParts([companyId, includeAllRecords, 'qbd-current-year-net-income-v1']),
          dataVersion: await buildFinancialsDataVersion(companyId),
        }
      : null;

    if (cacheContext) {
      const cachedPayload = await readDerivedApiCache<{ records: any[] }>(cacheContext);
      if (cachedPayload) {
        if (cachedPayload.records?.length > 0) {
          await auditFinancialAccess('FINANCIAL_RECORD_VIEWED', cachedPayload.records[0].id, companyId);
        }
        const presented = await presentCompanyJson(request, companyId, cachedPayload);
        return NextResponse.json(presented, { headers: privateCacheHeaders(FINANCIALS_CACHE_TTL_SECONDS, 300) });
      }
    }

    // Fetch records (user has validated access)
    const [company, records] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { accountingSystem: true },
      }),
      withPrismaReconnectRetry(
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
      ),
    ]);
    const responseRecords = withQbdCurrentYearNetIncome(records, isQuickBooksDesktopFamily(company?.accountingSystem));

    // AUDIT: Log financial data access
    if (responseRecords.length > 0) {
      await auditFinancialAccess('FINANCIAL_RECORD_VIEWED', responseRecords[0].id, companyId);
    }

    const payload = { records: responseRecords };
    if (cacheContext) {
      await writeDerivedApiCache({
        ...cacheContext,
        payload,
        ttlSeconds: FINANCIALS_CACHE_TTL_SECONDS,
      }).catch((error) => {
        console.warn('Financials cache write failed:', error);
      });
    }

    const presented = await presentCompanyJson(request, companyId, payload);
    return NextResponse.json(presented, { headers: privateCacheHeaders(FINANCIALS_CACHE_TTL_SECONDS, 300) });
  } catch (error) {
    console.error('Error fetching financial records:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
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
            retainageReceivables: month.retainageReceivables || 0,
            contractAssets: month.contractAssets || 0,
            inventory: month.inventory || 0,
            otherCA: month.otherCA || 0,
            tca: month.tca || 0,
            fixedAssets: month.fixedAssets || 0,
            constructionEquipment: month.constructionEquipment || 0,
            officeEquipment: month.officeEquipment || 0,
            shopEquipment: month.shopEquipment || 0,
            investments: month.investments || 0,
            rightOfUseLeases: month.rightOfUseLeases || 0,
            otherAssets: month.otherAssets || 0,
            totalAssets: month.totalAssets || 0,
            ap: month.ap || 0,
            loc: month.loc || 0,
            contractLiabilities: month.contractLiabilities || 0,
            otherCL: month.otherCL || 0,
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

