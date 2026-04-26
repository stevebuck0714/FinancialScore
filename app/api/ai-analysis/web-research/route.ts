import { NextRequest, NextResponse } from 'next/server';
import { getAiTransport, getOpenAiClient } from '@/lib/ai-gateway';
import { createModelText } from '@/lib/openai-helpers';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';

type ResearchDepth = 'standard' | 'deep';
type ResearchScope = 'local' | 'state' | 'regional' | 'national' | 'global';

const ALLOWED_SCOPES = new Set<ResearchScope>(['local', 'state', 'regional', 'national', 'global']);

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueStrings(value);
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeScopes(value: unknown): ResearchScope[] {
  if (!Array.isArray(value)) return ['local', 'state', 'regional', 'national'];
  const scopes = value
    .map((item) => String(item || '').trim().toLowerCase() as ResearchScope)
    .filter((item) => ALLOWED_SCOPES.has(item));
  return scopes.length > 0 ? scopes : ['local', 'state', 'regional', 'national'];
}

function normalizeResearchDepth(value: unknown): ResearchDepth {
  return String(value || '').trim().toLowerCase() === 'standard' ? 'standard' : 'deep';
}

function extractJsonObject(content: string): any {
  const cleaned = String(content || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Research response did not contain valid JSON.');
  }
}

async function callPerplexity(params: {
  apiKey: string;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<{ content: string; citations: string[] }> {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.PERPLEXITY_MODEL || 'sonar-pro',
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.prompt },
      ],
      temperature: 0.2,
      max_tokens: params.maxTokens || 2500,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || 'Perplexity research request failed.');
  }

  return {
    content: String(data?.choices?.[0]?.message?.content || '').trim(),
    citations: Array.isArray(data?.citations) ? data.citations.map((item: unknown) => String(item || '').trim()).filter(Boolean) : [],
  };
}

function normalizeFirecrawlUrl(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return '';
}

async function scrapeWithFirecrawl(params: { apiKey: string; url: string }): Promise<{ url: string; title: string; markdown: string } | null> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: params.url,
        formats: ['markdown'],
        onlyMainContent: true,
        maxAge: 1000 * 60 * 60 * 24 * 7,
      }),
    });
    const result = await response.json();
    if (!response.ok || result?.success === false) {
      console.warn('Web Research Firecrawl scrape failed:', params.url, result?.error || response.status);
      return null;
    }

    const data = result?.data || result;
    const markdown = String(data?.markdown || '').trim();
    if (!markdown) return null;

    return {
      url: params.url,
      title: String(data?.metadata?.title || data?.title || params.url).trim(),
      markdown: markdown.slice(0, 5000),
    };
  } catch (error) {
    console.warn('Web Research Firecrawl scrape error:', params.url, error);
    return null;
  }
}

function buildScopeInstructions(scopes: ResearchScope[], location: string): string {
  return scopes
    .map((scope) => {
      if (scope === 'local') return `- Local: prioritize the company city/metro area${location ? ` around ${location}` : ''}.`;
      if (scope === 'state') return '- State: include relevant sources and entities within the same state.';
      if (scope === 'regional') return '- Regional: include adjacent-state or multi-state market context.';
      if (scope === 'national') return '- National: include U.S. sources, benchmarks, peers, and category context.';
      return '- Global: include international market context when directly relevant to the question.';
    })
    .join('\n');
}

