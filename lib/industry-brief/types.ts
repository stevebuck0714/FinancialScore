export type IndustryBriefTrend = 'improving' | 'stable' | 'tight' | 'worsening';

export type IndustryBriefImpact = 'positive' | 'neutral' | 'negative';

export type IndustryBriefStatus = 'stable' | 'watch' | 'risk';

export type IndustryHealthIndicator = {
  key: string;
  label: string;
  score: number;
  trend: IndustryBriefTrend;
  note: string;
};

export type MarketSignal = {
  category: string;
  title: string;
  currentValue: string;
  trend: string;
  impact: IndustryBriefImpact;
  companyImplication: string;
  sources: string[];
};

export type GrowthOpportunity = {
  id: string;
  title: string;
  score: number;
  revenuePotential: 'low' | 'medium' | 'high';
  marginPotential: 'low' | 'medium' | 'high';
  urgency: 'today' | 'this_week' | '30_days' | '90_days';
  confidence: 'low' | 'medium' | 'high';
  whyNow: string;
  recommendedAction: string;
  owner: string;
  estimatedImpact: string;
  evidence: string[];
};

export type RiskMonitorItem = {
  risk: string;
  level: 'low' | 'medium' | 'high';
  note: string;
};

export type IndustryBriefSourceNote = {
  name: string;
  status: 'live';
  note: string;
};

export type IndustryBriefSourceRecord = {
  id: string;
  provider: 'FRED' | 'BLS' | 'Perplexity' | 'Corelytics Company Profile';
  category: string;
  title: string;
  value?: string;
  publishedAt?: string;
  url?: string;
  summary: string;
  citations?: string[];
  unit?: string;
  history?: Array<{
    date: string;
    value: number;
    label?: string;
  }>;
};

export type IndustryOutlookItem = {
  id: string;
  provider: IndustryBriefSourceRecord['provider'];
  category: string;
  title: string;
  value?: string;
  publishedAt?: string;
  summary: string;
  citations: string[];
  unit?: string;
  history?: IndustryBriefSourceRecord['history'];
};

export type DailyIndustryBrief = {
  generatedAt: string;
  briefDate: string;
  aiMetadata?: {
    aiGenerated: boolean;
    transport: string;
    finalModel: string;
    scanModel: string;
  };
  company: {
    id: string;
    name: string;
    revenueLabel: string;
    industry: string;
    segment: string;
    location: string;
  };
  executiveSummary: {
    status: IndustryBriefStatus;
    headline: string;
    bullets: string[];
    expectedImpact60Days: string[];
  };
  overallScore: number;
  healthIndicators: IndustryHealthIndicator[];
  marketSignals: MarketSignal[];
  growthOpportunities: GrowthOpportunity[];
  recommendedActions: {
    today: string[];
    next30Days: string[];
    next90Days: string[];
  };
  riskMonitor: RiskMonitorItem[];
  aiInsight: string;
  industryOutlook: IndustryOutlookItem[];
  sourceNotes: IndustryBriefSourceNote[];
};
