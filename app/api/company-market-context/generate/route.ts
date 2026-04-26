import { NextRequest, NextResponse } from 'next/server';
import { getAiTransport, getOpenAiClient } from '@/lib/ai-gateway';
import { createModelText } from '@/lib/openai-helpers';

type CompetitorSearchScope = 'local' | 'state' | 'regional' | 'national';
type ResearchDepth = 'standard' | 'deep';
type CompetitorTableRow = {
  name: string;
  scope: string;
  location: string;
  competitorType: string;
  revenueEstimate: string;
  employeeEstimate: string;
  yearsInBusiness: string;
  overlap: string;
  threatLevel: string;
  source: string;
};

const ALLOWED_SCOPES = new Set<CompetitorSearchScope>(['local', 'state', 'regional', 'national']);

function normalizeScopes(value: unknown): CompetitorSearchScope[] {
  if (!Array.isArray(value)) return ['local', 'state', 'regional', 'national'];
  const scopes = value
    .map((item) => String(item || '').trim().toLowerCase() as CompetitorSearchScope)
    .filter((item) => ALLOWED_SCOPES.has(item));
  return scopes.length > 0 ? scopes : ['local', 'state', 'regional', 'national'];
}

function normalizeResearchDepth(value: unknown): ResearchDepth {
  return String(value || '').trim().toLowerCase() === 'standard' ? 'standard' : 'deep';
}

function extractJsonObject(content: string): any {
  const cleaned = content
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
    throw new Error('Perplexity response did not contain valid JSON.');
  }
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || '').trim()).filter(Boolean)),
  );
}

function normalizeCompetitorTable(value: unknown): CompetitorTableRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        name: String(row.name || '').trim(),
        scope: String(row.scope || '').trim(),
        location: String(row.location || '').trim(),
        competitorType: String(row.competitorType || '').trim(),
        revenueEstimate: String(row.revenueEstimate || '').trim(),
        employeeEstimate: String(row.employeeEstimate || '').trim(),
        yearsInBusiness: String(row.yearsInBusiness || '').trim(),
        overlap: String(row.overlap || '').trim(),
        threatLevel: String(row.threatLevel || '').trim(),
        source: String(row.source || '').trim(),
      };
    })
    .filter((row) => row.name);
}

function normalizeFirecrawlUrl(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return '';
}

function pickFirecrawlUrls(citations: string[], website: string, identityAnchors: string[]): string[] {
  const urls = uniqueStrings([
    website,
    ...identityAnchors,
    ...citations,
  ])
    .map(normalizeFirecrawlUrl)
    .filter(Boolean);

  const preferred = urls.filter((url) =>
    /atlanticprecision\.net|about|company|product|service|solution|industr|capabilit|certification|quality|competitor|contact/i.test(url),
  );
  return uniqueStrings([...preferred, ...urls]).slice(0, 8);
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
      console.warn('Firecrawl scrape failed:', params.url, result?.error || response.status);
      return null;
    }

    const data = result?.data || result;
    const markdown = String(data?.markdown || '').trim();
    if (!markdown) return null;

    return {
      url: params.url,
      title: String(data?.metadata?.title || data?.title || params.url).trim(),
      markdown: markdown.slice(0, 6000),
    };
  } catch (error) {
    console.warn('Firecrawl scrape error:', params.url, error);
    return null;
  }
}