function normalizeSources(value: unknown): Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        url: String(row.url || '').trim(),
        title: String(row.title || '').trim() || undefined,
        publishedDate: row.publishedDate == null ? null : String(row.publishedDate || '').trim(),
        snippet: String(row.snippet || '').trim() || undefined,
      };
    })
    .filter((source) => source.url);
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const companyName = String(body?.companyName || '').trim();
    const question = String(body?.question || '').trim();
    const searchName = String(body?.searchName || '').trim() || companyName;
    const location = String(body?.location || '').trim();
    const aliases = normalizeStringList(body?.aliases);
    const identityAnchors = normalizeStringList(body?.identityAnchors);
    const excludedNames = normalizeStringList(body?.excludedNames);
    const scopes = normalizeScopes(body?.scopes);
    const researchDepth = normalizeResearchDepth(body?.researchDepth);
    const conversationContext = body?.conversationContext && typeof body.conversationContext === 'object'
      ? body.conversationContext as Record<string, unknown>
      : {};

    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 });

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('AIAnalysis', companyId, 'WEB_RESEARCH');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'PERPLEXITY_API_KEY is not configured.' }, { status: 500 });
    }

    const scopeInstructions = buildScopeInstructions(scopes, location);
    const recentTurns = Array.isArray(conversationContext.recentTurns)
      ? conversationContext.recentTurns.slice(-5)
      : [];
    const runningSummary = String(conversationContext.runningSummary || '').trim().slice(0, 3000);

    const identityBlock = `
Research subject / search name: ${searchName || 'Not specified'}
Company in Corelytics: ${companyName || 'Not specified'}
Location / geography: ${location || 'Not specified'}
Known aliases: ${aliases.join('; ') || 'None provided'}
Identity anchors: ${identityAnchors.join('; ') || 'None provided'}
Excluded names/entities: ${excludedNames.join('; ') || 'None provided'}

Identity rules:
- Confirm source identity before using a source.
- Prefer sources matching the search name, aliases, location, official website/domain, or identity anchors.
- Exclude sources that match excluded names/entities or appear to refer to a similarly named unrelated entity.
- If a fact is not source-supported, say it is not publicly available or uncertain.
`;

    const researchSystem =
      'You are a meticulous web research analyst for business and financial due diligence. Accuracy, source matching, and clear uncertainty labels are more important than completeness.';

    const researchPrompts = [
      {
        label: 'entity-and-query-research',
        prompt: `${identityBlock}
User research question:
${question}

Research this question directly. Confirm source identity before using each source. Return detailed notes with citations and call out rejected or uncertain sources.`,
      },
      {
        label: 'scope-research',
        prompt: `${identityBlock}
User research question:
${question}

Selected geography/scope:
${scopeInstructions}

Run a broader scope-aware search. Include local/state/regional/national/global context only where selected and relevant. Return detailed notes with citations.`,
      },
      {
        label: 'verification-and-contradictions',
        prompt: `${identityBlock}
User research question:
${question}

Look for corroborating sources, conflicting claims, missing facts, and low-confidence estimates. Return notes with citations and explain what should not be stated as fact.`,
      },
      ...(researchDepth === 'deep'
        ? [{
            label: 'deep-follow-up',
            prompt: `${identityBlock}
User research question:
${question}

Run a deep follow-up search using alternate terms, aliases, identity anchors, official/public record sources, and industry terminology. Prioritize source text that can support a careful answer.`,
          }]
        : []),
    ];

    const researchResults = await Promise.all(
      researchPrompts.map(async (item) => ({
        label: item.label,
        ...(await callPerplexity({
          apiKey,
          system: researchSystem,
          prompt: item.prompt,
          maxTokens: researchDepth === 'deep' ? 3500 : 2500,
        })),
      })),
    );

    const citations = uniqueStrings(researchResults.flatMap((item) => item.citations));
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY?.trim();
    const firecrawlUrls = uniqueStrings([...identityAnchors, ...citations])
      .map(normalizeFirecrawlUrl)
      .filter(Boolean)
      .slice(0, researchDepth === 'deep' ? 8 : 0);
    const firecrawlDocs =
      researchDepth === 'deep' && firecrawlApiKey
        ? (
            await Promise.all(
              firecrawlUrls.map((url) => scrapeWithFirecrawl({ apiKey: firecrawlApiKey, url })),
            )
          ).filter((doc): doc is { url: string; title: string; markdown: string } => Boolean(doc))
        : [];

    const researchNotes = researchResults
      .map((item) => `## ${item.label}\n${item.content}\nCitations: ${item.citations.join(', ') || 'None returned'}`)
      .join('\n\n');
    const firecrawlNotes = firecrawlDocs.length > 0
      ? firecrawlDocs.map((doc) => `## ${doc.title}\nURL: ${doc.url}\n${doc.markdown}`).join('\n\n')
      : 'No Firecrawl extracts available.';

    const synthesisPrompt = `
Prepare a source-backed answer for Ask Corelytics Web Research.

${identityBlock}

Research depth: ${researchDepth}
Selected scopes:
${scopeInstructions}

User question:
${question}

Prior conversation context:
Running summary:
${runningSummary || 'None'}

Recent turns:
${JSON.stringify(recentTurns, null, 2)}

Live web research notes:
${researchNotes}

Firecrawl page extracts:
${firecrawlNotes}

Return ONLY valid JSON:
{
  "shortAnswer": "concise direct answer",
  "longAnswer": "detailed answer with source-grounded reasoning, uncertainty labels, and follow-on context",
  "citedBullets": [
    {
      "text": "specific sourced finding",
      "citations": [{"url": "https://...", "title": "source title", "publishedDate": null}]
    }
  ],
  "howThisImpactsUs": "why this matters for the selected company, decision, risk, valuation, operations, or next research step",
  "sources": [{"url": "https://...", "title": "source title", "publishedDate": null, "snippet": "brief source relevance"}]
}

Requirements:
- Answer the user's question, not a generic company overview.
- Use prior turns only as context. Correct prior facts if new evidence contradicts them.
- Cite concrete claims. Every cited bullet must include at least one source URL when sources exist.
- Distinguish verified facts, estimates, and unknowns.
- Reject similarly named unrelated entities.
- If the search does not support a claim, say so clearly.
- Do not include markdown fences or commentary outside JSON.
`;

    let parsed: any;
    if (getAiTransport() !== 'unconfigured') {
      try {
        const synthesis = await createModelText({
          openai: getOpenAiClient(),
          model: process.env.OPENAI_MODEL_WEB_RESEARCH || process.env.OPENAI_MODEL || 'gpt-4o',
          messages: [
            {
              role: 'system',
              content:
                'You are a senior research analyst. Synthesize source-backed web research into precise JSON for a business analysis product.',
            },
            { role: 'user', content: synthesisPrompt },
          ],
          temperature: 0.2,
          maxTokens: researchDepth === 'deep' ? 6500 : 4500,
        });
        parsed = extractJsonObject(synthesis.text);
      } catch (error) {
        console.warn('Web Research OpenAI synthesis failed; falling back to Perplexity synthesis:', error);
      }
    }

    if (!parsed) {
      const fallback = await callPerplexity({
        apiKey,
        system: 'You are a senior research analyst. Return only valid JSON.',
        prompt: synthesisPrompt,
        maxTokens: researchDepth === 'deep' ? 6500 : 4500,
      });
      parsed = extractJsonObject(fallback.content);
      citations.push(...fallback.citations);
    }

    const sources = normalizeSources(parsed?.sources);
    const fallbackSources = uniqueStrings([...firecrawlDocs.map((doc) => doc.url), ...citations]).map((url) => ({ url }));

    return NextResponse.json({
      shortAnswer: String(parsed?.shortAnswer || '').trim(),
      longAnswer: String(parsed?.longAnswer || '').trim(),
      citedBullets: Array.isArray(parsed?.citedBullets) ? parsed.citedBullets : [],
      howThisImpactsUs: String(parsed?.howThisImpactsUs || '').trim(),
      sources: sources.length > 0 ? sources : fallbackSources,
      researchMeta: {
        researchDepth,
        scopes,
        firecrawlUsed: firecrawlDocs.length > 0,
        firecrawlDocumentCount: firecrawlDocs.length,
      },
    });
  } catch (error) {
    console.error('Error running Ask Corelytics web research:', error);
    return NextResponse.json({ error: 'Failed to run web research.' }, { status: 500 });
  }
}
