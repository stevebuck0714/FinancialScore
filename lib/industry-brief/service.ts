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

function percentLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function compactMoney(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return `$${Math.round(value)}`;
}

function inferProductThemes(productText: string): string[] {
  const text = productText.toLowerCase();
  const themes: string[] = [];
  if (/(breakfast|cinnamon|swirl|raisin|toast|morning|danish|coffee cake|sweet bread|banana|nut bread|muffin)/.test(text)) themes.push('breakfast breads');
  if (/(frozen|freezer|thaw|bake[- ]?off|par[- ]?baked)/.test(text)) themes.push('frozen or bake-off bread');
  if (/(bun|roll|sandwich|hoagie|sub|hamburger|hot dog)/.test(text)) themes.push('sandwich buns and rolls');
  if (/(artisan|specialty|premium|craft)/.test(text)) themes.push('specialty bakery products');
  if (/(private label|store brand|grocery)/.test(text)) themes.push('grocery/private-label bakery channel');
  return Array.from(new Set(themes));
}

function productThemeBuckets(text: string): string[] {
  const normalized = text.toLowerCase();
  const buckets: string[] = [];
  if (/(breakfast|cinnamon|swirl|raisin|toast|morning|danish|coffee cake|sweet bread|banana|nut bread|muffin)/.test(normalized)) buckets.push('breakfast breads');
  if (/(frozen|freezer|thaw|bake[- ]?off|par[- ]?baked)/.test(normalized)) buckets.push('frozen or bake-off bread');
  if (/(bun|roll|sandwich|hoagie|sub|hamburger|hot dog)/.test(normalized)) buckets.push('sandwich buns and rolls');
  if (/(private label|store brand)/.test(normalized)) buckets.push('private-label bakery');
  if (/(loaf|white bread|wheat bread|italian bread|rye bread)/.test(normalized)) buckets.push('loaf bread');
  return buckets.length ? buckets : ['other bakery products'];
}

function revenueWeightedProductContext(rows: Array<{ itemName: string; sku: string | null; revenue: number; quantitySold: number }>): string {
  const totalRevenue = rows.reduce((sum, row) => sum + Math.max(0, asNumber(row.revenue)), 0);
  return rows
    .slice(0, 20)
    .map((row) => {
      const revenue = Math.max(0, asNumber(row.revenue));
      const share = totalRevenue > 0 ? `, ${percentLabel(revenue / totalRevenue)} of top-product revenue` : '';
      const sku = row.sku ? ` (${row.sku})` : '';
      const quantity = asNumber(row.quantitySold) > 0 ? `, qty ${Math.round(asNumber(row.quantitySold))}` : '';
      return `${row.itemName}${sku}: ${compactMoney(revenue)}${share}${quantity}`;
    })
    .join('; ');
}

function revenueWeightedCustomerContext(rows: Array<{ customerName: string; revenue: number }>): string {
  const totalRevenue = rows.reduce((sum, row) => sum + Math.max(0, asNumber(row.revenue)), 0);
  return rows
    .slice(0, 15)
    .map((row) => {
      const revenue = Math.max(0, asNumber(row.revenue));
      const share = totalRevenue > 0 ? `, ${percentLabel(revenue / totalRevenue)} of top-customer revenue` : '';
      return `${row.customerName}: ${compactMoney(revenue)}${share}`;
    })
    .join('; ');
}

function revenueWeightedProductThemeMix(rows: Array<{ itemName: string; sku: string | null; revenue: number }>): string {
  const totals = new Map<string, number>();
  let totalRevenue = 0;
  rows.forEach((row) => {
    const revenue = Math.max(0, asNumber(row.revenue));
    if (revenue <= 0) return;
    totalRevenue += revenue;
    const buckets = productThemeBuckets(`${row.itemName} ${row.sku || ''}`);
    buckets.forEach((bucket) => {
      totals.set(bucket, (totals.get(bucket) || 0) + revenue / buckets.length);
    });
  });
  if (totalRevenue <= 0 || totals.size === 0) return '';
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([theme, revenue]) => `${theme}: ${percentLabel(revenue / totalRevenue)} of classified top-product revenue`)
    .join('; ');
}

function isCommercialBakeryContext(value: string): boolean {
  const text = value.toLowerCase();
  return /(baker|bakery|bread)/.test(text)
    && /(commercial|manufactur|wholesale|distribution|distributor|grocery|private label|foodservice|institution|route|regional|brand)/.test(text);
}

