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

const RESOLVED_STATUSES = new Set(['resolved', 'realized', 'closed', 'done', 'complete', 'completed']);
const OPERATIONAL_FOCUS_KEY = '__focusWatchlist';
type PulseTab = 'alerts' | 'policy';

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
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [selectedOwnerByAlert, setSelectedOwnerByAlert] = useState<Record<string, string>>({});
  const [transitionLoadingId, setTransitionLoadingId] = useState<string | null>(null);
  const [eventModalAlert, setEventModalAlert] = useState<AlertItem | null>(null);
  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
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
        start.setDate(start.getDate() - 7);
        const startDate = start.toISOString().split('T')[0];
        const endDate = end.toISOString().split('T')[0];

        const fetchOps = async (type: 'ar-aging' | 'ap-aging' | 'cash') => {
          const params = new URLSearchParams({
            companyId,
            type,
            frequency: 'daily',
            startDate,
            endDate,
          });
          const response = await fetch(`/api/operational-data?${params}`);
          if (!response.ok) throw new Error(`Failed to load ${type} data`);
          return response.json();
        };

        const fetchFindings = async () => {
          const params = new URLSearchParams({
            companyId,
            severity: 'critical',
            limit: '100',
          });
          const response = await fetch(`/api/performance-analytics/findings?${params}`);
          if (!response.ok) throw new Error('Failed to load findings');
          return response.json();
        };

        const fetchOperationalGoals = async () => {
          const params = new URLSearchParams({ companyId });
          const response = await fetch(`/api/operational-goals?${params}`);
          if (!response.ok) return { goals: {} };
          return response.json();
        };

        const fetchCompanyMeta = async () => {
          const params = new URLSearchParams({ companyId, limit: '1' });
          const response = await fetch(`/api/companies?${params}`);
          if (!response.ok) return { companies: [] };
          return response.json();
        };

        const [arData, apData, cashData, findingsData, operationalGoalsData, companyMetaData] = await Promise.all([
          fetchOps('ar-aging'),
          fetchOps('ap-aging'),
          fetchOps('cash'),
          fetchFindings(),
          fetchOperationalGoals(),
          fetchCompanyMeta(),
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
          const topCustomer = (Array.isArray(arData?.summary?.unpaidByCustomer) ? arData.summary.unpaidByCustomer : [])
            .map((row: any) => ({
              customerName: row.customerName,
              overdue: asNumber(row.days31to60) + asNumber(row.days61to90) + asNumber(row.days90plus),
            }))
            .sort((a: any, b: any) => b.overdue - a.overdue)[0];
          if (
            latestOver30 >= pulsePolicy['ar_daily_change.min_over30_pct'] &&
            deltaPts >= pulsePolicy['ar_daily_change.min_delta_pts']
          ) {
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
              itemLabel: topCustomer?.customerName || undefined,
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
        const totalCash = asNumber(cashSummary.totalCash);
        const burnProxy = Math.max(1, Math.abs(asNumber(cashSummary.changeAmount)));
        const runwayWeeks = (totalCash / burnProxy) * 4.33;

        if (
          arOver30 >= pulsePolicy['ar_open_critical.min_over30_pct'] ||
          dso >= pulsePolicy['ar_open_critical.min_dso_days']
        ) {
          built.push({
            id: `open-critical-ar-${endDate}`,
            fingerprint: 'open-critical-ar',
            source: 'open-critical',
            title: 'Outstanding Critical: AR Quality',
            detail: `AR >30d ${arOver30.toFixed(1)}% | DSO ${dso.toFixed(1)} days remains at critical levels`,
            owner: 'Collections Lead',
            drillView: 'pa-critical-issues',
            updatedAt: endDate,
          });
        }
        if (apOver30 >= pulsePolicy['ap_open_critical.min_over30_pct']) {
          built.push({
            id: `open-critical-ap-${endDate}`,
            fingerprint: 'open-critical-ap',
            source: 'open-critical',
            title: 'Outstanding Critical: AP Pressure',
            detail: `AP >30d ${apOver30.toFixed(1)}% remains in critical range`,
            owner: 'AP Manager',
            drillView: 'pa-critical-issues',
            updatedAt: endDate,
          });
        }
        if (
          cashChangePct <= pulsePolicy['cash_open_critical.max_change_pct'] ||
          runwayWeeks < pulsePolicy['cash_open_critical.min_runway_weeks']
        ) {
          built.push({
            id: `open-critical-cash-${endDate}`,
            fingerprint: 'open-critical-cash',
            source: 'open-critical',
            title: 'Outstanding Critical: Cash Risk',
            detail: `Cash change ${cashChangePct.toFixed(1)}% | Runway ~${runwayWeeks.toFixed(1)} weeks`,
            owner: 'Controller',
            drillView: 'pa-critical-issues',
            updatedAt: endDate,
          });
        }

        const findings = Array.isArray(findingsData?.findings) ? findingsData.findings : [];
        findings
          .filter((finding: any) => {
            const status = String(finding?.payload?.status || '').trim().toLowerCase();
            return !status || !RESOLVED_STATUSES.has(status);
          })
          .slice(0, 25)
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
            });
          });

        priorityFocusTerms.slice(0, 10).forEach((term) => {
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
        const visibleScored = scored.filter(
          (alert) => asNumber(alert.priorityScore) >= pulsePolicy['bucket.monitoring_min_score']
        );

        visibleScored.sort((a, b) => {
          const scoreDiff = asNumber(b.priorityScore) - asNumber(a.priorityScore);
          if (scoreDiff !== 0) return scoreDiff;
          if (a.source !== b.source) return sourceRank[b.source] - sourceRank[a.source];
          return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
        });

        let persistedAlerts: AlertItem[] = visibleScored;
        try {
          const syncResponse = await fetch('/api/pulse/alerts', {
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
          setAlerts(persistedAlerts);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load daily alerts');
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
        const response = await fetch(`/api/users?${params}`);
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
      const response = await fetch(`/api/pulse/alerts/${encodeURIComponent(alert.id)}/events?${params}`);
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
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    });
    const response = await fetch(`/api/operational-data?${params}`);
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

    // cash-runway-weeks
    return totals.map((row, idx) => {
      if (idx === 0) return { date: row.date, value: 0 };
      const prev = totals[idx - 1].value;
      const change = row.value - prev;
      const burnProxy = Math.max(1, Math.abs(change));
      return {
        date: row.date,
        value: (row.value / burnProxy) * 4.33,
      };
    });
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
        label: 'DSO',
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
            Resolve
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
            color: activeTab === 'alerts' ? '#667eea' : '#64748b',
            cursor: 'pointer',
            borderBottom: activeTab === 'alerts' ? '3px solid #667eea' : '3px solid transparent',
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
            color: activeTab === 'policy' ? '#667eea' : '#64748b',
            cursor: 'pointer',
            borderBottom: activeTab === 'policy' ? '3px solid #667eea' : '3px solid transparent',
            transition: 'all 0.2s',
          }}
        >
          Policy Settings
        </button>
      </div>

      {activeTab === 'alerts' && (
        <>
          <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#7f1d1d', fontWeight: 700, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '999px', padding: '4px 10px' }}>
              Needs Attention: {counts.attention}
            </span>
            <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 700, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '999px', padding: '4px 10px' }}>
              Monitoring: {counts.monitoring}
            </span>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                      <div style={{ fontSize: '17px', fontWeight: 700, color: '#7f1d1d' }}>{alert.title}</div>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          borderRadius: '999px',
                          padding: '3px 8px',
                          background: statusColor(alert.status).bg,
                          color: statusColor(alert.status).fg,
                          border: `1px solid ${statusColor(alert.status).border}`,
                          flexShrink: 0,
                        }}
                      >
                        {(alert.status || 'new').toUpperCase()}
                      </span>
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
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                    {renderLifecycleActions(alert)}
                    <button
                      onClick={() => onNavigate(alert.drillView)}
                      style={{ fontSize: '13px', fontWeight: 700, color: '#1f70c1', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                    >
                      Open
                    </button>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#92400e' }}>{alert.title}</div>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          borderRadius: '999px',
                          padding: '3px 8px',
                          background: statusColor(alert.status).bg,
                          color: statusColor(alert.status).fg,
                          border: `1px solid ${statusColor(alert.status).border}`,
                          flexShrink: 0,
                        }}
                      >
                        {(alert.status || 'new').toUpperCase()}
                      </span>
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
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                    {renderLifecycleActions(alert)}
                    <button
                      onClick={() => onNavigate(alert.drillView)}
                      style={{ fontSize: '13px', fontWeight: 700, color: '#1f70c1', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                    >
                      Open
                    </button>
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
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                        {renderLifecycleActions(alert)}
                        <button
                          onClick={() => onNavigate(alert.drillView)}
                          style={{ fontSize: '13px', fontWeight: 700, color: '#1f70c1', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                        >
                          Open
                        </button>
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
                    gridTemplateColumns: 'minmax(260px, 1.4fr) minmax(110px, 0.7fr) minmax(110px, 0.7fr) minmax(100px, 0.6fr) minmax(74px, 86px)',
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
                          gridTemplateColumns: 'minmax(260px, 1.4fr) minmax(110px, 0.7fr) minmax(110px, 0.7fr) minmax(100px, 0.6fr) minmax(74px, 86px)',
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

