export type ExternalSearchIntent = 'market-context' | 'industry-trend' | 'valuation' | 'news';

export type ExternalQueryPlan = {
  query: string;
  topic: string;
  searchIntent: ExternalSearchIntent;
  requiredTerms: string[];
};

function normalizeQuestion(question: string): string {
  return String(question || '')
    .replace(/\bour\b/gi, '')
    .replace(/\bmy company\b/gi, '')
    .replace(/\bmy business\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectIntent(question: string): ExternalSearchIntent {
  const q = question.toLowerCase();
  if (q.includes('valuation') || q.includes('multiple')) return 'valuation';
  if (q.includes('news') || q.includes('headline')) return 'news';
  if (q.includes('trend') || q.includes('outlook')) return 'industry-trend';
  return 'market-context';
}

function isMarginBenchmarkQuestion(question: string): boolean {
  const q = question.toLowerCase();
  const hasMargin = q.includes('margin');
  const hasCompare = q.includes('compare') || q.includes('vs') || q.includes('versus') || q.includes('benchmark');
  return hasMargin && hasCompare;
}

function buildRequiredTerms(topic: string): string[] {
  const stop = new Set(['and', 'the', 'for', 'with', 'from', 'group', 'industry', 'sector']);
  return Array.from(
    new Set(
      topic
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((t) => t.trim())
        .filter((t) => t.length >= 4 && !stop.has(t)),
    ),
  ).slice(0, 4);
}

export function buildExternalQueryPlan(params: {
  question: string;
  industryGroupName?: string | null;
  industrySectorCategory?: string | null;
  companyName?: string | null;
}): ExternalQueryPlan {
  const question = normalizeQuestion(params.question);
  const industry = String(params.industryGroupName || '').trim();
  const sectorCategory = String(params.industrySectorCategory || '').trim();
  const company = String(params.companyName || '').trim();
  const intent = detectIntent(question);
  const marginBenchmark = isMarginBenchmarkQuestion(question);

  const topic = industry || sectorCategory || (company ? `${company} industry` : 'industry');
  const suffixByIntent: Record<ExternalSearchIntent, string> = {
    'market-context': 'market conditions margins costs demand',
    'industry-trend': 'industry trends outlook',
    valuation: 'valuation multiples EBITDA revenue',
    news: 'latest news',
  };

  const benchmarkSuffix = marginBenchmark
    ? 'gross margin benchmark median quartile by industry annual report'
    : '';

  const query = [topic, question, suffixByIntent[intent]]
    .concat(benchmarkSuffix ? [benchmarkSuffix] : [])
    .concat(['-calculator', '-reddit', '-quora'])
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    query,
    topic,
    searchIntent: intent,
    requiredTerms: buildRequiredTerms(topic),
  };
}