function strategicMarketThesis(params: {
  companyName: string;
  industryText: string;
  productContext: string;
  customerContext: string;
  profileText: string;
}): string {
  const combined = [
    params.companyName,
    params.industryText,
    params.productContext,
    params.customerContext,
    params.profileText,
  ].join(' ');
  if (!isCommercialBakeryContext(combined)) return '';
  return [
    'Competitive frame: commercial/regional bakery supply, not neighborhood retail bakery.',
    'Relevant competitor set: commercial bread and breakfast bread manufacturers; grocery/private-label suppliers; wholesale bakery distributors; regional branded bread companies; foodservice/institutional bakery suppliers.',
    'Competitive change signals to research: capacity closures, plant shutdowns, route/distribution exits, pricing moves, shelf-space changes, supplier distress, and successor/acquirer activity.',
    'Growth/M&A signals to research: similar regional commercial bakers, complementary breakfast/specialty/frozen or bake-off product lines, routes, brands, grocery/customer relationships, co-manufacturing partners, merger partners, and acquisition targets.',
    'Targeted search examples for source collection: Schwebel Baking Company closing Pittsburgh bakery bread competitor; western Pennsylvania bakery closing bread grocery Schwebel; breakfast bread bakery competitor Pittsburgh grocery channel.',
  ].join('\n');
}

function inferCustomerChannels(customerText: string): string[] {
  const text = customerText.toLowerCase();
  const channels: string[] = [];
  if (/(grocery|market|supermarket|kroger|giant eagle|walmart|aldi|meijer|shop|store)/.test(text)) channels.push('grocery retail');
  if (/(restaurant|cafe|diner|foodservice|food service|hospitality|hotel|club)/.test(text)) channels.push('foodservice');
  if (/(school|university|college|hospital|health|institution|correction|jail|senior|nursing)/.test(text)) channels.push('institutional foodservice');
  if (/(distributor|distribution|wholesale|warehouse|sysco|us foods)/.test(text)) channels.push('wholesale/distributor');
  return Array.from(new Set(channels));
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
      select: { itemName: true, sku: true, quantitySold: true, revenue: true },
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
      select: { customerName: true, revenue: true },
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
  const weightedProductContext = revenueWeightedProductContext(productRows);
  const weightedCustomerContext = revenueWeightedCustomerContext(customerRows);
  const productThemeMix = revenueWeightedProductThemeMix(productRows);
  const productContext = uniqueText([
    intelligence?.industryBriefProductFocus,
    ...intelligenceBrands,
    weightedProductContext,
    productThemeMix,
    ...productRows.flatMap((row) => [row.itemName, row.sku]),
    ...inventoryRows.flatMap((row) => [row.itemName, row.sku]),
  ], 30);
  const customerContext = uniqueText([
    intelligence?.industryBriefCustomerChannels,
    weightedCustomerContext,
    ...customerRows.map((row) => row.customerName),
  ], 20);
  const inferredProductThemes = inferProductThemes(productContext);
  const inferredCustomerChannels = inferCustomerChannels(customerContext);
  const marketThesisContext = strategicMarketThesis({
    companyName: company.name,
    industryText: [company.industrySectorCategory, industryGroup?.name, industryGroup?.description].filter(Boolean).join(' '),
    productContext,
    customerContext,
    profileText,
  });
  const operationalProfileText = [
    labeledText('Top products/items from operational data', productContext),
    labeledText('Revenue-weighted product theme mix from operational data', productThemeMix),
    labeledText('Inferred product themes from operational data', inferredProductThemes),
    labeledText('Top customers/channels from operational data', customerContext),
    labeledText('Inferred customer channels from operational data', inferredCustomerChannels),
    labeledText('Strategic market and competitor thesis', marketThesisContext),
  ].filter(Boolean).join('\n');
  return {
    ...company,
    industryGroupName: industryGroup?.name || null,
    industryGroupDescription: industryGroup?.description || null,
    profileText: [profileText, operationalProfileText].filter(Boolean).join('\n'),
    productContext,
    customerContext,
    marketThesisContext,
    operationalProfileText,
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

function operationalProductMixSource(company: { operationalProfileText?: string | null }): IndustryBriefSourceRecord | null {
  const summary = String(company.operationalProfileText || '').trim();
  if (!summary) return null;
  return {
    id: 'corelytics-operational-product-mix',
    provider: 'Corelytics Company Profile',
    category: 'Operational Product and Channel Evidence',
    title: 'Operational product and customer mix',
    publishedAt: new Date().toISOString(),
    summary,
    citations: ['Corelytics operational product and customer snapshots'],
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
      marketThesisContext: company.marketThesisContext,
    },
    force: params.forceSources,
  });

  const sourceRecords = [
    ...sourceBundle.records,
    ...[companyIntelligenceSource(company)].filter((record): record is IndustryBriefSourceRecord => Boolean(record)),
    ...[operationalProductMixSource(company)].filter((record): record is IndustryBriefSourceRecord => Boolean(record)),
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
