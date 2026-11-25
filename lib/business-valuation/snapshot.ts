import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { estMonthKey } from '@/lib/time/eastern';
import { GET as getEbitdaAdjustments } from '@/app/api/sde/ebitda-adjustments/route';
import { GET as getLoans } from '@/app/api/operations/loans/route';
import {
  buildFiscalPeriods,
  normalizeFiscalYearEndMonth,
  summarizeFiscalPeriod,
  trailingTwelveMonthPeriod,
  type FiscalPeriod,
  type FiscalPeriodSummary,
  type MonthlyFinancialValues,
} from './fiscal-years';

export const SNAPSHOT_VERSION = 1;

export type FiscalYearEndSource = 'COMPANY_PROFILE' | 'DEFAULT';

export type ValuationSnapshotData = {
  version: number;
  capturedAt: string;
  valuationDate: string;
  asOfMonth: string;
  company: {
    name: string;
    city: string | null;
    state: string | null;
    zip: string | null;
    accountingSystem: string | null;
    industrySectorCategory: string | null;
    baseCurrency: string;
  };
  fiscalYear: { endMonth: number; source: FiscalYearEndSource };
  months: MonthlyFinancialValues[];
  periods: FiscalPeriod[];
  periodSummaries: FiscalPeriodSummary[];
  trailingTwelveMonths: FiscalPeriodSummary & { period: FiscalPeriod };
  qoe: {
    savedTotals: Record<string, number> | null;
    savedAt: string | null;
    accountAdjustments: unknown;
    accountAdjustmentsError: string | null;
  };
  loans: { instruments: unknown[]; error: string | null };
  taxReturns: { fiscalYearEndMonth: number; entries: Record<string, unknown> } | null;
  notes: string[];
};

const LOAN_ACTIVITY_KEYS = new Set(['monthlyActivity', 'recentActivity', 'scheduleActivity']);

const monthKeyOf = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

export async function resolveFiscalYearEnd(companyId: string): Promise<{ endMonth: number; source: FiscalYearEndSource }> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { fiscalYearEndMonth: true } });
  if (company?.fiscalYearEndMonth) return { endMonth: normalizeFiscalYearEndMonth(company.fiscalYearEndMonth), source: 'COMPANY_PROFILE' };
  return { endMonth: 12, source: 'DEFAULT' };
}

/**
 * Closed (published or locked) months from the company's latest financial record, through the
 * valuation month. Unlike the reports API there is no 2024 cutoff, so older stored years count.
 */
async function loadClosedMonths(companyId: string, throughMonth: string): Promise<MonthlyFinancialValues[]> {
  const [year, month] = throughMonth.split('-').map(Number);
  const throughDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const [latestRecord, publishedRows] = await Promise.all([
    prisma.financialRecord.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: { monthlyData: { where: { monthDate: { lte: throughDate } }, orderBy: { monthDate: 'asc' } } },
    }),
    prisma.financialMonthPublish.findMany({
      where: { companyId, status: { in: ['PUBLISHED', 'LOCKED'] } },
      select: { monthStart: true },
    }),
  ]);
  const published = new Set(publishedRows.map((row) => monthKeyOf(row.monthStart)));
  const currentMonth = estMonthKey();
  const byMonth = new Map<string, MonthlyFinancialValues>();
  for (const row of latestRecord?.monthlyData || []) {
    const key = monthKeyOf(row.monthDate);
    if (!published.has(key) || key >= currentMonth) continue;
    const values: Record<string, number> = {};
    for (const [field, raw] of Object.entries(row)) {
      if (typeof raw === 'number' && Number.isFinite(raw)) values[field] = raw;
    }
    byMonth.set(key, { ...values, month: key } as MonthlyFinancialValues);
  }
  return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
}

