import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getOpenAiClient } from '@/lib/ai-gateway';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { getBenchmarkValue } from '@/app/utils/data-processing';
import { indexCompanyDocument } from '@/lib/company-documents/index-document';
import { retrieveDocumentChunks } from '@/lib/company-documents/retrieve-chunks';
import { createModelText } from '@/lib/openai-helpers';
import { searchExternalWeb } from '@/lib/ask-corelytics/externalSearch';
import { buildExternalQueryPlan } from '@/lib/ask-corelytics/externalQueryBuilder';
import { getPlatosClosetAiContext } from '@/lib/operational/platos-closet-monthly-facts';
import {
  buildConstructionBriefingFacts,
  getExecBriefingModuleProfile,
} from '@/lib/pulse/exec-briefing-modules';
import { buildOperationalMockResponse } from '@/lib/operations/sector-mock-data';
import { resolveCompanyIndustrySectorCategory } from '@/lib/industry-sector-resolver';

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
  const locDebt = month.loc || 0;
  const tcl = Math.max(month.tcl || 0, ap + otherCL + locDebt);

  const ltDebt = month.ltDebt || 0;
  const otherLTL = month.otherLTL || 0;
  const totalLiabilities = Math.max(month.totalLiabilities || 0, tcl + ltDebt + otherLTL);

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

type ConversationTurn = {
  askedAt: string;
  question: string;
  shortAnswer: string;
  longAnswer: string;
  howThisImpactsUs: string;
  sources: Array<{ url: string; title?: string; publishedDate?: string | null }>;
};

type ConversationContext = {
  recentTurns: ConversationTurn[];
  runningSummary: string;
};

