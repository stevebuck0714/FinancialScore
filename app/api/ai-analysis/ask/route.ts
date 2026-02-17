import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { getBenchmarkValue } from '@/app/utils/data-processing';
import { indexCompanyDocument } from '@/lib/company-documents/index-document';
import { retrieveDocumentChunks } from '@/lib/company-documents/retrieve-chunks';
import { createModelText } from '@/lib/openai-helpers';

type RatioSnapshot = {
  name: string;
  value: number | null;
  benchmark: number | null;
  unit: 'ratio' | 'percent' | 'days';
};

function buildRatioSnapshot(month: any, benchmarks: any[]): RatioSnapshot[] {
  if (!month) return [];

  const revenue = month.revenue || 0;
  const cogs = month.cogsTotal || 0;
  const grossProfit = revenue - cogs;

  const operatingExpenses = (month.payroll || 0) + (month.ownerBasePay || 0) + (month.benefits || 0) +
    (month.insurance || 0) + (month.professionalFees || 0) + (month.subcontractors || 0) +
    (month.rent || 0) + (month.taxLicense || 0) + (month.phoneComm || 0) + (month.infrastructure || 0) +
    (month.autoTravel || 0) + (month.salesExpense || 0) + (month.marketing || 0) +
    (month.trainingCert || 0) + (month.mealsEntertainment || 0) + (month.otherExpense || 0);

  const ebit = grossProfit - operatingExpenses;
  const ebitda = ebit + (month.depreciationAmortization || 0);
  const netProfit = ebit - (month.interestExpense || 0);

  const cash = month.cash || 0;
  const ar = month.ar || 0;
  const inventory = month.inventory || 0;
  const otherCA = month.otherCA || 0;
  const tca = month.tca || (cash + ar + inventory + otherCA);

  const fixedAssets = month.fixedAssets || 0;
  const otherNCA = month.otherNCA || 0;
  const totalAssets = month.totalAssets || (tca + fixedAssets + otherNCA);

  const ap = month.ap || 0;
  const otherCL = month.otherCL || 0;
  const tcl = month.tcl || (ap + otherCL);

  const ltDebt = month.ltDebt || 0;
  const otherLTL = month.otherLTL || 0;
  const totalLiabilities = month.totalLiabilities || (tcl + ltDebt + otherLTL);

  const equity = month.equity || (totalAssets - totalLiabilities);

  const currentRatio = tcl > 0 ? tca / tcl : 0;
  const quickRatio = tcl > 0 ? (tca - inventory) / tcl : 0;
  const workingCapital = tca - tcl;

  const invTurnover = inventory > 0 ? cogs / inventory : 0;
  const arTurnover = ar > 0 ? revenue / ar : 0;
  const apTurnover = ap > 0 ? cogs / ap : 0;
  const daysInv = invTurnover > 0 ? 365 / invTurnover : 0;
  const daysAR = arTurnover > 0 ? 365 / arTurnover : 0;
  const daysAP = apTurnover > 0 ? 365 / apTurnover : 0;
  const salesWC = workingCapital > 0 ? revenue / workingCapital : 0;

  const interestCov = (month.interestExpense || 0) > 0 ? ebit / (month.interestExpense || 0) : 0;
  const debtSvcCov = (ltDebt + tcl) > 0 ? (netProfit + (month.depreciationAmortization || 0)) / (ltDebt + tcl) : 0;
  const cfToDebt = (ltDebt + tcl) > 0 ? netProfit / (ltDebt + tcl) : 0;

  const debtToNW = equity > 0 ? totalLiabilities / equity : 0;
  const fixedToNW = equity > 0 ? fixedAssets / equity : 0;
  const leverage = equity > 0 ? totalAssets / equity : 0;

  const totalAssetTO = totalAssets > 0 ? revenue / totalAssets : 0;
  const roe = equity > 0 ? netProfit / equity : 0;
  const roa = totalAssets > 0 ? netProfit / totalAssets : 0;
  const ebitdaMargin = revenue > 0 ? ebitda / revenue : 0;
  const ebitMargin = revenue > 0 ? ebit / revenue : 0;

  const rows: Array<{ name: string; value: number; unit: RatioSnapshot['unit'] }> = [
    { name: 'Current Ratio', value: currentRatio, unit: 'ratio' },
    { name: 'Quick Ratio', value: quickRatio, unit: 'ratio' },
    { name: 'Inventory Turnover', value: invTurnover, unit: 'ratio' },
    { name: 'Receivables Turnover', value: arTurnover, unit: 'ratio' },
    { name: 'Payables Turnover', value: apTurnover, unit: 'ratio' },
    { name: 'Days Inventory', value: daysInv, unit: 'days' },
    { name: 'Days Receivables', value: daysAR, unit: 'days' },
    { name: 'Days Payables', value: daysAP, unit: 'days' },
    { name: 'Sales/Working Capital', value: salesWC, unit: 'ratio' },
    { name: 'Interest Coverage', value: interestCov, unit: 'ratio' },
    { name: 'Debt Service Coverage', value: debtSvcCov, unit: 'ratio' },
    { name: 'Cash Flow to Debt', value: cfToDebt, unit: 'ratio' },
    { name: 'Debt/Net Worth', value: debtToNW, unit: 'ratio' },
    { name: 'Fixed Assets/Net Worth', value: fixedToNW, unit: 'ratio' },
    { name: 'Leverage Ratio', value: leverage, unit: 'ratio' },
    { name: 'Total Asset Turnover', value: totalAssetTO, unit: 'ratio' },
    { name: 'ROE', value: roe, unit: 'percent' },
    { name: 'ROA', value: roa, unit: 'percent' },
    { name: 'EBITDA/Revenue', value: ebitdaMargin, unit: 'percent' },
    { name: 'EBIT/Revenue', value: ebitMargin, unit: 'percent' },
  ];

  return rows.map((row) => ({
    name: row.name,
    value: Number.isFinite(row.value) ? row.value : null,
    benchmark: getBenchmarkValue(benchmarks, row.name),
    unit: row.unit,
  }));
}

type ChangeSummary = {
  current: number | null;
  previous: number | null;
  delta: number | null;
  direction: 'increased' | 'decreased' | 'flat' | 'unknown';
  percentChange: number | null;
};

function buildChangeSummary(current?: number | null, previous?: number | null): ChangeSummary {
  if (typeof current !== 'number' || typeof previous !== 'number') {
    return { current: current ?? null, previous: previous ?? null, delta: null, direction: 'unknown', percentChange: null };
  }
  const delta = current - previous;
  const direction = delta === 0 ? 'flat' : delta > 0 ? 'increased' : 'decreased';
  const percentChange = previous !== 0 ? (delta / Math.abs(previous)) * 100 : null;
  return { current, previous, delta, direction, percentChange };
}

type SerperOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
};