function getKnownCompanyFacts(params: {
  companyName: string;
  location: string;
  website: string;
  searchName: string;
  aliases: string[];
  excludedNames: string[];
  identityAnchors: string[];
}): string {
  const normalized = [
    params.companyName,
    params.location,
    params.website,
    params.searchName,
    ...params.aliases,
    ...params.identityAnchors,
  ].join(' ').toLowerCase().replace(/[^a-z0-9]/g, '');
  const userIdentityRules = [
    params.searchName ? `- Preferred search name: ${params.searchName}` : '',
    params.aliases.length > 0 ? `- Known aliases: ${params.aliases.join('; ')}` : '',
    params.identityAnchors.length > 0 ? `- Identity anchors: ${params.identityAnchors.join('; ')}` : '',
    params.excludedNames.length > 0 ? `- Excluded names/entities: ${params.excludedNames.join('; ')}` : '',
  ].filter(Boolean);

  const rules = userIdentityRules.length > 0
    ? ['User-provided entity identity rules for this research:', ...userIdentityRules, '- Accept sources only when they clearly match the preferred search name, known aliases, or identity anchors.', '- Exclude sources that match excluded names/entities.']
    : [];

  if (
    normalized.includes('atlanticprecisionresource') ||
    normalized.includes('atlanticprecisionresources') ||
    normalized.includes('atlanticprecisionlynchburg') ||
    normalized.includes('atlanticprecisionnet')
  ) {
    return [
      ...rules,
      rules.length > 0 ? '' : '',
      'Entity identity rules for this research:',
      '- The subject company is Atlantic Precision Resource / Atlantic Precision Resources in Lynchburg, Virginia.',
      '- Identity anchors: atlanticprecision.net, Lynchburg VA, and 3018 Carroll Avenue, Lynchburg, VA 24501.',
      '- Accept sources only when they clearly refer to this Lynchburg company or its official website.',
      '- Exclude similarly named but different entities, including Atlantic Precision Inc., Atlantic Precision Manufacturing, Atlantic Precision Machining, and other non-Lynchburg Atlantic Precision companies.',
      '',
      'Known user-verified facts for Atlantic Precision Resource(s):',
      '- Revenue is believed to be in the $10M-$15M range.',
      '- Employee count is believed to be fewer than 25 people.',
      '- Do not use third-party estimates claiming 51-200 employees or $50M-$100M revenue unless explicitly framed as unreliable and contradicted by user-verified facts.',
    ].join('\n');
  }
  return rules.join('\n');
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
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.prompt },
      ],
      temperature: 0.1,
      ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error?.message || 'Perplexity research request failed.');
  }

  return {
    content: String(result?.choices?.[0]?.message?.content || '').trim(),
    citations: Array.isArray(result?.citations)
      ? result.citations.map((source: unknown) => String(source || '').trim()).filter(Boolean)
      : [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'PERPLEXITY_API_KEY is not configured.' }, { status: 500 });
    }

    const body = await request.json();
    const companyName = String(body?.companyName || '').trim();
    const location = String(body?.location || '').trim();
    const website = String(body?.website || '').trim();
    const industry = String(body?.industry || '').trim();
    const aiResearchSearchName = String(body?.aiResearchSearchName || '').trim();
    const aiResearchAliases = Array.isArray(body?.aiResearchAliases)
      ? body.aiResearchAliases.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [];
    const aiResearchExcludedNames = Array.isArray(body?.aiResearchExcludedNames)
      ? body.aiResearchExcludedNames.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [];
    const aiResearchIdentityAnchors = Array.isArray(body?.aiResearchIdentityAnchors)
      ? body.aiResearchIdentityAnchors.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [];
    const researchDepth = normalizeResearchDepth(body?.researchDepth);
    const competitorSearchScopes = normalizeScopes(body?.competitorSearchScopes);

    if (!companyName) {
      return NextResponse.json({ error: 'Company name is required.' }, { status: 400 });
    }

    const scopeInstructions = competitorSearchScopes
      .map((scope) => {
        if (scope === 'local') return '- Local: city / metro-area competitors and alternatives.';
        if (scope === 'state') return '- State: competitors and alternatives across the same state.';
        if (scope === 'regional') return '- Regional: broader regional competitors around the company footprint.';
        return '- National: U.S. category leaders and direct product competitors.';
      })
      .join('\n');

    const companyProfile = `
Company display name: ${companyName}
AI research search name: ${aiResearchSearchName || companyName}
Location: ${location || 'Unknown'}
Website: ${website || 'Unknown'}
Industry / sector: ${industry || 'Unknown'}
${getKnownCompanyFacts({
  companyName,
  location,
  website,
  searchName: aiResearchSearchName,
  aliases: aiResearchAliases,
  excludedNames: aiResearchExcludedNames,
  identityAnchors: aiResearchIdentityAnchors,
})}
`;
    const researchSystem =
      'You are a meticulous business research analyst. Accuracy is more important than completeness. Use current public web sources, name sources in-line, distinguish verified facts from unavailable facts, and reject sources about similarly named but different companies. Do not write generic filler.';

    const researchPrompts = [
      {
        label: 'background-history',
        prompt: `${companyProfile}
Research the company background and history in detail. First confirm each source matches the subject company identity above. Find founding year, founders or family/ownership background, leadership, headquarters, locations, company evolution, milestones, and any public evidence about scale or operating footprint. Prioritize the official website, LinkedIn/company profiles, business directories, and credible public records. Return detailed notes with citations and identify any rejected similarly named companies.`,
      },
      {
        label: 'products-operations',
        prompt: `${companyProfile}
Research products, services, operating model, industries served, certifications, quality systems, sourcing/manufacturing footprint, and any customer/market positioning claims. First confirm each source matches the subject company identity above. Focus on facts that matter for valuation due diligence. Return detailed notes with citations and identify any rejected similarly named companies.`,
      },
      {
        label: 'competitive-landscape',
        prompt: `${companyProfile}
Research competitors and alternatives using these selected scopes:
${scopeInstructions}

Find direct product/category competitors, regional alternatives, national category leaders, and adjacent capability competitors. Build a robust competitor set, not just the first companies found locally. For each competitor, identify location, product/service overlap, why it competes with or substitutes for ${companyName}, relative scale/positioning if publicly available, and whether it is a direct competitor, regional alternative, national category competitor, or adjacent capability competitor. Avoid limiting the scan to only the company's city if national category competitors are relevant. Do not treat similarly named companies as competitors unless they are truly relevant suppliers in the same product/category market. Return detailed notes with citations.`,
      },
      ...(researchDepth === 'deep' ? [{
        label: 'competitor-deep-dive',
        prompt: `${companyProfile}
Run a second competitive scan focused on depth and omissions. Search for competitors by product/category terms, not only company name. Include suppliers that overlap by material, process, customer type, or OEM component function. For each selected competitor, capture:
- Company name and location
- Scope: local, state, regional, or national
- Competitor type: direct product competitor, regional alternative, national category leader, or adjacent capability competitor
- Product/category overlap
- Why a buyer might choose that competitor instead
- Any public quality/certification, manufacturing footprint, or industry focus signals
- Threat level to valuation: low, medium, or high
- Estimated revenue, employee count, and years in business when publicly available. Label estimates as estimates and leave "not publicly available" when unsupported.

Return detailed notes with citations. Exclude sources about similarly named but unrelated companies.`,
      }] : []),
      {
        label: 'valuation-implications',
        prompt: `${companyProfile}
Based on public information, research competitive strengths, vulnerabilities, differentiation, supply-chain/geographic risks, customer/industry exposure, and valuation implications. Identify where information is not publicly available. Return detailed notes with citations.`,
      },
    ];

    const researchResults = await Promise.all(
      researchPrompts.map(async (item) => ({
        label: item.label,
        ...(await callPerplexity({
          apiKey,
          system: researchSystem,
          prompt: item.prompt,
        })),
      })),
    );

    const allCitations = uniqueStrings(researchResults.flatMap((item) => item.citations));
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY?.trim();
    const firecrawlUrls = pickFirecrawlUrls(allCitations, website, aiResearchIdentityAnchors);
    const firecrawlDocs =
      researchDepth === 'deep' && firecrawlApiKey
        ? (
            await Promise.all(
              firecrawlUrls.map((url) =>
                scrapeWithFirecrawl({ apiKey: firecrawlApiKey, url }),
              ),
            )
          ).filter((doc): doc is { url: string; title: string; markdown: string } => Boolean(doc))
        : [];
    const researchNotes = researchResults
      .map((item) => `## ${item.label}\n${item.content}\nCitations: ${item.citations.join(', ') || 'None returned'}`)
      .join('\n\n');
    const firecrawlNotes = firecrawlDocs.length > 0
      ? firecrawlDocs
          .map((doc) => `## ${doc.title}\nURL: ${doc.url}\n${doc.markdown}`)
          .join('\n\n')
      : 'No Firecrawl page extracts were available. Use the live web search notes only.';

    const synthesisPrompt = `
You are preparing a detailed, valuation-ready Business Overview / Market Position section.

Company profile:
${companyProfile}

Research depth: ${researchDepth === 'deep' ? 'Deep - preserve more detail, include fuller competitor scan and table.' : 'Standard - concise but still source-grounded.'}

Selected competitor scopes:
${scopeInstructions}

Research notes from live web searches:
${researchNotes}

Firecrawl page extracts from selected cited/source pages:
${firecrawlNotes}

Return ONLY valid JSON:
{
  "companyBackgroundHistory": "detailed, polished content for the page with subheadings and enough narrative depth for valuation diligence",
  "marketPositionCompetitiveLandscape": "detailed, polished content for the page with subheadings, competitor grouping, and robust valuation implications",
  "competitorTable": [
    {
      "name": "competitor name",
      "scope": "Local | State | Regional | National",
      "location": "headquarters or relevant location",
      "competitorType": "Direct product competitor | Regional alternative | National category leader | Adjacent capability competitor",
      "revenueEstimate": "estimate/range with caveat, or not publicly available",
      "employeeEstimate": "estimate/range with caveat, or not publicly available",
      "yearsInBusiness": "years or founding year, or not publicly available",
      "overlap": "brief product/service overlap",
      "threatLevel": "Low | Medium | High",
      "source": "source URL or source title"
    }
  ],
  "sources": ["source URLs or source titles"]
}

Writing requirements:
- Be detailed and thorough. This should be substantially better than a quick web summary.
- Do not compress the output. Preserve useful detail from the research notes.
- When Firecrawl extracts are available, use them as higher-confidence source text than search summaries.
- Company Background & History should be roughly ${researchDepth === 'deep' ? '600-1,000' : '350-650'} words when public information supports it.
- Market Position & Competitive Landscape should be roughly ${researchDepth === 'deep' ? '900-1,500' : '500-900'} words when public information supports it.
- Use clear subheadings and concise paragraphs/bullets inside each string so the page is easy to edit.
- If public information is limited, explain the limitation and still provide valuation-relevant context based on verified products, industries, footprint, and competitors.
- Accuracy is mandatory. Never fill gaps with estimates or plausible-sounding claims.
- Use professional valuation diligence language.
- Include concrete facts: founding/history, ownership/leadership where public, locations, products/services, industries, certifications, operating model, and strategic positioning.
- Treat third-party revenue and employee-count estimates as low-confidence unless they are from the company, filings, reliable business records, or multiple corroborating sources.
- Do not state revenue/headcount estimates as fact when they conflict with known user-verified facts. If uncertain, say the exact figure is not publicly available.
- Reject facts from similarly named companies unless the source clearly matches the subject company identity anchors.
- If a source appears to refer to Atlantic Precision Inc. or another non-Lynchburg entity, exclude it from the final narrative.
- In the competitive section, group competitors by Local, State, Regional, and National when those scopes were selected.
- Make the competitive section robust enough for valuation diligence. Include a competitor scan with ${researchDepth === 'deep' ? '8-15' : '5-10'} named competitors when public evidence supports that many; if fewer are supportable, explain the limitation.
- For each meaningful competitor, include scope, location, product/category overlap, competitor type, relevance, and threat level.
- Explain competitor relevance, not just names. Distinguish direct product competitors from local/regional alternatives and adjacent capability providers.
- Include direct competitors, adjacent alternatives, national category competitors, and category leaders when public evidence supports them.
- Include buyer choice factors: price/cost, domestic vs offshore production, engineering depth, quality certifications, lead time, breadth of offering, and customer/industry focus where source-backed.
- Include market position takeaways: where the company is differentiated, where it is vulnerable, what competitors likely pressure, and what this means for valuation.
- Include competitive risks and valuation implications as a distinct closing subsection.
- Populate competitorTable with the most relevant regional and national competitors, plus local/state competitors when useful.
- In competitorTable, revenueEstimate and employeeEstimate must be labeled as estimates/ranges unless sourced from the company or reliable filings.
- Do not invent size metrics. Use "not publicly available" when unsupported.
- For yearsInBusiness, use a founding year or public history where available; otherwise use "not publicly available."
- Say "not publicly available" for important unknowns instead of inventing facts.
- Do not include markdown fences or commentary outside JSON.
`;

    let parsed: any;
    let synthesisSources: string[] = [];
    if (getAiTransport() !== 'unconfigured') {
      try {
        const openai = getOpenAiClient();
        const model = process.env.OPENAI_MODEL_BUSINESS_CONTEXT || process.env.OPENAI_MODEL || 'gpt-4o';
        const synthesis = await createModelText({
          openai,
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are a senior valuation analyst. Synthesize source-backed research into detailed, factual business overview and competitive landscape content. Return only JSON.',
            },
            { role: 'user', content: synthesisPrompt },
          ],
          temperature: 0.2,
        maxTokens: researchDepth === 'deep' ? 7000 : 4500,
        });
        parsed = extractJsonObject(synthesis.text);
        synthesisSources = Array.isArray(parsed?.sources)
          ? parsed.sources.map((source: unknown) => String(source || '').trim()).filter(Boolean)
          : [];
      } catch (synthesisError) {
        console.warn('OpenAI synthesis failed; falling back to Perplexity synthesis:', synthesisError);
      }
    }

    if (!parsed) {
      const fallback = await callPerplexity({
        apiKey,
        system:
          'You are a senior valuation analyst. Synthesize source-backed research into detailed, factual business overview and competitive landscape content. Return only JSON.',
        prompt: synthesisPrompt,
        maxTokens: researchDepth === 'deep' ? 7000 : 4500,
      });
      parsed = extractJsonObject(fallback.content);
      synthesisSources = Array.isArray(parsed?.sources)
        ? parsed.sources.map((source: unknown) => String(source || '').trim()).filter(Boolean)
        : [];
      fallback.citations.forEach((source) => allCitations.push(source));
    }

    const sources = uniqueStrings([...synthesisSources, ...firecrawlDocs.map((doc) => doc.url), ...allCitations]);

    return NextResponse.json({
      companyBackgroundHistory: String(parsed?.companyBackgroundHistory || '').trim(),
      marketPositionCompetitiveLandscape: String(parsed?.marketPositionCompetitiveLandscape || '').trim(),
      researchSources: sources,
      competitorTable: normalizeCompetitorTable(parsed?.competitorTable),
      researchDepth,
      firecrawlUsed: firecrawlDocs.length > 0,
      firecrawlConfigured: Boolean(firecrawlApiKey),
      firecrawlDocumentCount: firecrawlDocs.length,
      firecrawlAttemptedUrls: firecrawlUrls,
      rawCitations: allCitations,
    });
  } catch (error) {
    console.error('Error generating company market context:', error);
    return NextResponse.json({ error: 'Failed to generate company market context.' }, { status: 500 });
  }
}
