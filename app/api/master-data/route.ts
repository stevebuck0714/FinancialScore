import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { privateCacheHeaders } from '@/lib/http-cache';
import { hashCacheParts, readDerivedApiCache, writeDerivedApiCache } from '@/lib/derived-api-cache';

const MASTER_DATA_CACHE_TTL_SECONDS = 120;
const MASTER_DATA_REPORT_MIN_DATE = '2024-01-01';
const MASTER_DATA_REPORT_MIN_DATE_UTC = new Date(`${MASTER_DATA_REPORT_MIN_DATE}T00:00:00.000Z`);

const toNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const collectPrefixedValues = (
  month: Record<string, unknown>,
  breakdown: Record<string, unknown>,
  prefix: 'rev_' | 'cogs_',
): Record<string, number> => {
  const collected: Record<string, number> = {};

  Object.entries(breakdown || {}).forEach(([key, value]) => {
    if (!key.startsWith(prefix)) return;
    if (prefix === 'cogs_' && key === 'cogs_total') return;
    collected[key] = toNumber(value);
  });

  Object.entries(month || {}).forEach(([key, value]) => {
    if (!key.startsWith(prefix)) return;
    if (prefix === 'cogs_' && key === 'cogs_total') return;
    collected[key] = toNumber(value);
  });

  return collected;
};