async function serpApiSearch(query: string): Promise<SerperOrganicResult[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    return [];
  }

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('num', '10');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('gl', 'us');
  url.searchParams.set('api_key', apiKey);

  const res = await fetch(url.toString(), { method: 'GET' });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Web search failed (${res.status}): ${txt || res.statusText}`);
  }

  const data: any = await res.json();
  // SerpApi format: organic_results: [{ title, link, snippet, date }, ...]
  const organic = Array.isArray(data?.organic_results) ? (data.organic_results as SerperOrganicResult[]) : [];
  return organic
    .filter((r) => r?.link)
    .slice(0, 8)
    .map((r) => ({
      title: r.title,
      link: r.link,
      snippet: r.snippet,
      date: r.date,
    }));
}

function safeJsonParse(rawContent: string): any {
  const raw = String(rawContent || '');
  if (!raw.trim()) {
    throw new Error('Failed to parse model JSON (empty response)');
  }

  // Strip BOM and common markdown fences
  let s = raw.replace(/^\uFEFF/, '').trim();
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

  function extractFirstJsonValue(text: string): string | null {
    const startObj = text.indexOf('{');
    const startArr = text.indexOf('[');
    const start =
      startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr);
    if (start < 0) return null;
    const open = text[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inStr = false;
        }
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === open) depth += 1;
      if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
    return null;
  }

  try {
    return JSON.parse(s);
  } catch {
    // Best-effort extraction of first JSON value from surrounding text.
    const candidate = extractFirstJsonValue(s);
    if (candidate) {
      try {
        return JSON.parse(candidate);
      } catch {
        // fall through
      }
    }
    throw new Error('Failed to parse model JSON');
  }
}

type AskOutput = {
  shortAnswer: string;
  longAnswer: string;
  citedBullets: Array<{
    text: string;
    citations: Array<{ url: string; title?: string; publishedDate?: string | null }>;
  }>;
  howThisImpactsUs: string;
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
};

const REFERRAL_BLOCKLIST = ['yelp', "angi", "angie's list", 'homeadvisor', 'yellow pages'];

function buildDocumentExcerpt(params: {
  fullText: string;
  question: string;
  maxChars: number;
}): { excerpt: string; strategy: string } {
  const { fullText, question, maxChars } = params;
  const text = String(fullText || '');
  const q = String(question || '').toLowerCase();
  const lower = text.toLowerCase();

  if (!text) return { excerpt: '', strategy: 'empty' };

  const needles: string[] = [];
  if (q.includes('covenant')) needles.push('covenant');
  if (q.includes('financial')) needles.push('financial covenant');
  if (q.includes('report')) needles.push('reporting covenant');
  if (q.includes('affirm')) needles.push('affirmative covenant');
  if (q.includes('negative')) needles.push('negative covenant');
  if (q.includes('events of default')) needles.push('events of default');
  // Always include covenant as a catch-all when the user is document-searching.
  if (!needles.includes('covenant')) needles.push('covenant');

  // Prefer a heading-like "Covenants" mention if present.
  const headingMatch = lower.match(/(?:^|\n)\s*(?:section\s+\d+(?:\.\d+)*\s*)?covenants?\b/);
  const headingIdx = headingMatch?.index ?? -1;

  let bestIdx = headingIdx;
  if (bestIdx < 0) {
    for (const n of needles) {
      const i = lower.indexOf(n);
      if (i >= 0) {
        bestIdx = i;
        break;
      }
    }
  }

  // If we found a relevant anchor, take a large "after" window (sections usually follow the header).
  if (bestIdx >= 0) {
    const before = Math.min(8000, Math.floor(maxChars * 0.15));
    const after = maxChars - before;
    const start = Math.max(0, bestIdx - before);
    const end = Math.min(text.length, bestIdx + after);
    const excerpt = text.slice(start, end);
    const strategy = headingIdx >= 0 ? 'anchor:heading-covenants' : 'anchor:keyword';
    return { excerpt, strategy };
  }

  // No obvious anchor: covenant sections are often later → bias toward the tail.
  if (text.length <= maxChars) return { excerpt: text, strategy: 'full' };
  return { excerpt: text.slice(Math.max(0, text.length - maxChars)), strategy: 'tail' };
}

type TrendChange = {
  startDate: string | null;
  startValue: number | null;
  absolute: number | null;
  percent: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const EXTERNAL_QUERY_TERMS = [
  'competitor',
  'competitors',
  'competition',
  'market',
  'industry',
  'peer',
  'peers',
  'benchmark',
  'benchmarks',
  'macro',
  'economic',
  'inflation',
  'interest rates',
  'labor market',
  'supply chain',
  'regulatory',
  'geopolitical',
  'news',
];

const INTERNAL_QUERY_TERMS = [
  'kpi',
  'kpis',
  'metric',
  'metrics',
  'financial',
  'margin',
  'revenue',
  'expense',
  'cogs',
  'cash',
  'ar',
  'ap',
  'coa',
  'operational',
  'daily',
  'monthly',
  'trend',
  'trends',
  'variance',
  'goal',
  'goals',
  'target',
  'performance',
  'run-rate',
  'run rate',
  'collections',
  'dso',
  'aging',
];

const COMPETITOR_QUERY_TERMS = [
  'competitor',
  'competitors',
  'competition',
  'peer',
  'peers',
  'benchmark',
  'benchmarks',
  'market',
];

function isInternalOnlyQuestion(question: string): boolean {
  const q = question.toLowerCase();
  const hasInternal = INTERNAL_QUERY_TERMS.some((term) => q.includes(term));
  const hasExternal = EXTERNAL_QUERY_TERMS.some((term) => q.includes(term));
  return hasInternal && !hasExternal;
}

function isCompetitorQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return COMPETITOR_QUERY_TERMS.some((term) => q.includes(term));
}

function shouldUseExternalSources(question: string, override?: boolean | null): boolean {
  if (override === true) {
    return !isInternalOnlyQuestion(question);
  }
  if (override === false) return false;
  const q = question.toLowerCase();
  const hasExternal = EXTERNAL_QUERY_TERMS.some((term) => q.includes(term));
  return hasExternal;
}

function parseRequestedCount(question: string): number | null {
  const q = question.toLowerCase();
  const match = q.match(/\b(?:top|list|show|give|provide)\s+(\d{1,2})\b/);
  if (match?.[1]) {
    const n = Number(match[1]);
    if (!Number.isNaN(n) && n > 0 && n <= 25) return n;
  }
  return null;
}

function containsReferral(text: string): boolean {
  const lower = text.toLowerCase();
  return REFERRAL_BLOCKLIST.some((term) => lower.includes(term));
}

function isListInvalid(parsed: AskOutput, requestedCount: number | null): boolean {
  if (!requestedCount) return false;
  const bullets = Array.isArray(parsed?.citedBullets) ? parsed.citedBullets : [];
  if (bullets.length !== requestedCount) return true;
  const combined = [
    parsed?.shortAnswer || '',
    parsed?.longAnswer || '',
    parsed?.howThisImpactsUs || '',
    ...bullets.map((b) => b?.text || ''),
  ].join(' ');
  return containsReferral(combined);
}

function hasValidCitations(
  citedBullets: AskOutput['citedBullets'],
  allowedUrls: Set<string>,
): boolean {
  for (const b of citedBullets) {
    const text = String(b?.text || '').trim();
    if (text.length < 3) return false;
    if (containsReferral(text)) return false;
    const citations = Array.isArray(b?.citations) ? b.citations : [];
    if (citations.length < 1) return false;
    for (const c of citations) {
      const url = String(c?.url || '').trim();
      if (!allowedUrls.has(url)) return false;
    }
  }
  return true;
}

function hasNonEmptyBullets(citedBullets: AskOutput['citedBullets']): boolean {
  if (!Array.isArray(citedBullets) || citedBullets.length === 0) return false;
  return citedBullets.every((b) => String(b?.text || '').trim().length >= 3);
}

function extractCompanyCandidates(
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>,
): Array<{ name: string; sourceUrl: string; sourceTitle?: string }> {
  const candidates: Array<{ name: string; sourceUrl: string; sourceTitle?: string }> = [];
  const seen = new Set<string>();
  for (const s of sources) {
    const title = String(s.title || '').trim();
    if (!title) continue;
    const raw = title
      .split(' - ')[0]
      .split(' | ')[0]
      .split(' — ')[0]
      .split(':')[0]
      .trim();
    if (raw.length < 3) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ name: raw, sourceUrl: s.url, sourceTitle: s.title || undefined });
  }
  return candidates;
}

function buildFallbackFromSources(params: {
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  companyName: string;
  question: string;
  requestedCount: number | null;
  internalSummary?: Record<string, any>;
}): AskOutput {
  const { sources, companyName, question, requestedCount, internalSummary } = params;
  const hasDoc = !!internalSummary?.documentContext;
  const q = question.toLowerCase();
  const isMarginQuestion = ['margin', 'gross margin', 'ebitda', 'ebit'].some((term) => q.includes(term));
  const latest = internalSummary?.monthlySnapshot?.latest;
  const previous = internalSummary?.monthlySnapshot?.previous;

  if (hasDoc) {
    const docName = internalSummary?.documentContext?.fileName || 'the selected document';
    const citedBullets = sources.map((s) => ({
      text: `${s.title || docName} — I could not reliably extract a complete answer; open the source and try a narrower question.`,
      citations: [{ url: s.url, title: s.title, publishedDate: s.publishedDate }],
    }));
    return {
      shortAnswer: `I couldn't reliably answer that from ${docName}.`,
      longAnswer:
        `This usually happens when the extracted text is incomplete (scanned PDF / complex formatting) or the question is too broad. ` +
        `Try a narrower prompt like "List financial covenants", "List reporting covenants", or "Find the section titled Covenants and summarize it".`,
      citedBullets,
      howThisImpactsUs:
        'If we can extract the covenant section cleanly, Corelytics can summarize and track compliance tasks; otherwise we may need a cleaner PDF or a DOCX version.',
      sources,
    };
  }

  if (isMarginQuestion && latest && previous) {
    const latestRevenue = latest.revenue || 0;
    const prevRevenue = previous.revenue || 0;
    const latestCogs = latest.cogsTotal || 0;
    const prevCogs = previous.cogsTotal || 0;
    const latestExpense = latest.expense || 0;
    const prevExpense = previous.expense || 0;

    const latestGrossMargin = latestRevenue > 0 ? (latestRevenue - latestCogs) / latestRevenue : 0;
    const prevGrossMargin = prevRevenue > 0 ? (prevRevenue - prevCogs) / prevRevenue : 0;
    const marginDelta = (latestGrossMargin - prevGrossMargin) * 100;

    const formatCurrency = (value: number) => `$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const formatPct = (value: number) => `${Math.abs(value).toFixed(1)}%`;

    const citedBullets = sources.map((s) => ({
      text: `${s.title || 'Internal data source'} — Evidence for revenue, COGS, and expense trends.`,
      citations: [{ url: s.url, title: s.title, publishedDate: s.publishedDate }],
    }));

    return {
      shortAnswer: `Gross margin moved ${marginDelta >= 0 ? 'up' : 'down'} ${formatPct(marginDelta)} versus the prior month. The biggest drivers are revenue, COGS, and operating expense shifts.`,
      longAnswer: `Revenue changed by ${formatCurrency(latestRevenue - prevRevenue)}, COGS changed by ${formatCurrency(latestCogs - prevCogs)}, and operating expense changed by ${formatCurrency(latestExpense - prevExpense)}. Gross margin is ${marginDelta >= 0 ? 'higher' : 'lower'} by ${formatPct(marginDelta)} versus the prior month. Review Data Review for line-item detail and Operations for cash/AR impacts.`,
      citedBullets,
      howThisImpactsUs: 'Margin change is primarily driven by revenue mix and COGS/expense movement; use this to target pricing, cost control, and mix improvements.',
      sources,
    };
  }

  if (!isCompetitorQuestion(question)) {
    const citedBullets = sources.map((s) => ({
      text: `${s.title || 'Internal data source'} — Review this page for relevant financial/operational data.`,
      citations: [{ url: s.url, title: s.title, publishedDate: s.publishedDate }],
    }));
    return {
      shortAnswer:
        'I could not synthesize a reliable answer from internal data. Please review the linked financial and operational data sources.',
      longAnswer:
        'Please review the Data Review (financials) and Operations (operational snapshots) pages. If more context is needed, ensure recent data has been imported and operational snapshots are up to date.',
      citedBullets,
      howThisImpactsUs:
        'Rely on internal data for operational diagnostics. External sources are not appropriate for company-specific cash/AR performance.',
      sources,
    };
  }
  const candidates = extractCompanyCandidates(sources);
  const targetCount = requestedCount ?? Math.min(5, candidates.length);
  const picks = candidates.slice(0, targetCount);
  const citedBullets = picks.map((c) => ({
    text: `${c.name} — Listed in source results; verify services and location on the cited source.`,
    citations: [{ url: c.sourceUrl, title: c.sourceTitle }],
  }));
  const sourceTitles = picks.map((c) => c.name).join(', ');
  return {
    shortAnswer:
      picks.length > 0
        ? `Here are ${picks.length} competitors related to ${companyName || 'the company'} based on available sources.`
        : `No competitors could be confirmed from the available sources for: ${question}`,
    longAnswer:
      picks.length > 0
        ? `Sources identify these companies as related competitors or peer fabricators: ${sourceTitles}. Use the cited links for addresses and capabilities.`
        : 'The available sources did not list identifiable competitors. Try a more specific query or location.',
    citedBullets,
    howThisImpactsUs:
      picks.length > 0
        ? 'Use this list for initial outreach or benchmarking; confirm scope and capabilities directly with each firm.'
        : 'No sourced competitor list was available; broaden the query or add a location qualifier.',
    sources,
  };
}

function toDayKey(d: Date): number {
  const date = new Date(d);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function getValueAtOrBefore(
  sortedKeys: number[],
  targetKey: number,
  valueByKey: Map<number, number>,
): { dateKey: number; value: number } | null {
  for (let i = sortedKeys.length - 1; i >= 0; i -= 1) {
    const key = sortedKeys[i];
    if (key <= targetKey) {
      return { dateKey: key, value: valueByKey.get(key) ?? 0 };
    }
  }
  return null;
}

function computeChange(
  valueByKey: Map<number, number>,
  daysBack: number,
): { latestDate: string | null; latestValue: number | null; change: TrendChange } {
  const keys = Array.from(valueByKey.keys()).sort((a, b) => a - b);
  if (keys.length === 0) {
    return { latestDate: null, latestValue: null, change: { startDate: null, startValue: null, absolute: null, percent: null } };
  }

  const latestKey = keys[keys.length - 1];
  const latestValue = valueByKey.get(latestKey) ?? 0;
  const targetKey = latestKey - daysBack * DAY_MS;
  const start = getValueAtOrBefore(keys, targetKey, valueByKey);

  if (!start) {
    return {
      latestDate: new Date(latestKey).toISOString(),
      latestValue,
      change: { startDate: null, startValue: null, absolute: null, percent: null },
    };
  }

  const absolute = latestValue - start.value;
  const percent = start.value !== 0 ? (absolute / start.value) * 100 : null;

  return {
    latestDate: new Date(latestKey).toISOString(),
    latestValue,
    change: {
      startDate: new Date(start.dateKey).toISOString(),
      startValue: start.value,
      absolute,
      percent,
    },
  };
}

function buildSourcesForPrompt(
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>,
) {
  // Keep prompt compact: include short snippets for grounding.
  return sources.map((s, idx) => ({
    i: idx + 1,
    url: s.url,
    title: s.title || undefined,
    publishedDate: s.publishedDate || null,
    snippet: s.snippet ? String(s.snippet).slice(0, 220) : undefined,
  }));
}

async function generateAskJson(params: {
  openai: OpenAI;
  model: string;
  companyName: string;
  question: string;
  internalSummary: Record<string, unknown>;
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  mode: 'full' | 'compact';
  requestedCount: number | null;
  strictCitations?: boolean;
}): Promise<{ parsed: AskOutput; finish_reason: string | null | undefined; contentPreview: string; contentLength: number }> {
  const { openai, model, companyName, question, internalSummary, sources, mode, requestedCount, strictCitations } = params;
  const hasDoc = !!(internalSummary as any)?.documentContext?.id;
  const docCtx = hasDoc ? ((internalSummary as any).documentContext as any) : null;
  const retrievedChunks = hasDoc && Array.isArray(docCtx?.retrievedChunks) ? (docCtx.retrievedChunks as any[]) : [];
  const qLower = String(question || '').toLowerCase();
  const docLooksLikeListRequest =
    /\b(list|enumerate|identify|what are|which are|give me)\b/.test(qLower) &&
    !/\b(why|explain|summarize|describe)\b/.test(qLower);
  const retrievedChunkText = hasDoc
    ? retrievedChunks
        .map((c) => {
          const chunkIndex = typeof c?.chunkIndex === 'number' ? c.chunkIndex : '?';
          const score = typeof c?.score === 'number' ? c.score.toFixed(3) : '';
          const kw = typeof c?.keywordRank === 'number' ? c.keywordRank.toFixed(3) : '';
          const dist = typeof c?.vectorDistance === 'number' ? c.vectorDistance.toFixed(4) : '';
          const meta = [score ? `score=${score}` : null, kw ? `kw=${kw}` : null, dist ? `dist=${dist}` : null].filter(Boolean).join(' ');
          const text = String(c?.text || '').trim();
          return `[[chunk ${chunkIndex}${meta ? ` ${meta}` : ''}]]\n${text}`;
        })
        .join('\n\n-----\n\n')
    : '';

  const sourceList = buildSourcesForPrompt(sources);

  const system = hasDoc
    ? [
        'You are an expert analyst reading retrieved chunks from a company document.',
        'Return VALID JSON only.',
        'All factual claims must be grounded in the provided retrieved chunks and cite ONLY the allowed source URL.',
        'Do not invent numbers, dates, thresholds, names, or section numbers not present in the chunks.',
      ].join('\n')
    : [
        'You are an expert financial/operational analyst.',
        'Return VALID JSON only.',
        'All factual claims must be grounded in the provided sources.',
        'Do not invent URLs. Citations must reference only the provided source URLs.',
        'Focus strictly on financial and operational analysis.',
        'Do NOT reference internal Payments tab data or subscription/billing plan terms.',
        'Do NOT invent metrics or KPIs that are not present in the internal summary.',
        'In this app, KPIs are the same as ratio metrics shown in the Ratios view. Treat KPI questions as ratio questions.',
        'When describing month-over-month changes, use internalSummary.monthlyChanges.direction and values.',
        'If the user asks for a list of N items, provide N items directly (no referrals to other sites).',
      ].join('\n');

  const requirements =
    mode === 'full'
      ? [
          'Output MUST include these top-level keys exactly:',
          '"shortAnswer", "longAnswer", "citedBullets", "howThisImpactsUs", "sources".',
          'shortAnswer: 2-4 sentences.',
          'longAnswer: concise and direct, keep it under ~250 words.',
          hasDoc
            ? (docLooksLikeListRequest
                ? 'citedBullets: list the relevant extracted items; 5-15 bullets is fine; EVERY bullet must include >=1 citation.'
                : 'citedBullets: 3-8 bullets capturing the most relevant grounded points; EVERY bullet must include >=1 citation.')
            : 'citedBullets: 7-10 bullets; EVERY bullet must include >=1 citation.',
          'howThisImpactsUs: REQUIRED, keep it concise (<= 120 words).',
          'sources: must be the provided sources list (same URLs; you may reorder; do not add new URLs).',
        ]
      : [
          // Compact mode to avoid truncation on retry
          'Output MUST include these top-level keys exactly:',
          '"shortAnswer", "longAnswer", "citedBullets", "howThisImpactsUs", "sources".',
          'shortAnswer: 2-3 sentences.',
          'longAnswer: keep it short (<= 200 words).',
          hasDoc
            ? (docLooksLikeListRequest
                ? 'citedBullets: 4-10 bullets; EVERY bullet must include >=1 citation.'
                : 'citedBullets: 2-6 bullets; EVERY bullet must include >=1 citation.')
            : 'citedBullets: exactly 5 bullets; EVERY bullet must include >=1 citation.',
          hasDoc
            ? 'howThisImpactsUs: REQUIRED, but if not applicable to a document question, write "N/A".'
            : 'howThisImpactsUs: REQUIRED (<= 120 words).',
          'sources: must be the provided sources list (same URLs; do not add new URLs).',
        ];

  const industryContext = (internalSummary as any)?.company?.industryGroupName
    ? `Industry: ${(internalSummary as any).company.industryGroupName}`
    : 'Industry: (not provided)';
  const companyContext = companyName ? `Company: ${companyName}` : 'Company: (not provided)';

  const user = hasDoc
    ? [
        companyContext,
        industryContext,
        `Question: ${question}`,
        '',
        'Document context:',
        `- fileName: ${String(docCtx?.fileName || '')}`,
        `- category: ${String(docCtx?.category || '')}`,
        `- extractionStatus: ${String(docCtx?.extractionStatus || '')}`,
        `- indexStatus: ${String(docCtx?.indexStatus || '')}`,
        `- embeddingModel: ${String(docCtx?.embeddingModel || '')}`,
        `- embeddingDim: ${String(docCtx?.embeddingDim || '')}`,
        '',
        'Retrieved document chunks (may be partial; answer ONLY from these):',
        retrievedChunkText,
        '',
        'Allowed sources (cite ONLY these URLs):',
        JSON.stringify(sourceList),
        '',
        'Requirements:',
        ...requirements.map((r) => `- ${r}`),
        '- If the chunks do not contain the answer, say that explicitly and suggest better search terms or an anchor phrase that likely appears in the document (e.g. a section header, defined term, or exact phrase).',
        '- Prefer quoting short exact phrases from the chunks when answering extraction questions.',
        '',
        'Citations format:',
        '- Each cited bullet must include citations: [{ "url": "<allowed url>", "title": "...", "publishedDate": null }]',
        '',
        'Return ONLY JSON.',
      ].join('\n')
    : [
        companyContext,
        industryContext,
        `Question: ${question}`,
        '',
        'Internal data summary (use for company-specific metrics; do NOT invent data not present):',
        // Keep compact to reduce token use.
        JSON.stringify(internalSummary),
        '',
        'Allowed sources (cite ONLY these URLs):',
        JSON.stringify(sourceList),
        '',
        'Requirements:',
        ...requirements.map((r) => `- ${r}`),
        '- Be concise and action-oriented. Avoid generic filler or high-level fluff.',
        '- Use internal summary for company-specific metrics when applicable.',
        '- For peer/market questions, explicitly reference the company industry in the answer.',
        '- Avoid generic statements; cite specific peer commentary from sources when available.',
        '- If the query is marked as externalQuery and no external sources are available, say so clearly and avoid speculation.',
        '- If internal data is insufficient to answer, say so clearly and avoid speculation.',
        '- Exclude internal Payments tab data or subscription/billing plan terms.',
        '- Do not tell the user to visit Yelp/Angi/etc; synthesize the list directly from allowed sources.',
        '- Use source titles/snippets to identify specific companies; do not invent names.',
        ...(strictCitations
          ? ['- Every citedBullets item MUST include citations with >=1 allowed URL. If unsure, omit the item.']
          : []),
        ...(requestedCount
          ? [
              `- The question requests a list of ${requestedCount}. Provide exactly ${requestedCount} items.`,
              '- Format each citedBullets item as: "Name — short descriptor; Address/Phone if available".',
            ]
          : []),
        '',
        'Citations format:',
        '- Each cited bullet must include citations: [{ "url": "<one of the allowed urls>", "title": "...", "publishedDate": "..." }]',
        '',
        'Return ONLY JSON.',
      ].join('\n');

  // NOTE: models like gpt-5.1 are Responses-only; we use a helper that prefers
  // the Responses API and falls back to Chat Completions.
  const resp = await createModelText({
    openai,
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    maxTokens: hasDoc ? 1400 : (mode === 'full' ? 2200 : 1400),
  });

  const content = resp.text;
  const finish_reason = resp.finishReason;

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('Failed to parse model JSON (empty model response)');
  }

  const parsed = safeJsonParse(content) as AskOutput;
  return {
    parsed,
    finish_reason,
    contentPreview: content.slice(0, 240),
    contentLength: content.length,
  };
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const companyName = String(body?.companyName || '').trim();
    const question = String(body?.question || '').trim();
    const documentId = body?.documentId ? String(body.documentId).trim() : '';
    const uiModeRaw = String(body?.mode || '').trim().toLowerCase();
    const uiMode: 'default' | 'document' = uiModeRaw === 'document' ? 'document' : 'default';
    const useExternalSourcesRaw = body?.useExternalSources;
    const useExternalSourcesOverride =
      typeof useExternalSourcesRaw === 'boolean' ? useExternalSourcesRaw : false;

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }
    if (!question) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('AIAnalysis', companyId, 'ASK');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not set in environment' }, { status: 500 });
    }

    let docContext = documentId
      ? await prisma.companyDocument.findUnique({
          where: { id: documentId },
          select: {
            id: true,
            companyId: true,
            category: true,
            originalFileName: true,
            extractionStatus: true,
            indexStatus: true,
            indexedAt: true,
            indexError: true,
            embeddingModel: true,
            embeddingDim: true,
            extractedText: true,
          },
        })
      : null;

    if (docContext && docContext.companyId !== companyId) {
      return NextResponse.json({ error: 'Document not found for this company' }, { status: 404 });
    }

    const now = new Date();
    const useExternalSources = uiMode === 'document' ? false : shouldUseExternalSources(question, useExternalSourcesOverride);
    const requestedCount = parseRequestedCount(question);
    const start35 = new Date(now.getTime() - 35 * DAY_MS);
    const [cashDaily, arDaily, apDaily, customersDaily] = await Promise.all([
      prisma.cashSnapshot.findMany({
        where: { companyId, frequency: 'daily', snapshotDate: { gte: start35 } },
        orderBy: { snapshotDate: 'asc' },
      }),
      prisma.aRAgingSnapshot.findMany({
        where: { companyId, frequency: 'daily', snapshotDate: { gte: start35 } },
        orderBy: { snapshotDate: 'asc' },
      }),
      prisma.aPAgingSnapshot.findMany({
        where: { companyId, frequency: 'daily', snapshotDate: { gte: start35 } },
        orderBy: { snapshotDate: 'asc' },
      }),
      prisma.customerSalesSnapshot.findMany({
        where: { companyId, frequency: 'daily', snapshotDate: { gte: start35 } },
        orderBy: { snapshotDate: 'asc' },
      }),
    ]);

    const cashByDay = new Map<number, number>();
    for (const r of cashDaily) {
      const key = toDayKey(r.snapshotDate);
      cashByDay.set(key, (cashByDay.get(key) || 0) + r.cashBalance);
    }

    const arTotalByDay = new Map<number, number>();
    const arOver30ByDay = new Map<number, number>();
    for (const r of arDaily) {
      const key = toDayKey(r.snapshotDate);
      arTotalByDay.set(key, (arTotalByDay.get(key) || 0) + r.totalAR);
      const over30 = r.days31to60 + r.days61to90 + r.days90plus;
      arOver30ByDay.set(key, (arOver30ByDay.get(key) || 0) + over30);
    }
    const arOver30ShareByDay = new Map<number, number>();
    for (const [key, total] of arTotalByDay.entries()) {
      const over30 = arOver30ByDay.get(key) || 0;
      arOver30ShareByDay.set(key, total > 0 ? (over30 / total) * 100 : 0);
    }

    const apTotalByDay = new Map<number, number>();
    const apOver90ByDay = new Map<number, number>();
    for (const r of apDaily) {
      const key = toDayKey(r.snapshotDate);
      apTotalByDay.set(key, (apTotalByDay.get(key) || 0) + r.totalAP);
      apOver90ByDay.set(key, (apOver90ByDay.get(key) || 0) + r.days90plus);
    }
    const apOver90ShareByDay = new Map<number, number>();
    for (const [key, total] of apTotalByDay.entries()) {
      const over90 = apOver90ByDay.get(key) || 0;
      apOver90ShareByDay.set(key, total > 0 ? (over90 / total) * 100 : 0);
    }

    const customerTotalByDay = new Map<number, number>();
    const customerTopShareByDay = new Map<number, number>();
    for (const r of customersDaily) {
      const key = toDayKey(r.snapshotDate);
      customerTotalByDay.set(key, (customerTotalByDay.get(key) || 0) + r.revenue);
    }
    const customerByDay = new Map<number, Array<{ customerName: string; revenue: number }>>();
    for (const r of customersDaily) {
      const key = toDayKey(r.snapshotDate);
      const list = customerByDay.get(key) || [];
      list.push({ customerName: r.customerName, revenue: r.revenue });
      customerByDay.set(key, list);
    }
    for (const [key, rows] of customerByDay.entries()) {
      const total = customerTotalByDay.get(key) || 0;
      const top = rows.sort((a, b) => b.revenue - a.revenue)[0];
      customerTopShareByDay.set(key, total > 0 && top ? (top.revenue / total) * 100 : 0);
    }

    const latestMonth = await prisma.monthlyFinancial.findFirst({
      where: { companyId },
      orderBy: { monthDate: 'desc' },
    });
    const prevMonth = await prisma.monthlyFinancial.findFirst({
      where: { companyId, monthDate: { lt: latestMonth?.monthDate ?? now } },
      orderBy: { monthDate: 'desc' },
    });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { industrySector: true },
    });
    const industryGroupId = company?.industrySector ? String(company.industrySector) : null;
    const benchmarks = industryGroupId
      ? await prisma.industryBenchmark.findMany({
          where: { industryId: industryGroupId },
          select: { metricName: true, fiveYearValue: true, industryName: true },
          take: 200,
        })
      : [];
    const industryGroupName = benchmarks.find((b) => b.industryName)?.industryName || null;
    const ratioSnapshot = buildRatioSnapshot(latestMonth, benchmarks);

    const monthlyChanges = latestMonth && prevMonth
      ? {
          revenue: buildChangeSummary(latestMonth.revenue, prevMonth.revenue),
          expense: buildChangeSummary(latestMonth.expense, prevMonth.expense),
          cogsTotal: buildChangeSummary(latestMonth.cogsTotal, prevMonth.cogsTotal),
          cash: buildChangeSummary(latestMonth.cash, prevMonth.cash),
          ar: buildChangeSummary(latestMonth.ar, prevMonth.ar),
          ap: buildChangeSummary(latestMonth.ap, prevMonth.ap),
        }
      : null;

    if (uiMode === 'document' && !documentId) {
      return NextResponse.json({ error: 'Select a document first.' }, { status: 400 });
    }

    if (docContext) {
      const s = String(docContext.extractionStatus || '').toUpperCase();
      if (s === 'PENDING') {
        return NextResponse.json({ error: 'Document text is still processing. Try again in a few seconds.' }, { status: 422 });
      }
      if (s === 'FAILED') {
        return NextResponse.json({ error: 'Document text extraction failed. Try re-uploading the file.' }, { status: 422 });
      }
      if (s === 'NO_TEXT') {
        return NextResponse.json({ error: 'No text could be extracted (likely a scanned PDF). Upload a text-based PDF or DOCX.' }, { status: 422 });
      }
    }

    // Document-mode retrieval: ensure embeddings/chunks exist and retrieve a bounded set of relevant chunks.
    let retrievedDocChunks:
      | null
      | Awaited<ReturnType<typeof retrieveDocumentChunks>> = null;

    if (uiMode === 'document' && docContext) {
      const idxStatus = String(docContext.indexStatus || '').toUpperCase();
      if (idxStatus !== 'DONE') {
        const indexed = await indexCompanyDocument({ documentId: docContext.id });
        if (!indexed.ok) {
          return NextResponse.json(
            { error: indexed.error || 'Document index is not ready yet. Try again in a few seconds.' },
            { status: 422 },
          );
        }
        // Re-fetch doc context (indexStatus/indexedAt/indexError updated).
        docContext = await prisma.companyDocument.findUnique({
          where: { id: documentId },
          select: {
            id: true,
            companyId: true,
            category: true,
            originalFileName: true,
            extractionStatus: true,
            indexStatus: true,
            indexedAt: true,
            indexError: true,
            embeddingModel: true,
            embeddingDim: true,
            extractedText: false,
          },
        }) as any;
      }

      // General-purpose doc Q&A needs higher recall than "12 chunks" for many question types.
      retrievedDocChunks = await retrieveDocumentChunks({
        documentId: docContext.id,
        question,
        keywordLimit: 35,
        vectorLimit: 35,
        finalLimit: 18,
      });

      if ((retrievedDocChunks?.chunks || []).length === 0) {
        return NextResponse.json(
          {
            error:
              'No relevant text chunks were found for this question in the selected document. Try a more specific query (e.g. include a defined term, section number, or exact covenant name).',
          },
          { status: 422 },
        );
      }
    }

    const internalSummary =
      uiMode === 'document'
        ? {
            generatedAt: now.toISOString(),
            company: { id: companyId, name: companyName || null, industryGroupId, industryGroupName },
            documentContext: docContext
              ? {
                  id: docContext.id,
                  fileName: docContext.originalFileName,
                  category: docContext.category,
                  extractionStatus: docContext.extractionStatus,
                  indexStatus: docContext.indexStatus,
                  indexedAt: docContext.indexedAt,
                  indexError: docContext.indexError,
                  embeddingModel: docContext.embeddingModel,
                  embeddingDim: docContext.embeddingDim,
                  retrievedChunks: (retrievedDocChunks?.chunks || []).map((c) => ({
                    id: c.id,
                    chunkIndex: c.chunkIndex,
                    score: c.score,
                    keywordRank: c.keywordRank,
                    vectorDistance: c.vectorDistance,
                    text: String(c.text || '').slice(0, 5200),
                  })),
                  retrievalDebug: retrievedDocChunks?.debug || null,
                }
              : null,
            queryContext: {
              externalQuery: false,
              externalSourcesAvailable: false,
            },
            notes: [
              'Answer using ONLY the retrieved document chunks and the allowed document source URL.',
              'If the relevant covenant language is not present in the retrieved chunks, say so and suggest a more targeted query.',
            ],
          }
        : {
            generatedAt: now.toISOString(),
            company: { id: companyId, name: companyName || null, industryGroupId, industryGroupName },
            documentContext: docContext
              ? {
                  id: docContext.id,
                  fileName: docContext.originalFileName,
                  category: docContext.category,
                  extractionStatus: docContext.extractionStatus,
                  extractedTextPreview: String((docContext as any).extractedText || '').slice(0, 15000),
                }
              : null,
            queryContext: {
              externalQuery: useExternalSources,
              externalSourcesAvailable: false,
            },
            dataAvailability: {
              cashDaily: cashByDay.size,
              arDaily: arTotalByDay.size,
              apDaily: apTotalByDay.size,
              customersDaily: customerTotalByDay.size,
            },
            operationalTrends: {
              windowDays: { short: 14, long: 30 },
              metrics: [
                {
                  name: 'Cash balance (daily)',
                  unit: 'USD',
                  dataPoints: cashByDay.size,
                  change14Days: computeChange(cashByDay, 14),
                  change30Days: computeChange(cashByDay, 30),
                },
                {
                  name: 'AR total (daily)',
                  unit: 'USD',
                  dataPoints: arTotalByDay.size,
                  change14Days: computeChange(arTotalByDay, 14),
                  change30Days: computeChange(arTotalByDay, 30),
                },
                {
                  name: 'AR >30 days share (daily)',
                  unit: 'percent',
                  dataPoints: arOver30ShareByDay.size,
                  change14Days: computeChange(arOver30ShareByDay, 14),
                  change30Days: computeChange(arOver30ShareByDay, 30),
                },
                {
                  name: 'AP total (daily)',
                  unit: 'USD',
                  dataPoints: apTotalByDay.size,
                  change14Days: computeChange(apTotalByDay, 14),
                  change30Days: computeChange(apTotalByDay, 30),
                },
                {
                  name: 'AP 90+ days share (daily)',
                  unit: 'percent',
                  dataPoints: apOver90ShareByDay.size,
                  change14Days: computeChange(apOver90ShareByDay, 14),
                  change30Days: computeChange(apOver90ShareByDay, 30),
                },
                {
                  name: 'Customer revenue total (daily)',
                  unit: 'USD',
                  dataPoints: customerTotalByDay.size,
                  change14Days: computeChange(customerTotalByDay, 14),
                  change30Days: computeChange(customerTotalByDay, 30),
                },
                {
                  name: 'Top customer share (daily)',
                  unit: 'percent',
                  dataPoints: customerTopShareByDay.size,
                  change14Days: computeChange(customerTopShareByDay, 14),
                  change30Days: computeChange(customerTopShareByDay, 30),
                },
              ],
            },
            monthlySnapshot: {
              latest: latestMonth
                ? {
                    monthDate: latestMonth.monthDate,
                    revenue: latestMonth.revenue,
                    expense: latestMonth.expense,
                    cogsTotal: latestMonth.cogsTotal,
                    cash: latestMonth.cash,
                    ar: latestMonth.ar,
                    ap: latestMonth.ap,
                  }
                : null,
              previous: prevMonth
                ? {
                    monthDate: prevMonth.monthDate,
                    revenue: prevMonth.revenue,
                    expense: prevMonth.expense,
                    cogsTotal: prevMonth.cogsTotal,
                    cash: prevMonth.cash,
                    ar: prevMonth.ar,
                    ap: prevMonth.ap,
                  }
                : null,
            },
            monthlyChanges,
            kpiDefinitions: {
              alias: ['kpi', 'kpis', 'ratios'],
              note: 'In this app, KPIs are the ratio metrics shown in the Ratios view.',
              asOfMonth: latestMonth?.monthDate || null,
              industryGroupId,
              benchmarksAvailable: benchmarks.length,
              ratios: ratioSnapshot,
            },
            notes: [
              'Daily operational trends are computed using the most recent available daily snapshot date as the reference.',
              'If dataPoints are low or change values are null, there may be insufficient daily history to assess trends.',
              'KPI requests should be interpreted as ratio metrics; use kpiDefinitions.ratios when available.',
              'Use monthlyChanges.direction to describe increase/decrease; do not invert directions.',
            ],
          };

    const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002').replace(/\/+$/, '');
    const documentSource = docContext
      ? {
          url: `${appBaseUrl}/api/company-documents/${docContext.id}/open`,
          title: docContext.originalFileName,
          publishedDate: null,
          snippet:
            uiMode === 'document'
              ? (String((retrievedDocChunks?.chunks?.[0]?.text || '')).slice(0, 220) || 'Company document (retrieved chunks)')
              : (String((docContext as any).extractedText || '').slice(0, 220) || 'Company document (uploaded PDF/DOCX)'),
        }
      : null;
    const internalSources = [
      {
        url: `${appBaseUrl}?view=admin&tab=data-review`,
        title: 'Data Review - Financials',
        publishedDate: null,
        snippet: 'Review imported financial data and monthly ratios.',
      },
      {
        url: `${appBaseUrl}?view=operations`,
        title: 'Operations - Operational Data',
        publishedDate: null,
        snippet: 'Daily and monthly operational snapshots and metrics.',
      },
    ];

    const searchResults = useExternalSources ? await serpApiSearch(question) : [];
    const externalSources = searchResults.map((r) => ({
      url: r.link as string,
      title: r.title || undefined,
      publishedDate: r.date || null,
      snippet: r.snippet || undefined,
    }));
    internalSummary.queryContext.externalSourcesAvailable = externalSources.length > 0;
    const sources =
      uiMode === 'document'
        ? (documentSource ? [documentSource] : [])
        : (useExternalSources ? externalSources : internalSources);
    const sourcesWithDoc = uiMode === 'document' ? sources : (documentSource ? [documentSource, ...sources] : sources);

    if (useExternalSources && externalSources.length === 0) {
      return NextResponse.json(
        { error: 'No external sources found for this query. Try a more specific query or location.' },
        { status: 422 },
      );
    }
    if (sourcesWithDoc.length === 0) {
      return NextResponse.json({ error: 'No sources available for this query.' }, { status: 422 });
    }

    // 2) Ask the model to synthesize an answer with REQUIRED structure
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const defaultModel = process.env.OPENAI_MODEL || 'gpt-4o';
    const askModel = process.env.OPENAI_MODEL_ASK || defaultModel;
    const docsModel = process.env.OPENAI_MODEL_DOCS || defaultModel;
    const model = uiMode === 'document' ? docsModel : askModel;

    // Try full mode first; if truncated, retry once in compact mode.
    let parsed: AskOutput;
    let finishReason: string | null | undefined;
    try {
      const first = await generateAskJson({
        openai,
        model,
        companyName,
        question,
        internalSummary,
        sources: sourcesWithDoc,
        mode: 'full',
        requestedCount,
      });
      parsed = first.parsed;
      finishReason = first.finish_reason;

      console.log('AI Analysis ask: model content preview', {
        model,
        finish_reason: first.finish_reason,
        length: first.contentLength,
        preview: first.contentPreview,
      });

      if (first.finish_reason === 'length' || isListInvalid(parsed, requestedCount)) {
        throw new Error('Model output truncated or did not meet list requirements');
      }
    } catch (e: any) {
      // Retry in compact mode (smaller required output)
      const second = await generateAskJson({
        openai,
        model,
        companyName,
        question,
        internalSummary,
        sources: sourcesWithDoc,
        mode: 'compact',
        requestedCount,
      });
      parsed = second.parsed;
      finishReason = second.finish_reason;

      console.log('AI Analysis ask: model content preview (compact retry)', {
        model,
        finish_reason: second.finish_reason,
        length: second.contentLength,
        preview: second.contentPreview,
      });

      if (second.finish_reason === 'length' || isListInvalid(parsed, requestedCount)) {
        parsed = buildFallbackFromSources({ sources: sourcesWithDoc, companyName, question, requestedCount, internalSummary });
      }
    }

    // Basic shape validation + source URL allowlist
    const allowedUrls = new Set(sourcesWithDoc.map((s) => s.url));
    let citedBullets = Array.isArray(parsed?.citedBullets) ? parsed.citedBullets : [];
    let citationsOk = hasValidCitations(citedBullets, allowedUrls);

    // Document-mode: there is exactly one allowed source (the document open URL).
    // The model sometimes omits citations even when the answer is grounded.
    // Instead of discarding the answer, attach the document citation to every bullet.
    if (uiMode === 'document' && documentSource?.url) {
      const docCitation = { url: documentSource.url, title: documentSource.title, publishedDate: null };
      citedBullets = citedBullets.map((b: any) => {
        const text = String(b?.text || '');
        const citationsRaw = Array.isArray(b?.citations) ? b.citations : [];
        const citationsFiltered = citationsRaw
          .map((c: any) => ({ url: String(c?.url || '').trim(), title: c?.title || undefined, publishedDate: c?.publishedDate ?? null }))
          .filter((c: any) => allowedUrls.has(c.url));
        return {
          text,
          citations: citationsFiltered.length > 0 ? citationsFiltered : [docCitation],
        };
      });
      citationsOk = true;
    }

    if (!citationsOk) {
      const strictRetry = await generateAskJson({
        openai,
        model,
        companyName,
        question,
        internalSummary,
        sources: sourcesWithDoc,
        mode: 'compact',
        requestedCount,
        strictCitations: true,
      });
      parsed = strictRetry.parsed;
      finishReason = strictRetry.finish_reason;
      citedBullets = Array.isArray(parsed?.citedBullets) ? parsed.citedBullets : [];
      citationsOk = hasValidCitations(citedBullets, allowedUrls);

      if (strictRetry.finish_reason === 'length' || isListInvalid(parsed, requestedCount) || !citationsOk) {
        parsed = buildFallbackFromSources({ sources: sourcesWithDoc, companyName, question, requestedCount, internalSummary });
      }
    }

    // Keep the validated/normalized citedBullets (document-mode may have auto-attached citations).
    citedBullets = Array.isArray(citedBullets) ? citedBullets : [];

    // Document-mode robustness: if the model returned no usable bullets (common for long legal docs),
    // fall back to showing grounded excerpts from the retrieved chunks rather than the generic
    // "couldn't reliably answer" fallback.
    if (uiMode === 'document' && documentSource?.url && !hasNonEmptyBullets(citedBullets)) {
      const docCitation = { url: documentSource.url, title: documentSource.title, publishedDate: null };
      const chunksRaw = (retrievedDocChunks?.chunks || [])
        .map((c) => ({
          ...c,
          text: String(c?.text || ''),
          score: typeof (c as any)?.score === 'number' ? (c as any).score : 0,
        }))
        .filter((c) => c.text.trim().length >= 120);

      // Pick the highest scoring chunks (the retrieval function returns chunks ordered by chunkIndex,
      // which is good for readability but bad for "top N" selection).
      const top = chunksRaw
        .slice()
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 6)
        .sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0))
        .slice(0, 4);

      citedBullets = top
        .map((c) => {
          const excerpt = String(c.text || '').replace(/\s+/g, ' ').trim().slice(0, 360);
          if (!excerpt) return null;
          return {
            text: `Relevant excerpt (chunk ${c.chunkIndex}) — ${excerpt}${excerpt.length >= 360 ? '…' : ''}`,
            citations: [docCitation],
          };
        })
        .filter(Boolean) as any;
    }

    if (!hasNonEmptyBullets(citedBullets)) {
      parsed = buildFallbackFromSources({ sources: sourcesWithDoc, companyName, question, requestedCount, internalSummary });
      citedBullets = Array.isArray(parsed?.citedBullets) ? parsed.citedBullets : [];
      if (!hasNonEmptyBullets(citedBullets)) {
        return NextResponse.json(
          { error: 'Unable to build a cited list from available sources. Try a more specific query or location.' },
          { status: 422 },
        );
      }
    }

    // Ensure sources returned are exactly from allowlist
    const returnedSources = Array.isArray(parsed?.sources) ? parsed.sources : [];
    const normalizedSources = returnedSources
      .map((s: any) => ({
        url: String(s?.url || '').trim(),
        title: s?.title || undefined,
        publishedDate: s?.publishedDate ?? null,
        snippet: s?.snippet || undefined,
      }))
      .filter((s: any) => allowedUrls.has(s.url));

    return NextResponse.json({
      shortAnswer: String(parsed?.shortAnswer || ''),
      longAnswer: String(parsed?.longAnswer || ''),
      citedBullets: citedBullets.map((b: any) => ({
        text: String(b?.text || ''),
        citations: (Array.isArray(b?.citations) ? b.citations : []).map((c: any) => ({
          url: String(c?.url || '').trim(),
          title: c?.title || undefined,
          publishedDate: c?.publishedDate ?? null,
        })),
      })),
      howThisImpactsUs: String(parsed?.howThisImpactsUs || ''),
      sources: normalizedSources.length > 0 ? normalizedSources : sourcesWithDoc,
    });
  } catch (error: any) {
    console.error('AI Analysis ask error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to run AI Analysis ask' },
      { status: 500 },
    );
  }
}

