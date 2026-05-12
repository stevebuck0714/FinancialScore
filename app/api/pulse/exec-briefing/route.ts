import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { getAiTransport, getOpenAiClient } from '@/lib/ai-gateway';
import { createModelText } from '@/lib/openai-helpers';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { loadMonthlyFromDfs } from '@/lib/performance-analytics/monthly-from-dfs';

export const dynamic = 'force-dynamic';

type BriefingSection = { title: string; bullets: string[] };
type BriefingResponse = {
  generatedAt: string;
  model?: string;
  aiGenerated: boolean;
  sections: BriefingSection[];
  sourceNotes: string[];
};

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const MATERIAL_AMOUNT = 1000;
const MATERIAL_PCT = 0.01;
const MATERIAL_FINANCIAL_PCT = 0.03;

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pct(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 0.000001) return null;
  return numerator / denominator;
}

function dateKey(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function sortByDate<T extends { snapshotDate?: Date; monthDate?: Date }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ad = (a.snapshotDate || a.monthDate || new Date(0)).getTime();
    const bd = (b.snapshotDate || b.monthDate || new Date(0)).getTime();
    return ad - bd;
  });
}

function last<T>(rows: T[]): T | null {
  return rows.length ? rows[rows.length - 1] : null;
}

function ebitda(row: any): number {
  return asNumber(row?.revenue) - asNumber(row?.cogsTotal) - asNumber(row?.expense) + asNumber(row?.depreciationAmortization);
}

function buildPeriodSets(rows: Array<{ snapshotDate: Date }>): { recentDates: Set<string>; priorDates: Set<string> } {
  const dates = Array.from(new Set(rows.map((row) => dateKey(row.snapshotDate)).filter(Boolean))).sort();
  if (dates.length <= 1) return { recentDates: new Set(dates), priorDates: new Set() };
  const windowSize = Math.max(1, Math.min(6, Math.floor(dates.length / 2)));
  return {
    recentDates: new Set(dates.slice(-windowSize)),
    priorDates: new Set(dates.slice(-windowSize * 2, -windowSize)),
  };
}

function aggregateSales(rows: any[], nameKey: 'itemName' | 'customerName') {
  const { recentDates, priorDates } = buildPeriodSets(rows);
  const byName = new Map<string, any>();

  for (const row of rows) {
    const name = String(row?.[nameKey] || '').trim();
    const d = dateKey(row?.snapshotDate);
    if (!name || (!recentDates.has(d) && !priorDates.has(d))) continue;
    const current = byName.get(name) || {
      name,
      recentRevenue: 0,
      priorRevenue: 0,
      recentCogs: 0,
      priorCogs: 0,
      recentQty: 0,
      priorQty: 0,
    };
    const revenue = asNumber(row?.revenue);
    const cogs = asNumber(row?.cogs);
    const qty = asNumber(row?.quantitySold);
    if (recentDates.has(d)) {
      current.recentRevenue += revenue;
      current.recentCogs += cogs;
      current.recentQty += qty;
    } else {
      current.priorRevenue += revenue;
      current.priorCogs += cogs;
      current.priorQty += qty;
    }
    byName.set(name, current);
  }

  return Array.from(byName.values()).map((entry) => {
    const recentGrossProfit = entry.recentRevenue - entry.recentCogs;
    const priorGrossProfit = entry.priorRevenue - entry.priorCogs;
    const recentMarginPct = pct(recentGrossProfit, entry.recentRevenue);
    const priorMarginPct = pct(priorGrossProfit, entry.priorRevenue);
    const recentAvgPrice = pct(entry.recentRevenue, entry.recentQty);
    const priorAvgPrice = pct(entry.priorRevenue, entry.priorQty);
    const recentUnitCost = pct(entry.recentCogs, entry.recentQty);
    const priorUnitCost = pct(entry.priorCogs, entry.priorQty);
    return {
      ...entry,
      recentGrossProfit,
      priorGrossProfit,
      grossProfitDelta: recentGrossProfit - priorGrossProfit,
      grossProfitDeltaPct: pct(recentGrossProfit - priorGrossProfit, priorGrossProfit),
      recentMarginPct,
      priorMarginPct,
      marginPctDelta: recentMarginPct != null && priorMarginPct != null ? recentMarginPct - priorMarginPct : null,
      revenueDelta: entry.recentRevenue - entry.priorRevenue,
      revenueDeltaPct: pct(entry.recentRevenue - entry.priorRevenue, entry.priorRevenue),
      avgPriceDeltaPct: recentAvgPrice != null && priorAvgPrice != null ? pct(recentAvgPrice - priorAvgPrice, priorAvgPrice) : null,
      unitCostDeltaPct: recentUnitCost != null && priorUnitCost != null ? pct(recentUnitCost - priorUnitCost, priorUnitCost) : null,
    };
  });
}