async function buildMasterDataVersion(companyId: string, scope: 'published' | 'all'): Promise<string> {
  const [financialRows, monthlyRows, publishRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT COUNT(*)::text AS count, MAX("updatedAt") AS "maxUpdatedAt", MAX("createdAt") AS "maxCreatedAt"
       FROM "FinancialRecord"
       WHERE "companyId" = $1`,
      companyId
    ).catch((error: any) => [{ unavailable: true, error: String(error?.message || error).slice(0, 120) }]),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("monthDate") AS "maxMonthDate"
       FROM "MonthlyFinancial"
       WHERE "companyId" = $1
         AND "monthDate" >= $2`,
      companyId,
      MASTER_DATA_REPORT_MIN_DATE_UTC
    ).catch((error: any) => [{ unavailable: true, error: String(error?.message || error).slice(0, 120) }]),
    scope === 'published'
      ? prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT COUNT(*)::text AS count, MAX("updatedAt") AS "maxUpdatedAt", MAX("monthStart") AS "maxMonthStart"
           FROM "FinancialMonthPublish"
           WHERE "companyId" = $1
             AND "monthStart" >= $2`,
          companyId,
          MASTER_DATA_REPORT_MIN_DATE_UTC
        ).catch((error: any) => [{ unavailable: true, error: String(error?.message || error).slice(0, 120) }])
      : Promise.resolve([{ skipped: true }]),
  ]);
  return hashCacheParts([financialRows, monthlyRows, publishRows]);
}

// GET - Load Master data for a company from database
//
// Query params:
//   companyId  (required) - target company
//   scope      (optional) - 'published' (default) | 'all'
//                           'published' returns only months whose
//                           FinancialMonthPublish.status is PUBLISHED or LOCKED.
//                           'all' returns every month present in the latest
//                           FinancialRecord (including the in-progress month).
//                           Use 'all' only for Operations / Data Review.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const scopeRaw = (searchParams.get('scope') || 'published').toLowerCase();
    const scope: 'published' | 'all' = scopeRaw === 'all' ? 'all' : 'published';

    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing companyId parameter' },
        { status: 400 }
      );
    }

    const cacheContext = {
      namespace: 'master-data',
      cacheKey: hashCacheParts([companyId, scope, MASTER_DATA_REPORT_MIN_DATE]),
      dataVersion: await buildMasterDataVersion(companyId, scope),
    };
    const cachedPayload = await readDerivedApiCache<any>(cacheContext);
    if (cachedPayload) {
      return NextResponse.json(cachedPayload, { headers: privateCacheHeaders(scope === 'published' ? 120 : 30, 300) });
    }

    // Fetch the latest financial record for this company
    const latestRecord = await prisma.financialRecord.findFirst({
      where: { companyId },
      select: {
        monthlyData: {
          where: {
            monthDate: { gte: MASTER_DATA_REPORT_MIN_DATE_UTC },
          },
          orderBy: { monthDate: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestRecord || !latestRecord.monthlyData || latestRecord.monthlyData.length === 0) {
      // For ERP COA mapping-first workflows (for example CSI), it is valid to have
      // account mappings loaded before monthly financial snapshots exist.
      // Return an empty successful payload so the UI can keep operating.
      const emptyPayload = {
        success: true,
        monthlyData: [],
        expenseCategories: [],
        _source: 'database',
        _scope: scope,
        months: 0,
      };
      await writeDerivedApiCache({
        ...cacheContext,
        payload: emptyPayload,
        ttlSeconds: MASTER_DATA_CACHE_TTL_SECONDS,
      }).catch((error) => {
        console.warn('Master data cache write failed:', error);
      });
      return NextResponse.json(emptyPayload, { headers: privateCacheHeaders(60, 300) });
    }

    // Apply the publish gate when scope === 'published'.
    // We compare on UTC start-of-month so MonthlyFinancial.monthDate matches
    // FinancialMonthPublish.monthStart regardless of timezone storage quirks.
    let publishedKeys: Set<string> | null = null;
    if (scope === 'published') {
      const publishedRows = await prisma.financialMonthPublish.findMany({
        where: {
          companyId,
          status: { in: ['PUBLISHED', 'LOCKED'] },
          monthStart: { gte: MASTER_DATA_REPORT_MIN_DATE_UTC },
        },
        select: { monthStart: true },
      });
      publishedKeys = new Set(
        publishedRows.map((r) => {
          const d = r.monthStart;
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        })
      );
    }

    const sourceRows = (publishedKeys
      ? latestRecord.monthlyData.filter((m: any) => {
          const d = m?.monthDate ? new Date(m.monthDate) : null;
          if (!d || Number.isNaN(d.getTime())) return false;
          const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          return publishedKeys!.has(key);
        })
      : latestRecord.monthlyData);

    // Format monthly data to match expected structure
    const monthlyData = sourceRows.map((month: any) => {
      const cash = month.cash || 0;
      const ar = month.ar || 0;
      const retainageReceivables = month.retainageReceivables || 0;
      const contractAssets = month.contractAssets || 0;
      const inventory = month.inventory || 0;
      const otherCA = month.otherCA || 0;
      const ap = month.ap || 0;
      const loc = month.loc || 0;
      const contractLiabilities = month.contractLiabilities || 0;
      const otherCL = month.otherCL || 0;

      // Some legacy master-data shapes omitted tca/tcl; provide explicit fields with safe fallbacks.
      const tca = month.tca ?? (cash + ar + retainageReceivables + contractAssets + inventory + otherCA);
      const tcl = month.tcl ?? (ap + loc + contractLiabilities + otherCL);

      const revenueBreakdown = month.revenueBreakdown && typeof month.revenueBreakdown === 'object'
        ? month.revenueBreakdown
        : {};
      const cogsBreakdown = month.cogsBreakdown && typeof month.cogsBreakdown === 'object'
        ? month.cogsBreakdown
        : {};
      const expenseBreakdown = month.expenseBreakdown && typeof month.expenseBreakdown === 'object'
        ? month.expenseBreakdown
        : {};
      const nonOperatingIncomeFromBreakdown = Number(
        (expenseBreakdown as any).nonOperatingIncome ||
        (expenseBreakdown as any).nonOpertingIncome ||
        0,
      );
      const nonOperatingIncome = Number(
        month.nonOperatingIncome ||
        month.nonOpertingIncome ||
        month.non_operating_income ||
        0,
      ) || nonOperatingIncomeFromBreakdown;
      const nonOperatingExpenseFromBreakdown = Number(
        (expenseBreakdown as any).nonOperatingExpense ||
        (expenseBreakdown as any).nonOpertingExpense ||
        0,
      );
      const nonOperatingExpense = Number(
        month.nonOperatingExpense ||
        month.nonOpertingExpense ||
        month.non_operating_expense ||
        0,
      ) || nonOperatingExpenseFromBreakdown;

      const revenueFields = collectPrefixedValues(month, revenueBreakdown as Record<string, unknown>, 'rev_');
      const cogsFields = collectPrefixedValues(month, cogsBreakdown as Record<string, unknown>, 'cogs_');
      const hasSectorRevenue = Object.keys(revenueFields).length > 0;
      const hasSectorCogs = Object.keys(cogsFields).length > 0;
      const sectorRevenueTotal = Object.values(revenueFields).reduce((sum, value) => sum + toNumber(value), 0);
      const sectorCogsTotal = Object.values(cogsFields).reduce((sum, value) => sum + toNumber(value), 0);

      return {
      date: month.monthDate,
      month: month.monthDate,
      monthDate: month.monthDate,
      revenue: hasSectorRevenue ? sectorRevenueTotal : toNumber(month.revenue),
      expense: month.expense || 0,
      cogsPayroll: hasSectorCogs ? 0 : month.cogsPayroll || 0,
      cogsOwnerPay: hasSectorCogs ? 0 : month.cogsOwnerPay || 0,
      cogsContractors: hasSectorCogs ? 0 : month.cogsContractors || 0,
      cogsMaterials: hasSectorCogs ? 0 : month.cogsMaterials || 0,
      cogsCommissions: hasSectorCogs ? 0 : month.cogsCommissions || 0,
      cogsOther: hasSectorCogs ? 0 : month.cogsOther || 0,
      cogsTotal: hasSectorCogs ? sectorCogsTotal : toNumber(month.cogsTotal),
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
      nonOperatingIncome,
      nonOperatingExpense,
      extraordinaryItems: month.extraordinaryItems || 0,
      cash,
      ar,
      retainageReceivables,
      contractAssets,
      inventory,
      otherCA,
      tca,
      fixedAssets: month.fixedAssets || 0,
      constructionEquipment: month.constructionEquipment || 0,
      officeEquipment: month.officeEquipment || 0,
      shopEquipment: month.shopEquipment || 0,
      investments: month.investments || 0,
      rightOfUseLeases: month.rightOfUseLeases || 0,
      otherAssets: month.otherAssets || 0,
      totalAssets: month.totalAssets || 0,
      ap,
      loc,
      contractLiabilities,
      otherCL,
      tcl,
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
      revenueBreakdown,
      expenseBreakdown,
      cogsBreakdown,
      ...revenueBreakdown,
      ...expenseBreakdown,
      ...cogsBreakdown
      };
    });

    console.log(`✅ Master data loaded from database for company: ${companyId}`);
    console.log(`📊 Loaded ${monthlyData.length} months of Master data`);
    
    // Debug: Log sample month to verify income tax fields are present
    if (monthlyData.length > 0) {
      const sampleMonth = monthlyData[monthlyData.length - 1];
      console.log(`🔍 Sample month (latest) income tax fields:`, {
        monthDate: sampleMonth.date || sampleMonth.month,
        stateIncomeTaxes: sampleMonth.stateIncomeTaxes,
        federalIncomeTaxes: sampleMonth.federalIncomeTaxes,
        stateType: typeof sampleMonth.stateIncomeTaxes,
        federalType: typeof sampleMonth.federalIncomeTaxes,
        marketing: sampleMonth.marketing,
        marketingType: typeof sampleMonth.marketing
      });
      
      // Check for November 2025 specifically
      const nov2025 = monthlyData.find((m: any) => {
        const dateValue = m.date || m.month;
        if (!dateValue) return false;
        const dateStr = typeof dateValue === 'string' ? dateValue : (dateValue instanceof Date ? dateValue.toISOString() : String(dateValue));
        const dateObj = dateValue instanceof Date ? dateValue : new Date(dateValue);
        if (isNaN(dateObj.getTime())) return false;
        return dateObj.getUTCFullYear() === 2025 && dateObj.getUTCMonth() === 10; // Month is 0-indexed, so 10 = November
      });
      if (nov2025) {
        console.log(`📅 November 2025 data:`, {
          monthDate: nov2025.date || nov2025.month,
          federalIncomeTaxes: nov2025.federalIncomeTaxes,
          federalIncomeTaxesType: typeof nov2025.federalIncomeTaxes,
          stateIncomeTaxes: nov2025.stateIncomeTaxes,
          marketing: nov2025.marketing
        });
      }
    }

    const payload = {
      success: true,
      monthlyData,
      expenseCategories: [],
      _source: 'database',
      _scope: scope,
      months: monthlyData.length
    };
    await writeDerivedApiCache({
      ...cacheContext,
      payload,
      ttlSeconds: MASTER_DATA_CACHE_TTL_SECONDS,
    }).catch((cacheError) => {
      console.warn('Master data cache write failed:', cacheError);
    });
    return NextResponse.json(payload, { headers: privateCacheHeaders(scope === 'published' ? 120 : 30, 300) });
  } catch (error: any) {
    console.error('Error loading master data:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Save/update expense categories for a company
export async function POST(request: NextRequest) {
  try {
    const { companyId, expenseCategories } = await request.json();
    
    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing companyId' },
        { status: 400 }
      );
    }
    
    // Update the latest financial record with expense categories
    const latestRecord = await prisma.financialRecord.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestRecord) {
      return NextResponse.json(
        { error: 'No financial record found for this company' },
        { status: 404 }
      );
    }

    // FinancialRecord currently has no dedicated expenseCategories column.
    // Keep this endpoint non-breaking for callers until a persistence model is added.
    console.log(`✅ Master data update request accepted for company: ${companyId}`);
    console.log(`📊 Received expense categories: ${expenseCategories?.length || 0} categories`);
    
    return NextResponse.json({ 
      success: true,
      companyId,
      expenseCategories: expenseCategories?.length || 0
    });
  } catch (error: any) {
    console.error('Error saving master data:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

