import type { AskRoute } from '@/lib/ask-corelytics/types';

const INTERNAL_SIGNALS = [
  'our ',
  'my company',
  'my business',
  'gross margin',
  'inventory',
  'ar ',
  'ap ',
  'customer',
  'product',
  'working capital',
  'cash flow',
  'revenue decline',
  'collections',
];

const EXTERNAL_SIGNALS = [
  'industry',
  'market',
  'valuation multiples',
  'interest rates',
  'competitors',
  'news',
  'macro',
  'externally',
  'industry outlook',
  'market trends',
];

export function classifyQuestion(question: string, addMarketContext: boolean): AskRoute {
  const q = String(question || '').toLowerCase();
  const hasInternal = INTERNAL_SIGNALS.some((s) => q.includes(s));
  const hasExternal = EXTERNAL_SIGNALS.some((s) => q.includes(s));

  if (hasInternal && addMarketContext) return 'hybrid';
  if (hasInternal && hasExternal) return 'hybrid';
  if (!hasInternal && hasExternal) return 'external';
  return 'internal';
}
