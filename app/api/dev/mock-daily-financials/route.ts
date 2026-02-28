import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { ingestDailyFinancialSnapshots } from '@/lib/financial/daily-financial-ingest';

export const dynamic = 'force-dynamic';

function toIsoDay(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function buildMockDay(date: Date, dayIndex: number) {
  const seasonality = Math.sin(dayIndex / 5) * 1800;
  const revenue = Math.max(12000, 28000 + seasonality + dayIndex * 35);

  const cogsPayroll = revenue * 0.18;
  const cogsContractors = revenue * 0.06;
  const cogsMaterials = revenue * 0.09;
  const cogsTotal = cogsPayroll + cogsContractors + cogsMaterials;

  const payroll = revenue * 0.13;
  const rent = 2200;
  const marketing = revenue * 0.04;
  const phoneComm = 420;
  const professionalFees = 640;
  const otherExpense = 560;
  const expense = payroll + rent + marketing + phoneComm + professionalFees + otherExpense;

  const ar = revenue * 0.34;
  const inventory = revenue * 0.08;
  const cash = 42000 + dayIndex * 1400;
  const otherCA = 5000;
  const tca = cash + ar + inventory + otherCA;
  const fixedAssets = 105000;
  const otherAssets = 18000;
  const totalAssets = tca + fixedAssets + otherAssets;

  const ap = cogsTotal * 0.22;
  const otherCL = 6200;
  const tcl = ap + otherCL;
  const ltd = 42000;
  const totalLiab = tcl + ltd;
  const retainedEarnings = 54000 + dayIndex * 460;
  const ownersCapital = 32000;
  const totalEquity = ownersCapital + retainedEarnings;
  const totalLAndE = totalLiab + totalEquity;

  return {
    snapshotDate: toIsoDay(date),
    frequency: 'daily',
    revenue,
    expense,
    cogsPayroll,
    cogsContractors,
    cogsMaterials,
    cogsTotal,
    payroll,
    rent,
    marketing,
    phoneComm,
    professionalFees,
    otherExpense,
    cash,
    ar,
    inventory,
    otherCA,
    tca,
    fixedAssets,
    otherAssets,
    totalAssets: Math.max(totalAssets, totalLAndE),
    ap,
    otherCL,
    tcl,
    ltd,
    totalLiab,
    ownersCapital,
    retainedEarnings,
    totalEquity,
    totalLAndE,
  };
}

function buildMappedLines(snapshotDate: string, day: ReturnType<typeof buildMockDay>) {
  return [
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Service Revenue', sourceAccountId: '4000', sourceAccountType: 'Income', targetField: 'revenue', amount: day.revenue * 0.72 },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Maintenance Revenue', sourceAccountId: '4010', sourceAccountType: 'Income', targetField: 'revenue', amount: day.revenue * 0.28 },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Direct Labor', sourceAccountId: '5000', sourceAccountType: 'COGS', targetField: 'cogsPayroll', amount: day.cogsPayroll },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Subcontractors', sourceAccountId: '5010', sourceAccountType: 'COGS', targetField: 'cogsContractors', amount: day.cogsContractors },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Materials', sourceAccountId: '5020', sourceAccountType: 'COGS', targetField: 'cogsMaterials', amount: day.cogsMaterials },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Office Payroll', sourceAccountId: '6100', sourceAccountType: 'Expense', targetField: 'payroll', amount: day.payroll },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Rent', sourceAccountId: '6200', sourceAccountType: 'Expense', targetField: 'rent', amount: day.rent },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Marketing', sourceAccountId: '6300', sourceAccountType: 'Expense', targetField: 'marketing', amount: day.marketing },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Communications', sourceAccountId: '6400', sourceAccountType: 'Expense', targetField: 'phoneComm', amount: day.phoneComm },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Professional Fees', sourceAccountId: '6500', sourceAccountType: 'Expense', targetField: 'professionalFees', amount: day.professionalFees },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Other Expense', sourceAccountId: '6999', sourceAccountType: 'Expense', targetField: 'otherExpense', amount: day.otherExpense },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Cash - Operating', sourceAccountId: '1000', sourceAccountType: 'Asset', targetField: 'cash', amount: day.cash },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Accounts Receivable', sourceAccountId: '1100', sourceAccountType: 'Asset', targetField: 'ar', amount: day.ar },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Inventory', sourceAccountId: '1200', sourceAccountType: 'Asset', targetField: 'inventory', amount: day.inventory },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Accounts Payable', sourceAccountId: '2000', sourceAccountType: 'Liability', targetField: 'ap', amount: day.ap },
    { snapshotDate, frequency: 'daily', sourceAccountName: 'Retained Earnings', sourceAccountId: '3100', sourceAccountType: 'Equity', targetField: 'retainedEarnings', amount: day.retainedEarnings },
  ];
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Mock daily data loader is disabled in production.' }, { status: 403 });
    }

    await requireAuth();

    const body = await request.json().catch(() => ({}));
    const companyId = String(body?.companyId || '').trim();
    const requestedDays = Number(body?.days ?? 45);
    const days = Math.max(1, Math.min(90, Number.isFinite(requestedDays) ? requestedDays : 45));

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const records: Array<Record<string, unknown>> = [];
    const mappedLines: Array<{
      snapshotDate: string;
      frequency: string;
      sourceAccountName: string;
      sourceAccountId: string;
      sourceAccountType: string;
      targetField: string;
      amount: number;
    }> = [];

    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const dayIndex = days - 1 - offset;
      const day = buildMockDay(date, dayIndex);
      records.push(day);
      mappedLines.push(...buildMappedLines(String(day.snapshotDate), day));
    }

    const result = await ingestDailyFinancialSnapshots({
      companyId,
      platform: 'MOCK_DAILY_DEV',
      runId: `mock-daily-dev-${Date.now()}`,
      frequency: 'daily',
      records,
      mappedLines,
    });

    return NextResponse.json({
      success: result.success,
      companyId,
      days,
      recordsIngested: result.ingested,
      mappedLinesIngested: mappedLines.length,
      skipped: result.skipped,
      error: result.error || null,
    });
  } catch (error: any) {
    console.error('Failed to seed mock daily financials:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
