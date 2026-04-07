export type ExternalSearchIntent = 'market-context' | 'industry-trend' | 'valuation' | 'news';

export type ExternalQueryPlan = {
  query: string;
  topic: string;
  searchIntent: ExternalSearchIntent;
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

export function buildExternalQueryPlan(params: {
  question: string;
  industryGroupName?: string | null;
  companyName?: string | null;
}): ExternalQueryPlan {
  const question = normalizeQuestion(params.question);
  const industry = String(params.industryGroupName || '').trim();
  const company = String(params.companyName || '').trim();
  const intent = detectIntent(question);

  const topic = industry || (company ? `${company} industry` : 'industry');
  const suffixByIntent: Record<ExternalSearchIntent, string> = {
    'market-context': 'market conditions margins costs demand',
    'industry-trend': 'industry trends outlook',
    valuation: 'valuation multiples EBITDA revenue',
    news: 'latest news',
  };

  const query = [topic, question, suffixByIntent[intent]]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    query,
    topic,
    searchIntent: intent,
  };
}
