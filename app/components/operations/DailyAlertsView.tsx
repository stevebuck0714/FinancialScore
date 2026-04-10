'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  PULSE_POLICY_DEFINITIONS,
  PULSE_POLICY_OVERRIDE_KEY,
  getResolvedPulsePolicyValues,
  getSectorLabel,
  getSectorPulsePolicyValues,
  sanitizePulsePolicyOverrides,
  type PulsePolicyKey,
  type PulsePolicySection,
  type PulsePolicyUnit,
  type PulsePolicyValues,
} from '@/lib/company-pulse/policy';
import { toLocalInputDate } from '@/app/utils/date';

type AlertItem = {
  id: string;
  fingerprint?: string;
  source: 'daily-change' | 'unresolved' | 'open-critical';
  title: string;
  detail: string;
  owner: string;
  drillView: string;
  deltaText?: string;
  updatedAt?: string;
  itemLabel?: string;
  priorityScore?: number;
  bucket?: 'attention' | 'monitoring';
  priorityFocusTerm?: string;
  status?: 'new' | 'acknowledged' | 'snoozed' | 'resolved';
  dueAt?: string | null;
  snoozedUntil?: string | null;
  notes?: Array<{ text: string; createdAt: string; author?: string }>;
  isActive?: boolean;
  modifiedAt?: string;
  explainability?: {
    triggerName: string;
    formula: string;
    threshold: string;
    reasonNow: string;
    policySource: string;
    dataRefs: string[];
    sourceTimestamp?: string;
    readinessStatus?: ReadinessStatus;
    readinessReason?: string;
  };
};

type AlertEvent = {
  id: string;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorEmail?: string | null;
  note?: string | null;
  createdAt: string;
};

type AssignableUser = {
  id: string;
  name: string;
  email: string;
};

type ReadinessStatus = 'ready' | 'partial' | 'missing';

type ReadinessItem = {
  key: string;
  label: string;
  status: ReadinessStatus;
  reason: string;
  lastUpdated?: string;
};

interface DailyAlertsViewProps {
  companyId: string;
  companyName: string;
  onNavigate: (view: string) => void;
}

type TrendPoint = {
  date: string;
  value: number;
};

type PreviewMetric =
  | 'ar-over30-pct'
  | 'ar-dso'
  | 'ar-total'
  | 'ap-over30-pct'
  | 'ap-total'
  | 'cash-total'
  | 'cash-runway-weeks'
  | 'cash-account-balance';

type PreviewSpec = {
  key: string;
  metric: PreviewMetric;
  label: string;
  color: string;
  accountName?: string;
  unit: 'percent' | 'days' | 'currency' | 'weeks';
  direction: 'higher-worse' | 'lower-worse' | 'neutral';
};

const DAILY_ALERTS_FETCH_TIMEOUT_MS = 20000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DAILY_ALERTS_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

const RESOLVED_STATUSES = new Set(['resolved', 'realized', 'closed', 'done', 'complete', 'completed']);
const OPERATIONAL_FOCUS_KEY = '__focusWatchlist';
const AR_TOP_CUSTOMER_MATERIALITY_LIMIT = 5;
type PulseTab = 'alerts' | 'policy';

type PolicyExplainer = {
  what: string;
  evaluation: string;
  higherMeans: string;
  lowerMeans: string;
  example: string;
  dataNotes: string;
};

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function dayOverDayPct(current: number, previous: number): number {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

function extractLargestPercent(detail: string): number {
  const matches = detail.match(/-?\d+(\.\d+)?%/g) || [];
  if (matches.length === 0) return 0;
  const values = matches
    .map((m) => Number(m.replace('%', '')))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.abs(n));
  return values.length > 0 ? Math.max(...values) : 0;
}