type SectorOperationalContext = {
  profile: ReturnType<typeof getExecBriefingModuleProfile>;
  genericOperationalData: Record<string, unknown>;
  constructionOperations?: ReturnType<typeof buildConstructionBriefingFacts> | null;
  issueSummaries: Array<{
    entityName: string;
    entityId?: string;
    issue: string;
    action: string;
    severity: 'watch' | 'medium' | 'high';
  }>;
  entitySearchHints: string[];
  notes: string[];
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
    // Explicit UI intent: when user turns external sources ON, always run external retrieval.
    return true;
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

function normalizeConversationContext(input: unknown): ConversationContext | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as any;
  const rawRecent = Array.isArray(raw.recentTurns) ? raw.recentTurns : [];
  const recentTurns: ConversationTurn[] = rawRecent
    .slice(-8)
    .map((turn: any) => ({
      askedAt: String(turn?.askedAt || '').slice(0, 64),
      question: String(turn?.question || '').slice(0, 2000),
      shortAnswer: String(turn?.shortAnswer || '').slice(0, 2500),
      longAnswer: String(turn?.longAnswer || '').slice(0, 7000),
      howThisImpactsUs: String(turn?.howThisImpactsUs || '').slice(0, 2000),
      sources: (Array.isArray(turn?.sources) ? turn.sources : [])
        .slice(0, 8)
        .map((s: any) => ({
          url: String(s?.url || '').slice(0, 1200),
          title: s?.title ? String(s.title).slice(0, 300) : undefined,
          publishedDate: s?.publishedDate ? String(s.publishedDate).slice(0, 80) : null,
        }))
        .filter((s: any) => s.url),
    }))
    .filter((turn: ConversationTurn) => turn.question || turn.shortAnswer || turn.longAnswer);
  const runningSummary = String(raw.runningSummary || '').slice(0, 4000);
  if (recentTurns.length === 0 && !runningSummary) return null;
  return { recentTurns, runningSummary };
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

function buildExternalQueryResultsOnlyResponse(params: {
  question: string;
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
}): AskOutput {
  const { question, sources } = params;
  const normalizedSources = sources.slice(0, 8);
  const xRegex = /(\d+(?:\.\d+)?)\s*x\b/gi;
  const rangeRegex = /(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*x\b/gi;
  const isValuationQuestion = /valuation|multiple|ev\/ebitda|ebitda/i.test(question);

  const extracted = normalizedSources.map((s) => {
    const text = `${String(s.title || '')} ${String(s.snippet || '')}`;
    const ranges = Array.from(text.matchAll(rangeRegex)).map((m) => `${m[1]}x-${m[2]}x`);
    const singles = Array.from(text.matchAll(xRegex)).map((m) => `${m[1]}x`);
    const mentions = Array.from(new Set([...ranges, ...singles])).slice(0, 3);
    return { source: s, mentions };
  });

  const allXValues = extracted
    .flatMap((e) => e.mentions)
    .flatMap((m) => m.match(/\d+(?:\.\d+)?/g) || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
  const minX = allXValues.length > 0 ? Math.min(...allXValues) : null;
  const maxX = allXValues.length > 0 ? Math.max(...allXValues) : null;

  const citedBullets = extracted.map(({ source, mentions }) => ({
    text:
      mentions.length > 0
        ? `${source.title || 'Market source'} — reported multiples: ${mentions.join(', ')}`
        : (source.snippet && String(source.snippet).trim()) || (source.title ? `${source.title}` : source.url),
    citations: [{ url: source.url, title: source.title, publishedDate: source.publishedDate }],
  }));

  const shortAnswer =
    isValuationQuestion && minX !== null && maxX !== null
      ? `External sources indicate sector valuation multiples roughly in the ${minX.toFixed(1)}x-${maxX.toFixed(1)}x range (methodology and deal size vary by source).`
      : isValuationQuestion
        ? 'I found sector valuation references, but most sources did not provide clean numeric ranges in the snippets.'
        : `External market context was retrieved for: ${question}`;

  const longAnswer = extracted
    .map(({ source, mentions }, idx) => {
      const title = source.title || source.url;
      const snippet = source.snippet ? String(source.snippet).trim() : '';
      const mentionText = mentions.length > 0 ? ` | Multiples noted: ${mentions.join(', ')}` : '';
      return `${idx + 1}. ${title}${mentionText}${snippet ? ` — ${snippet}` : ''}`;
    })
    .join('\n');

  const howThisImpactsUs =
    isValuationQuestion && minX !== null && maxX !== null
      ? `Use this external range to bracket enterprise value (for example, EBITDA x ${minX.toFixed(1)} to ${maxX.toFixed(1)}), then adjust for your company size, growth, and risk versus sector norms.`
      : 'Use these sources as directional market context; for defensible valuation, prioritize sources with explicit sector multiples and methodology.';

  return {
    shortAnswer,
    longAnswer,
    citedBullets,
    howThisImpactsUs,
    sources: normalizedSources,
  };
}

function isMarginQuestion(question: string): boolean {
  const q = String(question || '').toLowerCase();
  return /\b(margin|gross\s*profit|gross\s*margin|ebitda|ebit)\b/.test(q);
}

function isWeakAskAnswer(parsed: AskOutput | null | undefined, question: string): boolean {
  if (!parsed) return true;
  const bulletText = (Array.isArray(parsed.citedBullets) ? parsed.citedBullets : [])
    .map((b: any) => String(b?.text || ''))
    .join(' ');
  const blob = `${parsed.shortAnswer || ''} ${parsed.longAnswer || ''} ${bulletText}`.toLowerCase();
  if (!blob.trim()) return true;

  const looksGeneric =
    /sector-specific issue|customer\/account module signal|sector-appropriate customer|product\/service module signal|please review the linked|could not synthesize a reliable answer|review this page for relevant/.test(
      blob
    );
  if (looksGeneric) return true;

  if (isMarginQuestion(question)) {
    const hasMarginEvidence =
      /\b(gross margin|gross profit|cogs|margin rate|margin %|percentage points|pts)\b/.test(blob) ||
      /\d+(\.\d+)?\s*%/.test(blob);
    const looksLikeCustomerDump =
      /\btenant\s+\d+\b/.test(blob) && !/\bgross (margin|profit)\b/.test(blob);
    return looksLikeCustomerDump || !hasMarginEvidence;
  }

  if (/\bkpi|peer group|benchmark/i.test(question)) {
    return !/\b(below|under|versus|vs\.?|benchmark|peer|ratio|kpi)\b/.test(blob);
  }
  if (/\bconcentration\b/i.test(question)) {
    return !/\b(share|concentration|top customer|% of)\b/.test(blob);
  }
  if (/\bnegative trends?|14 and 30|sustained negative/i.test(question)) {
    return !/\b(14|30|declin|decreas|worsen|negative|trend)\b/.test(blob);
  }
  if (/\bcoa\b|expense categor|cost creep|run-rate|run rate/i.test(question)) {
    return !/\b(expense|payroll|rent|marketing|cogs|variance|month|creep|run-?rate)\b/.test(blob);
  }
  if (/\brisks?\b/i.test(question)) {
    return !/\b(risk|cash|ar|ap|margin|concentration|covenant|collections|watch)\b/.test(blob);
  }
  return false;
}

function signedMoney(value: number): string {
  const n = Number(value) || 0;
  const abs = `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

function signedPctPoints(value: number): string {
  const n = Number(value) || 0;
  const abs = `${Math.abs(n).toFixed(1)} pts`;
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

function monthLabel(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(d.getTime())) return 'the latest month';
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function buildMarginDriversFromSummary(internalSummary?: Record<string, any>) {
  const latest = internalSummary?.monthlySnapshot?.latest;
  const previous = internalSummary?.monthlySnapshot?.previous;
  if (!latest || !previous) return null;

  const latestRevenue = Number(latest.revenue || 0);
  const prevRevenue = Number(previous.revenue || 0);
  const latestCogs = Number(latest.cogsTotal || 0);
  const prevCogs = Number(previous.cogsTotal || 0);
  const latestExpense = Number(latest.expense || 0);
  const prevExpense = Number(previous.expense || 0);
  const latestGp = latestRevenue - latestCogs;
  const prevGp = prevRevenue - prevCogs;
  const gpDelta = latestGp - prevGp;
  const revenueDelta = latestRevenue - prevRevenue;
  const cogsDelta = latestCogs - prevCogs;
  const expenseDelta = latestExpense - prevExpense;
  const latestGm = latestRevenue > 0 ? latestGp / latestRevenue : null;
  const prevGm = prevRevenue > 0 ? prevGp / prevRevenue : null;
  const gmDeltaPts =
    latestGm != null && prevGm != null ? (latestGm - prevGm) * 100 : null;

  // Decomposition: GP change ≈ revenue impact − COGS impact.
  // Holding prior margin, revenue growth contributes priorGm * revenueDelta.
  // COGS change at constant revenue contributes −cogsDelta.
  const revenueMixImpact = prevGm != null ? prevGm * revenueDelta : revenueDelta;
  const cogsImpact = -cogsDelta;

  const cogsComponents = [
    { name: 'Materials COGS', delta: Number(latest.cogsMaterials || 0) - Number(previous.cogsMaterials || 0) },
    { name: 'Payroll COGS', delta: Number(latest.cogsPayroll || 0) - Number(previous.cogsPayroll || 0) },
    { name: 'Owner pay COGS', delta: Number(latest.cogsOwnerPay || 0) - Number(previous.cogsOwnerPay || 0) },
    { name: 'Contractor COGS', delta: Number(latest.cogsContractors || 0) - Number(previous.cogsContractors || 0) },
    { name: 'Commissions COGS', delta: Number(latest.cogsCommissions || 0) - Number(previous.cogsCommissions || 0) },
    { name: 'Other COGS', delta: Number(latest.cogsOther || 0) - Number(previous.cogsOther || 0) },
  ]
    .filter((row) => Math.abs(row.delta) >= 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 4);

  const products = ((internalSummary?.sectorOperationalContext?.genericOperationalData as any)?.products?.topProducts ||
    []) as Array<{
    name?: string;
    itemName?: string;
    totalRevenue?: number;
    totalCogs?: number;
    grossMargin?: number;
    grossMarginPct?: number;
  }>;
  const productMarginDrivers = products
    .map((row) => {
      const revenue = Number(row.totalRevenue || 0);
      const cogs = Number(row.totalCogs || 0);
      const gp = Number(row.grossMargin != null ? row.grossMargin : revenue - cogs);
      const gmPct = Number(
        row.grossMarginPct != null ? row.grossMarginPct : revenue > 0 ? (gp / revenue) * 100 : 0
      );
      return {
        name: String(row.name || row.itemName || '').trim(),
        revenue,
        cogs,
        grossProfit: gp,
        grossMarginPct: gmPct,
      };
    })
    .filter((row) => row.name && row.revenue > 0 && Math.abs(row.cogs) > 0)
    .sort((a, b) => a.grossMarginPct - b.grossMarginPct)
    .slice(0, 3);

  const customers = ((internalSummary?.sectorOperationalContext?.genericOperationalData as any)?.customers?.topCustomers ||
    []) as Array<{
    name?: string;
    customerName?: string;
    totalRevenue?: number;
    totalCogs?: number;
    grossMargin?: number;
    grossMarginPct?: number;
  }>;
  const customerMarginDrivers = customers
    .map((row) => {
      const revenue = Number(row.totalRevenue || 0);
      const cogs = Number(row.totalCogs || 0);
      const gp = Number(row.grossMargin != null ? row.grossMargin : revenue - cogs);
      const gmPct = Number(
        row.grossMarginPct != null ? row.grossMarginPct : revenue > 0 ? (gp / revenue) * 100 : 0
      );
      return {
        name: String(row.name || row.customerName || '').trim(),
        revenue,
        cogs,
        grossProfit: gp,
        grossMarginPct: gmPct,
      };
    })
    .filter((row) => row.name && row.revenue > 0 && Math.abs(row.cogs) > 0)
    .sort((a, b) => a.grossMarginPct - b.grossMarginPct)
    .slice(0, 3);

  return {
    latestMonthLabel: monthLabel(latest.monthDate),
    previousMonthLabel: monthLabel(previous.monthDate),
    latestRevenue,
    prevRevenue,
    revenueDelta,
    latestCogs,
    prevCogs,
    cogsDelta,
    latestExpense,
    prevExpense,
    expenseDelta,
    latestGp,
    prevGp,
    gpDelta,
    latestGmPct: latestGm != null ? latestGm * 100 : null,
    prevGmPct: prevGm != null ? prevGm * 100 : null,
    gmDeltaPts,
    revenueMixImpact,
    cogsImpact,
    cogsComponents,
    productMarginDrivers,
    customerMarginDrivers,
  };
}

function buildMarginDriversFallback(params: {
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  question: string;
  internalSummary?: Record<string, any>;
}): AskOutput | null {
  const drivers = buildMarginDriversFromSummary(params.internalSummary);
  if (!drivers) return null;

  const financialSource =
    params.sources.find((s) => String(s.title || '').toLowerCase().includes('data review')) || params.sources[0];
  if (!financialSource) return null;
  const citation = {
    url: financialSource.url,
    title: financialSource.title,
    publishedDate: financialSource.publishedDate,
  };

  const asksEbitda = /\b(ebitda|ebit|operating\s*margin)\b/i.test(params.question);
  const bullets: Array<{ text: string; citations: typeof citation[] }> = [];

  if (drivers.gmDeltaPts != null) {
    bullets.push({
      text: `Gross margin moved from ${drivers.prevGmPct!.toFixed(1)}% in ${drivers.previousMonthLabel} to ${drivers.latestGmPct!.toFixed(1)}% in ${drivers.latestMonthLabel} (${signedPctPoints(drivers.gmDeltaPts)}).`,
      citations: [citation],
    });
  }
  bullets.push({
    text: `Gross profit dollars ${drivers.gpDelta >= 0 ? 'increased' : 'decreased'} ${signedMoney(drivers.gpDelta)} (${formatMoneyBrief(drivers.prevGp)} → ${formatMoneyBrief(drivers.latestGp)}).`,
    citations: [citation],
  });

  const rankedImpacts = [
    { name: 'Revenue / mix impact on gross profit', amount: drivers.revenueMixImpact },
    { name: 'COGS impact on gross profit', amount: drivers.cogsImpact },
  ].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  for (const impact of rankedImpacts) {
    if (Math.abs(impact.amount) < 1) continue;
    bullets.push({
      text: `${impact.name}: ${signedMoney(impact.amount)} (revenue ${signedMoney(drivers.revenueDelta)}; COGS ${signedMoney(drivers.cogsDelta)}).`,
      citations: [citation],
    });
  }

  for (const component of drivers.cogsComponents.slice(0, 2)) {
    bullets.push({
      text: `${component.name} ${component.delta >= 0 ? 'rose' : 'fell'} ${signedMoney(component.delta)}, contributing to the COGS-driven margin move.`,
      citations: [citation],
    });
  }

  if (asksEbitda) {
    bullets.push({
      text: `Operating expense ${drivers.expenseDelta >= 0 ? 'increased' : 'decreased'} ${signedMoney(drivers.expenseDelta)}, which ${drivers.expenseDelta > 0 ? 'pressures' : 'supports'} EBITDA/operating margin beyond gross margin.`,
      citations: [citation],
    });
  }

  for (const product of drivers.productMarginDrivers.slice(0, 2)) {
    bullets.push({
      text: `Product/service margin pressure: ${product.name} at ${product.grossMarginPct.toFixed(1)}% gross margin on ${signedMoney(product.revenue)} revenue (GP ${signedMoney(product.grossProfit)}).`,
      citations: [citation],
    });
  }

  for (const customer of drivers.customerMarginDrivers.slice(0, 1)) {
    bullets.push({
      text: `Account margin pressure: ${customer.name} at ${customer.grossMarginPct.toFixed(1)}% gross margin on ${signedMoney(customer.revenue)} revenue (GP ${signedMoney(customer.grossProfit)}).`,
      citations: [citation],
    });
  }

  const topDriver =
    Math.abs(drivers.cogsImpact) >= Math.abs(drivers.revenueMixImpact)
      ? `COGS movement (${signedMoney(drivers.cogsDelta)})`
      : `revenue/mix movement (${signedMoney(drivers.revenueDelta)})`;

  const shortAnswer =
    drivers.gmDeltaPts != null
      ? `Gross margin ${drivers.gmDeltaPts >= 0 ? 'improved' : 'declined'} ${signedPctPoints(drivers.gmDeltaPts)} from ${drivers.previousMonthLabel} to ${drivers.latestMonthLabel}. The largest driver is ${topDriver}, with gross profit ${signedMoney(drivers.gpDelta)}.`
      : `Gross profit ${drivers.gpDelta >= 0 ? 'increased' : 'decreased'} ${signedMoney(drivers.gpDelta)} from ${drivers.previousMonthLabel} to ${drivers.latestMonthLabel}. The largest driver is ${topDriver}.`;

  return {
    shortAnswer,
    longAnswer: bullets.map((b) => `- ${b.text}`).join('\n'),
    citedBullets: bullets.slice(0, 8),
    howThisImpactsUs:
      Math.abs(drivers.gpDelta) < 1 && Math.abs(drivers.gmDeltaPts || 0) < 0.1
        ? 'Margin is effectively flat period-over-period; no material action is required from this comparison alone.'
        : `Focus corrective action on the largest quantified driver (${topDriver}). Use pricing, mix, and COGS controls where that driver is adverse.`,
    sources: params.sources,
  };
}

const COA_EXPENSE_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'payroll', label: 'Payroll' },
  { key: 'ownerBasePay', label: 'Owner base pay' },
  { key: 'benefits', label: 'Benefits' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'professionalFees', label: 'Professional fees' },
  { key: 'subcontractors', label: 'Subcontractors' },
  { key: 'rent', label: 'Rent' },
  { key: 'taxLicense', label: 'Tax & license' },
  { key: 'phoneComm', label: 'Phone & communications' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'autoTravel', label: 'Auto & travel' },
  { key: 'salesExpense', label: 'Sales expense' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'trainingCert', label: 'Training & certification' },
  { key: 'mealsEntertainment', label: 'Meals & entertainment' },
  { key: 'otherExpense', label: 'Other expense' },
  { key: 'interestExpense', label: 'Interest expense' },
  { key: 'depreciationAmortization', label: 'Depreciation & amortization' },
];

type AskIntent =
  | 'margin'
  | 'kpi_peers'
  | 'risks'
  | 'daily_negative_trends'
  | 'cash_ar_indicators'
  | 'concentration'
  | 'coa_expense_variance'
  | 'cost_creep'
  | 'expense_shift_start'
  | 'construction_ops'
  | 'competitor'
  | 'general';

function classifyAskIntent(question: string): AskIntent {
  const q = String(question || '').toLowerCase();
  if (isMarginQuestion(q)) return 'margin';
  if (/\b(kpi|kpis|peer group|benchmark)\b/.test(q) && /\b(below|under|versus|vs|gap|peer|benchmark)\b/.test(q)) {
    return 'kpi_peers';
  }
  if (/\brisks?\b/.test(q) || /\bnext 90 days\b/.test(q)) return 'risks';
  if (/\b(sustained negative|negative trends?|14 and 30|last 14 and 30)\b/.test(q)) return 'daily_negative_trends';
  if (/\b(leading indicators?|cash\/?\s*ar|deteriorating cash|ar performance)\b/.test(q)) return 'cash_ar_indicators';
  if (/\bconcentration\b/.test(q)) return 'concentration';
  if (/\b(coa|expense categor)/.test(q) && /\b(variance|month-over-month|month over month|mom)\b/.test(q)) {
    return 'coa_expense_variance';
  }
  if (/\b(cost creep|run-?rate cost|run rate)\b/.test(q)) return 'cost_creep';
  if (/\b(earliest month|run-?rate shift began|expense run-?rate shift)\b/.test(q)) return 'expense_shift_start';
  if (/\b(job|project|change order|underbill|eac|retainage)\b/.test(q)) return 'construction_ops';
  if (isCompetitorQuestion(question)) return 'competitor';
  if (/\b(acquisition|m&a|capital deployment|reinvestment|debt paydown|distributions)\b/.test(q)) {
    return 'general';
  }
  return 'general';
}

function pickCitation(
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>,
  prefer: 'financial' | 'operations' = 'financial'
) {
  const financial = sources.find((s) => String(s.title || '').toLowerCase().includes('data review'));
  const operations = sources.find((s) => String(s.title || '').toLowerCase().includes('operations'));
  const chosen = prefer === 'operations' ? operations || financial || sources[0] : financial || operations || sources[0];
  if (!chosen) return null;
  return { url: chosen.url, title: chosen.title, publishedDate: chosen.publishedDate };
}

function makeAskOutput(params: {
  shortAnswer: string;
  bullets: string[];
  citation: { url: string; title?: string; publishedDate?: string | null };
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  howThisImpactsUs: string;
}): AskOutput {
  const citedBullets = params.bullets.filter(Boolean).slice(0, 8).map((text) => ({
    text,
    citations: [params.citation],
  }));
  return {
    shortAnswer: params.shortAnswer,
    longAnswer: citedBullets.map((b) => `- ${b.text}`).join('\n'),
    citedBullets,
    howThisImpactsUs: params.howThisImpactsUs,
    sources: params.sources,
  };
}

function serializeMonthlyAskRow(month: any) {
  if (!month) return null;
  const revenue = Number(month.revenue || 0);
  const cogsTotal = Number(month.cogsTotal || 0);
  const row: Record<string, unknown> = {
    monthDate: month.monthDate,
    revenue,
    expense: Number(month.expense || 0),
    cogsTotal,
    cogsMaterials: Number(month.cogsMaterials || 0),
    cogsPayroll: Number(month.cogsPayroll || 0),
    cogsOwnerPay: Number(month.cogsOwnerPay || 0),
    cogsContractors: Number(month.cogsContractors || 0),
    cogsCommissions: Number(month.cogsCommissions || 0),
    cogsOther: Number(month.cogsOther || 0),
    grossProfit: revenue - cogsTotal,
    grossMarginPct: revenue > 0 ? ((revenue - cogsTotal) / revenue) * 100 : null,
    cash: Number(month.cash || 0),
    ar: Number(month.ar || 0),
    ap: Number(month.ap || 0),
  };
  for (const field of COA_EXPENSE_FIELDS) {
    row[field.key] = Number(month?.[field.key] || 0);
  }
  return row;
}

function extractExpenseCategories(month: any): Array<{ key: string; label: string; amount: number }> {
  if (!month) return [];
  return COA_EXPENSE_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    amount: Number(month?.[field.key] || 0),
  })).filter((row) => Number.isFinite(row.amount));
}

function buildExpenseVarianceAnswer(params: {
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  internalSummary?: Record<string, any>;
}): AskOutput | null {
  const latest = params.internalSummary?.monthlySnapshot?.latest;
  const previous = params.internalSummary?.monthlySnapshot?.previous;
  const citation = pickCitation(params.sources, 'financial');
  if (!latest || !previous || !citation) return null;

  const latestCats = extractExpenseCategories(latest);
  const prevByKey = new Map(extractExpenseCategories(previous).map((row) => [row.key, row.amount]));
  const variances = latestCats
    .map((row) => {
      const prior = prevByKey.get(row.key) || 0;
      const delta = row.amount - prior;
      const pct = prior !== 0 ? delta / Math.abs(prior) : null;
      return { ...row, prior, delta, pct };
    })
    .filter((row) => Math.abs(row.delta) >= 250)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);

  if (!variances.length) {
    return makeAskOutput({
      shortAnswer: `No material COA expense category variances were found between ${monthLabel(previous.monthDate)} and ${monthLabel(latest.monthDate)}.`,
      bullets: [
        `Compared expense categories month-over-month using mapped COA fields; none moved by $250 or more.`,
        `Total operating expense changed ${signedMoney(Number(latest.expense || 0) - Number(previous.expense || 0))}.`,
      ],
      citation,
      sources: params.sources,
      howThisImpactsUs: 'Expense run-rate looks stable in the mapped categories for this comparison window.',
    });
  }

  const bullets = variances.map((row) => {
    const structural =
      Math.abs(row.pct || 0) >= 0.15 && Math.abs(row.prior) >= 1000
        ? 'likely structural/run-rate'
        : Math.abs(row.prior) < 500 && Math.abs(row.delta) >= 1000
          ? 'likely one-time / timing'
          : 'monitor for persistence';
    return `${row.label}: ${signedMoney(row.delta)} (${formatMoneyBrief(row.prior)} → ${formatMoneyBrief(row.amount)}${
      row.pct != null ? `, ${(row.pct >= 0 ? '+' : '')}${(row.pct * 100).toFixed(1)}%` : ''
    }); ${structural}.`;
  });

  return makeAskOutput({
    shortAnswer: `Largest COA expense variances from ${monthLabel(previous.monthDate)} to ${monthLabel(latest.monthDate)} are led by ${variances[0].label} (${signedMoney(variances[0].delta)}).`,
    bullets,
    citation,
    sources: params.sources,
    howThisImpactsUs:
      'Treat categories labeled structural/run-rate as ongoing cost-base changes; isolate one-time/timing items before changing forecasts.',
  });
}

function buildCostCreepAnswer(params: {
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  internalSummary?: Record<string, any>;
  mode: 'creep' | 'shift_start';
}): AskOutput | null {
  const history = (params.internalSummary?.monthlyHistory || []) as any[];
  const citation = pickCitation(params.sources, 'financial');
  if (!citation || history.length < 3) return null;

  const chronological = [...history].sort(
    (a, b) => new Date(a.monthDate).getTime() - new Date(b.monthDate).getTime()
  );
  const categorySeries = COA_EXPENSE_FIELDS.map((field) => {
    const points = chronological.map((month) => ({
      monthDate: month.monthDate,
      amount: Number(month?.[field.key] || 0),
    }));
    const first = points[0]?.amount || 0;
    const last = points[points.length - 1]?.amount || 0;
    const delta = last - first;
    let risingStreak = 0;
    for (let i = 1; i < points.length; i += 1) {
      if (points[i].amount >= points[i - 1].amount) risingStreak += 1;
      else risingStreak = 0;
    }
    let shiftStart: string | null = null;
    for (let i = 1; i < points.length; i += 1) {
      const prior = points[i - 1].amount;
      const cur = points[i].amount;
      if (prior > 0 && (cur - prior) / Math.abs(prior) >= 0.1 && cur - prior >= 500) {
        shiftStart = monthLabel(points[i].monthDate);
        break;
      }
    }
    return {
      label: field.label,
      first,
      last,
      delta,
      risingStreak,
      shiftStart,
      latest: last,
    };
  })
    .filter((row) => Math.abs(row.delta) >= 500 || row.risingStreak >= 2)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  if (params.mode === 'shift_start') {
    const withStart = categorySeries.filter((row) => row.shiftStart).slice(0, 5);
    if (!withStart.length) {
      return makeAskOutput({
        shortAnswer: 'No clear expense run-rate shift start month was detected in the available monthly history.',
        bullets: [
          `Reviewed ${chronological.length} months of mapped COA expense categories for a >=10% and >=$500 step-up.`,
          'No category met that shift threshold in the loaded history.',
        ],
        citation,
        sources: params.sources,
        howThisImpactsUs: 'Without a detected step-change, treat current expense levels as the working run-rate baseline.',
      });
    }
    return makeAskOutput({
      shortAnswer: `Earliest detected expense run-rate shift is ${withStart[0].shiftStart} in ${withStart[0].label}.`,
      bullets: withStart.map(
        (row) =>
          `${row.label}: shift begins ${row.shiftStart}; now ${formatMoneyBrief(row.latest)} (change ${signedMoney(row.delta)} over the window).`
      ),
      citation,
      sources: params.sources,
      howThisImpactsUs: 'Anchor budget/forecast resets to the earliest confirmed step-up month for the affected categories.',
    });
  }

  const creepers = categorySeries.filter((row) => row.delta > 0 && (row.risingStreak >= 2 || row.delta / Math.max(row.first, 1) >= 0.1)).slice(0, 5);
  if (!creepers.length) {
    return makeAskOutput({
      shortAnswer: 'No clear run-rate cost creep was detected across mapped COA categories in the available months.',
      bullets: [
        `Reviewed ${chronological.length} months of expense categories for sustained increases.`,
        'No category showed a material multi-month upward run-rate pattern.',
      ],
      citation,
      sources: params.sources,
      howThisImpactsUs: 'Expense categories look stable; keep monitoring monthly for new step-ups.',
    });
  }

  return makeAskOutput({
    shortAnswer: `Run-rate cost creep is most evident in ${creepers[0].label} (${signedMoney(creepers[0].delta)} over the loaded months).`,
    bullets: creepers.map(
      (row) =>
        `${row.label}: ${formatMoneyBrief(row.first)} → ${formatMoneyBrief(row.last)} (${signedMoney(row.delta)}); rising streak ${row.risingStreak} month-step${row.risingStreak === 1 ? '' : 's'}.`
    ),
    citation,
    sources: params.sources,
    howThisImpactsUs: 'Prioritize the rising categories for owner review before they permanently reset the cost base.',
  });
}

function buildKpiPeersAnswer(params: {
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  internalSummary?: Record<string, any>;
}): AskOutput | null {
  const ratios = (params.internalSummary?.kpiDefinitions?.ratios || []) as RatioSnapshot[];
  const citation = pickCitation(params.sources, 'financial');
  if (!citation || !ratios.length) return null;

  const below = ratios
    .filter((row) => row.value != null && row.benchmark != null && Number.isFinite(row.value) && Number.isFinite(row.benchmark))
    .map((row) => {
      const value = Number(row.value);
      const benchmark = Number(row.benchmark);
      // For days metrics and leverage-like ratios, higher can be worse; use name heuristics.
      const higherIsWorse = /days|debt|leverage|liab/i.test(row.name);
      const worse = higherIsWorse ? value > benchmark : value < benchmark;
      const gap = higherIsWorse ? value - benchmark : benchmark - value;
      return { ...row, value, benchmark, worse, gap, higherIsWorse };
    })
    .filter((row) => row.worse && Math.abs(row.gap) > 0)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, 6);

  if (!below.length) {
    return makeAskOutput({
      shortAnswer: 'No KPI/ratio gaps versus peer benchmarks were identified from the available ratio snapshot.',
      bullets: [
        `Compared ${ratios.length} ratio KPIs to industry peer benchmarks.`,
        'None were materially below (or worse than) peer values in this snapshot.',
      ],
      citation,
      sources: params.sources,
      howThisImpactsUs: 'Peer-relative KPI posture looks acceptable; monitor next month for emerging gaps.',
    });
  }

  const formatRatio = (row: (typeof below)[number]) => {
    if (row.unit === 'percent') return `${(row.value * 100).toFixed(1)}% vs peer ${(row.benchmark * 100).toFixed(1)}%`;
    if (row.unit === 'days') return `${row.value.toFixed(1)} days vs peer ${row.benchmark.toFixed(1)} days`;
    return `${row.value.toFixed(2)} vs peer ${row.benchmark.toFixed(2)}`;
  };

  return makeAskOutput({
    shortAnswer: `${below.length} KPI${below.length === 1 ? '' : 's'} are worse than peer benchmarks, led by ${below[0].name}.`,
    bullets: below.map((row) => {
      const cause =
        /receivable|ar|dso/i.test(row.name)
          ? 'Likely collections/aging pressure.'
          : /inventory/i.test(row.name)
            ? 'Likely inventory turns or stocking mix.'
            : /margin|ebit|roe|roa/i.test(row.name)
              ? 'Likely pricing, mix, or cost structure versus peers.'
              : /current|quick|working capital/i.test(row.name)
                ? 'Likely liquidity / working-capital timing.'
                : 'Review drivers in financials and operations for this ratio.';
      return `${row.name}: ${formatRatio(row)}. ${cause}`;
    }),
    citation,
    sources: params.sources,
    howThisImpactsUs: 'Close the largest peer gaps first; they are the clearest underperformance signals versus the industry set.',
  });
}

function trendDirection(change: any): 'up' | 'down' | 'flat' | 'unknown' {
  const absolute = Number(change?.absolute);
  if (!Number.isFinite(absolute)) return 'unknown';
  if (Math.abs(absolute) < 0.0001) return 'flat';
  return absolute > 0 ? 'up' : 'down';
}

function formatTrendChange(change: any, unit: string): string {
  const absolute = Number(change?.absolute);
  const percent = Number(change?.percent);
  if (!Number.isFinite(absolute)) return 'insufficient history';
  const absText =
    unit === 'percent'
      ? `${absolute >= 0 ? '+' : ''}${absolute.toFixed(1)} pts`
      : signedMoney(absolute);
  const pctText = Number.isFinite(percent) ? ` (${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%)` : '';
  return `${absText}${pctText}`;
}

function buildDailyTrendsAnswer(params: {
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  internalSummary?: Record<string, any>;
}): AskOutput | null {
  const metrics = (params.internalSummary?.operationalTrends?.metrics || []) as any[];
  const citation = pickCitation(params.sources, 'operations');
  if (!citation || !metrics.length) return null;

  const negativePreferredUp = /share|aging|90\+|over 30|top customer share/i;
  const rows = metrics
    .map((metric) => {
      const c14 = trendDirection(metric.change14Days?.change);
      const c30 = trendDirection(metric.change30Days?.change);
      const upIsBad = negativePreferredUp.test(metric.name);
      const bad14 = upIsBad ? c14 === 'up' : c14 === 'down';
      const bad30 = upIsBad ? c30 === 'up' : c30 === 'down';
      return {
        name: metric.name,
        unit: metric.unit,
        bad14,
        bad30,
        sustained: bad14 && bad30,
        c14,
        c30,
        change14: metric.change14Days?.change,
        change30: metric.change30Days?.change,
      };
    })
    .filter((row) => row.sustained || row.bad14 || row.bad30)
    .sort((a, b) => Number(b.sustained) - Number(a.sustained));

  const sustained = rows.filter((row) => row.sustained);
  if (!sustained.length && !rows.length) {
    return makeAskOutput({
      shortAnswer: 'No sustained negative daily operational trends were detected over the last 14 and 30 days.',
      bullets: metrics.slice(0, 5).map(
        (metric) =>
          `${metric.name}: 14d ${formatTrendChange(metric.change14Days?.change, metric.unit)}; 30d ${formatTrendChange(metric.change30Days?.change, metric.unit)}.`
      ),
      citation,
      sources: params.sources,
      howThisImpactsUs: 'Daily cash/AR/AP/customer metrics are not showing a sustained adverse pattern in this window.',
    });
  }

  const focus = sustained.length ? sustained : rows;
  return makeAskOutput({
    shortAnswer: sustained.length
      ? `${sustained.length} daily metric${sustained.length === 1 ? '' : 's'} show sustained negative trends over both 14 and 30 days.`
      : `${focus.length} daily metric${focus.length === 1 ? '' : 's'} show negative movement in the recent windows.`,
    bullets: focus.slice(0, 6).map(
      (row) =>
        `${row.name}: 14d ${formatTrendChange(row.change14, row.unit)}; 30d ${formatTrendChange(row.change30, row.unit)}${
          row.sustained ? ' (sustained across both windows)' : ''
        }.`
    ),
    citation,
    sources: params.sources,
    howThisImpactsUs: 'Investigate the sustained metrics first; they are the strongest near-term operating warning signs.',
  });
}

function buildCashArIndicatorAnswer(params: {
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  internalSummary?: Record<string, any>;
}): AskOutput | null {
  const metrics = (params.internalSummary?.operationalTrends?.metrics || []) as any[];
  const citation = pickCitation(params.sources, 'operations');
  if (!citation || !metrics.length) return null;
  const byName = (needle: RegExp) => metrics.find((m) => needle.test(String(m.name || '')));
  const cash = byName(/cash balance/i);
  const ar = byName(/^ar total/i);
  const arAging = byName(/ar >30|ar over 30|ar >30 days share/i);
  const customerRev = byName(/customer revenue total/i);
  const concentration = byName(/top customer share/i);

  const bullets: string[] = [];
  const cashDown = trendDirection(cash?.change30Days?.change) === 'down';
  const arUp = trendDirection(ar?.change30Days?.change) === 'up';
  const agingUp = trendDirection(arAging?.change30Days?.change) === 'up';
  const salesDown = trendDirection(customerRev?.change30Days?.change) === 'down';
  const concentrationUp = trendDirection(concentration?.change30Days?.change) === 'up';

  if (cash) bullets.push(`Cash (30d): ${formatTrendChange(cash.change30Days?.change, cash.unit)}.`);
  if (ar) bullets.push(`AR total (30d): ${formatTrendChange(ar.change30Days?.change, ar.unit)}.`);
  if (arAging) bullets.push(`AR >30 days share (30d): ${formatTrendChange(arAging.change30Days?.change, arAging.unit)}.`);
  if (customerRev) bullets.push(`Customer revenue (30d): ${formatTrendChange(customerRev.change30Days?.change, customerRev.unit)}.`);
  if (concentration) {
    bullets.push(`Top customer share (30d): ${formatTrendChange(concentration.change30Days?.change, concentration.unit)}.`);
  }

  const correlations: string[] = [];
  if (cashDown && arUp) correlations.push('Rising AR alongside falling cash is a collections/working-capital warning.');
  if (cashDown && agingUp) correlations.push('Worsening AR aging correlates with cash pressure.');
  if (cashDown && salesDown) correlations.push('Lower customer revenue can explain weaker cash inflows.');
  if (arUp && agingUp) correlations.push('AR growth with rising >30 share points to slower collections, not just billing volume.');
  if (concentrationUp && (cashDown || agingUp)) {
    correlations.push('Rising customer concentration can amplify cash/AR volatility if a large account slows payments.');
  }

  if (!bullets.length) return null;
  return makeAskOutput({
    shortAnswer: correlations[0]
      ? correlations[0]
      : 'Cash/AR leading indicators over the last 30 days do not show a clear adverse correlation pattern.',
    bullets: [...correlations.slice(0, 3), ...bullets].slice(0, 7),
    citation,
    sources: params.sources,
    howThisImpactsUs:
      'Use the correlated indicators to prioritize collections, credit limits, and near-term cash planning.',
  });
}

function buildConcentrationAnswer(params: {
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  internalSummary?: Record<string, any>;
}): AskOutput | null {
  const metrics = (params.internalSummary?.operationalTrends?.metrics || []) as any[];
  const customers = ((params.internalSummary?.sectorOperationalContext?.genericOperationalData as any)?.customers
    ?.topCustomers || []) as any[];
  const citation = pickCitation(params.sources, 'operations');
  if (!citation) return null;

  const shareMetric = metrics.find((m) => /top customer share/i.test(String(m.name || '')));
  const bullets: string[] = [];
  if (shareMetric) {
    bullets.push(
      `Top customer share: 14d ${formatTrendChange(shareMetric.change14Days?.change, shareMetric.unit)}; 30d ${formatTrendChange(shareMetric.change30Days?.change, shareMetric.unit)}.`
    );
  }
  const totalRevenue = customers.reduce((sum, row) => sum + Number(row.totalRevenue || 0), 0);
  for (const row of customers.slice(0, 3)) {
    const revenue = Number(row.totalRevenue || 0);
    const share = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : null;
    bullets.push(
      `${row.name || row.customerName}: ${formatMoneyBrief(revenue)} recent revenue${
        share != null ? ` (${share.toFixed(1)}% of customer snapshot)` : ''
      }.`
    );
  }

  const worsening =
    trendDirection(shareMetric?.change14Days?.change) === 'up' ||
    trendDirection(shareMetric?.change30Days?.change) === 'up';

  if (!bullets.length) return null;
  return makeAskOutput({
    shortAnswer: worsening
      ? 'Customer concentration risk is worsening: top-customer share has increased in the recent daily windows.'
      : 'Customer concentration is visible in the top accounts, but top-customer share is not clearly worsening in the recent daily windows.',
    bullets,
    citation,
    sources: params.sources,
    howThisImpactsUs: worsening
      ? 'Reduce dependency on the largest accounts through collections terms, diversification, and pipeline coverage.'
      : 'Keep watching top-account share; concentration remains a structural risk even when not currently worsening.',
  });
}

function buildRisksAnswer(params: {
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  question: string;
  internalSummary?: Record<string, any>;
}): AskOutput | null {
  const citation = pickCitation(params.sources, 'financial');
  if (!citation) return null;
  const risks: Array<{ severity: number; text: string }> = [];

  const margin = buildMarginDriversFromSummary(params.internalSummary);
  if (margin && ((margin.gmDeltaPts != null && margin.gmDeltaPts <= -1) || margin.gpDelta < -1000)) {
    risks.push({
      severity: 3,
      text: `Margin risk: gross margin ${margin.gmDeltaPts != null ? signedPctPoints(margin.gmDeltaPts) : 'moved'} with gross profit ${signedMoney(margin.gpDelta)} versus prior month.`,
    });
  }

  const trends = (params.internalSummary?.operationalTrends?.metrics || []) as any[];
  const cash = trends.find((m) => /cash balance/i.test(String(m.name || '')));
  const arAging = trends.find((m) => /ar >30|ar over 30/i.test(String(m.name || '')));
  if (trendDirection(cash?.change30Days?.change) === 'down') {
    risks.push({
      severity: 3,
      text: `Liquidity risk: cash declined ${formatTrendChange(cash.change30Days?.change, cash.unit)} over 30 days.`,
    });
  }
  if (trendDirection(arAging?.change30Days?.change) === 'up') {
    risks.push({
      severity: 2,
      text: `Collections risk: AR >30 days share rose ${formatTrendChange(arAging.change30Days?.change, arAging.unit)} over 30 days.`,
    });
  }

  const shareMetric = trends.find((m) => /top customer share/i.test(String(m.name || '')));
  if (trendDirection(shareMetric?.change30Days?.change) === 'up') {
    risks.push({
      severity: 2,
      text: `Concentration risk: top customer share increased ${formatTrendChange(shareMetric.change30Days?.change, shareMetric.unit)} over 30 days.`,
    });
  }

  const kpi = buildKpiPeersAnswer(params);
  const kpiBullets = kpi?.citedBullets?.slice(0, 1) || [];
  for (const bullet of kpiBullets) {
    risks.push({ severity: 1, text: `Peer KPI risk: ${bullet.text}` });
  }

  const issues = (params.internalSummary?.sectorOperationalContext?.issueSummaries || []) as any[];
  for (const issue of issues.slice(0, 2)) {
    risks.push({ severity: 2, text: `Operating risk: ${issue.issue}` });
  }

  const top = risks.sort((a, b) => b.severity - a.severity).slice(0, 3);
  if (!top.length) {
    return makeAskOutput({
      shortAnswer: 'No material top risks were identified from current margin, liquidity, concentration, and peer KPI signals.',
      bullets: [
        'Checked margin movement, cash/AR trends, customer concentration, peer KPI gaps, and sector operating issues.',
        'None crossed a material adverse threshold in the available data.',
      ],
      citation,
      sources: params.sources,
      howThisImpactsUs: 'Maintain normal monitoring; no urgent 90-day performance risk stood out in the current snapshot.',
    });
  }

  return makeAskOutput({
    shortAnswer: `Top ${top.length} performance risk${top.length === 1 ? '' : 's'} over the next 90 days are ${top
      .map((r) => r.text.split(':')[0].toLowerCase())
      .join(', ')}.`,
    bullets: top.map((r) => r.text),
    citation,
    sources: params.sources,
    howThisImpactsUs: 'Address the highest-severity risks first over the next 90 days; they are the clearest threats to near-term performance.',
  });
}

function buildConstructionOpsAnswer(params: {
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  question: string;
  internalSummary?: Record<string, any>;
}): AskOutput | null {
  const sectorContext = params.internalSummary?.sectorOperationalContext as SectorOperationalContext | undefined;
  const citation = pickCitation(params.sources, 'operations');
  if (!sectorContext || !citation) return null;
  const issues = sectorContext.issueSummaries || [];
  const matched = issues.filter((issue) => includesQuestionEntity(params.question, [issue.entityName, issue.entityId]));
  const selected = (matched.length ? matched : issues).slice(0, 6);
  if (!selected.length) return null;
  return makeAskOutput({
    shortAnswer: `Found ${selected.length} construction operating issue${selected.length === 1 ? '' : 's'} tied to jobs/projects.`,
    bullets: selected.map((issue) => `${issue.issue} Action: ${issue.action}`),
    citation,
    sources: params.sources,
    howThisImpactsUs: 'Resolve the named job issues before the next project review to protect margin and cash timing.',
  });
}

function buildInsufficientDataAnswer(params: {
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  question: string;
  intent: AskIntent;
}): AskOutput {
  const citation = pickCitation(params.sources, 'financial') || {
    url: params.sources[0]?.url || '',
    title: params.sources[0]?.title,
    publishedDate: params.sources[0]?.publishedDate ?? null,
  };
  const strategyQuestion = /\b(acquisition|m&a|capital deployment|industry trends|peers in our industry)\b/i.test(
    params.question
  );
  return makeAskOutput({
    shortAnswer: strategyQuestion
      ? 'This question needs grounded market/external context, and the current internal-only dataset does not support a specific answer.'
      : `I do not have enough specific internal data yet to answer this ${params.intent.replace(/_/g, ' ')} question with quantified results.`,
    bullets: strategyQuestion
      ? [
          `Question asked: ${params.question}`,
          'Internal financial/operational snapshots alone are not sufficient for acquisition archetypes, capital-deployment strategy, or peer-market narrative.',
          'Turn on external web sources (or provide market materials) and ask again for a sourced answer.',
        ]
      : [
          `Question asked: ${params.question}`,
          'Checked the available financial snapshots, operational trends, KPI/ratio set, and sector operating context.',
          'Import or refresh the missing monthly/daily data, then ask again for a quantified answer.',
        ],
    citation,
    sources: params.sources,
    howThisImpactsUs: strategyQuestion
      ? 'Avoid strategy decisions from generic internal dumps; use sourced market evidence before acting.'
      : 'Without the underlying period data, any answer would be speculative; refresh source data before making decisions.',
  });
}

function buildQuestionSpecificAnswer(params: {
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  companyName: string;
  question: string;
  requestedCount: number | null;
  internalSummary?: Record<string, any>;
}): AskOutput {
  const intent = classifyAskIntent(params.question);

  if (intent === 'margin') {
    return (
      buildMarginDriversFallback(params) ||
      buildInsufficientDataAnswer({ ...params, intent })
    );
  }
  if (intent === 'kpi_peers') {
    return buildKpiPeersAnswer(params) || buildInsufficientDataAnswer({ ...params, intent });
  }
  if (intent === 'risks') {
    return buildRisksAnswer(params) || buildInsufficientDataAnswer({ ...params, intent });
  }
  if (intent === 'daily_negative_trends') {
    return buildDailyTrendsAnswer(params) || buildInsufficientDataAnswer({ ...params, intent });
  }
  if (intent === 'cash_ar_indicators') {
    return buildCashArIndicatorAnswer(params) || buildInsufficientDataAnswer({ ...params, intent });
  }
  if (intent === 'concentration') {
    return buildConcentrationAnswer(params) || buildInsufficientDataAnswer({ ...params, intent });
  }
  if (intent === 'coa_expense_variance') {
    return buildExpenseVarianceAnswer(params) || buildInsufficientDataAnswer({ ...params, intent });
  }
  if (intent === 'cost_creep') {
    return buildCostCreepAnswer({ ...params, mode: 'creep' }) || buildInsufficientDataAnswer({ ...params, intent });
  }
  if (intent === 'expense_shift_start') {
    return (
      buildCostCreepAnswer({ ...params, mode: 'shift_start' }) || buildInsufficientDataAnswer({ ...params, intent })
    );
  }
  if (intent === 'construction_ops') {
    return buildConstructionOpsAnswer(params) || buildInsufficientDataAnswer({ ...params, intent });
  }
  if (intent === 'competitor') {
    const candidates = extractCompanyCandidates(params.sources);
    const targetCount = params.requestedCount ?? Math.min(5, candidates.length);
    const picks = candidates.slice(0, targetCount);
    if (!picks.length) return buildInsufficientDataAnswer({ ...params, intent });
    return {
      shortAnswer: `Here are ${picks.length} competitors related to ${params.companyName || 'the company'} based on available sources.`,
      longAnswer: `Sources identify: ${picks.map((c) => c.name).join(', ')}.`,
      citedBullets: picks.map((c) => ({
        text: `${c.name} — Listed in source results; verify services and location on the cited source.`,
        citations: [{ url: c.sourceUrl, title: c.sourceTitle }],
      })),
      howThisImpactsUs:
        'Use this list for initial outreach or benchmarking; confirm scope and capabilities directly with each firm.',
      sources: params.sources,
    };
  }

  // General internal questions: prefer margin/risks/trends synthesis over generic dumps.
  // Opportunity / strategy questions need grounded external context — do not invent from ops dumps.
  if (/\b(acquisition|m&a|capital deployment|reinvestment|debt paydown|distributions|industry trends|peers in our industry)\b/i.test(params.question)) {
    return buildInsufficientDataAnswer({
      ...params,
      intent,
    });
  }
  return (
    buildRisksAnswer(params) ||
    buildDailyTrendsAnswer(params) ||
    buildMarginDriversFallback(params) ||
    buildInsufficientDataAnswer({ ...params, intent })
  );
}

function buildFallbackFromSources(params: {
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  companyName: string;
  question: string;
  requestedCount: number | null;
  internalSummary?: Record<string, any>;
}): AskOutput {
  const { sources, question, internalSummary } = params;
  const hasDoc = !!internalSummary?.documentContext;

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

  // Always answer the specific question with quantified internal results — never generic module dumps.
  return buildQuestionSpecificAnswer(params);
}

function formatMoneyBrief(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatPctBrief(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `${n.toFixed(1)}%`;
}

function includesQuestionEntity(question: string, values: unknown[]): boolean {
  const q = question.toLowerCase();
  return values.some((value) => {
    const text = String(value || '').trim().toLowerCase();
    return text.length >= 3 && q.includes(text);
  });
}

function buildConstructionIssueSummaries(construction: ReturnType<typeof buildConstructionBriefingFacts> | null) {
  if (!construction) return [];
  const summaries: SectorOperationalContext['issueSummaries'] = [];
  const byKey = new Map<string, any>();
  const keyFor = (row: any) => String(row?.jobId || row?.jobName || '').trim();
  const merge = (row: any, patch: Record<string, unknown>) => {
    const key = keyFor(row);
    if (!key) return;
    byKey.set(key, { ...(byKey.get(key) || {}), jobId: row?.jobId, jobName: row?.jobName, ...patch });
  };

  for (const row of construction.jobCostControl?.marginWatch || []) {
    merge(row, {
      projectedProfit: row.projectedProfit,
      marginPct: row.marginPct,
      costToDate: row.costToDate,
      eac: row.eac,
    });
  }
  for (const row of construction.commitmentsForecast?.changeOrders || []) {
    merge(row, {
      pendingCOs: row.pendingCOs,
      pendingCount: row.pendingCount,
      approvedCOs: row.approvedCOs,
      revisedContractValue: row.revisedContractValue,
    });
  }
  for (const row of construction.billingCash?.billingCash || []) {
    merge(row, {
      costToDate: row.costToDate,
      billedToDate: row.billedToDate,
      billingPctOfCost: row.billingPctOfCost,
      netCashPosition: row.netCashPosition,
    });
  }
  for (const row of (construction.billingCash as any)?.arByJob || []) {
    merge(row, {
      billingTotalAR: row.totalAR,
      billingBucket90Plus: row.bucket90Plus,
      billingPctOver60: row.pctOver60,
    });
  }
  for (const row of construction.constructionAr?.byProject || []) {
    merge(row, {
      projectTotalAR: row.totalAr,
      projectD90Plus: row.d90Plus,
    });
  }

  for (const row of byKey.values()) {
    const pendingCOs = Number(row.pendingCOs || 0);
    const pendingCount = Number(row.pendingCount || 0);
    const projectedProfit = Number(row.projectedProfit);
    const marginPct = Number(row.marginPct);
    if (pendingCOs > 0) {
      summaries.push({
        entityName: row.jobName,
        entityId: row.jobId,
        severity: pendingCOs >= 25000 ? 'high' : 'medium',
        issue: `${row.jobName} (${row.jobId}) has ${formatMoneyBrief(pendingCOs)} pending COs${pendingCount ? ` across ${pendingCount} item${pendingCount === 1 ? '' : 's'}` : ''}; projected profit is ${formatMoneyBrief(projectedProfit)} at ${formatPctBrief(marginPct)} margin.`,
        action: `Confirm which pending COs will be approved and update the forecasted profit/margin for ${row.jobName}.`,
      });
    }

    const costToDate = Number(row.costToDate || 0);
    const billedToDate = Number(row.billedToDate || 0);
    const billingPct = Number(row.billingPctOfCost);
    const ar = Number(row.billingTotalAR || row.projectTotalAR || 0);
    const ar90 = Number(row.billingBucket90Plus || row.projectD90Plus || 0);
    const underBilled = Math.max(0, costToDate - billedToDate);
    if (costToDate > 0 && underBilled > 0 && billingPct < 95) {
      summaries.push({
        entityName: row.jobName,
        entityId: row.jobId,
        severity: ar90 > 0 || underBilled >= 50000 ? 'high' : 'medium',
        issue: `${row.jobName} (${row.jobId}) is billed at ${formatPctBrief(billingPct)} of ${formatMoneyBrief(costToDate)} cost (${formatMoneyBrief(underBilled)} underbilled)${ar ? `, with ${formatMoneyBrief(ar)} AR` : ''}${ar90 ? ` and ${formatMoneyBrief(ar90)} in 90+ AR` : ''}.`,
        action: `Review billing status and collection plan for ${row.jobName}; prioritize catch-up billing and 90+ AR follow-up.`,
      });
    } else if (ar90 > 0) {
      summaries.push({
        entityName: row.jobName,
        entityId: row.jobId,
        severity: 'high',
        issue: `${row.jobName} (${row.jobId}) has ${formatMoneyBrief(ar90)} in 90+ AR${ar ? ` out of ${formatMoneyBrief(ar)} total AR` : ''}.`,
        action: `Escalate collection follow-up for the 90+ balance on ${row.jobName}.`,
      });
    }
  }

  return summaries.slice(0, 20);
}

function buildSectorAwareFallback(_params: {
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  question: string;
  internalSummary?: Record<string, any>;
}): AskOutput | null {
  // Intentionally disabled: generic sector dumps caused off-topic Ask answers.
  // Question-specific handlers in buildQuestionSpecificAnswer own this path now.
  return null;
}

function summarizeProductRows(rows: any[]): { topProducts: any[] } | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const byName = new Map<string, { name: string; sku?: string; totalRevenue: number; totalCogs: number; totalQuantity: number }>();
  for (const row of rows) {
    const name = String(row?.itemName || row?.name || row?.sku || '').trim();
    if (!name) continue;
    const current = byName.get(name) || { name, sku: row?.sku || undefined, totalRevenue: 0, totalCogs: 0, totalQuantity: 0 };
    current.totalRevenue += Number(row?.revenue || 0);
    current.totalCogs += Number(row?.cogs || 0);
    current.totalQuantity += Number(row?.quantitySold || 0);
    byName.set(name, current);
  }
  return {
    topProducts: Array.from(byName.values())
      .map((row) => ({
        ...row,
        grossMargin: row.totalRevenue - row.totalCogs,
        grossMarginPct: row.totalRevenue > 0 ? ((row.totalRevenue - row.totalCogs) / row.totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 8),
  };
}

function summarizeInventoryRows(rows: any[]): { totalValue: number; itemCount: number; topItems: any[] } | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const latestDate = rows
    .map((row) => new Date(row?.snapshotDate || 0).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)[0];
  const latestRows = Number.isFinite(latestDate)
    ? rows.filter((row) => new Date(row?.snapshotDate || 0).getTime() === latestDate)
    : rows;
  return {
    totalValue: latestRows.reduce((sum, row) => sum + Number(row?.assetValue || 0), 0),
    itemCount: latestRows.length,
    topItems: latestRows
      .map((row) => ({
        itemName: row?.itemName,
        sku: row?.sku,
        qtyOnHand: Number(row?.qtyOnHand || 0),
        assetValue: Number(row?.assetValue || 0),
      }))
      .sort((a, b) => b.assetValue - a.assetValue)
      .slice(0, 8),
  };
}

function summarizeCustomerRows(rows: any[]): { topCustomers: any[] } | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const byName = new Map<
    string,
    { name: string; totalRevenue: number; totalCogs: number; totalInvoices: number }
  >();
  for (const row of rows) {
    const name = String(row?.customerName || row?.name || '').trim();
    if (!name) continue;
    const current = byName.get(name) || { name, totalRevenue: 0, totalCogs: 0, totalInvoices: 0 };
    current.totalRevenue += Number(row?.revenue || 0);
    current.totalCogs += Number(row?.cogs || 0);
    current.totalInvoices += Number(row?.invoiceCount || 0);
    byName.set(name, current);
  }
  return {
    topCustomers: Array.from(byName.values())
      .map((row) => ({
        ...row,
        grossMargin: row.totalRevenue - row.totalCogs,
        grossMarginPct: row.totalRevenue > 0 ? ((row.totalRevenue - row.totalCogs) / row.totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 8),
  };
}

function buildMockSummary(type: 'customers' | 'products' | 'inventory', companyId: string, sectorCategory?: string | null): any {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 35 * DAY_MS);
  return buildOperationalMockResponse({
    type,
    companyId,
    sectorCategory,
    frequency: 'daily',
    startDate,
    endDate,
    limit: 500,
  } as any).summary;
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
  const conversationContext = !hasDoc ? ((internalSummary as any)?.conversationContext as ConversationContext | null) : null;
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
        'Use internalSummary.sectorOperationalContext for sector-specific operating questions. Respect its allowedOperationalTopics and blockedOperationalTopics.',
        'If the user asks about a named job, project, customer, product, site, unit, account, route, program, or other operating entity, search sectorOperationalContext before saying data is insufficient.',
        'Do not analyze operating topics that are not appropriate for the company sector unless explicit facts are present in sectorOperationalContext.',
        'When sectorOperationalContext.issueSummaries are present, use them as grounded evidence to infer the practical answer. Do not merely describe that sector data exists.',
        'For questions asking whether there are issues, problems, risks, or things to watch, answer directly with the specific issues and recommended actions. Do not lead with source provenance, module names, or instructions to review other pages.',
        'Never quote internal sector guidance, allowed/blocked topic rules, or module-selection instructions in the user-facing answer.',
        'When describing month-over-month changes, use internalSummary.monthlyChanges.direction and values.',
        'Answer the exact question asked with quantified results from internalSummary. Never substitute unrelated top-customer revenue lists, tenant/account dumps, or generic "sector-specific issues" language.',
        'For margin / gross profit / EBITDA driver questions: answer ONLY with quantified margin drivers from monthlySnapshot, monthlyChanges, and marginDrivers. Do not answer with top-customer revenue lists, tenant/account names, or generic sector module signals unless those rows include gross profit and gross margin percent that explain the margin change.',
        'For KPI/peer questions: use kpiDefinitions.ratios and explicitly compare company value versus benchmark.',
        'For daily trend / cash-AR / concentration questions: use operationalTrends metrics with 14-day and 30-day changes.',
        'For COA/expense questions: use monthlySnapshot expense categories and monthlyHistory.',
        'If the user asks for a list of N items, provide N items directly (no referrals to other sites).',
        'Use conversation context for follow-up questions (for example: "that", "it", "compare this to last answer").',
        'When prior context conflicts with new grounded sources, prioritize current grounded sources and mention the change.',
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
        ...(conversationContext
          ? [
              '',
              'Conversation context for true follow-up threading:',
              JSON.stringify(conversationContext),
              '- Use this to resolve references to prior turns and keep continuity.',
            ]
          : []),
        '',
        'Allowed sources (cite ONLY these URLs):',
        JSON.stringify(sourceList),
        '',
        'Requirements:',
        ...requirements.map((r) => `- ${r}`),
        '- Be concise and action-oriented. Avoid generic filler or high-level fluff.',
        '- Use internal summary for company-specific metrics when applicable.',
        '- Answer the specific question with specific numbers, names, dates, and deltas from the data. Do not invent a generic operating-module dump.',
        '- For margin / gross profit / EBITDA questions: lead with the quantified period change in gross margin % and gross profit $, then rank drivers (revenue/mix vs COGS vs expense). Use marginDrivers when present. Never substitute top-customer or tenant revenue for a margin-driver answer.',
        '- For sector-specific operating questions, infer the answer from sectorOperationalContext and issueSummaries only when those facts directly answer the asked question. Lead with the actual issue/action, not where the data came from.',
        '- If the question names a specific operating entity, prioritize issueSummaries and matching entitySearchHints for that entity.',
        '- Do not include internal sector guidance text, allowed/blocked topic rules, or module-selection instructions in shortAnswer, longAnswer, citedBullets, or howThisImpactsUs.',
        '- For peer/market questions, explicitly reference the company industry in the answer.',
        '- Avoid generic statements; cite specific peer commentary from sources when available.',
        '- If the query is marked as externalQuery and no external sources are available, say so clearly and avoid speculation.',
        '- If internal data is insufficient to answer, say exactly what data is missing and avoid speculation.',
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

  let parsed: AskOutput;
  try {
    parsed = safeJsonParse(content) as AskOutput;
  } catch (e: any) {
    // Some models occasionally emit non-JSON wrappers or minor JSON issues (quotes, fences).
    // If that happens, do one fast "repair" pass that converts the output to strict JSON.
    const repair = await createModelText({
      openai,
      model,
      messages: [
        {
          role: 'system',
          content: [
            'You are a strict JSON repair tool.',
            'Return VALID JSON only. Do not include markdown fences or any other text.',
            'Fix quoting, remove trailing commas, and remove any non-JSON wrapper text.',
            'Preserve the original meaning and values as much as possible.',
            'The JSON MUST be a single object with the keys: shortAnswer, longAnswer, citedBullets, howThisImpactsUs, sources.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            'Convert this to valid JSON (single object) with the required keys only.',
            '',
            '---BEGIN---',
            // Bound size to keep retry fast even if the model went off-script.
            String(content).slice(0, 12000),
            '---END---',
          ].join('\n'),
        },
      ],
      temperature: 0,
      maxTokens: 1600,
    });

    parsed = safeJsonParse(repair.text) as AskOutput;
  }
  return {
    parsed,
    finish_reason,
    contentPreview: content.slice(0, 240),
    contentLength: content.length,
  };
}

export async function runAskCorelyticsLegacy(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const companyName = String(body?.companyName || '').trim();
    const question = String(body?.question || '').trim();
    const documentId = body?.documentId ? String(body.documentId).trim() : '';
    const uiModeRaw = String(body?.mode || '').trim().toLowerCase();
    const uiMode: 'default' | 'document' = uiModeRaw === 'document' ? 'document' : 'default';
    const requestedDocumentId = uiMode === 'document' ? documentId : '';
    const useExternalSourcesRaw = body?.useExternalSources;
    const useExternalSourcesOverride =
      typeof useExternalSourcesRaw === 'boolean' ? useExternalSourcesRaw : false;
    const threadId = body?.threadId ? String(body.threadId).slice(0, 120) : '';
    const conversationContext = normalizeConversationContext(body?.conversationContext);

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

    let docContext = requestedDocumentId
      ? await prisma.companyDocument.findUnique({
          where: { id: requestedDocumentId },
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

    const monthlyHistory = await prisma.monthlyFinancial.findMany({
      where: { companyId },
      orderBy: { monthDate: 'desc' },
      take: 8,
    });
    const latestMonth = monthlyHistory[0] || null;
    const prevMonth = monthlyHistory[1] || null;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { industrySector: true, industrySectorCategory: true, name: true },
    });
    const sectorCategory = resolveCompanyIndustrySectorCategory(company);
    const moduleProfile = getExecBriefingModuleProfile(sectorCategory);
    const [productDaily, inventoryDaily] = await Promise.all([
      moduleProfile.genericSnapshots.products
        ? prisma.productSalesSnapshot.findMany({
            where: { companyId, frequency: 'daily', snapshotDate: { gte: start35 } },
            orderBy: { snapshotDate: 'asc' },
            take: 500,
          })
        : Promise.resolve([]),
      moduleProfile.genericSnapshots.inventory
        ? prisma.inventorySnapshot.findMany({
            where: { companyId, frequency: 'daily', snapshotDate: { gte: start35 } },
            orderBy: { snapshotDate: 'asc' },
            take: 500,
          })
        : Promise.resolve([]),
    ]);
    const genericOperationalData: Record<string, unknown> = {};
    if (moduleProfile.genericSnapshots.customers) {
      genericOperationalData.customers =
        summarizeCustomerRows(customersDaily) ||
        buildMockSummary('customers', companyId, sectorCategory);
    }
    if (moduleProfile.genericSnapshots.products) {
      genericOperationalData.products =
        summarizeProductRows(productDaily) ||
        buildMockSummary('products', companyId, sectorCategory);
    }
    if (moduleProfile.genericSnapshots.inventory) {
      genericOperationalData.inventory =
        summarizeInventoryRows(inventoryDaily) ||
        buildMockSummary('inventory', companyId, sectorCategory);
    }
    const constructionOperations = moduleProfile.hasConstructionNativeModules
      ? buildConstructionBriefingFacts(companyId)
      : null;
    const sectorOperationalContext: SectorOperationalContext = {
      profile: moduleProfile,
      genericOperationalData,
      constructionOperations,
      issueSummaries: buildConstructionIssueSummaries(constructionOperations),
      entitySearchHints: [
        ...Object.values(genericOperationalData).flatMap((summary: any) => [
          ...(summary?.topCustomers || []).map((row: any) => row.name || row.customerName),
          ...(summary?.topProducts || []).map((row: any) => row.name || row.itemName || row.sku),
          ...(summary?.topItems || []).map((row: any) => row.itemName || row.sku),
        ]),
        ...(constructionOperations?.jobCostControl?.marginWatch || []).map((row: any) => `${row.jobName} ${row.jobId}`),
        ...(constructionOperations?.billingCash?.billingCash || []).map((row: any) => `${row.jobName || ''} ${row.jobId || ''}`),
        ...(constructionOperations?.constructionAr?.byProject || []).map((row: any) => `${row.jobName || ''} ${row.jobId || ''}`),
      ].filter(Boolean).slice(0, 40),
      notes: [
        'Use only modules listed in profile.promptRules.allowedOperationalTopics for sector-specific operating answers.',
        'Do not answer with blocked operational topics unless the user asks a generic financial question and the data is explicitly present.',
        'If the user names an entity/job/customer/product/location, match it against entitySearchHints and the relevant sector context before falling back.',
      ],
    };
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
    const platosClosetWorkbookContext = await getPlatosClosetAiContext({
      companyId,
      endDate: now,
      months: 36,
    });

    const monthlyChanges = latestMonth && prevMonth
      ? {
          revenue: buildChangeSummary(latestMonth.revenue, prevMonth.revenue),
          expense: buildChangeSummary(latestMonth.expense, prevMonth.expense),
          cogsTotal: buildChangeSummary(latestMonth.cogsTotal, prevMonth.cogsTotal),
          grossProfit: buildChangeSummary(
            Number(latestMonth.revenue || 0) - Number(latestMonth.cogsTotal || 0),
            Number(prevMonth.revenue || 0) - Number(prevMonth.cogsTotal || 0)
          ),
          cash: buildChangeSummary(latestMonth.cash, prevMonth.cash),
          ar: buildChangeSummary(latestMonth.ar, prevMonth.ar),
          ap: buildChangeSummary(latestMonth.ap, prevMonth.ap),
        }
      : null;

    if (uiMode === 'document' && !requestedDocumentId) {
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
          where: { id: requestedDocumentId },
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
            company: {
              id: companyId,
              name: companyName || null,
              industryGroupId,
              industryGroupName,
              industrySectorCategory: moduleProfile.sectorCategory,
            },
            sectorOperationalContext,
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
            company: {
              id: companyId,
              name: companyName || null,
              industryGroupId,
              industryGroupName,
              industrySectorCategory: moduleProfile.sectorCategory,
            },
            sectorOperationalContext,
            threadContext: {
              threadId: threadId || null,
            },
            conversationContext,
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
              productSalesDaily: productDaily.length,
              inventoryDaily: inventoryDaily.length,
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
              latest: serializeMonthlyAskRow(latestMonth),
              previous: serializeMonthlyAskRow(prevMonth),
            },
            monthlyHistory: monthlyHistory.map((month) => serializeMonthlyAskRow(month)).filter(Boolean),
            monthlyChanges,
            marginDrivers: buildMarginDriversFromSummary({
              monthlySnapshot: {
                latest: serializeMonthlyAskRow(latestMonth),
                previous: serializeMonthlyAskRow(prevMonth),
              },
              sectorOperationalContext: { genericOperationalData },
            }),
            kpiDefinitions: {
              alias: ['kpi', 'kpis', 'ratios'],
              note: 'In this app, KPIs are the ratio metrics shown in the Ratios view.',
              asOfMonth: latestMonth?.monthDate || null,
              industryGroupId,
              benchmarksAvailable: benchmarks.length,
              ratios: ratioSnapshot,
            },
            operationalWorkbookData: platosClosetWorkbookContext
              ? {
                  platosCloset: platosClosetWorkbookContext,
                }
              : null,
            notes: [
              'Daily operational trends are computed using the most recent available daily snapshot date as the reference.',
              'If dataPoints are low or change values are null, there may be insufficient daily history to assess trends.',
              'KPI requests should be interpreted as ratio metrics; use kpiDefinitions.ratios when available.',
              'Use monthlyChanges.direction to describe increase/decrease; do not invert directions.',
              'For margin-driver questions, use marginDrivers and monthlySnapshot/monthlyChanges. Do not answer with customer revenue lists that lack gross-profit impact.',
              'For KPI questions use kpiDefinitions.ratios. For daily trend/concentration/cash-AR questions use operationalTrends. For COA/expense questions use monthlyHistory.',
              'Never answer with generic sector module dumps that do not address the asked question.',
              'If operationalWorkbookData.platosCloset is present, use it for Plato spreadsheet-derived sales, inventory, and retail product aging analysis.',
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

    const externalQueryPlan = useExternalSources
      ? buildExternalQueryPlan({
          question,
          industryGroupName,
          industrySectorCategory: sectorCategory,
          companyName: companyName || company?.name || null,
        })
      : null;
    const externalQuery = externalQueryPlan?.query || question;
    const searchResults = useExternalSources
      ? await searchExternalWeb(externalQuery, { requiredTerms: externalQueryPlan?.requiredTerms || [] })
      : [];
    const externalSources = searchResults.map((r) => ({
      url: r.link as string,
      title: r.title || undefined,
      publishedDate: r.date || null,
      snippet: r.snippet || undefined,
    }));
    if (useExternalSources && externalQueryPlan) {
      (internalSummary as any).queryContext.externalQueryText = externalQuery;
      (internalSummary as any).queryContext.externalSearchIntent = externalQueryPlan.searchIntent;
      (internalSummary as any).queryContext.externalTopic = externalQueryPlan.topic;
      (internalSummary as any).queryContext.externalRequiredTerms = externalQueryPlan.requiredTerms;
    }
    internalSummary.queryContext.externalSourcesAvailable = externalSources.length > 0;
    const sources =
      uiMode === 'document'
        ? (documentSource ? [documentSource] : [])
        : (useExternalSources ? externalSources : internalSources);
    const sourcesWithDoc = uiMode === 'document' ? sources : (documentSource ? [documentSource, ...sources] : sources);

    if (useExternalSources && externalSources.length === 0) {
      return NextResponse.json(
        { error: 'No external sources found for this query. Try a more specific query or location.', debug: { externalQuery } },
        { status: 422 },
      );
    }
    if (sourcesWithDoc.length === 0) {
      return NextResponse.json({ error: 'No sources available for this query.' }, { status: 422 });
    }

    // 2) Ask the model to synthesize an answer with REQUIRED structure.
    // Routes through Vercel AI Gateway with per-request ZDR when AI_GATEWAY_API_KEY is set.
    const openai = getOpenAiClient();
    const defaultModel = process.env.OPENAI_MODEL || 'gpt-4o';
    const askModel = process.env.OPENAI_MODEL_ASK || defaultModel;
    // If you don't explicitly set a docs model, default documents to the same
    // interactive model as Ask Corelytics (usually faster/more reliable than the global default).
    const docsModel = process.env.OPENAI_MODEL_DOCS || askModel;
    const model = uiMode === 'document' ? docsModel : askModel;

    // Try full mode first; if truncated, retry once in compact mode.
    let parsed: AskOutput;
    let finishReason: string | null | undefined;
    const externalResultsOnly = Boolean((internalSummary as any)?.queryContext?.externalQuery);
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
        parsed = externalResultsOnly
          ? buildExternalQueryResultsOnlyResponse({ question, sources: sourcesWithDoc })
          : buildFallbackFromSources({ sources: sourcesWithDoc, companyName, question, requestedCount, internalSummary });
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
        parsed = externalResultsOnly
          ? buildExternalQueryResultsOnlyResponse({ question, sources: sourcesWithDoc })
          : buildFallbackFromSources({ sources: sourcesWithDoc, companyName, question, requestedCount, internalSummary });
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
      parsed = externalResultsOnly
        ? buildExternalQueryResultsOnlyResponse({ question, sources: sourcesWithDoc })
        : buildFallbackFromSources({ sources: sourcesWithDoc, companyName, question, requestedCount, internalSummary });
      citedBullets = Array.isArray(parsed?.citedBullets) ? parsed.citedBullets : [];
      if (!hasNonEmptyBullets(citedBullets)) {
        return NextResponse.json(
          { error: 'Unable to build a cited list from available sources. Try a more specific query or location.' },
          { status: 422 },
        );
      }
    }

    // Prefer question-specific quantified answers for internal Ask (no generic dumps).
    if (uiMode !== 'document' && !externalResultsOnly) {
      const intent = classifyAskIntent(question);
      const preferDeterministic =
        intent !== 'general' && intent !== 'competitor'
          ? true
          : isWeakAskAnswer({ ...parsed, citedBullets } as AskOutput, question);
      if (preferDeterministic) {
        const specific = buildQuestionSpecificAnswer({
          sources: sourcesWithDoc,
          companyName,
          question,
          requestedCount,
          internalSummary,
        });
        parsed = specific;
        citedBullets = Array.isArray(parsed.citedBullets) ? parsed.citedBullets : [];
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

export async function POST(request: NextRequest) {
  return runAskCorelyticsLegacy(request);
}