function likelyMarginDriver(row: any): string {
  if ((row.avgPriceDeltaPct ?? 0) <= -0.02) return 'lower average selling price / discounting';
  if ((row.unitCostDeltaPct ?? 0) >= 0.02) return 'higher unit cost';
  if ((row.revenueDeltaPct ?? 0) > 0.02 && (row.marginPctDelta ?? 0) < 0) return 'mix shift toward lower-margin volume';
  if ((row.revenueDeltaPct ?? 0) < -0.02 && (row.marginPctDelta ?? 0) > 0) return 'lower volume offset by better margin rate';
  return 'margin mix';
}

function findBenchmark(benchmarks: any[], patterns: RegExp[]): any | null {
  return benchmarks.find((benchmark) => patterns.some((pattern) => pattern.test(String(benchmark?.metricName || '')))) || null;
}

async function loadGoals(table: 'ExpenseGoal' | 'OperationalGoal', companyId: string) {
  try {
    return table === 'ExpenseGoal'
      ? await prisma.$queryRaw<Array<{ goals: any }>>`SELECT goals FROM "ExpenseGoal" WHERE "companyId" = ${companyId}`
      : await prisma.$queryRaw<Array<{ goals: any }>>`SELECT goals FROM "OperationalGoal" WHERE "companyId" = ${companyId}`;
  } catch {
    return [];
  }
}

function agingSummary(row: any, totalKey: 'totalAR' | 'totalAP') {
  if (!row) return null;
  const total = asNumber(row?.[totalKey]);
  const over30 = asNumber(row?.days31to60) + asNumber(row?.days61to90) + asNumber(row?.days90plus);
  const over60 = asNumber(row?.days61to90) + asNumber(row?.days90plus);
  return {
    snapshotDate: row.snapshotDate,
    total,
    over30,
    over30Pct: pct(over30, total),
    over60,
    over60Pct: pct(over60, total),
    dso: row?.dso != null ? asNumber(row.dso) : null,
  };
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text.trim());
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function hasSpecificEvidence(text: string): boolean {
  return /(\$[\d,.]+|\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:days?|weeks?|months?|pts?|points?|bps|x)\b|threshold|headroom|margin|gross profit|revenue|cash|AR|AP|DSO|LOC|EBITDA|customer|product|covenant)/i.test(text);
}

function isMaterialAmount(value: number | null | undefined, baseline?: number | null): boolean {
  if (value == null || !Number.isFinite(value)) return false;
  if (Math.abs(value) >= MATERIAL_AMOUNT * 10) return true;
  if (baseline != null && Number.isFinite(baseline) && Math.abs(baseline) > 0) {
    return Math.abs(value / baseline) >= MATERIAL_FINANCIAL_PCT;
  }
  return Math.abs(value) >= MATERIAL_AMOUNT;
}

function isMaterialPct(value: number | null | undefined, threshold = MATERIAL_FINANCIAL_PCT): boolean {
  return value != null && Number.isFinite(value) && Math.abs(value) >= threshold;
}

