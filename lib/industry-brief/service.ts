import prisma from '@/lib/prisma';
import { getIndustryBriefAiConfig } from '@/lib/industry-brief/ai-config';
import { buildDailyIndustryBriefShell } from '@/lib/industry-brief/generator';
import { synthesizeIndustryBriefWithAi } from '@/lib/industry-brief/prompt';
import {
  getCachedIndustryBriefSources,
  readCachedIndustryBrief,
  writeCachedIndustryBrief,
} from '@/lib/industry-brief/cache';
import { normalizeIndustrySectorCategory } from '@/lib/performance-analytics/industry-sector-category';
import { INDUSTRY_SECTORS } from '@/data/industrySectors';
import type { DailyIndustryBrief, IndustryBriefSourceRecord } from '@/lib/industry-brief/types';

type FinancialFactInput = {
  revenueLastTwelveMonths: number;
  grossMarginPct: number | null;
  cogsPct: number | null;
  payrollPct: number | null;
  latestRevenueTrendPct: number | null;
};

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pct(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 0.000001) return null;
  return numerator / denominator;
}

function uniqueText(values: unknown[], limit: number): string {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value || '').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result.join(', ');
}

async function ensureIndustryBriefProfileColumns() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "CompanyProfile"
      ADD COLUMN IF NOT EXISTS "industryBriefProductFocus" TEXT,
      ADD COLUMN IF NOT EXISTS "industryBriefBrands" JSONB,
      ADD COLUMN IF NOT EXISTS "industryBriefCustomerChannels" TEXT,
      ADD COLUMN IF NOT EXISTS "industryBriefCompetitors" TEXT,
      ADD COLUMN IF NOT EXISTS "industryBriefLocalMarketEvents" TEXT,
      ADD COLUMN IF NOT EXISTS "industryBriefKnownOpportunities" TEXT
  `);
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function labeledText(label: string, value: unknown): string {
  const text = Array.isArray(value) ? stringList(value).join(', ') : String(value || '').trim();
  return text ? `${label}: ${text}` : '';
}

export async function loadIndustryBriefFinancialFacts(companyId: string): Promise<FinancialFactInput> {
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

export async function loadIndustryBriefCompany(companyId: string) {
  await ensureIndustryBriefProfileColumns();
  const [company, productRows, inventoryRows, customerRows, intelligenceRows] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        industrySector: true,
        accountingSystem: true,
        industrySectorCategory: true,
        addressCity: true,
        addressState: true,
        subscriptionMonthlyPrice: true,
        profile: {
          select: {
            workforce: true,
            specialNotes: true,
            qoeNotes: true,
          },
        },
      },
    }),
    prisma.productSalesSnapshot.findMany({
      where: { companyId },
      orderBy: [{ snapshotDate: 'desc' }, { revenue: 'desc' }],
      take: 20,
      select: { itemName: true, sku: true },
    }).catch(() => []),
    prisma.inventorySnapshot.findMany({
      where: { companyId },
      orderBy: [{ snapshotDate: 'desc' }, { assetValue: 'desc' }],
      take: 20,
      select: { itemName: true, sku: true },
    }).catch(() => []),
    prisma.customerSalesSnapshot.findMany({
      where: { companyId },
      orderBy: [{ snapshotDate: 'desc' }, { revenue: 'desc' }],
      take: 15,
      select: { customerName: true },
    }).catch(() => []),
    prisma.$queryRawUnsafe<Array<{
      industryBriefProductFocus: string | null;
      industryBriefBrands: unknown;
      industryBriefCustomerChannels: string | null;
      industryBriefCompetitors: string | null;
      industryBriefLocalMarketEvents: string | null;
      industryBriefKnownOpportunities: string | null;
    }>>(
      `SELECT
         "industryBriefProductFocus",
         "industryBriefBrands",
         "industryBriefCustomerChannels",
         "industryBriefCompetitors",
         "industryBriefLocalMarketEvents",
         "industryBriefKnownOpportunities"
       FROM "CompanyProfile"
       WHERE "companyId" = $1
       LIMIT 1`,
      companyId,
    ).catch(() => []),
  ]);
  if (!company) {
    throw new Error('Company not found');
  }
  if (!String(company.industrySectorCategory || '').trim() || !String(company.addressCity || '').trim() || !String(company.addressState || '').trim()) {
    throw new Error('Industry Brief unavailable: missing company industry/location.');
  }
  const industryGroup = INDUSTRY_SECTORS.find((sector) => String(sector.id) === String(company.industrySector || ''));
  const intelligence = intelligenceRows[0] || null;
  const intelligenceBrands = stringList(intelligence?.industryBriefBrands);
  const profileText = [
    company.profile?.workforce,
    company.profile?.specialNotes,
    company.profile?.qoeNotes,
    labeledText('Product/capability focus', intelligence?.industryBriefProductFocus),
    labeledText('Brands/product lines', intelligenceBrands),
    labeledText('Customer channels', intelligence?.industryBriefCustomerChannels),
    labeledText('Competitors/local market events', intelligence?.industryBriefCompetitors),
    labeledText('Known local developments', intelligence?.industryBriefLocalMarketEvents),
    labeledText('Known opportunity themes', intelligence?.industryBriefKnownOpportunities),
  ].map((part) => String(part || '').trim()).filter(Boolean).join('\n');
  const productContext = uniqueText([
    intelligence?.industryBriefProductFocus,
    ...intelligenceBrands,
    ...productRows.flatMap((row) => [row.itemName, row.sku]),
    ...inventoryRows.flatMap((row) => [row.itemName, row.sku]),
  ], 30);
  const customerContext = uniqueText([
    intelligence?.industryBriefCustomerChannels,
    ...customerRows.map((row) => row.customerName),
  ], 20);
  return {
    ...company,
    industryGroupName: industryGroup?.name || null,
    industryGroupDescription: industryGroup?.description || null,
    profileText,
    productContext,
    customerContext,
  };
}

function companyIntelligenceSource(company: { profileText?: string | null }): IndustryBriefSourceRecord | null {
  const summary = String(company.profileText || '').trim();
  if (!summary) return null;
  return {
    id: 'corelytics-company-intelligence',
    provider: 'Corelytics Company Profile',
    category: 'Company Intelligence',
    title: 'First-party company setup intelligence',
    publishedAt: new Date().toISOString(),
    summary,
    citations: ['Corelytics company profile'],
  };
}

export async function generateAndCacheDailyIndustryBrief(params: {
  companyId: string;
  forceSources?: boolean;
}): Promise<DailyIndustryBrief> {
  const companyId = String(params.companyId || '').trim();
  if (!companyId) throw new Error('companyId is required');

  const company = await loadIndustryBriefCompany(companyId);
  const financialFacts = await loadIndustryBriefFinancialFacts(companyId);
  const aiConfig = getIndustryBriefAiConfig();
  const shell = buildDailyIndustryBriefShell({ company, financialFacts });
  shell.aiMetadata = {
    aiGenerated: true,
    transport: aiConfig.transport,
    finalModel: aiConfig.finalModel,
    scanModel: aiConfig.scanModel,
  };

  const sourceBundle = await getCachedIndustryBriefSources({
    companyId,
    context: {
      name: shell.company.name,
      industry: shell.company.industry,
      segment: shell.company.segment,
      location: shell.company.location,
      sectorKey: normalizeIndustrySectorCategory(company.industrySectorCategory),
      industryGroupName: company.industryGroupName,
      industryGroupDescription: company.industryGroupDescription,
      profileText: company.profileText,
      productContext: company.productContext,
      customerContext: company.customerContext,
    },
    force: params.forceSources,
  });

  const sourceRecords = [
    ...sourceBundle.records,
    ...[companyIntelligenceSource(company)].filter((record): record is IndustryBriefSourceRecord => Boolean(record)),
  ];

  const brief = await synthesizeIndustryBriefWithAi({
    baseBrief: shell,
    sourceRecords,
    config: aiConfig,
    financialFacts,
  });
  await writeCachedIndustryBrief(companyId, brief);
  return brief;
}

export { readCachedIndustryBrief };