async function callRoute(
  handler: (request: NextRequest) => Promise<Response>,
  path: string,
  request: NextRequest,
): Promise<{ data: any; error: string | null }> {
  try {
    const response = await handler(new NextRequest(new URL(path, request.url), { headers: request.headers }));
    const data = await response.json().catch(() => null);
    if (!response.ok) return { data: null, error: String(data?.error || data?.details || `Request failed (${response.status})`) };
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function buildValuationSnapshot(params: {
  companyId: string;
  valuationDate: string;
  request: NextRequest;
}): Promise<{ data: ValuationSnapshotData } | { error: string }> {
  const { companyId, valuationDate, request } = params;
  const valuationMonth = valuationDate.slice(0, 7);
  const [company, fiscalYear, months, valuationSettings, cashProof] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, addressCity: true, addressState: true, addressZip: true, accountingSystem: true, industrySectorCategory: true, baseCurrency: true },
    }),
    resolveFiscalYearEnd(companyId),
    loadClosedMonths(companyId, valuationMonth),
    prisma.$queryRaw<Array<{ sdeAnalysisTotals: Record<string, number> | null; updatedAt: Date | null }>>`
      SELECT "sdeAnalysisTotals", "updatedAt" FROM "ValuationSettings" WHERE "companyId" = ${companyId} LIMIT 1
    `.catch(() => []),
    prisma.cashProofEngagement.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: { fiscalYearEndMonth: true, taxReturns: true },
    }),
  ]);
  if (!company) return { error: 'Company not found' };
  if (months.length === 0) return { error: 'No closed months are stored on or before the valuation date.' };

  const asOfMonth = months[months.length - 1].month;
  const storedMonths = months.map((row) => row.month);
  const rowsByMonth = new Map(months.map((row) => [row.month, row]));
  const periods = buildFiscalPeriods(asOfMonth, fiscalYear.endMonth, storedMonths);
  const ttmPeriod = trailingTwelveMonthPeriod(asOfMonth, storedMonths);

  const query = `companyId=${encodeURIComponent(companyId)}`;
  const [adjustments, loans] = await Promise.all([
    callRoute(getEbitdaAdjustments, `/api/sde/ebitda-adjustments?${query}&asOfMonth=${asOfMonth}`, request),
    callRoute(getLoans, `/api/operations/loans?${query}`, request),
  ]);

  const settings = valuationSettings[0];
  const notes: string[] = [];
  if (asOfMonth !== valuationMonth) notes.push(`The latest closed month on or before the valuation date is ${asOfMonth}.`);
  if (periods.some((period) => !period.isComplete)) notes.push('Some fiscal periods are missing stored months; see coverage.');
  if (!settings?.sdeAnalysisTotals || Object.keys(settings.sdeAnalysisTotals).length === 0) {
    notes.push('No saved Quality of Earnings totals were found; save the Quality of Earnings tab before relying on adjusted earnings.');
  }
  notes.push('Loan balances are as of the snapshot date, not the valuation date.');

  return {
    data: {
      version: SNAPSHOT_VERSION,
      capturedAt: new Date().toISOString(),
      valuationDate,
      asOfMonth,
      company: {
        name: company.name,
        city: company.addressCity,
        state: company.addressState,
        zip: company.addressZip,
        accountingSystem: company.accountingSystem,
        industrySectorCategory: company.industrySectorCategory,
        baseCurrency: company.baseCurrency,
      },
      fiscalYear,
      months,
      periods,
      periodSummaries: periods.map((period) => summarizeFiscalPeriod(period, rowsByMonth)),
      trailingTwelveMonths: { ...summarizeFiscalPeriod(ttmPeriod, rowsByMonth), period: ttmPeriod },
      qoe: {
        savedTotals: settings?.sdeAnalysisTotals && Object.keys(settings.sdeAnalysisTotals).length > 0 ? settings.sdeAnalysisTotals : null,
        savedAt: settings?.updatedAt ? new Date(settings.updatedAt).toISOString() : null,
        accountAdjustments: adjustments.data ? { asOfMonth: adjustments.data.asOfMonth, buckets: adjustments.data.buckets } : null,
        accountAdjustmentsError: adjustments.error,
      },
      loans: {
        instruments: (Array.isArray(loans.data?.instruments) ? loans.data.instruments : []).map((instrument: Record<string, unknown>) =>
          Object.fromEntries(Object.entries(instrument).filter(([key]) => !LOAN_ACTIVITY_KEYS.has(key))),
        ),
        error: loans.error,
      },
      taxReturns: cashProof?.taxReturns && typeof cashProof.taxReturns === 'object'
        ? { fiscalYearEndMonth: cashProof.fiscalYearEndMonth, entries: cashProof.taxReturns as Record<string, unknown> }
        : null,
      notes,
    },
  };
}
