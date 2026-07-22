import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getIndustryBriefAiConfig } from '@/lib/industry-brief/ai-config';
import { buildDailyIndustryBriefShell } from '@/lib/industry-brief/generator';
import { scanIndustryBriefSourcesWithAi, synthesizeIndustryBriefWithAi } from '@/lib/industry-brief/prompt';
import {
  collectBlsIndustryBriefSources,
  collectFredIndustryBriefSources,
  collectPerplexityIndustryBriefSource,
} from '@/lib/industry-brief/sources';
import { normalizeIndustrySectorCategory } from '@/lib/performance-analytics/industry-sector-category';
import type { DailyIndustryBrief, IndustryBriefSourceRecord } from '@/lib/industry-brief/types';
import { requireSiteAdmin } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

type DiagnosticStep = {
  name: string;
  ok: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
};

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pct(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 0.000001) return null;
  return numerator / denominator;
}

async function loadFinancialFacts(companyId: string) {
  const rows = await prisma.monthlyFinancial.findMany({
    where: { companyId },
    orderBy: { monthDate: 'desc' },
    take: 13,
    select: {
      revenue: true,
      cogsTotal: true,
      payroll: true,
      cogsPayroll: true,
      expense: true,
      monthDate: true,
    },
  });

  const ordered = [...rows].sort((a, b) => a.monthDate.getTime() - b.monthDate.getTime());
  const ltm = ordered.slice(-12);
  const revenue = ltm.reduce((sum, row) => sum + asNumber(row.revenue), 0);
  const cogs = ltm.reduce((sum, row) => sum + asNumber(row.cogsTotal), 0);
  const payroll = ltm.reduce((sum, row) => sum + asNumber(row.payroll) + asNumber(row.cogsPayroll), 0);
  const grossProfit = revenue - cogs;
  const latest = ordered[ordered.length - 1];
  const prior = ordered[ordered.length - 2];

  return {
    revenueLastTwelveMonths: revenue,
    grossMarginPct: pct(grossProfit, revenue),
    cogsPct: pct(cogs, revenue),
    payrollPct: pct(payroll, revenue),
    latestRevenueTrendPct: latest && prior ? pct(asNumber(latest.revenue) - asNumber(prior.revenue), asNumber(prior.revenue)) : null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function timedStep<T>(
  name: string,
  run: () => Promise<T>,
  summarize?: (value: T) => Record<string, unknown>,
): Promise<{ step: DiagnosticStep; value?: T }> {
  const started = Date.now();
  try {
    const value = await run();
    return {
      value,
      step: {
        name,
        ok: true,
        durationMs: Date.now() - started,
        details: summarize ? summarize(value) : undefined,
      },
    };
  } catch (error) {
    return {
      step: {
        name,
        ok: false,
        durationMs: Date.now() - started,
        error: errorMessage(error),
      },
    };
  }
}

function summarizeSources(records: IndustryBriefSourceRecord[]): Record<string, unknown> {
  return {
    count: records.length,
    providers: records.map((record) => record.provider),
    titles: records.map((record) => record.title),
    citationCount: records.reduce((sum, record) => sum + (record.citations?.length || 0), 0),
  };
}

function summarizeBrief(brief: DailyIndustryBrief): Record<string, unknown> {
  return {
    headlinePresent: Boolean(brief.executiveSummary.headline.trim()),
    bulletCount: brief.executiveSummary.bullets.length,
    healthIndicatorCount: brief.healthIndicators.length,
    marketSignalCount: brief.marketSignals.length,
    growthOpportunityCount: brief.growthOpportunities.length,
    todayActionCount: brief.recommendedActions.today.length,
    riskCount: brief.riskMonitor.length,
    aiInsightPresent: Boolean(brief.aiInsight.trim()),
    industryOutlookCount: brief.industryOutlook.length,
    sourceNoteCount: brief.sourceNotes.length,
  };
}

export async function GET(request: NextRequest) {
  const steps: DiagnosticStep[] = [];
  try {
    await requireSiteAdmin();
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });

    const companyStep = await timedStep('company-profile', async () => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          accountingSystem: true,
          industrySectorCategory: true,
          addressCity: true,
          addressState: true,
          subscriptionMonthlyPrice: true,
        },
      });
      if (!company) throw new Error('Company not found.');
      if (!String(company.industrySectorCategory || '').trim() || !String(company.addressCity || '').trim() || !String(company.addressState || '').trim()) {
        throw new Error('Missing company industry/location.');
      }
      return company;
    }, (company) => ({
      companyId: company.id,
      companyName: company.name,
      industrySectorCategory: company.industrySectorCategory,
      location: [company.addressCity, company.addressState].filter(Boolean).join(', '),
    }));
    steps.push(companyStep.step);
    if (!companyStep.value) return NextResponse.json({ ok: false, steps }, { status: 503 });

    const financialFacts = await loadFinancialFacts(companyId);
    const aiConfig = getIndustryBriefAiConfig();
    const shell = buildDailyIndustryBriefShell({ company: companyStep.value, financialFacts });

    const sourceContext = {
      name: shell.company.name,
      industry: shell.company.industry,
      segment: shell.company.segment,
      location: shell.company.location,
      sectorKey: normalizeIndustrySectorCategory(companyStep.value.industrySectorCategory),
    };

    const [fred, bls, perplexity] = await Promise.all([
      timedStep('fred-sources', () => collectFredIndustryBriefSources(sourceContext), summarizeSources),
      timedStep('bls-sources', () => collectBlsIndustryBriefSources(sourceContext), summarizeSources),
      timedStep('perplexity-source', () => collectPerplexityIndustryBriefSource(sourceContext), (record) => summarizeSources([record])),
    ]);
    steps.push(fred.step, bls.step, perplexity.step);

    const sourceRecords = [
      ...(fred.value || []),
      ...(bls.value || []),
      ...(perplexity.value ? [perplexity.value] : []),
    ];
    if (!fred.value || !bls.value || !perplexity.value) {
      return NextResponse.json({ ok: false, aiConfig, sourceCount: sourceRecords.length, steps }, { status: 503 });
    }

    const scan = await timedStep(
      'scan-model-classification',
      () => scanIndustryBriefSourcesWithAi({ shell, sourceRecords, financialFacts, config: aiConfig }),
      summarizeBrief,
    );
    steps.push(scan.step);
    if (!scan.value) return NextResponse.json({ ok: false, aiConfig, sourceCount: sourceRecords.length, steps }, { status: 503 });

    const final = await timedStep(
      'final-model-synthesis',
      () => synthesizeIndustryBriefWithAi({ baseBrief: scan.value as DailyIndustryBrief, sourceRecords, config: aiConfig, financialFacts }),
      summarizeBrief,
    );
    steps.push(final.step);

    return NextResponse.json({
      ok: Boolean(final.value),
      aiConfig,
      sourceCount: sourceRecords.length,
      steps,
    }, { status: final.value ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: errorMessage(error),
      steps,
    }, { status: 500 });
  }
}
