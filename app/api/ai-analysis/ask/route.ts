import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
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
    throw new Error('SERPAPI_API_KEY is not set. Configure a web search provider key.');
  }

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('num', '8');
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

function buildSourcesForPrompt(
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>,
) {
  // Keep prompt compact: no huge snippets, just enough to anchor citations.
  return sources.map((s, idx) => ({
    i: idx + 1,
    url: s.url,
    title: s.title || undefined,
    publishedDate: s.publishedDate || null,
  }));
}

async function generateAskJson(params: {
  openai: OpenAI;
  model: string;
  companyName: string;
  question: string;
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
  mode: 'full' | 'compact';
}): Promise<{ parsed: AskOutput; finish_reason: string | null | undefined; contentPreview: string; contentLength: number }> {
  const { openai, model, companyName, question, sources, mode } = params;

  const sourceList = buildSourcesForPrompt(sources);

  const system = [
    'You are an expert financial/operational analyst.',
    'Return VALID JSON only.',
    'All factual claims must be grounded in the provided sources.',
    'Do not invent URLs. Citations must reference only the provided source URLs.',
  ].join('\n');

  const requirements =
    mode === 'full'
      ? [
          'Output MUST include these top-level keys exactly:',
          '"shortAnswer", "longAnswer", "citedBullets", "howThisImpactsUs", "sources".',
          'shortAnswer: 2-4 sentences.',
          'longAnswer: a structured explanation, keep it under ~900 words.',
          'citedBullets: 7-10 bullets; EVERY bullet must include >=1 citation.',
          'howThisImpactsUs: REQUIRED and specific to the company context when possible.',
          'sources: must be the provided sources list (same URLs; you may reorder; do not add new URLs).',
        ]
      : [
          // Compact mode to avoid truncation on retry
          'Output MUST include these top-level keys exactly:',
          '"shortAnswer", "longAnswer", "citedBullets", "howThisImpactsUs", "sources".',
          'shortAnswer: 2-3 sentences.',
          'longAnswer: keep it short (<= 400 words).',
          'citedBullets: exactly 5 bullets; EVERY bullet must include >=1 citation.',
          'howThisImpactsUs: REQUIRED (<= 250 words).',
          'sources: must be the provided sources list (same URLs; do not add new URLs).',
        ];

  const companyContext = companyName ? `Company: ${companyName}` : 'Company: (not provided)';

  const user = [
    companyContext,
    `Question: ${question}`,
    '',
    'Allowed sources (cite ONLY these URLs):',
    JSON.stringify(sourceList),
    '',
    'Requirements:',
    ...requirements.map((r) => `- ${r}`),
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

    // 1) Web search
    const searchResults = await serpApiSearch(question);
    const sources = searchResults.map((r) => ({
      url: r.link as string,
      title: r.title || undefined,
      publishedDate: r.date || null,
      snippet: r.snippet || undefined,
    }));

    if (sources.length === 0) {
      return NextResponse.json(
        {
          error: 'No web sources found for this query. Try rephrasing the question.',
        },
        { status: 422 },
      );
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
        sources,
        mode: 'full',
      });
      parsed = first.parsed;
      finishReason = first.finish_reason;

      console.log('AI Analysis ask: model content preview', {
        model,
        finish_reason: first.finish_reason,
        length: first.contentLength,
        preview: first.contentPreview,
      });

      if (first.finish_reason === 'length') {
        throw new Error('Model output truncated');
      }
    } catch (e: any) {
      // Retry in compact mode (smaller required output)
      const second = await generateAskJson({
        openai,
        model,
        companyName,
        question,
        sources,
        mode: 'compact',
      });
      parsed = second.parsed;
      finishReason = second.finish_reason;

      console.log('AI Analysis ask: model content preview (compact retry)', {
        model,
        finish_reason: second.finish_reason,
        length: second.contentLength,
        preview: second.contentPreview,
      });

      if (second.finish_reason === 'length') {
        throw new Error('Model output truncated (even after compact retry)');
      }
    }

    // Basic shape validation + source URL allowlist
    const allowedUrls = new Set(sources.map((s) => s.url));
    const citedBullets = Array.isArray(parsed?.citedBullets) ? parsed.citedBullets : [];
    for (const b of citedBullets) {
      const citations = Array.isArray(b?.citations) ? b.citations : [];
      if (citations.length < 1) {
        throw new Error('Model returned a cited bullet with no citations.');
      }
      for (const c of citations) {
        const url = String(c?.url || '').trim();
        if (!allowedUrls.has(url)) {
          throw new Error('Model returned a citation URL not in provided sources.');
        }
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