function normalizeSections(value: any): BriefingSection[] {
  const sections = Array.isArray(value?.sections) ? value.sections : [];
  return sections
    .map((section: any) => {
      const title = String(section?.title || '').trim();
      const bullets = Array.isArray(section?.bullets)
        ? section.bullets.map((bullet: any) => String(bullet || '').trim()).filter(Boolean)
        : [];
      const filtered = /recommended actions?/i.test(title) ? bullets.filter(hasSpecificEvidence) : bullets;
      return { title, bullets: filtered.slice(0, 6) };
    })
    .filter((section) => section.title && section.bullets.length > 0)
    .slice(0, 8);
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const companyId = request.nextUrl.searchParams.get('companyId') || '';
    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('Company', companyId, 'PULSE_EXEC_BRIEFING_READ');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 180 * MS_IN_DAY);
    const monthlyStartDate = new Date();
    monthlyStartDate.setMonth(monthlyStartDate.getMonth() - 18);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, industrySector: true, industrySectorCategory: true },
    } as any);

    const industryGroupId = company?.industrySector ? String(company.industrySector) : null;
    const benchmarks = industryGroupId
      ? await prisma.industryBenchmark.findMany({
          where: { industryId: industryGroupId },
          select: { metricName: true, fiveYearValue: true, industryName: true, assetSizeCategory: true },
          take: 250,
        })
      : [];

    const dfsMonthly = await loadMonthlyFromDfs(companyId, monthlyStartDate, endDate);
    const latestFinancialRecord = dfsMonthly
      ? null
      : await prisma.financialRecord.findFirst({ where: { companyId }, select: { id: true }, orderBy: { createdAt: 'desc' } });
    const monthlyWhere: any = { companyId, monthDate: { gte: monthlyStartDate, lte: endDate } };
    if (latestFinancialRecord?.id) monthlyWhere.financialRecordId = latestFinancialRecord.id;

    const [
      monthlyFinancialsRaw,
      dailyFinancials,
      cashSnapshots,
      arSnapshots,
      apSnapshots,
      customerSnapshots,
      productSnapshots,
      inventorySnapshots,
      loans,
      expenseGoals,
      operationalGoals,
      findings,
      pulseAlerts,
    ] = await Promise.all([
      dfsMonthly ? Promise.resolve([]) : prisma.monthlyFinancial.findMany({ where: monthlyWhere, orderBy: { monthDate: 'asc' }, take: 36 }),
      prisma.dailyFinancialSnapshot.findMany({ where: { companyId, frequency: 'daily', snapshotDate: { gte: startDate, lte: endDate } }, orderBy: { snapshotDate: 'asc' }, take: 220 }),
      prisma.cashSnapshot.findMany({ where: { companyId, snapshotDate: { gte: startDate, lte: endDate } }, orderBy: { snapshotDate: 'asc' }, take: 500 }),
      prisma.aRAgingSnapshot.findMany({ where: { companyId, snapshotDate: { gte: startDate, lte: endDate } }, orderBy: { snapshotDate: 'asc' }, take: 500 }),
      prisma.aPAgingSnapshot.findMany({ where: { companyId, snapshotDate: { gte: startDate, lte: endDate } }, orderBy: { snapshotDate: 'asc' }, take: 500 }),
      prisma.customerSalesSnapshot.findMany({ where: { companyId, snapshotDate: { gte: startDate, lte: endDate } }, orderBy: { snapshotDate: 'asc' }, take: 1200 }),
      prisma.productSalesSnapshot.findMany({ where: { companyId, snapshotDate: { gte: startDate, lte: endDate } }, orderBy: { snapshotDate: 'asc' }, take: 1200 }),
      prisma.inventorySnapshot.findMany({ where: { companyId, snapshotDate: { gte: startDate, lte: endDate } }, orderBy: { snapshotDate: 'asc' }, take: 1200 }),
      prisma.loan.findMany({ where: { companyId, status: { in: ['ACTIVE', 'MATURING'] as any } }, include: { covenants: true }, take: 50 } as any),
      loadGoals('ExpenseGoal', companyId),
      loadGoals('OperationalGoal', companyId),
      prisma
        .$queryRawUnsafe<any[]>(
          `SELECT "type", "metric", "severity", "confidence", "payload", "updatedAt"
           FROM "PerformanceFinding"
           WHERE "companyId" = $1
           ORDER BY "updatedAt" DESC
           LIMIT 50`,
          companyId
        )
        .catch(() => []),
      prisma
        .$queryRawUnsafe<any[]>(
          `SELECT "source", "title", "detail", "priorityScore", "bucket", "status", "modifiedAt"
           FROM "PulseAlert"
           WHERE "companyId" = $1 AND "isActive" = TRUE AND "status" <> 'resolved'
           ORDER BY COALESCE("priorityScore", 0) DESC, "modifiedAt" DESC
           LIMIT 20`,
          companyId
        )
        .catch(() => []),
    ]);

    const monthlyFinancials = sortByDate(dfsMonthly ? dfsMonthly.rows : monthlyFinancialsRaw);
    const recentFinancials = monthlyFinancials.slice(-3);
    const priorFinancials = monthlyFinancials.slice(-6, -3);
    const latestFinancial = last(monthlyFinancials);
    const latestDailyFinancial = last(sortByDate(dailyFinancials));
    const latestCashSnapshot = last(sortByDate(cashSnapshots));
    const latestArSnapshot = last(sortByDate(arSnapshots));
    const latestApSnapshot = last(sortByDate(apSnapshots));

    const recentRevenue = recentFinancials.reduce((sum, row: any) => sum + asNumber(row.revenue), 0);
    const priorRevenue = priorFinancials.reduce((sum, row: any) => sum + asNumber(row.revenue), 0);
    const recentCogs = recentFinancials.reduce((sum, row: any) => sum + asNumber(row.cogsTotal), 0);
    const priorCogs = priorFinancials.reduce((sum, row: any) => sum + asNumber(row.cogsTotal), 0);
    const recentGrossProfit = recentRevenue - recentCogs;
    const priorGrossProfit = priorRevenue - priorCogs;
    const recentEbitda = recentFinancials.reduce((sum, row: any) => sum + ebitda(row), 0);
    const priorEbitda = priorFinancials.reduce((sum, row: any) => sum + ebitda(row), 0);
    const latestRevenue = asNumber(latestFinancial?.revenue);
    const latestEbitdaMargin = pct(ebitda(latestFinancial), latestRevenue);
    const latestCash = asNumber(latestDailyFinancial?.cash || latestFinancial?.cash || latestCashSnapshot?.cashBalance);
    const latestLoc = asNumber(latestDailyFinancial?.loc || latestFinancial?.loc);

    const productAgg = aggregateSales(productSnapshots, 'itemName').sort((a, b) => b.recentRevenue - a.recentRevenue);
    const customerAgg = aggregateSales(customerSnapshots, 'customerName').sort((a, b) => b.recentRevenue - a.recentRevenue);
    const totalRecentCustomerRevenue = customerAgg.reduce((sum, row) => sum + row.recentRevenue, 0);
    const topCustomers = customerAgg
      .filter((row) => row.recentRevenue > MATERIAL_AMOUNT || Math.abs(row.recentGrossProfit) > MATERIAL_AMOUNT)
      .slice(0, 5)
      .map((row) => ({ ...row, revenueShare: pct(row.recentRevenue, totalRecentCustomerRevenue) }));
    const top3Share = pct(topCustomers.slice(0, 3).reduce((sum, row) => sum + row.recentRevenue, 0), totalRecentCustomerRevenue);
    const topMarginWatch = productAgg
      .filter((row) => row.recentRevenue > MATERIAL_AMOUNT)
      .slice(0, 15)
      .filter((row) => {
        const materialGrossProfitMove = Math.abs(row.grossProfitDelta) > MATERIAL_AMOUNT;
        const materialMarginMove = Math.abs(row.marginPctDelta ?? 0) >= MATERIAL_PCT;
        const revenueUpProfitDown = row.revenueDelta > MATERIAL_AMOUNT && row.grossProfitDelta < -MATERIAL_AMOUNT;
        return materialGrossProfitMove || materialMarginMove || revenueUpProfitDown;
      })
      .sort((a, b) => Math.abs(b.grossProfitDelta) - Math.abs(a.grossProfitDelta))
      .slice(0, 6)
      .map((row) => ({ ...row, likelyDriver: likelyMarginDriver(row) }));

    const covenantWatchlist = (loans as any[])
      .flatMap((loan: any) =>
        (loan.covenants || [])
          .filter((covenant: any) => covenant.isApplicable !== false)
          .map((covenant: any) => {
            const threshold = asNumber(covenant.threshold);
            const current = asNumber(covenant.currentValue);
            let bufferPct: number | null = null;
            if (threshold) {
              if (String(covenant.covenantType) === 'MAXIMUM') bufferPct = (threshold - current) / Math.abs(threshold);
              if (String(covenant.covenantType) === 'MINIMUM') bufferPct = (current - threshold) / Math.abs(threshold);
            }
            return { loanName: loan.loanName, lenderName: loan.lenderName, name: covenant.covenantName, type: String(covenant.covenantType || ''), status: String(covenant.status || ''), threshold, current, bufferPct, updatedAt: covenant.updatedAt };
          })
      )
      .filter((row: any) => row.current || row.threshold || row.status === 'WARNING' || row.status === 'BREACHED')
      .sort((a: any, b: any) => (a.bufferPct ?? 999) - (b.bufferPct ?? 999))
      .slice(0, 6);

    const grossMarginBenchmark = findBenchmark(benchmarks, [/gross\s*margin/i]);
    const ebitdaBenchmark = findBenchmark(benchmarks, [/ebitda/i, /operating\s*margin/i]);
    const dsoBenchmark = findBenchmark(benchmarks, [/dso/i, /days\s*sales/i]);
    const latestGrossMarginPct = pct(asNumber(latestFinancial?.revenue) - asNumber(latestFinancial?.cogsTotal), asNumber(latestFinancial?.revenue));
    const benchmarkComparisons = [
      grossMarginBenchmark && latestGrossMarginPct != null ? { metric: grossMarginBenchmark.metricName, actual: latestGrossMarginPct, benchmark: asNumber(grossMarginBenchmark.fiveYearValue), variance: latestGrossMarginPct - asNumber(grossMarginBenchmark.fiveYearValue) } : null,
      ebitdaBenchmark && latestEbitdaMargin != null ? { metric: ebitdaBenchmark.metricName, actual: latestEbitdaMargin, benchmark: asNumber(ebitdaBenchmark.fiveYearValue), variance: latestEbitdaMargin - asNumber(ebitdaBenchmark.fiveYearValue) } : null,
      dsoBenchmark && latestArSnapshot ? { metric: dsoBenchmark.metricName, actual: asNumber((latestArSnapshot as any).dso), benchmark: asNumber(dsoBenchmark.fiveYearValue), variance: asNumber((latestArSnapshot as any).dso) - asNumber(dsoBenchmark.fiveYearValue) } : null,
    ].filter(Boolean);

    const facts = {
      company: { name: company?.name || 'Company', industryGroupId, industryName: benchmarks[0]?.industryName || null, industrySectorCategory: company?.industrySectorCategory || null },
      financials: {
        monthsLoaded: monthlyFinancials.length,
        revenueTrend: recentRevenue >= priorRevenue ? 'increasing' : 'declining',
        recentRevenue,
        priorRevenue,
        revenueDelta: recentRevenue - priorRevenue,
        revenueDeltaPct: pct(recentRevenue - priorRevenue, priorRevenue),
        recentGrossProfit,
        priorGrossProfit,
        grossProfitDelta: recentGrossProfit - priorGrossProfit,
        grossProfitDeltaPct: pct(recentGrossProfit - priorGrossProfit, priorGrossProfit),
        grossMarginPct: pct(recentGrossProfit, recentRevenue),
        priorGrossMarginPct: pct(priorGrossProfit, priorRevenue),
        grossMarginDeltaPct: pct(recentGrossProfit, recentRevenue) != null && pct(priorGrossProfit, priorRevenue) != null ? (pct(recentGrossProfit, recentRevenue) || 0) - (pct(priorGrossProfit, priorRevenue) || 0) : null,
        ebitdaMargin: pct(recentEbitda, recentRevenue),
        priorEbitdaMargin: pct(priorEbitda, priorRevenue),
        ebitdaDelta: recentEbitda - priorEbitda,
        latestCash,
        latestLoc,
        latestAR: agingSummary(latestArSnapshot, 'totalAR'),
        latestAP: agingSummary(latestApSnapshot, 'totalAP'),
        materiality: {
          revenueMoveIsMaterial: isMaterialPct(pct(recentRevenue - priorRevenue, priorRevenue)),
          grossProfitMoveIsMaterial: isMaterialAmount(recentGrossProfit - priorGrossProfit, priorGrossProfit),
          grossMarginMoveIsMaterial: isMaterialPct(
            pct(recentGrossProfit, recentRevenue) != null && pct(priorGrossProfit, priorRevenue) != null
              ? (pct(recentGrossProfit, recentRevenue) || 0) - (pct(priorGrossProfit, priorRevenue) || 0)
              : null
          ),
          thresholds: {
            materialFinancialPct: MATERIAL_FINANCIAL_PCT,
            materialAmount: MATERIAL_AMOUNT,
          },
        },
      },
      workingCapital: { latestCash, latestAR: agingSummary(latestArSnapshot, 'totalAR'), latestAP: agingSummary(latestApSnapshot, 'totalAP'), inventoryRows: inventorySnapshots.length },
      covenants: { activeLoans: (loans as any[]).length, watchlist: covenantWatchlist },
      customers: { totalRecentRevenue: totalRecentCustomerRevenue, top3Share, topCustomers },
      products: { topMarginWatch },
      benchmarks: { loaded: benchmarks.length, comparisons: benchmarkComparisons, sample: benchmarks.slice(0, 25) },
      goals: { expense: expenseGoals[0]?.goals || {}, operational: operationalGoals[0]?.goals || {} },
      siteTrackedIssues: { pulseAlerts: (pulseAlerts || []).slice(0, 20), performanceFindings: (findings || []).slice(0, 50) },
      dataCoverage: { monthlyFinancialPeriods: monthlyFinancials.length, dailyFinancialRows: dailyFinancials.length, cashRows: cashSnapshots.length, arRows: arSnapshots.length, apRows: apSnapshots.length, customerRows: customerSnapshots.length, productRows: productSnapshots.length, inventoryRows: inventorySnapshots.length, benchmarkRows: benchmarks.length },
      alerts: (pulseAlerts || []).slice(0, 12),
      findings: (findings || []).slice(0, 20),
    };

    const sourceNotes = [
      monthlyFinancials.length > 0 ? `${monthlyFinancials.length} monthly financial period(s) analyzed` : '',
      dailyFinancials.length > 0 ? `${dailyFinancials.length} daily financial row(s) analyzed` : '',
      arSnapshots.length > 0 ? `${arSnapshots.length} AR aging row(s) analyzed` : '',
      apSnapshots.length > 0 ? `${apSnapshots.length} AP aging row(s) analyzed` : '',
      customerSnapshots.length > 0 ? `${customerSnapshots.length} customer snapshot row(s) analyzed` : '',
      productSnapshots.length > 0 ? `${productSnapshots.length} product/service snapshot row(s) analyzed` : '',
      inventorySnapshots.length > 0 ? `${inventorySnapshots.length} inventory snapshot row(s) analyzed` : '',
      benchmarks.length > 0 ? `${benchmarks.length} industry benchmark row(s) available` : '',
      covenantWatchlist.length > 0 ? `${covenantWatchlist.length} covenant row(s) included in watchlist` : '',
    ].filter(Boolean);

    if (getAiTransport() === 'unconfigured') {
      return NextResponse.json(
        { error: 'AI is not configured for executive briefing generation' },
        { status: 503 }
      );
    }

    const model = process.env.OPENAI_MODEL_EXEC_BRIEFING || process.env.OPENAI_MODEL_ASK || process.env.OPENAI_MODEL || 'gpt-4o';
    const prompt = `Create a Daily Exec Briefing for ${facts.company.name}.

Write like a practical CFO/operator briefing the leadership team. Use concise bullet narrative, not technical jargon. Be forward-looking and action-oriented.

Use only the facts below. If the company does not use, track, or report a topic, do not mention that topic. Do not include "no data" bullets. Only mention a data gap when the site has an active alert/finding saying the data gap itself is a leadership issue.

This is an exception-based leadership briefing. Only include analysis if it matters. Do not report normal, expected, immaterial, or stable trends just because data exists. Do not mention revenue, gross profit, margin, customers, products, covenants, accounts, or risks where the measured movement/exposure is zero, immaterial, normal, or not decision-useful.

Analyze the full company picture: financial performance, gross profit dollars, margin rate, liquidity, working capital, AR, AP, inventory, LOC/debt, covenants, customer concentration, product/service margin quality, expense drivers, benchmarks, Pulse alerts, performance findings, goals/watchlists, and data coverage.

When revenue and margin rate move in different directions, explicitly state the end result to gross profit dollars only if the movement is material or decision-useful. Example: if revenue is declining but gross margin rate is improving, say whether gross profit dollars increased or decreased and by how much; if both are normal/immaterial, omit the topic entirely.

For product/service margin, do the diagnosis yourself. Only report top-seller margin analysis if there is a measurable issue. Do not tell leadership to "check pricing, discounting, unit cost, and customer mix." Instead, use average price change, unit-cost change, revenue change, margin-rate change, and gross-profit dollar change to say which driver is most likely and what measurable action follows.

Recommendations must be specific and measurable. Include the actual metric, customer/product/covenant/account name, dollar amount, percentage, threshold, time window, or target from the facts whenever available. Do not write generic recommendations like "review covenant headroom", "pull margin detail", "assign owners", "monitor closely", "review performance", "improve margins", or "watch cash" unless the same bullet discusses the underlying values driving the issue and the measurable next action.

Choose the 3-8 sections that best tell leadership what they need to pay attention to today. Include topics only when they are material, abnormal, worsening, tied to a Pulse alert/performance finding/goal/benchmark gap, or directly decision-useful. If there are no material exceptions, return one short section titled "No Material Exceptions".

Return JSON only in this shape:
{
  "sections": [
    { "title": "Top Takeaway", "bullets": ["..."] }
  ]
}

Facts:
${JSON.stringify(facts, null, 2)}`;

    const ai = await createModelText({
      openai: getOpenAiClient(),
      model,
      temperature: 0.2,
      maxTokens: 2800,
      messages: [
        {
          role: 'system',
          content:
            'You produce concise executive operating briefings from financial and operational data. Identify the highest-priority issues yourself. Always evaluate gross profit dollars, not just revenue or margin rate. Recommendations must be specific, measurable, and tied to observed facts. Use bullets. Keep language plain and board-ready.',
        },
        { role: 'user', content: prompt },
      ],
    });
    const sections = normalizeSections(safeJsonParse(ai.text));

    if (!sections.length) {
      return NextResponse.json(
        { error: 'AI briefing response did not include usable briefing sections' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      model,
      aiGenerated: true,
      sections,
      sourceNotes,
    } satisfies BriefingResponse);
  } catch (error: any) {
    console.error('Pulse exec briefing error:', error);
    return NextResponse.json({ error: 'Failed to generate executive briefing', details: String(error?.message || error) }, { status: 500 });
  }
}
