export type AskRoute = 'internal' | 'hybrid' | 'external';

export type AskCorelyticsRequest = {
  companyId: string;
  question: string;
  addMarketContext?: boolean;
  sessionId?: string;
  companyName?: string;
};

export type AskCorelyticsResponse = {
  route: AskRoute;
  usedInternalData: boolean;
  usedExternalData: boolean;
  internalSection?: {
    heading: string;
    findings: string[];
  };
  externalSection?: {
    heading: string;
    findings: Array<{
      title: string;
      summary: string;
      sourceName: string;
      sourceUrl: string;
    }>;
  };
  conclusionSection: {
    heading: string;
    summary: string;
  };
  followUps?: string[];
  debug?: {
    classifierRoute: AskRoute;
    externalQuery?: string;
  };
};

export type LegacyAskResponse = {
  shortAnswer: string;
  longAnswer: string;
  citedBullets: Array<{
    text: string;
    citations: Array<{ url: string; title?: string; publishedDate?: string | null }>;
  }>;
  howThisImpactsUs: string;
  sources: Array<{ url: string; title?: string; publishedDate?: string | null; snippet?: string }>;
};
