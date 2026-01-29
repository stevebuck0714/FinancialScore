import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';

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

  try {
    return JSON.parse(s);
  } catch {
    // Best-effort extraction of a JSON object from surrounding text.
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const candidate = s.slice(start, end + 1);
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

function shouldUseExternalSources(question: string, override?: boolean | null): boolean {
  if (override === true) return true;
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
}): AskOutput {
  const { sources, companyName, question, requestedCount } = params;
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

  const sourceList = buildSourcesForPrompt(sources);

  const system = [
    'You are an expert financial/operational analyst.',
    'Return VALID JSON only.',
    'All factual claims must be grounded in the provided sources.',
    'Do not invent URLs. Citations must reference only the provided source URLs.',
    'Focus strictly on financial and operational analysis.',
    'Do NOT reference internal Payments tab data or subscription/billing plan terms.',
    'Do NOT invent metrics or KPIs that are not present in the internal summary.',
    'If the user asks for a list of N items, provide N items directly (no referrals to other sites).',
  ].join('\n');

  const requirements =
    mode === 'full'
      ? [
          'Output MUST include these top-level keys exactly:',
          '"shortAnswer", "longAnswer", "citedBullets", "howThisImpactsUs", "sources".',
          'shortAnswer: 2-4 sentences.',
          'longAnswer: concise and direct, keep it under ~250 words.',
          'citedBullets: 7-10 bullets; EVERY bullet must include >=1 citation.',
          'howThisImpactsUs: REQUIRED, keep it concise (<= 120 words).',
          'sources: must be the provided sources list (same URLs; you may reorder; do not add new URLs).',
        ]
      : [
          // Compact mode to avoid truncation on retry
          'Output MUST include these top-level keys exactly:',
          '"shortAnswer", "longAnswer", "citedBullets", "howThisImpactsUs", "sources".',
          'shortAnswer: 2-3 sentences.',
          'longAnswer: keep it short (<= 200 words).',
          'citedBullets: exactly 5 bullets; EVERY bullet must include >=1 citation.',
          'howThisImpactsUs: REQUIRED (<= 120 words).',
          'sources: must be the provided sources list (same URLs; do not add new URLs).',
        ];

  const companyContext = companyName ? `Company: ${companyName}` : 'Company: (not provided)';

  const user = [
    companyContext,
    `Question: ${question}`,
    '',
    'Internal data summary (use for company-specific metrics; do NOT invent data not present):',
    JSON.stringify(internalSummary, null, 2),
    '',
    'Allowed sources (cite ONLY these URLs):',
    JSON.stringify(sourceList),
    '',
    'Requirements:',
    ...requirements.map((r) => `- ${r}`),
    '- Be concise and action-oriented. Avoid generic filler or high-level fluff.',
    '- Use internal summary for company-specific metrics when applicable.',
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

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: mode === 'full' ? 2200 : 1400,
  });

  const content = completion.choices[0]?.message?.content ?? '';
  const finish_reason = completion.choices[0]?.finish_reason;

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
    const useExternalSourcesRaw = body?.useExternalSources;
    const useExternalSourcesOverride =
      typeof useExternalSourcesRaw === 'boolean' ? useExternalSourcesRaw : null;

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

    const now = new Date();
    const useExternalSources = shouldUseExternalSources(question, useExternalSourcesOverride);
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

    const internalSummary = {
      generatedAt: now.toISOString(),
      company: { id: companyId, name: companyName || null },
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
      notes: [
        'Daily operational trends are computed using the most recent available daily snapshot date as the reference.',
        'If dataPoints are low or change values are null, there may be insufficient daily history to assess trends.',
      ],
    };

    const internalSources = [
      {
        url: 'https://internal.local/financials',
        title: 'Internal financial and operational data',
        publishedDate: null,
        snippet: 'Company financials and daily operational snapshots.',
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
    const sources = useExternalSources ? externalSources : internalSources;

    if (useExternalSources && externalSources.length === 0) {
      return NextResponse.json(
        { error: 'No external sources found for this query. Try a more specific query or location.' },
        { status: 422 },
      );
    }
    if (sources.length === 0) {
      return NextResponse.json({ error: 'No sources available for this query.' }, { status: 422 });
    }

    // 2) Ask the model to synthesize an answer with REQUIRED structure
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-4o';

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
        sources,
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
        sources,
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
        throw new Error('Model output truncated or did not meet list requirements');
      }
    }

    // Basic shape validation + source URL allowlist
    const allowedUrls = new Set(sources.map((s) => s.url));
    let citedBullets = Array.isArray(parsed?.citedBullets) ? parsed.citedBullets : [];
    let citationsOk = hasValidCitations(citedBullets, allowedUrls);

    if (!citationsOk) {
      const strictRetry = await generateAskJson({
        openai,
        model,
        companyName,
        question,
        internalSummary,
        sources,
        mode: 'compact',
        requestedCount,
        strictCitations: true,
      });
      parsed = strictRetry.parsed;
      finishReason = strictRetry.finish_reason;
      citedBullets = Array.isArray(parsed?.citedBullets) ? parsed.citedBullets : [];
      citationsOk = hasValidCitations(citedBullets, allowedUrls);

      if (strictRetry.finish_reason === 'length' || isListInvalid(parsed, requestedCount) || !citationsOk) {
        parsed = buildFallbackFromSources({ sources, companyName, question, requestedCount });
      }
    }

    citedBullets = Array.isArray(parsed?.citedBullets) ? parsed.citedBullets : [];
    if (!hasNonEmptyBullets(citedBullets)) {
      parsed = buildFallbackFromSources({ sources, companyName, question, requestedCount });
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
      sources: normalizedSources.length > 0 ? normalizedSources : sources,
    });
  } catch (error: any) {
    console.error('AI Analysis ask error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to run AI Analysis ask' },
      { status: 500 },
    );
  }
}

