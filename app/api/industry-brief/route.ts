import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashCacheParts, readDerivedApiCache, writeDerivedApiCache } from '@/lib/derived-api-cache';
import { getIndustryBriefAiConfig } from '@/lib/industry-brief/ai-config';
import { buildDailyIndustryBriefShell } from '@/lib/industry-brief/generator';
import { scanIndustryBriefSourcesWithAi, synthesizeIndustryBriefWithAi } from '@/lib/industry-brief/prompt';
import { collectIndustryBriefSources } from '@/lib/industry-brief/sources';
import type { DailyIndustryBrief } from '@/lib/industry-brief/types';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const CACHE_NAMESPACE = 'daily-industry-brief';
const DATA_VERSION = 'v4-render-safe-brief';
const CACHE_TTL_SECONDS = 6 * 60 * 60;

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pct(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 0.000001) return null;
  return numerator / denominator;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
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

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    const force = request.nextUrl.searchParams.get('force') === 'true';
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const allowed = await validateCompanyAccess(companyId);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const cacheKey = hashCacheParts([companyId, todayKey()]);
    if (!force) {
      const cached = await readDerivedApiCache<DailyIndustryBrief>({
        namespace: CACHE_NAMESPACE,
        cacheKey,
        dataVersion: DATA_VERSION,
      });
      if (cached) return NextResponse.json(cached);
    }

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
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    if (!String(company.industrySectorCategory || '').trim() || !String(company.addressCity || '').trim() || !String(company.addressState || '').trim()) {
      return NextResponse.json(
        { error: 'Industry Brief unavailable: missing company industry/location.' },
        { status: 422 },
      );
    }

    const financialFacts = await loadFinancialFacts(companyId);
    const aiConfig = getIndustryBriefAiConfig();
    const shell = buildDailyIndustryBriefShell({ company, financialFacts });
    shell.aiMetadata = {
      aiGenerated: true,
      transport: aiConfig.transport,
      finalModel: aiConfig.finalModel,
      scanModel: aiConfig.scanModel,
    };

    let sourceRecords;
    let scannedBrief: DailyIndustryBrief;
    try {
      sourceRecords = await collectIndustryBriefSources({
        name: shell.company.name,
        industry: shell.company.industry,
        segment: shell.company.segment,
        location: shell.company.location,
      });
    } catch (sourceError) {
      const sourceMessage = sourceError instanceof Error ? sourceError.message : String(sourceError);
      console.error('Daily Industry Brief live source collection failed.', {
        companyId,
        error: sourceMessage,
      });
      return NextResponse.json(
        { error: sourceMessage || 'Industry Brief unavailable: live source collection failed.' },
        { status: 503 },
      );
    }

    try {
      scannedBrief = await scanIndustryBriefSourcesWithAi({
        shell,
        sourceRecords,
        financialFacts,
        config: aiConfig,
      });
    } catch (scanError) {
      const scanMessage = scanError instanceof Error ? scanError.message : String(scanError);
      console.error('Daily Industry Brief source classification failed.', {
        companyId,
        scanModel: aiConfig.scanModel,
        sourceCount: sourceRecords.length,
        error: scanMessage,
      });
      return NextResponse.json(
        { error: scanMessage || 'Industry Brief unavailable: source classification failed.' },
        { status: 503 },
      );
    }

    let brief: DailyIndustryBrief;
    try {
      brief = await synthesizeIndustryBriefWithAi({
        baseBrief: scannedBrief,
        sourceRecords,
        config: aiConfig,
      });
    } catch (aiError) {
      const aiMessage = aiError instanceof Error ? aiError.message : String(aiError);
      console.error('Daily Industry Brief AI synthesis failed.', {
        companyId,
        model: aiConfig.finalModel,
        error: aiMessage,
      });
      return NextResponse.json(
        { error: aiMessage || 'Industry Brief unavailable: AI synthesis failed.' },
        { status: 503 },
      );
    }

    await writeDerivedApiCache({
      namespace: CACHE_NAMESPACE,
      cacheKey,
      dataVersion: DATA_VERSION,
      payload: brief,
      ttlSeconds: CACHE_TTL_SECONDS,
    });

    return NextResponse.json(brief);
  } catch (error: any) {
    const message = error?.message || 'Failed to load daily industry brief';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
