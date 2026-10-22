/** Left-sidebar sections tracked in the Site Admin Traffic report, in sidebar order. */
export const TRAFFIC_SECTIONS = [
  { key: 'daily-alerts', label: 'Daily Alerts' },
  { key: 'operational-reporting', label: 'Operational Reporting' },
  { key: 'financial-reporting', label: 'Financial Reporting' },
  { key: 'ask-corelytics', label: 'Ask Corelytics' },
  { key: 'corelytics-score', label: 'Corelytics Score' },
  { key: 'expert-analysis', label: 'Expert Analysis' },
  { key: 'valuation', label: 'Valuation' },
  { key: 'data-room', label: 'Data Room' },
  { key: 'custom-reports', label: 'Custom Reports' },
  { key: 'report-packages', label: 'Report Packages' },
  { key: 'team-assessment', label: 'Team Assessment' },
] as const;

export type TrafficSectionKey = (typeof TRAFFIC_SECTIONS)[number]['key'];

/** Time beyond this in one uninterrupted visit is treated as idle, not reading. */
export const MAX_SECTION_SEGMENT_MS = 30 * 60 * 1000;

const SECTION_KEYS = new Set<string>(TRAFFIC_SECTIONS.map((section) => section.key));

const FINANCIAL_REPORTING_VIEWS = new Set([
  'dashboard',
  'kpis',
  'mda',
  'trend-analysis',
  'goals',
  'projections',
  'cash-flow',
  'working-capital',
  'financial-statements',
]);

export function isTrafficSectionKey(value: unknown): value is TrafficSectionKey {
  return typeof value === 'string' && SECTION_KEYS.has(value);
}

export function trafficSectionLabel(key: string): string {
  return TRAFFIC_SECTIONS.find((section) => section.key === key)?.label ?? key;
}

/** Maps an app view to its sidebar section; views outside the sidebar (admin, profile) return null. */
export function viewToTrafficSection(view: string): TrafficSectionKey | null {
  if (view === 'daily-alerts') return 'daily-alerts';
  if (view === 'operations' || view === 'operations-cash-forecast') return 'operational-reporting';
  if (FINANCIAL_REPORTING_VIEWS.has(view)) return 'financial-reporting';
  if (view === 'ai-analysis') return 'ask-corelytics';
  if (view === 'fs-score' || view === 'fs-insights') return 'corelytics-score';
  if (view.startsWith('pa-')) return 'expert-analysis';
  if (view === 'valuation' || view === 'valuation-reports') return 'valuation';
  if (view === 'dataroom') return 'data-room';
  if (view === 'custom-reports') return 'custom-reports';
  if (view === 'custom-print') return 'report-packages';
  if (view.startsWith('ma-')) return 'team-assessment';
  return null;
}