function daysSince(isoDate?: string): number {
  if (!isoDate) return 999;
  const t = new Date(isoDate).getTime();
  if (!Number.isFinite(t)) return 999;
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

function extractPriorityFocusTerms(goals: any): string[] {
  const raw = goals?.[OPERATIONAL_FOCUS_KEY];
  if (!raw || typeof raw !== 'object') return [];
  const terms = Object.values(raw)
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((v) => v.length > 0);
  return Array.from(new Set(terms));
}

function findPriorityFocusMatch(alert: AlertItem, focusTerms: string[]): string | null {
  if (focusTerms.length === 0) return null;
  const haystack = `${alert.title} ${alert.detail} ${alert.itemLabel || ''}`.toLowerCase();
  for (const term of focusTerms) {
    if (term && haystack.includes(term)) return term;
  }
  return null;
}

function scoreAlert(alert: AlertItem): number {
  let score = 0;

  if (alert.source === 'open-critical') score += 85;
  else if (alert.source === 'daily-change') score += 75;
  else score += 55;

  const pct = extractLargestPercent(alert.detail);
  score += Math.min(10, Math.floor(pct / 2));

  const ageDays = daysSince(alert.updatedAt);
  if (ageDays <= 2) score += 5;
  else if (ageDays >= 14) score -= 10;

  if (/cash|runway/i.test(alert.title) || /cash|runway/i.test(alert.detail)) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

function formatPolicyNumber(value: number, unit: PulsePolicyUnit): string {
  if (unit === 'percent') return `${value.toFixed(1)}%`;
  if (unit === 'currency') return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (unit === 'points') return `${value.toFixed(1)} pts`;
  if (unit === 'days') return `${value.toFixed(0)} days`;
  if (unit === 'weeks') return `${value.toFixed(1)} weeks`;
  if (unit === 'hours') return `${value.toFixed(0)} hours`;
  return `${value.toFixed(0)}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'n/a';
  const t = new Date(value);
  if (!Number.isFinite(t.getTime())) return 'n/a';
  return t.toLocaleString();
}

function readinessColor(status: ReadinessStatus) {
  if (status === 'ready') return { bg: '#dcfce7', fg: '#166534', border: '#86efac' };
  if (status === 'partial') return { bg: '#fef3c7', fg: '#92400e', border: '#fde68a' };
  return { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' };
}

function buildPolicyExplainer(def: (typeof PULSE_POLICY_DEFINITIONS)[number]): PolicyExplainer {
  const defaultEvaluation = `Pulse evaluates this using the active threshold (${formatPolicyNumber(def.defaultValue, def.unit)} by default, sector/company overrides may change it).`;
  const defaultHigher = 'Higher values generally make this check less sensitive and may reduce alerts.';
  const defaultLower = 'Lower values generally make this check more sensitive and may increase alerts.';
  const defaultExample = `If set to ${formatPolicyNumber(def.defaultValue, def.unit)}, this policy controls when "${def.label}" is considered materially out of bounds.`;
  const defaultDataNotes = 'Depends on the relevant operational snapshots feeding this metric.';

  const map: Partial<Record<PulsePolicyKey, PolicyExplainer>> = {
    'ar_daily_change.min_over30_pct': {
      what: 'Sets the AR overdue percentage floor before a daily AR deterioration alert can fire.',
      evaluation: 'Triggered when AR >30d % is at or above this threshold and the AR day-over-day change threshold is also met.',
      higherMeans: 'Requires a worse overdue level before alerting.',
      lowerMeans: 'Alerts earlier on smaller AR overdue levels.',
      example: 'At 30%, AR daily deterioration can only trigger when AR >30d is at least 30%.',
      dataNotes: 'Uses AR aging daily snapshots.',
    },
    'ar_daily_change.min_delta_pts': {
      what: 'Sets minimum day-over-day deterioration in AR overdue percentage points.',
      evaluation: 'Triggered when latest AR >30d % minus prior AR >30d % is at or above this threshold.',
      higherMeans: 'Requires a larger one-day worsening before alerting.',
      lowerMeans: 'Allows alerts on smaller daily deteriorations.',
      example: 'At 2.0 pts, a move from 31.0% to 33.2% qualifies (+2.2 pts).',
      dataNotes: 'Uses consecutive AR daily snapshots.',
    },
    'ar_daily_change.min_top_customer_overdue_amount': {
      what: `Adds materiality gating for concentration risk in AR deterioration checks.`,
      evaluation: `At least one customer in the top ${AR_TOP_CUSTOMER_MATERIALITY_LIMIT} overdue customers (>30d) must be at or above this amount.`,
      higherMeans: 'Only larger customer exposures are treated as material.',
      lowerMeans: 'Smaller customer exposures can satisfy materiality.',
      example: `At $25,000, if any top ${AR_TOP_CUSTOMER_MATERIALITY_LIMIT} overdue customer exceeds $25,000 (>30d), materiality is met.`,
      dataNotes: 'Uses AR summary overdue-by-customer data (>30d buckets only).',
    },
    'ar_open_critical.min_over30_pct': {
      what: 'Defines the overdue percentage threshold for AR to remain in open critical status.',
      evaluation: 'AR stays open critical when AR >30d % is at or above this threshold.',
      higherMeans: 'Needs a more severe overdue percentage to remain critical.',
      lowerMeans: 'Keeps AR in critical status at lower overdue percentages.',
      example: 'At 35%, AR >30d at 37% keeps AR in open critical.',
      dataNotes: 'Uses AR daily summary over30Pct.',
    },
    'ar_open_critical.min_dso_days': {
      what: 'Defines the Days Sales Outstanding threshold for AR to remain open critical.',
      evaluation: 'AR stays open critical when Days Sales Outstanding is at or above this threshold.',
      higherMeans: 'Allows longer collection cycles before marking critical.',
      lowerMeans: 'Flags critical sooner on slower collections.',
      example: 'At 55 days, Days Sales Outstanding of 61 keeps AR open critical.',
      dataNotes: 'Uses AR daily summary Days Sales Outstanding.',
    },
    'cash_open_critical.allow_proxy_runway': {
      what: 'Controls whether estimated (proxy) runway is allowed when sourced runway inputs are missing.',
      evaluation: '0 disables proxy runway; 1 enables proxy runway fallback.',
      higherMeans: 'At 1, more permissive: allows inferred runway fallback.',
      lowerMeans: 'At 0, stricter: requires sourced runway data.',
      example: 'Set to 0 to suppress guessed runway and show data-gap behavior instead.',
      dataNotes: 'Runway quality depends on line-level sourced runway fields.',
    },
  };

  return (
    map[def.key] || {
      what: def.description,
      evaluation: defaultEvaluation,
      higherMeans: defaultHigher,
      lowerMeans: defaultLower,
      example: defaultExample,
      dataNotes: defaultDataNotes,
    }
  );
}

export default function DailyAlertsView({ companyId, companyName, onNavigate }: DailyAlertsViewProps) {
  const [activeTab, setActiveTab] = useState<PulseTab>('alerts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [industrySectorCategory, setIndustrySectorCategory] = useState<string | null>(null);
  const [goalsSnapshot, setGoalsSnapshot] = useState<Record<string, any>>({});
  const [policyOverrides, setPolicyOverrides] = useState<Partial<PulsePolicyValues>>({});
  const [policySaving, setPolicySaving] = useState(false);
  const [policyStatus, setPolicyStatus] = useState<string | null>(null);
  const [readinessItems, setReadinessItems] = useState<ReadinessItem[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [selectedOwnerByAlert, setSelectedOwnerByAlert] = useState<Record<string, string>>({});
  const [transitionLoadingId, setTransitionLoadingId] = useState<string | null>(null);
  const [eventModalAlert, setEventModalAlert] = useState<AlertItem | null>(null);
  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [explainabilityAlert, setExplainabilityAlert] = useState<AlertItem | null>(null);
  const [policyDetailKey, setPolicyDetailKey] = useState<PulsePolicyKey | null>(null);
  const [previewAlert, setPreviewAlert] = useState<AlertItem | null>(null);
  const [previewSpec, setPreviewSpec] = useState<PreviewSpec | null>(null);
  const [previewTrend, setPreviewTrend] = useState<TrendPoint[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const end = new Date();
        const start = new Date();
        // Use a wider lookback so monthly/weekly operational snapshots remain visible in Pulse.
        start.setDate(start.getDate() - 120);
        const startDate = toLocalInputDate(start);
        const endDate = toLocalInputDate(end);

        const fetchOps = async (
          type: 'ar-aging' | 'ap-aging' | 'cash' | 'customers' | 'products' | 'inventory' | 'daily-financials',
          frequency: 'daily' | 'weekly' | 'monthly'
        ) => {
          const params = new URLSearchParams({
            companyId,
            type,
            frequency,
            startDate,
            endDate,
          });
          const response = await fetchWithTimeout(`/api/operational-data?${params}`);
          if (!response.ok) throw new Error(`Failed to load ${type} data`);
          return response.json();
        };

        const fetchOpsWithCadenceFallback = async (
          type: 'ar-aging' | 'ap-aging' | 'cash' | 'customers' | 'products' | 'inventory' | 'daily-financials',
          emptyShape: any
        ) => {
          const cadenceOrder: Array<'daily' | 'weekly' | 'monthly'> = ['daily', 'weekly', 'monthly'];
          let bestPayload: any = emptyShape;
          let bestCount = 0;
          for (const cadence of cadenceOrder) {
            try {
              const payload = await fetchOps(type, cadence);
              const records = Array.isArray(payload?.records) ? payload.records : [];
              if (records.length > bestCount) {
                bestPayload = payload;
                bestCount = records.length;
              }
            } catch (error) {
              console.warn(`Daily alerts: ${type} ${cadence} fetch failed, trying next cadence.`, error);
            }
          }
          return bestPayload;
        };

        const fetchFindings = async () => {
          const params = new URLSearchParams({
            companyId,
            limit: '1000',
          });
          const response = await fetchWithTimeout(`/api/performance-analytics/findings?${params}`);
          if (!response.ok) throw new Error('Failed to load findings');
          return response.json();
        };

        const fetchExpertFindings = async () => {
          const params = new URLSearchParams({
            companyId,
            limit: '1000',
          });
          const response = await fetchWithTimeout(`/api/performance-analytics/findings?${params}`);
          if (!response.ok) return { findings: [] };
          return response.json();
        };

        const triggerPerformanceRun = async () => {
          const response = await fetchWithTimeout('/api/performance-analytics/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId, replace: true, frequency: 'daily' }),
          }, 30000);
          if (!response.ok) throw new Error('Failed to run performance analytics');
          return response.json();
        };

        const fetchPerformanceContext = async () => {
          const params = new URLSearchParams({
            companyId,
            frequency: 'monthly',
            months: '18',
            limit: '300',
          });
          const response = await fetchWithTimeout(`/api/performance-analytics/context?${params}`);
          if (!response.ok) return {};
          return response.json();
        };

        const fetchCovenantAlerts = async () => {
          const params = new URLSearchParams({ companyId });
          const response = await fetchWithTimeout(`/api/covenants/alerts?${params}`);
          if (!response.ok) return { alerts: [] };
          return response.json();
        };

        const fetchOperationalGoals = async () => {
          const params = new URLSearchParams({ companyId });
          const response = await fetchWithTimeout(`/api/operational-goals?${params}`);
          if (!response.ok) return { goals: {} };
          return response.json();
        };

        const fetchCompanyMeta = async () => {
          const params = new URLSearchParams({ companyId, limit: '1' });
          const response = await fetchWithTimeout(`/api/companies?${params}`);
          if (!response.ok) return { companies: [] };
          return response.json();
        };

        const withFallback = async <T,>(label: string, promise: Promise<T>, fallback: T): Promise<T> => {
          try {
            return await promise;
          } catch (error) {
            console.warn(`Daily alerts: ${label} fetch failed, using fallback.`, error);
            return fallback;
          }
        };

        await withFallback('performance run', triggerPerformanceRun(), null);

        const [
          arData,
          apData,
          cashData,
          customerData,
          productData,
          inventoryData,
          dailyFinancialData,
          findingsData,
          expertFindingsData,
          performanceContextData,
          covenantAlertsData,
          operationalGoalsData,
          companyMetaData,
        ] = await Promise.all([
          withFallback('AR', fetchOpsWithCadenceFallback('ar-aging', { records: [], summary: {} }), { records: [], summary: {} }),
          withFallback('AP', fetchOpsWithCadenceFallback('ap-aging', { records: [], summary: {} }), { records: [], summary: {} }),
          withFallback('cash', fetchOpsWithCadenceFallback('cash', { records: [], summary: {} }), { records: [], summary: {} }),
          withFallback('customers', fetchOpsWithCadenceFallback('customers', { records: [], summary: {} }), { records: [], summary: {} }),
          withFallback('products', fetchOpsWithCadenceFallback('products', { records: [], summary: {} }), { records: [], summary: {} }),
          withFallback('inventory', fetchOpsWithCadenceFallback('inventory', { records: [], trend: [], summary: {} }), { records: [], trend: [], summary: {} }),
          withFallback('daily-financials', fetchOpsWithCadenceFallback('daily-financials', { records: [], summary: {} }), { records: [], summary: {} }),
          withFallback('critical findings', fetchFindings(), { findings: [] }),
          withFallback('expert findings', fetchExpertFindings(), { findings: [] }),
          withFallback('performance context', fetchPerformanceContext(), { data: { monthlyFinancials: [] } }),
          withFallback('covenant alerts', fetchCovenantAlerts(), { alerts: [] }),
          withFallback('operational goals', fetchOperationalGoals(), { goals: {} }),
          withFallback('company meta', fetchCompanyMeta(), { companies: [] }),
        ]);
        const goals = (operationalGoalsData?.goals && typeof operationalGoalsData.goals === 'object')
          ? operationalGoalsData.goals
          : {};
        const companySectorCategory = String(companyMetaData?.companies?.[0]?.industrySectorCategory || '').trim() || null;
        const pulseOverrides = sanitizePulsePolicyOverrides(goals[PULSE_POLICY_OVERRIDE_KEY]);
        const pulsePolicy = getResolvedPulsePolicyValues(pulseOverrides, companySectorCategory);
        const priorityFocusTerms = extractPriorityFocusTerms(goals);

        const built: AlertItem[] = [];

        const arRecords = Array.isArray(arData?.records) ? arData.records : [];
        if (arRecords.length >= 2) {
          const latest = arRecords[0];
          const prev = arRecords[1];
          const latestOver30 = ((asNumber(latest.days1to30) + asNumber(latest.days31to60) + asNumber(latest.days61to90) + asNumber(latest.days90plus)) / Math.max(asNumber(latest.totalAR), 1)) * 100;
          const prevOver30 = ((asNumber(prev.days1to30) + asNumber(prev.days31to60) + asNumber(prev.days61to90) + asNumber(prev.days90plus)) / Math.max(asNumber(prev.totalAR), 1)) * 100;
          const deltaPts = latestOver30 - prevOver30;
          const materialOverdueThreshold = asNumber(
            pulsePolicy['ar_daily_change.min_top_customer_overdue_amount']
          );
          const rankedCustomers = (Array.isArray(arData?.summary?.unpaidByCustomer) ? arData.summary.unpaidByCustomer : [])
            .map((row: any) => ({
              customerName: row.customerName,
              overdue: asNumber(row.days31to60) + asNumber(row.days61to90) + asNumber(row.days90plus),
            }))
            .sort((a: any, b: any) => b.overdue - a.overdue);
          const scannedTopCustomers = rankedCustomers.slice(0, AR_TOP_CUSTOMER_MATERIALITY_LIMIT);
          const materialTopCustomers = scannedTopCustomers.filter(
            (customer: any) => customer.overdue >= materialOverdueThreshold
          );
          const topCustomer = rankedCustomers[0];
          if (
            latestOver30 >= pulsePolicy['ar_daily_change.min_over30_pct'] &&
            deltaPts >= pulsePolicy['ar_daily_change.min_delta_pts'] &&
            materialTopCustomers.length > 0
          ) {
            const topMaterialCustomer = materialTopCustomers[0];
            const materialCustomerNames = materialTopCustomers
              .slice(0, 3)
              .map((customer: any) => customer.customerName)
              .filter(Boolean);
            built.push({
              id: `daily-ar-${latest.snapshotDate}`,
              fingerprint: `daily-ar-${latest.snapshotDate}`,
              source: 'daily-change',
              title: 'AR Deteriorated Today',
              detail: `AR >30d is ${latestOver30.toFixed(1)}% (${deltaPts >= 0 ? '+' : ''}${deltaPts.toFixed(1)} pts vs prior day)`,
              owner: 'Collections Lead',
              drillView: 'pa-critical-issues',
              deltaText: `DoD ${deltaPts >= 0 ? '+' : ''}${deltaPts.toFixed(1)} pts`,
              updatedAt: latest.snapshotDate,
              itemLabel: topMaterialCustomer?.customerName || topCustomer?.customerName || undefined,
              explainability: {
                triggerName: 'AR Deteriorated Today',
                formula: 'AR >30d % = (days1to30 + days31to60 + days61to90 + days90plus) / totalAR * 100; delta = latest - previous; materiality requires any customer in top-N overdue list to exceed minimum overdue threshold',
                threshold: `latestOver30 >= ${pulsePolicy['ar_daily_change.min_over30_pct']} AND deltaPts >= ${pulsePolicy['ar_daily_change.min_delta_pts']} AND any(top${AR_TOP_CUSTOMER_MATERIALITY_LIMIT}.overdue >= ${materialOverdueThreshold})`,
                reasonNow: `Latest ${latestOver30.toFixed(1)}%; delta ${deltaPts.toFixed(1)} pts; material customer(s): ${materialCustomerNames.join(', ') || 'n/a'}`,
                policySource: `Company Pulse policy (company override + sector default fallback)`,
                dataRefs: ['AR aging daily snapshots', 'AR summary unpaid by customer'],
                sourceTimestamp: latest.snapshotDate,
              },
            });
          }
        }

        const apRecords = Array.isArray(apData?.records) ? apData.records : [];
        if (apRecords.length >= 2) {
          const latest = apRecords[0];
          const prev = apRecords[1];
          const latestOver30 = ((asNumber(latest.days1to30) + asNumber(latest.days31to60) + asNumber(latest.days61to90) + asNumber(latest.days90plus)) / Math.max(asNumber(latest.totalAP), 1)) * 100;
          const prevOver30 = ((asNumber(prev.days1to30) + asNumber(prev.days31to60) + asNumber(prev.days61to90) + asNumber(prev.days90plus)) / Math.max(asNumber(prev.totalAP), 1)) * 100;
          const deltaPts = latestOver30 - prevOver30;
          const topVendor = (Array.isArray(apData?.summary?.unpaidByVendor) ? apData.summary.unpaidByVendor : [])
            .map((row: any) => ({
              vendorName: row.vendorName,
              overdue: asNumber(row.days31to60) + asNumber(row.days61to90) + asNumber(row.days90plus),
            }))
            .sort((a: any, b: any) => b.overdue - a.overdue)[0];
          if (
            latestOver30 >= pulsePolicy['ap_daily_change.min_over30_pct'] &&
            deltaPts >= pulsePolicy['ap_daily_change.min_delta_pts']
          ) {
            built.push({
              id: `daily-ap-${latest.snapshotDate}`,
              fingerprint: `daily-ap-${latest.snapshotDate}`,
              source: 'daily-change',
              title: 'AP Pressure Increased Today',
              detail: `AP >30d is ${latestOver30.toFixed(1)}% (${deltaPts >= 0 ? '+' : ''}${deltaPts.toFixed(1)} pts vs prior day)`,
              owner: 'AP Manager',
              drillView: 'pa-critical-issues',
              deltaText: `DoD ${deltaPts >= 0 ? '+' : ''}${deltaPts.toFixed(1)} pts`,
              updatedAt: latest.snapshotDate,
              itemLabel: topVendor?.vendorName || undefined,
              explainability: {
                triggerName: 'AP Pressure Increased Today',
                formula: 'AP >30d % = (days1to30 + days31to60 + days61to90 + days90plus) / totalAP * 100; delta = latest - previous',
                threshold: `latestOver30 >= ${pulsePolicy['ap_daily_change.min_over30_pct']} AND deltaPts >= ${pulsePolicy['ap_daily_change.min_delta_pts']}`,
                reasonNow: `Latest ${latestOver30.toFixed(1)}%; delta ${deltaPts.toFixed(1)} pts`,
                policySource: `Company Pulse policy (company override + sector default fallback)`,
                dataRefs: ['AP aging daily snapshots', 'AP summary unpaid by vendor'],
                sourceTimestamp: latest.snapshotDate,
              },
            });
          }
        }

        const cashRecords = Array.isArray(cashData?.records) ? cashData.records : [];
        if (cashRecords.length >= 2) {
          const byDate = cashRecords.reduce((acc: Record<string, number>, row: any) => {
            const key = String(row.snapshotDate || '');
            acc[key] = (acc[key] || 0) + asNumber(row.cashBalance);
            return acc;
          }, {});
          const orderedDates = Object.keys(byDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
          if (orderedDates.length >= 2) {
            const latest = byDate[orderedDates[0]];
            const previous = byDate[orderedDates[1]];
            const pct = dayOverDayPct(latest, previous);
            if (pct <= pulsePolicy['cash_daily_change.max_total_dod_pct']) {
              built.push({
                id: `daily-cash-${orderedDates[0]}`,
                fingerprint: `daily-cash-${orderedDates[0]}`,
                source: 'daily-change',
                title: 'Cash Dropped Today',
                detail: `Total cash moved ${pct.toFixed(1)}% day-over-day`,
                owner: 'Controller',
                drillView: 'pa-critical-issues',
                deltaText: `DoD ${pct.toFixed(1)}%`,
                updatedAt: orderedDates[0],
                explainability: {
                  triggerName: 'Cash Dropped Today',
                  formula: 'DoD % = (latestTotalCash - previousTotalCash) / previousTotalCash * 100',
                  threshold: `cash DoD % <= ${pulsePolicy['cash_daily_change.max_total_dod_pct']}`,
                  reasonNow: `DoD ${pct.toFixed(1)}%`,
                  policySource: `Company Pulse policy (company override + sector default fallback)`,
                  dataRefs: ['Cash daily snapshots by account', 'Cash totals aggregated by date'],
                  sourceTimestamp: orderedDates[0],
                },
              });
            }

            // Account-level deterioration (daily) for visibility into specific accounts/items.
            const latestRows = cashRecords.filter((r: any) => String(r.snapshotDate) === orderedDates[0]);
            const prevRows = cashRecords.filter((r: any) => String(r.snapshotDate) === orderedDates[1]);
            const prevByAccount = new Map<string, number>(
              prevRows.map((row: any) => [String(row.accountName || ''), asNumber(row.cashBalance)])
            );
            latestRows.forEach((row: any) => {
              const accountName = String(row.accountName || '').trim();
              if (!accountName) return;
              const latestBal = asNumber(row.cashBalance);
              const prevBal = prevByAccount.get(accountName) || 0;
              const accountPct = dayOverDayPct(latestBal, prevBal);
              if (accountPct <= pulsePolicy['cash_account_daily_change.max_dod_pct']) {
                built.push({
                  id: `daily-cash-account-${orderedDates[0]}-${accountName}`,
                  fingerprint: `daily-cash-account-${orderedDates[0]}-${accountName}`,
                  source: 'daily-change',
                  title: 'Cash Account Worsened Today',
                  detail: `${accountName} moved ${accountPct.toFixed(1)}% day-over-day`,
                  owner: 'Controller',
                  drillView: 'pa-critical-issues',
                  deltaText: `DoD ${accountPct.toFixed(1)}%`,
                  updatedAt: orderedDates[0],
                  itemLabel: accountName,
                  explainability: {
                    triggerName: 'Cash Account Worsened Today',
                    formula: 'Account DoD % = (latestBalance - previousBalance) / previousBalance * 100',
                    threshold: `account DoD % <= ${pulsePolicy['cash_account_daily_change.max_dod_pct']}`,
                    reasonNow: `${accountName} DoD ${accountPct.toFixed(1)}%`,
                    policySource: `Company Pulse policy (company override + sector default fallback)`,
                    dataRefs: ['Cash account daily snapshots'],
                    sourceTimestamp: orderedDates[0],
                  },
                });
              }
            });
          }
        }

        // Outstanding operational critical conditions from current daily snapshots
        // (kept visible even if not newly worsened today).
        const arSummary = arData?.summary || {};
        const apSummary = apData?.summary || {};
        const cashSummary = cashData?.summary || {};
        const arOver30 = asNumber(arSummary.over30Pct);
        const apOver30 = asNumber(apSummary.over30Pct);
        const dso = asNumber(arSummary.dso);
        const cashChangePct = asNumber(cashSummary.changePercent);
        const explicitRunwayRaw = (cashSummary as any)?.runwayWeeks;
        const explicitRunwayWeeks = Number(explicitRunwayRaw);
        const hasCashBasis =
          cashRecords.length > 0 &&
          Number.isFinite(asNumber(cashSummary.totalCash));
        const inferredRunwayWeeksFromCashSummary =
          !hasCashBasis
            ? null
            : Number.isFinite(explicitRunwayWeeks)
            ? explicitRunwayWeeks
            : Number.isFinite(asNumber(cashSummary.totalCash))
              ? Math.abs(asNumber(cashSummary.changeAmount)) > 0
                ? (asNumber(cashSummary.totalCash) / Math.abs(asNumber(cashSummary.changeAmount))) * 4.33
                : asNumber(cashSummary.totalCash) > 0
                  ? 999
                  : null
              : null;
        const hasExplicitRunway =
          inferredRunwayWeeksFromCashSummary !== null &&
          Number.isFinite(inferredRunwayWeeksFromCashSummary);
        const allowProxyRunway = asNumber(pulsePolicy['cash_open_critical.allow_proxy_runway']) >= 1;
        const totalCash = asNumber(cashSummary.totalCash);
        const burnProxy = Math.max(1, Math.abs(asNumber(cashSummary.changeAmount)));
        const proxyRunwayWeeks = (totalCash / burnProxy) * 4.33;
        const runwayWeeks = hasExplicitRunway
          ? inferredRunwayWeeksFromCashSummary
          : allowProxyRunway
            ? proxyRunwayWeeks
            : null;
        const hasRunwaySignal = runwayWeeks !== null && Number.isFinite(runwayWeeks);
        const arCriticalMinDays = Math.max(1, Math.floor(asNumber(pulsePolicy['ar_open_critical.min_consecutive_days']) || 1));
        const apCriticalMinDays = Math.max(1, Math.floor(asNumber(pulsePolicy['ap_open_critical.min_consecutive_days']) || 1));
        const computeTrailingCriticalDays = (rows: any[], isCritical: (row: any) => boolean): number => {
          if (!Array.isArray(rows) || rows.length === 0) return 0;
          const sorted = [...rows].sort(
            (a, b) => new Date(b?.snapshotDate || 0).getTime() - new Date(a?.snapshotDate || 0).getTime()
          );
          let streak = 0;
          for (const row of sorted) {
            if (!isCritical(row)) break;
            streak += 1;
          }
          return streak;
        };
        const arRowOver30Pct = (row: any): number => {
          const total = asNumber(row?.totalAR);
          if (total <= 0) return 0;
          const over30Amt = asNumber(row?.days31to60) + asNumber(row?.days61to90) + asNumber(row?.days90plus);
          return (over30Amt / total) * 100;
        };
        const arRowDso = (row: any): number => {
          const direct = asNumber((row as any)?.dso);
          if (Number.isFinite(direct) && direct > 0) return direct;
          const days90plus = asNumber(row?.days90plus);
          if (days90plus > 0) return 90;
          const days61to90 = asNumber(row?.days61to90);
          if (days61to90 > 0) return 75;
          const days31to60 = asNumber(row?.days31to60);
          if (days31to60 > 0) return 45;
          return 20;
        };
        const apRowOver30Pct = (row: any): number => {
          const total = asNumber(row?.totalAP);
          if (total <= 0) return 0;
          const over30Amt = asNumber(row?.days31to60) + asNumber(row?.days61to90) + asNumber(row?.days90plus);
          return (over30Amt / total) * 100;
        };
        const arCriticalStreakDays = computeTrailingCriticalDays(
          arRecords,
          (row) =>
            arRowOver30Pct(row) >= pulsePolicy['ar_open_critical.min_over30_pct'] ||
            arRowDso(row) >= pulsePolicy['ar_open_critical.min_dso_days']
        );
        const apCriticalStreakDays = computeTrailingCriticalDays(
          apRecords,
          (row) => apRowOver30Pct(row) >= pulsePolicy['ap_open_critical.min_over30_pct']
        );
        const latestDateFrom = (rows: any[]): string | undefined => {
          if (!Array.isArray(rows) || rows.length === 0) return undefined;
          const dates = rows
            .map((r: any) => String(r?.snapshotDate || '').trim())
            .filter((v: string) => v.length > 0)
            .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime());
          return dates[0];
        };
        const readinessSnapshot: ReadinessItem[] = [
          {
            key: 'ar',
            label: 'AR snapshots',
            status: arRecords.length >= 2 ? 'ready' : arRecords.length > 0 ? 'partial' : 'missing',
            reason:
              arRecords.length >= 2
                ? 'Enough daily AR snapshots for deterioration and open-critical checks.'
                : 'Need at least 2 daily AR snapshots for full signal coverage.',
            lastUpdated: latestDateFrom(arRecords),
          },
          {
            key: 'ap',
            label: 'AP snapshots',
            status: apRecords.length >= 2 ? 'ready' : apRecords.length > 0 ? 'partial' : 'missing',
            reason:
              apRecords.length >= 2
                ? 'Enough daily AP snapshots for deterioration and open-critical checks.'
                : 'Need at least 2 daily AP snapshots for full signal coverage.',
            lastUpdated: latestDateFrom(apRecords),
          },
          {
            key: 'cash',
            label: 'Cash snapshots',
            status: cashRecords.length >= 2 ? 'ready' : cashRecords.length > 0 ? 'partial' : 'missing',
            reason:
              cashRecords.length >= 2
                ? 'Enough daily cash snapshots for day-over-day and account-level checks.'
                : 'Need at least 2 daily cash snapshots for full cash signal coverage.',
            lastUpdated: latestDateFrom(cashRecords),
          },
          {
            key: 'runway',
            label: 'Runway line data',
            status: hasExplicitRunway ? 'ready' : allowProxyRunway ? 'partial' : 'missing',
            reason: hasExplicitRunway
              ? 'Sourced runwayWeeks is available.'
              : allowProxyRunway
                ? 'Sourced runwayWeeks missing; policy currently allows proxy runway fallback.'
                : 'Sourced runwayWeeks missing and proxy fallback disabled by policy.',
            lastUpdated: endDate,
          },
          {
            key: 'customers',
            label: 'Customer operational data',
            status:
              Array.isArray(customerData?.records) && customerData.records.length >= 2
                ? 'ready'
                : Array.isArray(customerData?.records) && customerData.records.length > 0
                  ? 'partial'
                  : 'missing',
            reason:
              Array.isArray(customerData?.records) && customerData.records.length >= 2
                ? 'Customer sales data is available for multi-day trend checks.'
                : 'Customer sales records are sparse for trend-level coverage.',
            lastUpdated: latestDateFrom(Array.isArray(customerData?.records) ? customerData.records : []),
          },
          {
            key: 'products',
            label: 'Product operational data',
            status: Array.isArray(productData?.records) && productData.records.length > 0 ? 'ready' : 'missing',
            reason:
              Array.isArray(productData?.records) && productData.records.length > 0
                ? 'Product-level operational records are available.'
                : 'No product operational rows available in the selected window.',
            lastUpdated: latestDateFrom(Array.isArray(productData?.records) ? productData.records : []),
          },
          {
            key: 'inventory',
            label: 'Inventory operational data',
            status: Array.isArray(inventoryData?.records) && inventoryData.records.length > 0 ? 'ready' : 'missing',
            reason:
              Array.isArray(inventoryData?.records) && inventoryData.records.length > 0
                ? 'Inventory snapshots are available for operational monitoring.'
                : 'No inventory snapshots available in the selected window.',
            lastUpdated: latestDateFrom(Array.isArray(inventoryData?.trend) ? inventoryData.trend : []),
          },
          {
            key: 'financial',
            label: 'Financial trend data',
            status:
              Array.isArray(dailyFinancialData?.records) && dailyFinancialData.records.length >= 2
                ? 'ready'
                : Array.isArray(dailyFinancialData?.records) && dailyFinancialData.records.length > 0
                  ? 'partial'
                  : 'missing',
            reason:
              Array.isArray(dailyFinancialData?.records) && dailyFinancialData.records.length >= 2
                ? 'Daily financial snapshots are available for trend and margin signals.'
                : 'Need at least 2 daily financial snapshots for full financial trend checks.',
            lastUpdated: latestDateFrom(Array.isArray(dailyFinancialData?.records) ? dailyFinancialData.records : []),
          },
          {
            key: 'expert-analysis',
            label: 'Expert analysis feed',
            status:
              Array.isArray(expertFindingsData?.findings) && expertFindingsData.findings.length > 0
                ? 'ready'
                : 'missing',
            reason:
              Array.isArray(expertFindingsData?.findings) && expertFindingsData.findings.length > 0
                ? 'Expert findings are available for cross-signal scoring.'
                : 'No expert findings currently available for this company.',
            lastUpdated: latestDateFrom(
              (Array.isArray(expertFindingsData?.findings) ? expertFindingsData.findings : []).map((f: any) => ({
                snapshotDate: f?.updatedAt,
              }))
            ),
          },
          {
            key: 'policy',
            label: 'Policy settings',
            status: 'ready',
            reason: `Pulse policy resolved with ${Object.keys(pulseOverrides || {}).length} company override(s); sector baseline applied.`,
            lastUpdated: endDate,
          },
          {
            key: 'covenants',
            label: 'Loan covenant warnings',
            status:
              Array.isArray(covenantAlertsData?.alerts) && covenantAlertsData.alerts.length > 0
                ? 'ready'
                : 'missing',
            reason:
              Array.isArray(covenantAlertsData?.alerts) && covenantAlertsData.alerts.length > 0
                ? 'Covenant monitoring feed has active warning/breach signals.'
                : 'No covenant alerts returned (no active warning/breach or no configured covenants).',
            lastUpdated:
              Array.isArray(covenantAlertsData?.alerts) && covenantAlertsData.alerts.length > 0
                ? String(covenantAlertsData.alerts[0]?.timestamp || endDate)
                : endDate,
          },
        ];

        const dailyFinancialRecords = Array.isArray(dailyFinancialData?.records) ? dailyFinancialData.records : [];
        if (dailyFinancialRecords.length >= 2) {
          const latest = dailyFinancialRecords[0];
          const prev = dailyFinancialRecords[1];
          const latestRevenue = asNumber(latest?.revenue);
          const prevRevenue = asNumber(prev?.revenue);
          const latestExpense = asNumber(latest?.expense);
          const prevExpense = asNumber(prev?.expense);
          const latestNet = latestRevenue - latestExpense;
          const prevNet = prevRevenue - prevExpense;
          const netDelta = latestNet - prevNet;
          const revenuePct = dayOverDayPct(latestRevenue, prevRevenue);
          const expensePct = dayOverDayPct(latestExpense, prevExpense);

          if (latestNet < 0 && netDelta < 0) {
            built.push({
              id: `financial-net-pressure-${latest.snapshotDate}`,
              fingerprint: 'financial-net-pressure',
              source: 'open-critical',
              title: 'Financial Pressure: Net Trend Worsened',
              detail: `Daily net ${latestNet.toFixed(0)} (${netDelta.toFixed(0)} vs prior day)`,
              owner: 'Controller',
              drillView: 'pa-critical-issues',
              updatedAt: latest.snapshotDate,
              explainability: {
                triggerName: 'Financial Pressure: Net Trend Worsened',
                formula: 'latestNet = revenue - expense; trigger when latestNet is negative and netDelta is negative',
                threshold: 'latestNet < 0 AND netDelta < 0',
                reasonNow: `latestNet ${latestNet.toFixed(0)}, netDelta ${netDelta.toFixed(0)}`,
                policySource: 'Cross-signal financial health rule',
                dataRefs: ['/api/operational-data?type=daily-financials'],
                sourceTimestamp: latest.snapshotDate,
              },
            });
          }
          if (revenuePct <= -10 && expensePct >= 0) {
            built.push({
              id: `financial-revenue-drop-${latest.snapshotDate}`,
              fingerprint: 'financial-revenue-drop',
              source: 'daily-change',
              title: 'Financial Signal: Revenue Drop With Flat/Rising Expense',
              detail: `Revenue ${revenuePct.toFixed(1)}% DoD, expense ${expensePct.toFixed(1)}% DoD`,
              owner: 'Controller',
              drillView: 'pa-critical-issues',
              deltaText: `Rev ${revenuePct.toFixed(1)}% | Exp ${expensePct.toFixed(1)}%`,
              updatedAt: latest.snapshotDate,
              explainability: {
                triggerName: 'Financial Signal: Revenue Drop With Flat/Rising Expense',
                formula: 'Trigger when revenue falls materially while expense does not decline',
                threshold: 'revenue DoD <= -10% AND expense DoD >= 0%',
                reasonNow: `Revenue ${revenuePct.toFixed(1)}%, expense ${expensePct.toFixed(1)}%`,
                policySource: 'Cross-signal financial trend rule',
                dataRefs: ['/api/operational-data?type=daily-financials'],
                sourceTimestamp: latest.snapshotDate,
              },
            });
          }
        }

        const customerRecords = Array.isArray(customerData?.records) ? customerData.records : [];
        const productRecords = Array.isArray(productData?.records) ? productData.records : [];
        const customerSummaryTop = Array.isArray((customerData as any)?.summary?.topCustomers)
          ? (customerData as any).summary.topCustomers
          : [];
        const bookingSummaryTop = Array.isArray((customerData as any)?.summary?.bookings?.topCustomers)
          ? (customerData as any).summary.bookings.topCustomers
          : [];
        const customerBasis =
          customerSummaryTop.some((row: any) => asNumber(row?.totalRevenue) > 0)
            ? customerSummaryTop.map((row: any) => ({
                customerName: String(row?.customerName || row?.name || 'Unknown Customer'),
                value: asNumber(row?.totalRevenue),
              }))
            : bookingSummaryTop
                .map((row: any) => ({
                  customerName: String(row?.name || row?.customerName || 'Unknown Customer'),
                  value: asNumber(row?.ytd || row?.currentMonth || row?.last12Months || 0),
                }))
                .filter((row: any) => row.value > 0);
        if (customerBasis.length > 0 || customerRecords.length > 0) {
          const latestSnapshotDate = String(customerRecords[0]?.snapshotDate || endDate);
          const latestRows =
            customerBasis.length > 0
              ? customerBasis
              : customerRecords
                  .filter((row: any) => String(row?.snapshotDate || '') === latestSnapshotDate)
                  .map((row: any) => ({
                    customerName: String(row?.customerName || 'Unknown Customer'),
                    value: asNumber(row?.revenue),
                  }));
          const totalRevenue = latestRows.reduce((sum: number, row: any) => sum + asNumber(row?.value), 0);
          const topCustomer = [...latestRows].sort((a: any, b: any) => asNumber(b?.value) - asNumber(a?.value))[0];
          const topShare = totalRevenue > 0 ? (asNumber(topCustomer?.value) / totalRevenue) * 100 : 0;
          if (topShare >= 35) {
            built.push({
              id: `customer-concentration-${latestSnapshotDate}`,
              fingerprint: 'customer-concentration',
              source: 'unresolved',
              title: 'Operational Signal: Customer Concentration Elevated',
              detail: `${String(topCustomer?.customerName || 'Top customer')} is ${topShare.toFixed(1)}% of latest customer concentration basis`,
              owner: 'Sales Lead',
              drillView: 'pa-overview',
              updatedAt: latestSnapshotDate,
              itemLabel: String(topCustomer?.customerName || ''),
              explainability: {
                triggerName: 'Operational Signal: Customer Concentration Elevated',
                formula: 'Top customer share = topCustomerValue / totalCustomerValue * 100 (revenue first, bookings fallback)',
                threshold: 'top customer share >= 35%',
                reasonNow: `Top share ${topShare.toFixed(1)}%`,
                policySource: 'Operational concentration watch rule',
                dataRefs: ['/api/operational-data?type=customers', 'customers.summary.topCustomers / bookings.topCustomers'],
                sourceTimestamp: latestSnapshotDate,
              },
            });
          }
        }

        const inventoryTrend = Array.isArray(inventoryData?.trend) ? inventoryData.trend : [];
        if (inventoryTrend.length >= 2) {
          const latest = inventoryTrend[inventoryTrend.length - 1];
          const prev = inventoryTrend[inventoryTrend.length - 2];
          const latestValue = asNumber(latest?.assetValue);
          const prevValue = asNumber(prev?.assetValue);
          const inventoryPct = dayOverDayPct(latestValue, prevValue);
          if (inventoryPct >= 15) {
            built.push({
              id: `inventory-build-${String(latest?.snapshotDate || endDate)}`,
              fingerprint: 'inventory-build',
              source: 'daily-change',
              title: 'Operational Signal: Inventory Build',
              detail: `Inventory value ${inventoryPct.toFixed(1)}% DoD`,
              owner: 'Operations Lead',
              drillView: 'pa-overview',
              deltaText: `DoD ${inventoryPct.toFixed(1)}%`,
              updatedAt: String(latest?.snapshotDate || endDate),
              explainability: {
                triggerName: 'Operational Signal: Inventory Build',
                formula: 'Inventory DoD % = (latestValue - previousValue) / previousValue * 100',
                threshold: 'Inventory DoD % >= 15%',
                reasonNow: `Inventory DoD ${inventoryPct.toFixed(1)}%`,
                policySource: 'Operational inventory momentum rule',
                dataRefs: ['/api/operational-data?type=inventory'],
                sourceTimestamp: String(latest?.snapshotDate || endDate),
              },
            });
          }
        }

        const productTop = Array.isArray(productData?.summary?.topProducts) ? productData.summary.topProducts : [];
        const weakMarginProduct = productTop.find(
          (row: any) => asNumber(row?.grossMarginPct) < 10 && asNumber(row?.totalRevenue) > 0
        );
        if (weakMarginProduct) {
          built.push({
            id: `product-margin-pressure-${endDate}`,
            fingerprint: 'product-margin-pressure',
            source: 'unresolved',
            title: 'Operational Signal: Product Margin Pressure',
            detail: `${String(weakMarginProduct?.name || 'Top product')} margin ${asNumber(weakMarginProduct?.grossMarginPct).toFixed(1)}%`,
            owner: 'Operations Lead',
            drillView: 'pa-overview',
            updatedAt: endDate,
            itemLabel: String(weakMarginProduct?.name || ''),
            explainability: {
              triggerName: 'Operational Signal: Product Margin Pressure',
              formula: 'Flag top products with low gross margin percentage',
              threshold: 'grossMarginPct < 10% on revenue-bearing product',
              reasonNow: `grossMarginPct ${asNumber(weakMarginProduct?.grossMarginPct).toFixed(1)}%`,
              policySource: 'Operational product margin watch rule',
              dataRefs: ['/api/operational-data?type=products'],
              sourceTimestamp: endDate,
            },
          });
        }

        if (
          (arOver30 >= pulsePolicy['ar_open_critical.min_over30_pct'] ||
            dso >= pulsePolicy['ar_open_critical.min_dso_days']) &&
          arCriticalStreakDays >= arCriticalMinDays
        ) {
          built.push({
            id: `open-critical-ar-${endDate}`,
            fingerprint: 'open-critical-ar',
            source: 'open-critical',
            title: 'Outstanding Critical: AR Quality',
            detail: `AR >30d ${arOver30.toFixed(1)}% | Days Sales Outstanding ${dso.toFixed(1)} days remains at critical levels`,
            owner: 'Collections Lead',
            drillView: 'pa-critical-issues',
            updatedAt: endDate,
            explainability: {
              triggerName: 'Outstanding Critical: AR Quality',
              formula:
                'Open critical if AR >30d % or Days Sales Outstanding remains above critical threshold for the configured consecutive-day window',
              threshold: `(AR >30d >= ${pulsePolicy['ar_open_critical.min_over30_pct']} OR Days Sales Outstanding >= ${pulsePolicy['ar_open_critical.min_dso_days']}) for >= ${arCriticalMinDays} day(s)`,
              reasonNow: `AR >30d ${arOver30.toFixed(1)}%, Days Sales Outstanding ${dso.toFixed(1)} days, streak ${arCriticalStreakDays} day(s)`,
              policySource: `Company Pulse policy (company override + sector default fallback)`,
              dataRefs: ['AR daily summary over30Pct', 'AR daily summary Days Sales Outstanding'],
              sourceTimestamp: endDate,
            },
          });
        }
        if (
          apOver30 >= pulsePolicy['ap_open_critical.min_over30_pct'] &&
          apCriticalStreakDays >= apCriticalMinDays
        ) {
          built.push({
            id: `open-critical-ap-${endDate}`,
            fingerprint: 'open-critical-ap',
            source: 'open-critical',
            title: 'Outstanding Critical: AP Pressure',
            detail: `AP >30d ${apOver30.toFixed(1)}% remains in critical range`,
            owner: 'AP Manager',
            drillView: 'pa-critical-issues',
            updatedAt: endDate,
            explainability: {
              triggerName: 'Outstanding Critical: AP Pressure',
              formula: 'Open critical if AP >30d % remains above threshold for the configured consecutive-day window',
              threshold: `AP >30d >= ${pulsePolicy['ap_open_critical.min_over30_pct']} for >= ${apCriticalMinDays} day(s)`,
              reasonNow: `AP >30d ${apOver30.toFixed(1)}%, streak ${apCriticalStreakDays} day(s)`,
              policySource: `Company Pulse policy (company override + sector default fallback)`,
              dataRefs: ['AP daily summary over30Pct'],
              sourceTimestamp: endDate,
            },
          });
        }
        if (
          cashChangePct <= pulsePolicy['cash_open_critical.max_change_pct'] ||
          (hasRunwaySignal && asNumber(runwayWeeks) < pulsePolicy['cash_open_critical.min_runway_weeks'])
        ) {
          built.push({
            id: `open-critical-cash-${endDate}`,
            fingerprint: 'open-critical-cash',
            source: 'open-critical',
            title: 'Outstanding Critical: Cash Risk',
            detail: hasRunwaySignal
              ? `Cash change ${cashChangePct.toFixed(1)}% | Runway ${asNumber(runwayWeeks).toFixed(1)} weeks`
              : `Cash change ${cashChangePct.toFixed(1)}% | Runway signal unavailable (insufficient source data)`,
            owner: 'Controller',
            drillView: 'pa-critical-issues',
            updatedAt: endDate,
            explainability: {
              triggerName: 'Outstanding Critical: Cash Risk',
              formula: hasRunwaySignal
                ? 'Open critical if current cash change is severe OR sourced runway weeks is below minimum'
                : 'Open critical based on sourced cash change only; runway signal suppressed due to missing sourced runway inputs',
              threshold: hasRunwaySignal
                ? `cashChangePct <= ${pulsePolicy['cash_open_critical.max_change_pct']} OR runwayWeeks < ${pulsePolicy['cash_open_critical.min_runway_weeks']}`
                : `cashChangePct <= ${pulsePolicy['cash_open_critical.max_change_pct']} (runway suppressed)`,
              reasonNow: hasRunwaySignal
                ? `Cash change ${cashChangePct.toFixed(1)}%; runway ${asNumber(runwayWeeks).toFixed(1)} weeks`
                : `Cash change ${cashChangePct.toFixed(1)}%; runway unavailable due to insufficient source data`,
              policySource: `Company Pulse policy (company override + sector default fallback)`,
              dataRefs: hasRunwaySignal
                ? ['Cash summary changePercent', 'Cash summary runwayWeeks', allowProxyRunway ? 'Proxy runway enabled by policy' : '']
                    .filter(Boolean)
                : ['Cash summary changePercent', 'Runway source fields missing: runwayWeeks'],
              sourceTimestamp: endDate,
              readinessStatus: hasRunwaySignal ? 'ready' : allowProxyRunway ? 'partial' : 'missing',
              readinessReason: hasRunwaySignal
                ? 'Sourced runwayWeeks is available for this alert.'
                : allowProxyRunway
                  ? 'Sourced runwayWeeks missing; policy allows proxy fallback.'
                  : 'Sourced runwayWeeks missing; proxy fallback disabled by policy.',
            },
          });
        }

        if (!hasRunwaySignal && cashRecords.length > 0) {
          built.push({
            id: `data-gap-cash-runway-${endDate}`,
            fingerprint: 'data-gap-cash-runway',
            source: 'unresolved',
            title: 'Runway Signal Unavailable',
            detail: 'Insufficient source data for runway. Alerting uses explicit cash-change signal only.',
            owner: 'Controller',
            drillView: 'pa-overview',
            updatedAt: endDate,
            explainability: {
              triggerName: 'Insufficient Source Data: Runway',
              formula: 'Runway-based trigger suppressed when sourced runway inputs are unavailable',
              threshold: 'Requires sourced runwayWeeks (or policy-approved proxy runway)',
              reasonNow: allowProxyRunway
                ? 'Proxy runway was allowed but source runway field is still preferred and currently unavailable'
                : 'Proxy runway disabled by policy; sourced runway field unavailable',
              policySource: `cash_open_critical.allow_proxy_runway = ${asNumber(pulsePolicy['cash_open_critical.allow_proxy_runway'])}`,
              dataRefs: ['Cash summary runwayWeeks missing or invalid'],
              sourceTimestamp: endDate,
              readinessStatus: allowProxyRunway ? 'partial' : 'missing',
              readinessReason: allowProxyRunway
                ? 'Sourced runway field missing; proxy runway currently policy-enabled.'
                : 'Sourced runway field missing and proxy runway is policy-disabled.',
            },
          });
        }

        const findings = Array.isArray(findingsData?.findings) ? findingsData.findings : [];
        findings
          .filter((finding: any) => {
            const status = String(finding?.payload?.status || '').trim().toLowerCase();
            return !status || !RESOLVED_STATUSES.has(status);
          })
          .forEach((finding: any) => {
            built.push({
              id: `open-${finding.id}`,
              fingerprint: `finding-${finding.id}`,
              source: 'unresolved',
              title: finding?.payload?.title || finding?.metric || 'Open Critical Finding',
              detail: finding?.payload?.summary || finding?.payload?.likelyCause || 'Previously flagged critical item remains unresolved.',
              owner: finding?.payload?.owner || 'Ops/Finance Owner',
              drillView: finding?.type === 'anomaly' ? 'pa-anomaly-inbox' : 'pa-critical-issues',
              updatedAt: finding?.updatedAt,
              itemLabel: finding?.metric || undefined,
              explainability: {
                triggerName: 'Unresolved Critical Finding',
                formula: 'Include unresolved critical findings from performance analytics feed',
                threshold: 'status not in resolved/realized/closed/done/complete/completed',
                reasonNow: `Finding remains unresolved (${finding?.type || 'critical'})`,
                policySource: 'Findings ingestion rule + Pulse priority policy',
                dataRefs: ['/api/performance-analytics/findings?severity=critical'],
                sourceTimestamp: finding?.updatedAt,
              },
            });
          });

        const criticalFindingIds = new Set(findings.map((finding: any) => String(finding?.id || '')));
        const expertFindings = Array.isArray(expertFindingsData?.findings) ? expertFindingsData.findings : [];
        expertFindings
          .filter((finding: any) => {
            const id = String(finding?.id || '');
            if (!id || criticalFindingIds.has(id)) return false;
            const status = String(finding?.payload?.status || '').trim().toLowerCase();
            if (status && RESOLVED_STATUSES.has(status)) return false;
            return true;
          })
          .forEach((finding: any) => {
            built.push({
              id: `expert-${finding.id}`,
              fingerprint: `expert-finding-${finding.id}`,
              source: 'unresolved',
              title: finding?.payload?.title || finding?.metric || 'Expert Analysis Signal',
              detail:
                finding?.payload?.summary ||
                finding?.payload?.likelyCause ||
                'Expert analytics identified a notable operating/financial signal.',
              owner: finding?.payload?.owner || 'Ops/Finance Owner',
              drillView: 'pa-overview',
              updatedAt: finding?.updatedAt,
              itemLabel: finding?.metric || undefined,
              explainability: {
                triggerName: 'Expert Analysis Signal',
                formula: 'Include unresolved expert findings (non-critical tiers) in pulse monitoring',
                threshold: 'finding unresolved AND severity in {high, medium} (or unspecified)',
                reasonNow: `Expert finding remains open (${String(finding?.type || 'analysis')})`,
                policySource: 'Expert findings ingestion rule + Pulse priority policy',
                dataRefs: ['/api/performance-analytics/findings'],
                sourceTimestamp: finding?.updatedAt,
              },
            });
          });

        const monthlyFinancialCount = Array.isArray(performanceContextData?.data?.monthlyFinancials)
          ? performanceContextData.data.monthlyFinancials.length
          : 0;
        const monthlyFinancialRows = Array.isArray(performanceContextData?.data?.monthlyFinancials)
          ? [...performanceContextData.data.monthlyFinancials]
          : [];
        const latestMonthlyFinancial = monthlyFinancialRows
          .filter((row: any) => row && typeof row === 'object')
          .sort((a: any, b: any) => new Date(b?.monthDate || 0).getTime() - new Date(a?.monthDate || 0).getTime())[0];
        const latestLiabilities = latestMonthlyFinancial
          ? Math.max(
              0,
              asNumber(
                latestMonthlyFinancial.totalLiab ??
                  latestMonthlyFinancial.totalLiabilities ??
                  latestMonthlyFinancial.totalLiability ??
                  latestMonthlyFinancial.liabilities
              )
            )
          : 0;
        const latestEquity = latestMonthlyFinancial
          ? Math.max(
              0,
              asNumber(
                latestMonthlyFinancial.totalEquity ??
                  latestMonthlyFinancial.equity
              )
            )
          : 0;
        const debtToEquityRatio = latestEquity > 0 ? latestLiabilities / latestEquity : null;
        if (debtToEquityRatio !== null && Number.isFinite(debtToEquityRatio)) {
          const debtToEquityPct = debtToEquityRatio * 100;
          const isCriticalLeverage = debtToEquityRatio >= 1;
          const isHighLeverage = debtToEquityRatio >= 0.5;
          if (isHighLeverage) {
            built.push({
              id: `debt-to-equity-${String(latestMonthlyFinancial?.monthDate || endDate)}`,
              fingerprint: 'debt-to-equity-leverage',
              source: isCriticalLeverage ? 'open-critical' : 'unresolved',
              title: isCriticalLeverage ? 'Outstanding Critical: Leverage Risk' : 'Leverage Signal: Debt-to-Equity Elevated',
              detail: `Debt-to-Equity is ${debtToEquityPct.toFixed(1)}% (L ${latestLiabilities.toFixed(0)} / E ${latestEquity.toFixed(0)})`,
              owner: 'Controller',
              drillView: 'pa-overview',
              updatedAt: String(latestMonthlyFinancial?.monthDate || endDate),
              explainability: {
                triggerName: isCriticalLeverage
                  ? 'Outstanding Critical: Leverage Risk'
                  : 'Leverage Signal: Debt-to-Equity Elevated',
                formula: 'Debt-to-Equity = total liabilities / total equity',
                threshold: isCriticalLeverage
                  ? 'Debt-to-Equity >= 100%'
                  : 'Debt-to-Equity >= 50%',
                reasonNow: `Debt-to-Equity ${debtToEquityPct.toFixed(1)}%`,
                policySource: 'Financial structure watch rule (monthly context)',
                dataRefs: ['/api/performance-analytics/context monthlyFinancials'],
                sourceTimestamp: String(latestMonthlyFinancial?.monthDate || endDate),
              },
            });
          }
        }

        const contextBenchmarks = Array.isArray(performanceContextData?.benchmarks?.items)
          ? performanceContextData.benchmarks.items
          : [];
        const grossMarginRatio =
          latestMonthlyFinancial && asNumber(latestMonthlyFinancial.revenue) > 0
            ? asNumber(
                latestMonthlyFinancial.grossMargin ??
                  latestMonthlyFinancial.grossMarginPct ??
                  latestMonthlyFinancial.grossProfit
              ) > 0
              ? (
                  asNumber(
                    latestMonthlyFinancial.grossMargin ??
                      latestMonthlyFinancial.grossMarginPct ??
                      latestMonthlyFinancial.grossProfit
                  ) /
                  (String(latestMonthlyFinancial.grossMarginPct || '').includes('%') ? 1 : asNumber(latestMonthlyFinancial.revenue))
                )
              : (asNumber(latestMonthlyFinancial.revenue) - asNumber(latestMonthlyFinancial.cogsTotal)) /
                Math.max(asNumber(latestMonthlyFinancial.revenue), 1)
            : null;
        const netMarginRatio =
          latestMonthlyFinancial && asNumber(latestMonthlyFinancial.revenue) > 0
            ? asNumber(
                latestMonthlyFinancial.netMargin ??
                  latestMonthlyFinancial.netMarginPct ??
                  latestMonthlyFinancial.netIncome ??
                  latestMonthlyFinancial.netProfit
              ) > 0
              ? (
                  asNumber(
                    latestMonthlyFinancial.netMargin ??
                      latestMonthlyFinancial.netMarginPct ??
                      latestMonthlyFinancial.netIncome ??
                      latestMonthlyFinancial.netProfit
                  ) /
                  (String(latestMonthlyFinancial.netMarginPct || '').includes('%') ? 1 : asNumber(latestMonthlyFinancial.revenue))
                )
              : null
            : null;
        const currentLiabilities = asNumber(
          latestMonthlyFinancial?.currentLiabilities ??
            latestMonthlyFinancial?.currentLiab
        );
        const currentAssets = asNumber(
          latestMonthlyFinancial?.currentAssets
        );
        const currentRatio =
          currentLiabilities > 0
            ? (currentAssets > 0
                ? currentAssets / currentLiabilities
                : (asNumber(latestMonthlyFinancial?.cash) + asNumber(latestMonthlyFinancial?.ar)) / currentLiabilities)
            : null;
        const quickRatio =
          currentLiabilities > 0
            ? (asNumber(latestMonthlyFinancial?.cash) + asNumber(latestMonthlyFinancial?.ar)) / currentLiabilities
            : null;
        const dsoDays =
          Number.isFinite(asNumber(arSummary?.dso)) && asNumber(arSummary?.dso) > 0
            ? asNumber(arSummary.dso)
            : Number.isFinite(asNumber(latestMonthlyFinancial?.dso))
              ? asNumber(latestMonthlyFinancial?.dso)
              : null;
        const dpoDays = Number.isFinite(asNumber(latestMonthlyFinancial?.dpo))
          ? asNumber(latestMonthlyFinancial?.dpo)
          : null;
        const dioDays = Number.isFinite(asNumber(latestMonthlyFinancial?.dio ?? latestMonthlyFinancial?.daysInventory))
          ? asNumber(latestMonthlyFinancial?.dio ?? latestMonthlyFinancial?.daysInventory)
          : null;
        type BenchmarkSignal = {
          label: string;
          companyValue: number;
          benchmarkValue: number;
          direction: 'higher-better' | 'lower-better';
          unit: 'ratio' | 'days' | 'percent';
        };
        const benchmarkSignals: BenchmarkSignal[] = [];
        const benchmarkRules: Array<{
          label: string;
          matcher: RegExp;
          direction: 'higher-better' | 'lower-better';
          unit: 'ratio' | 'days' | 'percent';
          value: number | null;
        }> = [
          { label: 'Debt-to-Equity', matcher: /debt.*equity|equity.*debt|leverage/i, direction: 'lower-better', unit: 'ratio', value: debtToEquityRatio },
          { label: 'Current Ratio', matcher: /current\s*ratio/i, direction: 'higher-better', unit: 'ratio', value: currentRatio },
          { label: 'Quick Ratio', matcher: /quick\s*ratio|acid\s*test/i, direction: 'higher-better', unit: 'ratio', value: quickRatio },
          { label: 'Gross Margin', matcher: /gross\s*margin/i, direction: 'higher-better', unit: 'percent', value: grossMarginRatio },
          { label: 'Net Margin', matcher: /net\s*margin|profit\s*margin/i, direction: 'higher-better', unit: 'percent', value: netMarginRatio },
          { label: 'DSO', matcher: /days\s*(sales\s*outstanding|receivables)|\bdso\b/i, direction: 'lower-better', unit: 'days', value: dsoDays },
          { label: 'DPO', matcher: /days\s*payables|\bdpo\b/i, direction: 'lower-better', unit: 'days', value: dpoDays },
          { label: 'DIO', matcher: /days\s*inventory|\bdio\b|inventory\s*days/i, direction: 'lower-better', unit: 'days', value: dioDays },
        ];
        for (const benchmark of contextBenchmarks) {
          const metricName = String(benchmark?.metricName || '');
          const benchmarkValue = Number(benchmark?.fiveYearValue);
          if (!metricName || !Number.isFinite(benchmarkValue)) continue;
          const rule = benchmarkRules.find((candidate) => candidate.matcher.test(metricName));
          if (!rule || rule.value === null || !Number.isFinite(rule.value)) continue;
          benchmarkSignals.push({
            label: rule.label,
            companyValue: Number(rule.value),
            benchmarkValue,
            direction: rule.direction,
            unit: rule.unit,
          });
        }
        const adverseBenchmarkSignals = benchmarkSignals.filter((signal) => {
          if (signal.direction === 'higher-better') {
            return signal.companyValue < signal.benchmarkValue * 0.85;
          }
          return signal.companyValue > signal.benchmarkValue * 1.15;
        });
        if (adverseBenchmarkSignals.length > 0) {
          const topSignals = adverseBenchmarkSignals.slice(0, 3);
          const formatBenchmarkValue = (signal: BenchmarkSignal, value: number): string => {
            if (signal.unit === 'days') return `${value.toFixed(1)}d`;
            if (signal.unit === 'percent') return `${(value * 100).toFixed(1)}%`;
            return `${value.toFixed(2)}x`;
          };
          built.push({
            id: `benchmark-variance-${endDate}`,
            fingerprint: 'benchmark-variance',
            source: 'unresolved',
            title: 'Benchmark Variance Watch',
            detail: `${adverseBenchmarkSignals.length} benchmark gap(s): ${topSignals
              .map(
                (signal) =>
                  `${signal.label} ${formatBenchmarkValue(signal, signal.companyValue)} vs ${formatBenchmarkValue(
                    signal,
                    signal.benchmarkValue
                  )}`
              )
              .join(' | ')}`,
            owner: 'Controller',
            drillView: 'pa-overview',
            updatedAt: endDate,
            explainability: {
              triggerName: 'Benchmark Variance Watch',
              formula: 'Compare company ratios against available industry benchmarks and flag materially adverse variance',
              threshold: 'Adverse variance >15% vs benchmark (direction-aware)',
              reasonNow: `${adverseBenchmarkSignals.length} ratio(s) are materially away from benchmark.`,
              policySource: 'Industry benchmark variance rule',
              dataRefs: ['/api/performance-analytics/context benchmarks + monthlyFinancials'],
              sourceTimestamp: endDate,
            },
          });
        }

        const covenantAlerts = Array.isArray(covenantAlertsData?.alerts) ? covenantAlertsData.alerts : [];
        covenantAlerts
          .filter((alert: any) => String(alert?.status || '').toLowerCase() === 'active')
          .forEach((alert: any) => {
            const severity = String(alert?.severity || '').toLowerCase();
            const covenantName = String(alert?.covenantName || alert?.title || 'Covenant').trim();
            built.push({
              id: `covenant-${String(alert?.id || Math.random().toString(36).slice(2))}`,
              fingerprint: `covenant-${String(alert?.id || '').trim() || String(alert?.title || '').trim()}`,
              source: severity === 'critical' ? 'open-critical' : 'unresolved',
              title: `Loan Covenant ${severity === 'critical' ? 'Breach Risk' : 'Warning'}: ${covenantName}`,
              detail: String(alert?.description || alert?.title || 'Covenant outside allowed range'),
              owner: 'Covenant Manager',
              drillView: 'covenants',
              updatedAt: String(alert?.timestamp || endDate),
              explainability: {
                triggerName: 'Loan Covenant Warning/Breach',
                formula: 'Ingest active covenant warnings and breach-level statuses from covenant monitor',
                threshold: 'status = active and severity in {warning, critical}',
                reasonNow: `${covenantName} is active at ${severity || 'warning'} severity`,
                policySource: 'Covenant monitoring feed',
                dataRefs: ['/api/covenants/alerts'],
                sourceTimestamp: String(alert?.timestamp || endDate),
              },
            });
          });

        const hasCoreOperationalContext =
          arRecords.length > 0 ||
          apRecords.length > 0 ||
          cashRecords.length > 0 ||
          customerRecords.length > 0 ||
          productRecords.length > 0 ||
          inventoryRecords.length > 0 ||
          dailyFinancialRecords.length > 0;

        if (monthlyFinancialCount <= 0 && !hasCoreOperationalContext) {
          built.push({
            id: `financial-context-gap-${endDate}`,
            fingerprint: 'financial-context-gap',
            source: 'unresolved',
            title: 'Financial Context Coverage Gap',
            detail: 'Monthly financial context is unavailable; pulse scoring may underweight broader financial trends.',
            owner: 'Controller',
            drillView: 'pa-overview',
            updatedAt: endDate,
            explainability: {
              triggerName: 'Financial Context Coverage Gap',
              formula: 'Raise monitoring item when both monthly financial context and core operational context feeds are empty',
              threshold: 'performance context monthlyFinancials count = 0 AND all core ops records count = 0',
              reasonNow: 'No monthly financial records and no core operational records were returned for the selected range.',
              policySource: 'Cross-signal readiness rule',
              dataRefs: ['/api/performance-analytics/context'],
              sourceTimestamp: endDate,
              readinessStatus: 'partial',
              readinessReason: 'Monthly context missing while operational signals continue to run.',
            },
          });
        }

        priorityFocusTerms.forEach((term) => {
          built.push({
            id: `priority-focus-${term}-${endDate}`,
            fingerprint: `priority-focus-${term}`,
            source: 'unresolved',
            title: 'Priority Focus Watch',
            detail: `${term} is configured as a daily priority focus area.`,
            owner: 'Ops/Finance Owner',
            drillView: 'pa-overview',
            updatedAt: endDate,
            itemLabel: term,
            explainability: {
              triggerName: 'Priority Focus Watch',
              formula: 'Inject watch item for configured operational focus term',
              threshold: 'Term exists in __focusWatchlist',
              reasonNow: `"${term}" configured as priority focus`,
              policySource: '__focusWatchlist operational goal',
              dataRefs: ['/api/operational-goals'],
              sourceTimestamp: endDate,
            },
          });
        });

        const sourceRank: Record<AlertItem['source'], number> = {
          'daily-change': 3,
          'open-critical': 2,
          unresolved: 1,
        };
        const scored = built.map((alert) => {
          const baseScore = scoreAlert(alert);
          const priorityFocusTerm = findPriorityFocusMatch(alert, priorityFocusTerms) || undefined;
          const priorityScore = Math.min(100, baseScore + (priorityFocusTerm ? 20 : 0));
          return {
            ...alert,
            priorityScore,
            priorityFocusTerm,
            bucket:
              priorityScore >= pulsePolicy['bucket.attention_min_score']
                ? 'attention'
                : 'monitoring',
          } as AlertItem;
        });
        const visibleScored = scored;

        visibleScored.sort((a, b) => {
          const scoreDiff = asNumber(b.priorityScore) - asNumber(a.priorityScore);
          if (scoreDiff !== 0) return scoreDiff;
          if (a.source !== b.source) return sourceRank[b.source] - sourceRank[a.source];
          return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
        });

        let persistedAlerts: AlertItem[] = visibleScored;
        try {
          const syncResponse = await fetchWithTimeout('/api/pulse/alerts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId,
              alerts: visibleScored.map((alert) => ({
                fingerprint: alert.fingerprint || alert.id,
                source: alert.source,
                title: alert.title,
                detail: alert.detail,
                owner: alert.owner,
                drillView: alert.drillView,
                deltaText: alert.deltaText,
                updatedAt: alert.updatedAt,
                itemLabel: alert.itemLabel,
                priorityScore: alert.priorityScore,
                bucket: alert.bucket,
                priorityFocusTerm: alert.priorityFocusTerm,
                explainability: alert.explainability,
              })),
            }),
          });
          if (syncResponse.ok) {
            const syncData = await syncResponse.json();
            if (Array.isArray(syncData?.alerts)) {
              persistedAlerts = syncData.alerts.map((row: any) => ({
                id: String(row.id),
                fingerprint: String(row.fingerprint || ''),
                source: row.source as AlertItem['source'],
                title: row.title,
                detail: row.detail,
                owner: row.owner || 'Ops/Finance Owner',
                drillView: row.drillView || 'pa-overview',
                deltaText: row.deltaText || undefined,
                updatedAt: row.updatedAt || undefined,
                itemLabel: row.itemLabel || undefined,
                priorityScore: Number(row.priorityScore || 0),
                bucket: row.bucket === 'attention' ? 'attention' : 'monitoring',
                priorityFocusTerm: row.priorityFocusTerm || undefined,
                status: row.status || 'new',
                dueAt: row.dueAt || null,
                snoozedUntil: row.snoozedUntil || null,
                notes: Array.isArray(row.notes) ? row.notes : [],
                isActive: Boolean(row.isActive),
                modifiedAt: row.modifiedAt || undefined,
                explainability:
                  row && typeof row.explainability === 'object'
                    ? row.explainability
                    : {
                        triggerName: row?.title || 'Pulse Alert',
                        formula: 'Derived from Company Pulse rule set for this alert source',
                        threshold: 'See policy settings and source-specific trigger thresholds',
                        reasonNow: row?.detail || 'Condition met in latest run',
                        policySource: 'Company Pulse policy (company override + sector default fallback)',
                        dataRefs: [row?.source || 'pulse-source'],
                        sourceTimestamp: row?.updatedAt || undefined,
                      },
              }));
            }
          }
        } catch {
          // Fallback to in-memory alerts if sync endpoint is unavailable.
        }

        if (!cancelled) {
          setGoalsSnapshot(goals);
          setPolicyOverrides(pulseOverrides);
          setIndustrySectorCategory(companySectorCategory);
          setReadinessItems(readinessSnapshot);
          setAlerts(persistedAlerts);
        }
      } catch (err: any) {
        if (!cancelled) {
          const isAbort = err?.name === 'AbortError';
          setError(isAbort ? 'Daily alerts request timed out. Please retry.' : (err.message || 'Failed to load daily alerts'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (companyId) load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    const loadCompanyUsers = async () => {
      if (!companyId) {
        setAssignableUsers([]);
        return;
      }
      try {
        const params = new URLSearchParams({ companyId });
        const response = await fetch(`/api/users?${params}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const users = Array.isArray(data?.users) ? data.users : [];
        const mapped = users
          .map((user: any) => ({
            id: String(user?.id || '').trim(),
            name: String(user?.name || '').trim() || String(user?.email || '').trim(),
            email: String(user?.email || '').trim(),
          }))
          .filter((user: AssignableUser) => user.id && user.email);
        if (!cancelled) {
          setAssignableUsers(mapped);
        }
      } catch {
        // Keep dropdown empty on user lookup failure.
      }
    };
    loadCompanyUsers();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const activeAlerts = useMemo(
    () => alerts.filter((a) => a.status !== 'resolved' && a.isActive !== false),
    [alerts]
  );
  const resolvedAlerts = useMemo(() => alerts.filter((a) => a.status === 'resolved'), [alerts]);
  const counts = useMemo(() => {
    const attention = activeAlerts.filter((a) => a.bucket === 'attention').length;
    const monitoring = activeAlerts.filter((a) => a.bucket === 'monitoring').length;
    return {
      total: activeAlerts.length,
      daily: activeAlerts.filter((a) => a.source === 'daily-change').length,
      unresolved: activeAlerts.filter((a) => a.source === 'unresolved' || a.source === 'open-critical').length,
      attention,
      monitoring,
    };
  }, [activeAlerts]);

  const attentionAlerts = useMemo(() => activeAlerts.filter((a) => a.bucket === 'attention'), [activeAlerts]);
  const monitoringAlerts = useMemo(() => activeAlerts.filter((a) => a.bucket === 'monitoring'), [activeAlerts]);
  const readinessCounts = useMemo(() => {
    return readinessItems.reduce(
      (acc, item) => {
        if (item.status === 'ready') acc.ready += 1;
        else if (item.status === 'partial') acc.partial += 1;
        else acc.missing += 1;
        return acc;
      },
      { ready: 0, partial: 0, missing: 0 }
    );
  }, [readinessItems]);
  const readinessSummaryTone = useMemo(() => {
    if (readinessCounts.missing > 0) return readinessColor('missing');
    if (readinessCounts.partial > 0) return readinessColor('partial');
    return readinessColor('ready');
  }, [readinessCounts]);
  const sectorLabel = useMemo(
    () => getSectorLabel(industrySectorCategory),
    [industrySectorCategory]
  );
  const sectorPolicyValues = useMemo(
    () => getSectorPulsePolicyValues(industrySectorCategory),
    [industrySectorCategory]
  );
  const effectivePolicyValues = useMemo(
    () => getResolvedPulsePolicyValues(policyOverrides, industrySectorCategory),
    [policyOverrides, industrySectorCategory]
  );
  const policySections = useMemo(() => {
    const sectionOrder: PulsePolicySection[] = ['AR', 'AP', 'Cash', 'Findings & Freshness', 'Buckets'];
    return sectionOrder.map((section) => ({
      section,
      items: PULSE_POLICY_DEFINITIONS.filter((def) => def.section === section),
    }));
  }, []);
  const policyDetailDefinition = useMemo(
    () =>
      policyDetailKey
        ? PULSE_POLICY_DEFINITIONS.find((def) => def.key === policyDetailKey) || null
        : null,
    [policyDetailKey]
  );
  const policySettingsGridColumns =
    'minmax(350px, 2.05fr) minmax(120px, 0.62fr) minmax(120px, 0.62fr) minmax(100px, 0.58fr) minmax(74px, 86px) minmax(72px, 82px)';

  const hasPolicyOverride = (key: PulsePolicyKey) => Object.prototype.hasOwnProperty.call(policyOverrides, key);

  const setPolicyOverrideEnabled = (key: PulsePolicyKey, enabled: boolean) => {
    setPolicyStatus(null);
    setPolicyOverrides((prev) => {
      if (!enabled) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (Object.prototype.hasOwnProperty.call(prev, key)) return prev;
      return {
        ...prev,
        [key]: sectorPolicyValues[key],
      };
    });
  };

  const setPolicyOverrideValue = (key: PulsePolicyKey, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setPolicyStatus(null);
    setPolicyOverrides((prev) => ({
      ...prev,
      [key]: parsed,
    }));
  };

  const resetAllPolicyOverrides = () => {
    setPolicyOverrides({});
    setPolicyStatus('All company overrides cleared. Sector defaults are now active.');
  };

  const savePolicyOverrides = async () => {
    setPolicySaving(true);
    setPolicyStatus(null);
    try {
      const cleanedOverrides = sanitizePulsePolicyOverrides(policyOverrides);
      const nextGoals = {
        ...goalsSnapshot,
        [PULSE_POLICY_OVERRIDE_KEY]: cleanedOverrides,
      };
      const response = await fetch('/api/operational-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          goals: nextGoals,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to save policy settings');
      }
      setGoalsSnapshot(nextGoals);
      setPolicyOverrides(cleanedOverrides);
      setPolicyStatus('Policy settings saved. Company overrides are now active.');
    } catch (err: any) {
      setPolicyStatus(err?.message || 'Failed to save policy settings');
    } finally {
      setPolicySaving(false);
    }
  };

  const mergeUpdatedAlert = (updated: any) => {
    if (!updated?.id) return;
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === updated.id
          ? {
              ...alert,
              owner: updated.owner || alert.owner,
              status: updated.status || alert.status,
              dueAt: updated.dueAt ?? alert.dueAt ?? null,
              snoozedUntil: updated.snoozedUntil ?? alert.snoozedUntil ?? null,
              notes: Array.isArray(updated.notes) ? updated.notes : alert.notes,
              isActive: typeof updated.isActive === 'boolean' ? updated.isActive : alert.isActive,
              modifiedAt: updated.modifiedAt || alert.modifiedAt,
            }
          : alert
      )
    );
  };

  const runAlertAction = async (alert: AlertItem, payload: Record<string, unknown>) => {
    setTransitionLoadingId(alert.id);
    try {
      const response = await fetch(`/api/pulse/alerts/${encodeURIComponent(alert.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, ...payload }),
      });
      if (!response.ok) throw new Error('Failed to update alert');
      const data = await response.json();
      mergeUpdatedAlert(data?.alert);
    } catch (err: any) {
      setError(err?.message || 'Failed to update alert');
    } finally {
      setTransitionLoadingId(null);
    }
  };

  const loadAlertEvents = async (alert: AlertItem) => {
    setEventModalAlert(alert);
    setEventsLoading(true);
    setAlertEvents([]);
    try {
      const params = new URLSearchParams({ companyId });
      const response = await fetch(`/api/pulse/alerts/${encodeURIComponent(alert.id)}/events?${params}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Failed to load alert history');
      const data = await response.json();
      setAlertEvents(Array.isArray(data?.events) ? data.events : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load alert history');
    } finally {
      setEventsLoading(false);
    }
  };

  const fetchOpsRecords = async (type: 'ar-aging' | 'ap-aging' | 'cash') => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 90);
    const params = new URLSearchParams({
      companyId,
      type,
      frequency: 'daily',
      startDate: toLocalInputDate(start),
      endDate: toLocalInputDate(end),
    });
    const response = await fetch(`/api/operational-data?${params}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load ${type} trend preview`);
    const data = await response.json();
    return Array.isArray(data?.records) ? data.records : [];
  };

  const byDateTotals = (rows: any[], field: string): Array<{ date: string; value: number }> => {
    const map = rows.reduce((acc: Record<string, number>, row: any) => {
      const date = String(row.snapshotDate || '');
      if (!date) return acc;
      acc[date] = (acc[date] || 0) + asNumber(row[field]);
      return acc;
    }, {});
    return Object.entries(map)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const buildTrend = async (spec: PreviewSpec): Promise<TrendPoint[]> => {
    if (spec.metric.startsWith('ar-')) {
      const rows = await fetchOpsRecords('ar-aging');
      const normalized = rows
        .map((row: any) => {
          const totalAR = asNumber(row.totalAR);
          const over30Amt =
            asNumber(row.days1to30) +
            asNumber(row.days31to60) +
            asNumber(row.days61to90) +
            asNumber(row.days90plus);
          return {
            date: String(row.snapshotDate || ''),
            totalAR,
            over30Pct: totalAR > 0 ? (over30Amt / totalAR) * 100 : 0,
            dso: asNumber(row.dso),
          };
        })
        .filter((row: any) => row.date)
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (spec.metric === 'ar-over30-pct') {
        return normalized.map((row: any) => ({ date: row.date, value: row.over30Pct }));
      }
      if (spec.metric === 'ar-dso') {
        return normalized.map((row: any) => ({ date: row.date, value: row.dso }));
      }
      return normalized.map((row: any) => ({ date: row.date, value: row.totalAR }));
    }

    if (spec.metric.startsWith('ap-')) {
      const rows = await fetchOpsRecords('ap-aging');
      const normalized = rows
        .map((row: any) => {
          const totalAP = asNumber(row.totalAP);
          const over30Amt =
            asNumber(row.days1to30) +
            asNumber(row.days31to60) +
            asNumber(row.days61to90) +
            asNumber(row.days90plus);
          return {
            date: String(row.snapshotDate || ''),
            totalAP,
            over30Pct: totalAP > 0 ? (over30Amt / totalAP) * 100 : 0,
          };
        })
        .filter((row: any) => row.date)
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (spec.metric === 'ap-over30-pct') {
        return normalized.map((row: any) => ({ date: row.date, value: row.over30Pct }));
      }
      return normalized.map((row: any) => ({ date: row.date, value: row.totalAP }));
    }

    const cashRows = await fetchOpsRecords('cash');
    if (spec.metric === 'cash-account-balance' && spec.accountName) {
      const filtered = cashRows.filter(
        (row: any) => String(row.accountName || '').trim() === spec.accountName
      );
      return byDateTotals(filtered, 'cashBalance').map((row) => ({
        date: row.date,
        value: row.value,
      }));
    }

    const totals = byDateTotals(cashRows, 'cashBalance');
    if (spec.metric === 'cash-total') {
      return totals.map((row) => ({ date: row.date, value: row.value }));
    }

    // cash-runway-weeks: sourced runway only (no proxy inference).
    const byDate = new Map<string, number>();
    cashRows.forEach((row: any) => {
      const date = String(row.snapshotDate || '');
      if (!date) return;
      const runway = asNumber(row.runwayWeeks);
      if (Number.isFinite(runway) && runway > 0) {
        byDate.set(date, runway);
      }
    });
    return Array.from(byDate.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const openPreview = async (alert: AlertItem, spec: PreviewSpec) => {
    setPreviewAlert(alert);
    setPreviewSpec(spec);
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const trend = await buildTrend(spec);
      setPreviewTrend(trend);
    } catch (err: any) {
      setPreviewError(err?.message || 'Failed to load KPI preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const getPreviewSpecs = (alert: AlertItem): PreviewSpec[] => {
    const text = `${alert.title} ${alert.detail}`.toLowerCase();
    const specs: PreviewSpec[] = [];
    if (text.includes('ar')) {
      specs.push({
        key: `${alert.id}-ar-over30`,
        metric: 'ar-over30-pct',
        label: 'AR >30d %',
        color: '#b91c1c',
        unit: 'percent',
        direction: 'higher-worse',
      });
      specs.push({
        key: `${alert.id}-ar-dso`,
        metric: 'ar-dso',
        label: 'Days Sales Outstanding',
        color: '#7c3aed',
        unit: 'days',
        direction: 'higher-worse',
      });
      specs.push({
        key: `${alert.id}-ar-total`,
        metric: 'ar-total',
        label: 'Total AR',
        color: '#0f766e',
        unit: 'currency',
        direction: 'neutral',
      });
    }
    if (text.includes('ap')) {
      specs.push({
        key: `${alert.id}-ap-over30`,
        metric: 'ap-over30-pct',
        label: 'AP >30d %',
        color: '#c2410c',
        unit: 'percent',
        direction: 'higher-worse',
      });
      specs.push({
        key: `${alert.id}-ap-total`,
        metric: 'ap-total',
        label: 'Total AP',
        color: '#0369a1',
        unit: 'currency',
        direction: 'neutral',
      });
    }
    if (text.includes('cash') || text.includes('runway')) {
      specs.push({
        key: `${alert.id}-cash-total`,
        metric: 'cash-total',
        label: 'Cash Balance',
        color: '#166534',
        unit: 'currency',
        direction: 'lower-worse',
      });
      specs.push({
        key: `${alert.id}-cash-runway`,
        metric: 'cash-runway-weeks',
        label: 'Runway Weeks',
        color: '#4338ca',
        unit: 'weeks',
        direction: 'lower-worse',
      });
      if (alert.itemLabel) {
        specs.push({
          key: `${alert.id}-cash-account`,
          metric: 'cash-account-balance',
          label: `${alert.itemLabel} Balance`,
          color: '#0f766e',
          unit: 'currency',
          direction: 'lower-worse',
          accountName: alert.itemLabel,
        });
      }
    }
    return specs;
  };

  const statusColor = (status: AlertItem['status']) => {
    if (status === 'resolved') return { bg: '#dcfce7', fg: '#166534', border: '#86efac' };
    if (status === 'snoozed') return { bg: '#fef3c7', fg: '#92400e', border: '#fde68a' };
    if (status === 'acknowledged') return { bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd' };
    return { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' };
  };

  const renderLifecycleActions = (alert: AlertItem) => {
    const isBusy = transitionLoadingId === alert.id;
    const selectedOwner = selectedOwnerByAlert[alert.id] || '';
    return (
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '2px', maxWidth: '100%', flex: '1 1 auto' }}>
        {alert.status !== 'acknowledged' && alert.status !== 'resolved' && (
          <button
            disabled={isBusy}
            onClick={() => runAlertAction(alert, { action: 'acknowledge' })}
            style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '7px', padding: '3px 7px', cursor: isBusy ? 'not-allowed' : 'pointer' }}
          >
            Ack
          </button>
        )}
        {alert.status !== 'snoozed' && alert.status !== 'resolved' && (
          <button
            disabled={isBusy}
            onClick={() => {
              const hours = window.prompt('Snooze hours (e.g. 24):', '24');
              const h = Number(hours || 0);
              if (!Number.isFinite(h) || h <= 0) return;
              const until = new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
              runAlertAction(alert, { action: 'snooze', snoozedUntil: until });
            }}
            style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '7px', padding: '3px 7px', cursor: isBusy ? 'not-allowed' : 'pointer' }}
          >
            Snooze
          </button>
        )}
        {alert.status !== 'resolved' && (
          <button
            disabled={isBusy}
            onClick={() => runAlertAction(alert, { action: 'resolve' })}
            style={{ fontSize: '11px', fontWeight: 700, color: '#166534', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '7px', padding: '3px 7px', cursor: isBusy ? 'not-allowed' : 'pointer' }}
          >
            Mark Resolved
          </button>
        )}
        {alert.status === 'resolved' && (
          <button
            disabled={isBusy}
            onClick={() => runAlertAction(alert, { action: 'reopen' })}
            style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '7px', padding: '3px 7px', cursor: isBusy ? 'not-allowed' : 'pointer' }}
          >
            Reopen
          </button>
        )}
        <select
          value={selectedOwner}
          disabled={isBusy || assignableUsers.length === 0}
          onChange={(e) =>
            setSelectedOwnerByAlert((prev) => ({
              ...prev,
              [alert.id]: e.target.value,
            }))
          }
          style={{
            fontSize: '11px',
            color: '#334155',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '7px',
            padding: '3px 6px',
            minWidth: '180px',
            maxWidth: '220px',
          }}
        >
          <option value="">{assignableUsers.length > 0 ? 'Assign to user...' : 'No users'}</option>
          {assignableUsers.map((user) => (
            <option key={user.id} value={`${user.name} <${user.email}>`}>
              {user.name} ({user.email})
            </option>
          ))}
        </select>
        <button
          disabled={isBusy || !selectedOwner}
          onClick={async () => {
            if (!selectedOwner) return;
            await runAlertAction(alert, { action: 'assign', owner: selectedOwner });
            setSelectedOwnerByAlert((prev) => ({ ...prev, [alert.id]: '' }));
          }}
          style={{ fontSize: '11px', fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '7px', padding: '3px 7px', cursor: isBusy || !selectedOwner ? 'not-allowed' : 'pointer' }}
        >
          Assign
        </button>
        <button
          disabled={isBusy}
          onClick={() => {
            const raw = window.prompt('Due date/time (YYYY-MM-DDTHH:mm):', '');
            if (raw === null) return;
            const dueAt = raw.trim() ? new Date(raw.trim()).toISOString() : null;
            runAlertAction(alert, { action: 'set_due', dueAt });
          }}
          style={{ fontSize: '11px', fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '7px', padding: '3px 7px', cursor: isBusy ? 'not-allowed' : 'pointer' }}
        >
          Due
        </button>
        <button
          disabled={isBusy}
          onClick={() => {
            const note = window.prompt('Add note:', '');
            if (!note) return;
            runAlertAction(alert, { action: 'note', note });
          }}
          style={{ fontSize: '11px', fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '7px', padding: '3px 7px', cursor: isBusy ? 'not-allowed' : 'pointer' }}
        >
          Note
        </button>
        <button
          onClick={() => loadAlertEvents(alert)}
          style={{ fontSize: '11px', fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '7px', padding: '3px 7px', cursor: 'pointer' }}
        >
          History
        </button>
        <button
          onClick={() => setExplainabilityAlert(alert)}
          style={{ fontSize: '11px', fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '7px', padding: '3px 7px', cursor: 'pointer' }}
        >
          Why
        </button>
      </div>
    );
  };

  const renderSparkline = (points: TrendPoint[], spec: PreviewSpec) => {
    const width = 620;
    const height = 220;
    const padding = 24;
    if (points.length < 2) {
      return (
        <div style={{ fontSize: '13px', color: '#64748b' }}>
          Not enough daily data points for {spec.label} trend.
        </div>
      );
    }

    const values = points.map((p) => p.value);
    const minY = Math.min(...values);
    const maxY = Math.max(...values);
    const yRange = Math.max(1, maxY - minY);

    const xFor = (idx: number) =>
      padding + (idx / Math.max(1, points.length - 1)) * (width - padding * 2);
    const yFor = (value: number) =>
      height - padding - ((value - minY) / yRange) * (height - padding * 2);

    const pathD = points
      .map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${xFor(idx).toFixed(2)} ${yFor(point.value).toFixed(2)}`)
      .join(' ');

    const last = points[points.length - 1];
    const first = points[0];

    return (
      <div>
        <div style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
          {spec.label} (90 days, daily)
        </div>
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${spec.label} trend`}>
          <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" />
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#cbd5e1" />
          <path d={pathD} fill="none" stroke={spec.color} strokeWidth="3" />
          <circle cx={xFor(points.length - 1)} cy={yFor(last.value)} r="4" fill={spec.color} />
        </svg>
        <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
          <span>{first.date}</span>
          <span>{last.date}</span>
        </div>
      </div>
    );
  };

  const formatValue = (value: number, unit: PreviewSpec['unit']) => {
    if (unit === 'percent') return `${value.toFixed(1)}%`;
    if (unit === 'days') return `${value.toFixed(1)} days`;
    if (unit === 'weeks') return `${value.toFixed(1)} weeks`;
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const previewNarrative = useMemo(() => {
    if (!previewSpec || previewTrend.length < 2) return null;
    const latest = previewTrend[previewTrend.length - 1];
    const baseline = previewTrend[Math.max(0, previewTrend.length - 8)];
    const delta = latest.value - baseline.value;
    return {
      latest,
      baseline,
      delta,
      worsened:
        previewSpec.direction === 'neutral'
          ? null
          : previewSpec.direction === 'higher-worse'
            ? delta > 0
            : delta < 0,
    };
  }, [previewSpec, previewTrend]);

  if (loading) return <div style={{ padding: '32px', color: '#475569' }}>Loading daily alerts…</div>;
  if (error) return <div style={{ padding: '32px', color: '#b91c1c' }}>{error}</div>;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <div
        style={{
          marginTop: '4px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          gap: '20px',
          alignItems: 'center',
        }}
      >
        <button
          onClick={() => setActiveTab('alerts')}
          style={{
            fontSize: '17px',
            fontWeight: 600,
            padding: '10px 0',
            border: 'none',
            background: 'none',
            color: activeTab === 'alerts' ? '#2751d0' : '#64748b',
            cursor: 'pointer',
            borderBottom: activeTab === 'alerts' ? '3px solid #2751d0' : '3px solid transparent',
            transition: 'all 0.2s',
          }}
        >
          Alerts
        </button>
        <button
          onClick={() => setActiveTab('policy')}
          style={{
            fontSize: '17px',
            fontWeight: 600,
            padding: '10px 0',
            border: 'none',
            background: 'none',
            color: activeTab === 'policy' ? '#2751d0' : '#64748b',
            cursor: 'pointer',
            borderBottom: activeTab === 'policy' ? '3px solid #2751d0' : '3px solid transparent',
            transition: 'all 0.2s',
          }}
        >
          Policy Settings
        </button>
      </div>

      {activeTab === 'alerts' && (
        <>
          <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: '#7f1d1d', fontWeight: 700, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '999px', padding: '4px 10px' }}>
              Needs Attention: {counts.attention}
            </span>
            <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 700, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '999px', padding: '4px 10px' }}>
              Monitoring: {counts.monitoring}
            </span>
            {readinessItems.length > 0 && (
              <span
                title={readinessItems.map((item) => `${item.label}: ${item.status.toUpperCase()} - ${item.reason}`).join('\n')}
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '999px',
                  padding: '4px 10px',
                  background: readinessSummaryTone.bg,
                  color: readinessSummaryTone.fg,
                  border: `1px solid ${readinessSummaryTone.border}`,
                }}
              >
                Data readiness: {readinessCounts.ready} ready / {readinessCounts.partial} partial / {readinessCounts.missing} missing
              </span>
            )}
          </div>

          <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(320px, 1fr))', gap: '12px' }}>
            {attentionAlerts.length === 0 && monitoringAlerts.length === 0 && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', background: 'white', color: '#475569', gridColumn: '1 / -1' }}>
                No critical day-over-day deteriorations or unresolved critical findings right now.
              </div>
            )}
            {attentionAlerts.map((alert) => (
              <div key={alert.id} style={{ border: '1px solid #fecaca', borderRadius: '10px', padding: '12px', background: '#fff7f7' }}>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div style={{ fontSize: '17px', fontWeight: 700, color: '#7f1d1d', minWidth: 0, overflowWrap: 'anywhere' }}>{alert.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            borderRadius: '999px',
                            padding: '3px 8px',
                            background: statusColor(alert.status).bg,
                            color: statusColor(alert.status).fg,
                            border: `1px solid ${statusColor(alert.status).border}`,
                          }}
                        >
                          {(alert.status || 'new').toUpperCase()}
                        </span>
                        <button
                          onClick={() => onNavigate(alert.drillView)}
                          style={{ fontSize: '13px', fontWeight: 700, color: '#1f70c1', background: 'transparent', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          Open
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: '14px', color: '#334155', marginTop: '2px' }}>{alert.detail}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                      <strong>Owner:</strong> {alert.owner}
                      {alert.itemLabel ? ` | ${alert.itemLabel}` : ''}
                      {alert.deltaText ? ` | ${alert.deltaText}` : ''}
                      {typeof alert.priorityScore === 'number' ? ` | Priority ${alert.priorityScore}` : ''}
                      {alert.dueAt ? ` | Due ${formatDateTime(alert.dueAt)}` : ''}
                      {alert.snoozedUntil ? ` | Snoozed until ${formatDateTime(alert.snoozedUntil)}` : ''}
                    </div>
                    <div style={{ marginTop: '6px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {getPreviewSpecs(alert).map((spec) => (
                        <button
                          key={spec.key}
                          onClick={() => openPreview(alert, spec)}
                          style={{ fontSize: '12px', fontWeight: 700, color: spec.color, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          {spec.label} Trend
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px', alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      {renderLifecycleActions(alert)}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {monitoringAlerts.length > 0 && (
              <div style={{ gridColumn: '1 / -1', marginTop: '4px', fontSize: '13px', fontWeight: 700, color: '#92400e' }}>
                Monitoring
              </div>
            )}
            {monitoringAlerts.map((alert) => (
              <div key={alert.id} style={{ border: '1px solid #fde68a', borderRadius: '10px', padding: '12px', background: '#fffbeb' }}>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#92400e', minWidth: 0, overflowWrap: 'anywhere' }}>{alert.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            borderRadius: '999px',
                            padding: '3px 8px',
                            background: statusColor(alert.status).bg,
                            color: statusColor(alert.status).fg,
                            border: `1px solid ${statusColor(alert.status).border}`,
                          }}
                        >
                          {(alert.status || 'new').toUpperCase()}
                        </span>
                        <button
                          onClick={() => onNavigate(alert.drillView)}
                          style={{ fontSize: '13px', fontWeight: 700, color: '#1f70c1', background: 'transparent', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          Open
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: '14px', color: '#334155', marginTop: '2px' }}>{alert.detail}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                      <strong>Owner:</strong> {alert.owner}
                      {alert.itemLabel ? ` | ${alert.itemLabel}` : ''}
                      {alert.deltaText ? ` | ${alert.deltaText}` : ''}
                      {typeof alert.priorityScore === 'number' ? ` | Priority ${alert.priorityScore}` : ''}
                      {alert.dueAt ? ` | Due ${formatDateTime(alert.dueAt)}` : ''}
                      {alert.snoozedUntil ? ` | Snoozed until ${formatDateTime(alert.snoozedUntil)}` : ''}
                    </div>
                    <div style={{ marginTop: '6px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {getPreviewSpecs(alert).map((spec) => (
                        <button
                          key={spec.key}
                          onClick={() => openPreview(alert, spec)}
                          style={{ fontSize: '12px', fontWeight: 700, color: spec.color, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          {spec.label} Trend
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px', alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      {renderLifecycleActions(alert)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {resolvedAlerts.length > 0 && (
              <>
                <div style={{ gridColumn: '1 / -1', marginTop: '6px', fontSize: '13px', fontWeight: 700, color: '#166534' }}>
                  Resolved
                </div>
                {resolvedAlerts.slice(0, 10).map((alert) => (
                  <div key={alert.id} style={{ border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px', background: '#f0fdf4' }}>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#166534' }}>{alert.title}</div>
                        <div style={{ fontSize: '13px', color: '#334155', marginTop: '2px' }}>{alert.detail}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                          <strong>Owner:</strong> {alert.owner}
                          {alert.modifiedAt ? ` | Updated ${formatDateTime(alert.modifiedAt)}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px', alignItems: 'center' }}>
                        <div style={{ minWidth: 0 }}>
                          {renderLifecycleActions(alert)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {activeTab === 'policy' && (
        <div style={{ marginTop: '14px', border: '1px solid #e2e8f0', borderRadius: '12px', background: 'white', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '13px', color: '#334155' }}>
              Sector defaults: <strong>{sectorLabel}</strong>. Enable override on any row to use company-specific values.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={resetAllPolicyOverrides}
                style={{ fontSize: '12px', fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}
              >
                Reset Overrides
              </button>
              <button
                onClick={savePolicyOverrides}
                disabled={policySaving}
                style={{ fontSize: '12px', fontWeight: 700, color: 'white', background: policySaving ? '#94a3b8' : '#1d4ed8', border: '1px solid #1d4ed8', borderRadius: '8px', padding: '6px 10px', cursor: policySaving ? 'not-allowed' : 'pointer' }}
              >
                {policySaving ? 'Saving...' : 'Save Policies'}
              </button>
            </div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
            <strong>Sector default</strong> is the baseline for your sector. <strong>Active value</strong> is what Pulse is currently using (sector default unless a company override is enabled).
          </div>
          {policyStatus && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: policyStatus.toLowerCase().includes('failed') ? '#b91c1c' : '#166534' }}>
              {policyStatus}
            </div>
          )}

          {policySections.map(({ section, items }) => (
            <div key={section} style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>{section}</div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: policySettingsGridColumns,
                    gap: '10px',
                    padding: '8px 10px',
                    background: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#475569',
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                  }}
                >
                  <div>Policy</div>
                  <div>Sector Default</div>
                  <div>Active Value</div>
                  <div>Override</div>
                  <div>Value</div>
                  <div>Details</div>
                </div>
                {items.map((def, idx) => {
                  const overrideEnabled = hasPolicyOverride(def.key);
                  const sectorValue = sectorPolicyValues[def.key];
                  const effectiveValue = effectivePolicyValues[def.key];
                  return (
                    <div
                      key={def.key}
                      style={{
                        padding: '10px',
                        borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9',
                        background: overrideEnabled ? '#f8fafc' : 'white',
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: policySettingsGridColumns,
                          gap: '10px',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{def.label}</div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{def.description}</div>
                        </div>
                        <div style={{ fontSize: '12px', color: '#334155', fontWeight: 700 }}>
                          {formatPolicyNumber(sectorValue, def.unit)}
                        </div>
                        <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700 }}>
                          {formatPolicyNumber(effectiveValue, def.unit)}
                        </div>
                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155', fontWeight: 700 }}>
                            <input
                              type="checkbox"
                              checked={overrideEnabled}
                              onChange={(e) => setPolicyOverrideEnabled(def.key, e.target.checked)}
                            />
                            Use override
                          </label>
                        </div>
                        <div>
                          <input
                            type="number"
                            value={overrideEnabled ? String(policyOverrides[def.key] ?? sectorValue) : String(sectorValue)}
                            step={def.step}
                            min={def.min}
                            max={def.max}
                            disabled={!overrideEnabled}
                            onChange={(e) => setPolicyOverrideValue(def.key, e.target.value)}
                            style={{
                              width: '84px',
                              maxWidth: '84px',
                              minWidth: 0,
                              fontSize: '12px',
                              padding: '6px 8px',
                              borderRadius: '7px',
                              border: '1px solid #cbd5e1',
                              background: overrideEnabled ? 'white' : '#f8fafc',
                              color: '#0f172a',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <div>
                          <button
                            onClick={() => setPolicyDetailKey(def.key)}
                            style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              color: '#1d4ed8',
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              borderRadius: '7px',
                              padding: '5px 8px',
                              cursor: 'pointer',
                            }}
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {eventModalAlert && (
        <div
          onClick={() => setEventModalAlert(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 2100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(760px, 95vw)',
              maxHeight: '85vh',
              overflowY: 'auto',
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 16px 40px rgba(15, 23, 42, 0.25)',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>Alert History</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{eventModalAlert.title}</div>
              </div>
              <button
                onClick={() => setEventModalAlert(null)}
                style={{ border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
              >
                Close
              </button>
            </div>
            <div style={{ marginTop: '12px' }}>
              {eventsLoading && <div style={{ fontSize: '13px', color: '#475569' }}>Loading history...</div>}
              {!eventsLoading && alertEvents.length === 0 && (
                <div style={{ fontSize: '13px', color: '#64748b' }}>No history available yet.</div>
              )}
              {!eventsLoading &&
                alertEvents.map((event) => (
                  <div key={event.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>
                      {event.eventType}
                      {event.fromStatus || event.toStatus ? ` (${event.fromStatus || 'n/a'} -> ${event.toStatus || 'n/a'})` : ''}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      {formatDateTime(event.createdAt)}{event.actorEmail ? ` | ${event.actorEmail}` : ''}
                    </div>
                    {event.note && (
                      <div style={{ fontSize: '12px', color: '#334155', marginTop: '4px' }}>
                        {event.note}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {explainabilityAlert && (
        <div
          onClick={() => setExplainabilityAlert(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 2150,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(820px, 96vw)',
              maxHeight: '88vh',
              overflowY: 'auto',
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 16px 40px rgba(15, 23, 42, 0.25)',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>Why This Alert Triggered</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '3px' }}>{explainabilityAlert.title}</div>
              </div>
              <button
                onClick={() => setExplainabilityAlert(null)}
                style={{ border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Trigger</div>
                <div style={{ fontSize: '14px', color: '#0f172a', marginTop: '4px' }}>{explainabilityAlert.explainability?.triggerName || explainabilityAlert.title}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Exact Formula</div>
                <div style={{ fontSize: '13px', color: '#1e293b', marginTop: '4px' }}>{explainabilityAlert.explainability?.formula || 'See alert source rule logic.'}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Threshold / Policy Used</div>
                <div style={{ fontSize: '13px', color: '#1e293b', marginTop: '4px' }}>{explainabilityAlert.explainability?.threshold || 'Policy thresholds applied at run time.'}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{explainabilityAlert.explainability?.policySource || 'Company override + sector default fallback'}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Why Now (Delta vs Baseline)</div>
                <div style={{ fontSize: '13px', color: '#1e293b', marginTop: '4px' }}>{explainabilityAlert.explainability?.reasonNow || explainabilityAlert.detail}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Source Records & Time</div>
                <div style={{ fontSize: '13px', color: '#1e293b', marginTop: '4px' }}>
                  {Array.isArray(explainabilityAlert.explainability?.dataRefs) && explainabilityAlert.explainability?.dataRefs?.length
                    ? explainabilityAlert.explainability?.dataRefs.join(' | ')
                    : 'Operational data + findings feeds'}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Source timestamp: {formatDateTime(explainabilityAlert.explainability?.sourceTimestamp || explainabilityAlert.updatedAt)}
                </div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Readiness Status</div>
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      borderRadius: '999px',
                      padding: '3px 8px',
                      background: readinessColor(explainabilityAlert.explainability?.readinessStatus || 'ready').bg,
                      color: readinessColor(explainabilityAlert.explainability?.readinessStatus || 'ready').fg,
                      border: `1px solid ${readinessColor(explainabilityAlert.explainability?.readinessStatus || 'ready').border}`,
                    }}
                  >
                    {(explainabilityAlert.explainability?.readinessStatus || 'ready').toUpperCase()}
                  </span>
                  <span style={{ fontSize: '13px', color: '#1e293b' }}>
                    {explainabilityAlert.explainability?.readinessReason || 'Required data sources available for this alert.'}
                  </span>
                </div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Transition History</div>
                <div style={{ fontSize: '13px', color: '#1f70c1', marginTop: '4px' }}>
                  Use the <strong>History</strong> action on this alert to view the full lifecycle audit trail.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {policyDetailDefinition && (
        <div
          onClick={() => setPolicyDetailKey(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 2170,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(860px, 96vw)',
              maxHeight: '88vh',
              overflowY: 'auto',
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 16px 40px rgba(15, 23, 42, 0.25)',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>Policy Details</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '3px' }}>{policyDetailDefinition.label}</div>
              </div>
              <button
                onClick={() => setPolicyDetailKey(null)}
                style={{ border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>What This Controls</div>
                <div style={{ fontSize: '13px', color: '#1e293b', marginTop: '4px' }}>
                  {buildPolicyExplainer(policyDetailDefinition).what}
                </div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>How Pulse Evaluates It</div>
                <div style={{ fontSize: '13px', color: '#1e293b', marginTop: '4px' }}>
                  {buildPolicyExplainer(policyDetailDefinition).evaluation}
                </div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Sensitivity Impact</div>
                <div style={{ fontSize: '13px', color: '#1e293b', marginTop: '4px' }}>
                  <strong>Higher value:</strong> {buildPolicyExplainer(policyDetailDefinition).higherMeans}
                </div>
                <div style={{ fontSize: '13px', color: '#1e293b', marginTop: '4px' }}>
                  <strong>Lower value:</strong> {buildPolicyExplainer(policyDetailDefinition).lowerMeans}
                </div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Example</div>
                <div style={{ fontSize: '13px', color: '#1e293b', marginTop: '4px' }}>
                  {buildPolicyExplainer(policyDetailDefinition).example}
                </div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Data Notes</div>
                <div style={{ fontSize: '13px', color: '#1e293b', marginTop: '4px' }}>
                  {buildPolicyExplainer(policyDetailDefinition).dataNotes}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewAlert && (
        <div
          onClick={() => setPreviewAlert(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(760px, 95vw)',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 16px 40px rgba(15, 23, 42, 0.25)',
              padding: '18px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
                  {previewSpec ? `${previewSpec.label} Preview` : 'KPI Preview'}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  {previewAlert.title} for <strong>{companyName}</strong>
                </div>
              </div>
              <button
                onClick={() => setPreviewAlert(null)}
                style={{ border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: '14px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
              {previewLoading && <div style={{ fontSize: '13px', color: '#475569' }}>Loading 90-day trend...</div>}
              {!previewLoading && previewError && <div style={{ fontSize: '13px', color: '#b91c1c' }}>{previewError}</div>}
              {!previewLoading && !previewError && previewSpec && renderSparkline(previewTrend, previewSpec)}
            </div>

            {previewSpec && previewNarrative && (
              <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
                <div style={{ fontSize: '14px', color: '#1e293b' }}>
                  <strong>What changed:</strong> {previewSpec.label} is <strong>{formatValue(previewNarrative.latest.value, previewSpec.unit)}</strong> ({previewNarrative.delta >= 0 ? '+' : ''}{formatValue(previewNarrative.delta, previewSpec.unit)} vs {previewNarrative.baseline.date}).
                </div>
                <div style={{ fontSize: '14px', color: '#1e293b' }}>
                  <strong>Why likely:</strong> This follows recent daily movement in the underlying operational data; use Open to inspect customer/vendor/account level drivers.
                </div>
                <div style={{ fontSize: '14px', color: '#1e293b' }}>
                  <strong>So what:</strong> {previewNarrative.worsened === null
                    ? 'Track this metric with related issues to confirm whether it is becoming material.'
                    : previewNarrative.worsened
                      ? 'Direction is worsening relative to the trailing week and may require action.'
                      : 'Direction is improving relative to the trailing week.'}
                </div>
              </div>
            )}

            <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Data freshness: {previewTrend.length > 0 ? previewTrend[previewTrend.length - 1].date : 'n/a'}
              </div>
              <button
                onClick={() => onNavigate(previewAlert.drillView)}
                style={{ fontSize: '13px', fontWeight: 700, color: '#1f70c1', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                Open Full Drilldown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

