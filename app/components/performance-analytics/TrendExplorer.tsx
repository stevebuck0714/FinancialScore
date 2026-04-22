'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { LineChart } from '../charts/Charts';
import { getBenchmarkValue } from '../../utils/data-processing';

type BenchmarkItem = {
   metricName: string;
   fiveYearValue: number | null;
 };
 
type Finding = {
  id: string;
  type: 'trend' | 'anomaly' | 'driver' | 'focus' | 'opportunity';
  metric?: string | null;
  severity?: string | null;
  confidence?: number | null;
  payload?: any;
  updatedAt?: string;
};

 type ContextResponse = {
   benchmarks: {
     items?: BenchmarkItem[];
   };
   goals: {
     expense: Record<string, any>;
     operational: Record<string, any>;
   };
   data: {
     monthlyFinancials: Array<any>;
   };
   meta?: {
     trendSource?: 'dfs' | 'monthly';
     trendWindow?: { start?: string; end?: string };
     dfs?: { daysCovered?: number; firstSnapshot?: string; lastSnapshot?: string } | null;
     monthlyFinancialRecordId?: string | null;
   };
 };
 
 interface TrendExplorerProps {
   companyId: string;
 }
 
const formatCurrency = (value: number) => `$${(value / 1000).toFixed(0)}k`;
const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const formatRatio = (value: number) => `${value.toFixed(2)}x`;

// Equity values smaller than this magnitude are treated as "near zero" for the
// debt-to-equity ratio (denominator unsafe). Renders the point as a gap.
const EQUITY_NEAR_ZERO_THRESHOLD = 1000;
 
 export default function TrendExplorer({ companyId }: TrendExplorerProps) {
   const [context, setContext] = useState<ContextResponse | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
  const [monthsWindow, setMonthsWindow] = useState(24);
 
   useEffect(() => {
     let isMounted = true;
    const loadContext = async () => {
       setLoading(true);
       setError(null);
       try {
        const response = await fetch(`/api/performance-analytics/context?companyId=${companyId}&months=${monthsWindow}`);
         if (!response.ok) {
           let message = 'Failed to load trend explorer';
           try {
             const payload = await response.json();
             if (payload?.error) {
               message = payload.error;
               if (payload.details) message += ` (${payload.details})`;
             }
           } catch {
             // ignore parse errors
           }
           message += ` [${response.status}]`;
           throw new Error(message);
         }
         const data = await response.json();
         if (isMounted) setContext(data);
       } catch (err: any) {
         if (isMounted) setError(err.message || 'Failed to load trend explorer');
       } finally {
         if (isMounted) setLoading(false);
       }
     };

    const loadFindings = async () => {
      try {
        const response = await fetch(`/api/performance-analytics/findings?companyId=${companyId}`);
        if (!response.ok) return;
        const data = await response.json();
        if (isMounted) setFindings(data.findings || []);
      } catch {
        // findings are optional for rendering
      }
    };
 
     if (companyId) {
      loadContext();
      loadFindings();
     }
 
     return () => {
       isMounted = false;
     };
  }, [companyId, monthsWindow]);
 
   const monthly = useMemo(() => {
     if (!context?.data?.monthlyFinancials) return [];
    const byMonth = new Map<string, any>();
    for (const m of context.data.monthlyFinancials) {
      if (!m?.monthDate) continue;
      const date = new Date(m.monthDate);
      if (Number.isNaN(date.getTime())) continue;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      // Keep latest row for month if duplicates ever appear.
      byMonth.set(monthKey, m);
    }

    const rows = Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([monthKey, m]) => ({
        month: monthKey,
        revenue: m.revenue || 0,
        cogsTotal: m.cogsTotal || 0,
        expense: m.expense || 0,
        operatingExpenseTotal: m.operatingExpenseTotal || 0,
        payroll: m.payroll || 0,
        ownerBasePay: m.ownerBasePay || 0,
        benefits: m.benefits || 0,
        insurance: m.insurance || 0,
        professionalFees: m.professionalFees || 0,
        subcontractors: m.subcontractors || 0,
        rent: m.rent || 0,
        taxLicense: m.taxLicense || 0,
        phoneComm: m.phoneComm || 0,
        infrastructure: m.infrastructure || 0,
        autoTravel: m.autoTravel || 0,
        salesExpense: m.salesExpense || 0,
        marketing: m.marketing || 0,
        trainingCert: m.trainingCert || 0,
        mealsEntertainment: m.mealsEntertainment || 0,
        otherExpense: m.otherExpense || 0,
        cash: m.cash || 0,
        ar: m.ar || 0,
        inventory: m.inventory || 0,
        ap: m.ap || 0,
        tca: m.tca || 0,
        tcl: m.tcl || 0,
        loc: m.loc || 0,
        ltd: m.ltd || 0,
        totalEquity: m.totalEquity || 0,
      }));

    const isMeaningfulMonth = (row: any) => {
      const keys = ['revenue', 'cogsTotal', 'expense', 'cash', 'ar', 'inventory'];
      return keys.some((k) => Math.abs(Number(row?.[k] || 0)) > 0.0001);
    };

    const firstMeaningfulIdx = rows.findIndex(isMeaningfulMonth);
    if (firstMeaningfulIdx <= 0) return rows;
    return rows.slice(firstMeaningfulIdx);
   }, [context]);

  const pnlMonthly = useMemo(() => {
    if (!monthly.length) return monthly;
    const firstPnlIdx = monthly.findIndex((m: any) => {
      return (
        Math.abs(Number(m.revenue || 0)) > 0.0001 ||
        Math.abs(Number(m.cogsTotal || 0)) > 0.0001 ||
        Math.abs(Number(m.expense || 0)) > 0.0001
      );
    });
    if (firstPnlIdx <= 0) return monthly;
    return monthly.slice(firstPnlIdx);
  }, [monthly]);
 
   const grossMarginData = useMemo(() => {
    return pnlMonthly.map((m: any) => ({
       month: m.month,
      value: m.revenue > 0.0001 ? ((m.revenue - m.cogsTotal) / m.revenue) * 100 : null,
     }));
  }, [pnlMonthly]);
 
  const getOperatingExpenseTotal = (m: any) => {
    const computed =
      (m.payroll || 0) +
      (m.ownerBasePay || 0) +
      (m.benefits || 0) +
      (m.insurance || 0) +
      (m.professionalFees || 0) +
      (m.subcontractors || 0) +
      (m.rent || 0) +
      (m.taxLicense || 0) +
      (m.phoneComm || 0) +
      (m.infrastructure || 0) +
      (m.autoTravel || 0) +
      (m.salesExpense || 0) +
      (m.marketing || 0) +
      (m.trainingCert || 0) +
      (m.mealsEntertainment || 0) +
      (m.otherExpense || 0);
    return computed !== 0 ? computed : (m.operatingExpenseTotal || m.expense || 0);
  };

  const operatingExpensePctData = useMemo(() => {
    return pnlMonthly.map((m: any) => ({
      month: m.month,
      value: m.revenue > 0.0001 ? (getOperatingExpenseTotal(m) / m.revenue) * 100 : null,
    }));
  }, [pnlMonthly]);

  const apData = useMemo(() => {
    return monthly.map((m: any) => ({ month: m.month, value: m.ap }));
  }, [monthly]);

  const workingCapitalData = useMemo(() => {
    return monthly.map((m: any) => ({
      month: m.month,
      value: (Number(m.tca) || 0) - (Number(m.tcl) || 0),
    }));
  }, [monthly]);

  // Definition A: interest-bearing debt (LOC + LTD) divided by total equity.
  // Renders a null gap for months where |totalEquity| is below the
  // near-zero threshold, so the chart doesn't spike to infinity.
  const debtToEquityData = useMemo(() => {
    return monthly.map((m: any) => {
      const equity = Number(m.totalEquity) || 0;
      const debt = (Number(m.loc) || 0) + (Number(m.ltd) || 0);
      const value =
        Math.abs(equity) >= EQUITY_NEAR_ZERO_THRESHOLD ? debt / equity : null;
      return { month: m.month, value };
    });
  }, [monthly]);

  const debtToEquityHasGaps = useMemo(
    () => debtToEquityData.some((d: any) => d.value === null),
    [debtToEquityData]
  );

  const trendMonthly = pnlMonthly.length ? pnlMonthly : monthly;
 
   const benchmarks = context?.benchmarks?.items || [];
   const grossMarginBenchmark = getBenchmarkValue(benchmarks as any, 'Gross Margin');
  const debtToEquityBenchmark = getBenchmarkValue(benchmarks as any, 'Debt to Equity');
 
   const operationalGoals = context?.goals?.operational || {};
   const cashGoal = operationalGoals.total_cash ? monthly.map(() => operationalGoals.total_cash) : undefined;
   const arGoal = operationalGoals.total_ar ? monthly.map(() => operationalGoals.total_ar) : undefined;
   const inventoryGoal = operationalGoals.inventory_value ? monthly.map(() => operationalGoals.inventory_value) : undefined;

  const driverNarrative = useMemo(() => {
    if (trendMonthly.length < 6) return null;
    const prior = trendMonthly.slice(-6, -3);
    const recent = trendMonthly.slice(-3);
    const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / (values.length || 1);

    const priorRevenue = avg(prior.map((m: any) => m.revenue || 0));
    const recentRevenue = avg(recent.map((m: any) => m.revenue || 0));
    const priorCogs = avg(prior.map((m: any) => m.cogsTotal || 0));
    const recentCogs = avg(recent.map((m: any) => m.cogsTotal || 0));
    const priorExpense = avg(prior.map((m: any) => getOperatingExpenseTotal(m)));
    const recentExpense = avg(recent.map((m: any) => getOperatingExpenseTotal(m)));

    const priorNet = priorRevenue - priorCogs - priorExpense;
    const recentNet = recentRevenue - recentCogs - recentExpense;
    const netDelta = recentNet - priorNet;

    const revenueImpact = recentRevenue - priorRevenue;
    const cogsImpact = -(recentCogs - priorCogs);
    const expenseImpact = -(recentExpense - priorExpense);

    const drivers = [
      { name: 'Revenue', impact: revenueImpact },
      { name: 'COGS', impact: cogsImpact },
      { name: 'Operating Expense', impact: expenseImpact },
    ].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

    if (!netDelta || !Number.isFinite(netDelta)) return null;

    const top = drivers[0];
    const second = drivers[1];
    const direction = netDelta > 0 ? 'up' : 'down';
    const formatDollar = (value: number) => `$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

    return {
      summary: `Net income is ${direction} ${formatDollar(netDelta)} vs prior baseline. Primary driver: ${top.name} (${top.impact >= 0 ? '+' : '-'}${formatDollar(top.impact)}). Secondary: ${second.name} (${second.impact >= 0 ? '+' : '-'}${formatDollar(second.impact)}).`,
      driverMap: {
        Revenue: top.name === 'Revenue' || second.name === 'Revenue',
        'Operating Expense': top.name === 'Operating Expense' || second.name === 'Operating Expense',
        COGS: top.name === 'COGS' || second.name === 'COGS',
      },
    };
  }, [trendMonthly]);

  const grossMarginPeerNarrative = useMemo(() => {
    if (grossMarginBenchmark == null || grossMarginData.length === 0) return null;
    const latest = grossMarginData[grossMarginData.length - 1]?.value ?? 0;
    const delta = latest - grossMarginBenchmark;
    const direction = delta >= 0 ? 'above' : 'below';
    return `Gross margin is ${Math.abs(delta).toFixed(1)} pts ${direction} Industry Group peer benchmark.`;
  }, [grossMarginBenchmark, grossMarginData]);

  const chartSoWhat = useMemo(() => {
    if (trendMonthly.length < 6) return {};
    const prior = trendMonthly.slice(-6, -3);
    const recent = trendMonthly.slice(-3);
    const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
    const formatDollar = (value: number) => `$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

    const priorRevenue = avg(prior.map((m: any) => m.revenue || 0));
    const recentRevenue = avg(recent.map((m: any) => m.revenue || 0));
    const revenueDelta = recentRevenue - priorRevenue;
    const revenueChangePct = priorRevenue ? revenueDelta / Math.abs(priorRevenue) : 0;

    const priorExpense = avg(prior.map((m: any) => getOperatingExpenseTotal(m)));
    const recentExpense = avg(recent.map((m: any) => getOperatingExpenseTotal(m)));
    const expenseDelta = recentExpense - priorExpense;
    const priorExpensePct = avg(prior.map((m: any) => (m.revenue ? (getOperatingExpenseTotal(m) / m.revenue) * 100 : 0)));
    const recentExpensePct = avg(recent.map((m: any) => (m.revenue ? (getOperatingExpenseTotal(m) / m.revenue) * 100 : 0)));
    const expensePctDelta = recentExpensePct - priorExpensePct;

    const priorGrossMargin = avg(prior.map((m: any) => (m.revenue ? ((m.revenue - (m.cogsTotal || 0)) / m.revenue) * 100 : 0)));
    const recentGrossMargin = avg(recent.map((m: any) => (m.revenue ? ((m.revenue - (m.cogsTotal || 0)) / m.revenue) * 100 : 0)));
    const grossMarginDelta = recentGrossMargin - priorGrossMargin;

    const priorCash = avg(prior.map((m: any) => m.cash || 0));
    const recentCash = avg(recent.map((m: any) => m.cash || 0));
    const cashDelta = recentCash - priorCash;

    const priorAR = avg(prior.map((m: any) => m.ar || 0));
    const recentAR = avg(recent.map((m: any) => m.ar || 0));
    const arDelta = recentAR - priorAR;

    const priorInventory = avg(prior.map((m: any) => m.inventory || 0));
    const recentInventory = avg(recent.map((m: any) => m.inventory || 0));
    const inventoryDelta = recentInventory - priorInventory;

    const priorDSO = priorRevenue ? (priorAR / priorRevenue) * 30 : 0;
    const recentDSO = recentRevenue ? (recentAR / recentRevenue) * 30 : 0;
    const dsoDelta = recentDSO - priorDSO;

    const soWhat: Record<string, string> = {
      Revenue: revenueDelta
        ? `Revenue ${revenueDelta > 0 ? 'rose' : 'fell'} ${formatDollar(revenueDelta)} (${formatPercent(revenueChangePct)} vs prior baseline).`
        : 'Revenue is flat vs the prior baseline.',
      'Operating Expense': expensePctDelta
        ? `Operating expense % ${expensePctDelta > 0 ? 'increased' : 'decreased'} ${Math.abs(expensePctDelta).toFixed(1)} pts (from ${priorExpensePct.toFixed(1)}% to ${recentExpensePct.toFixed(1)}%). Total operating expense dollars ${expenseDelta > 0 ? 'rose' : 'fell'} ${formatDollar(expenseDelta)}.`
        : `Operating expense % is flat vs the prior baseline (~${recentExpensePct.toFixed(1)}%). Total operating expense dollars are ${expenseDelta > 0 ? 'up' : expenseDelta < 0 ? 'down' : 'flat'} ${formatDollar(expenseDelta)}.`,
      'Gross Margin': grossMarginDelta
        ? `Gross margin ${grossMarginDelta > 0 ? 'improved' : 'compressed'} ${Math.abs(grossMarginDelta).toFixed(1)} pts.`
        : 'Gross margin is flat vs the prior baseline.',
      'Cash Balance': cashDelta
        ? `Cash ${cashDelta > 0 ? 'increased' : 'declined'} ${formatDollar(cashDelta)} vs prior baseline.`
        : 'Cash levels are steady vs the prior baseline.',
      'Total AR': arDelta
        ? `AR ${arDelta > 0 ? 'grew' : 'declined'} ${formatDollar(arDelta)}; DSO ${dsoDelta > 0 ? 'worsened' : 'improved'} ${Math.abs(dsoDelta).toFixed(1)} days.`
        : 'AR levels are steady vs the prior baseline.',
      Inventory: inventoryDelta
        ? `Inventory ${inventoryDelta > 0 ? 'rose' : 'fell'} ${formatDollar(inventoryDelta)} vs prior baseline.`
        : 'Inventory is steady vs the prior baseline.',
    };

    if (arDelta > 0 && revenueDelta <= 0) {
      soWhat['Total AR'] += ' This suggests slower collections rather than growth-driven AR.';
    } else if (arDelta > 0 && revenueDelta > 0) {
      soWhat['Total AR'] += ' This may be driven by sales growth; monitor collection speed.';
    }

    return soWhat;
  }, [trendMonthly]);

  const priorityVarianceMetrics = useMemo(() => {
    return new Set(findings.filter((f) => f.type === 'trend' && f.metric).map((f) => f.metric as string));
  }, [findings]);

  const topMoves = useMemo(() => {
    const trendFindings = findings.filter((f) => f.type === 'trend');
    return trendFindings.slice(0, 3);
  }, [findings]);

  const chartNarratives = useMemo(() => {
    const narratives: Record<string, string> = {};
    findings.forEach((finding) => {
      if (!finding.metric || !finding.payload?.summary) return;
      if (!narratives[finding.metric]) {
        narratives[finding.metric] = finding.payload.summary;
      }
    });
    return narratives;
  }, [findings]);

  const chartRationales = useMemo(() => {
    const rationales: Record<string, string[]> = {};
    const addReason = (metric: string, reason: string) => {
      if (!rationales[metric]) rationales[metric] = [];
      if (!rationales[metric].includes(reason)) rationales[metric].push(reason);
    };

    const trendFindings = findings.filter((f) => f.type === 'trend');
    const anomalyFindings = findings.filter((f) => f.type === 'anomaly');
    const driverFindings = findings.filter((f) => f.type === 'driver');
    const focusFindings = findings.filter((f) => f.type === 'focus');

    trendFindings.forEach((finding) => {
      if (!finding.metric) return;
      addReason(finding.metric, 'Flagged as a priority variance due to recent baseline shifts.');
      if (finding.payload?.onsetDate) {
        addReason(
          finding.metric,
          `Change onset detected near ${new Date(finding.payload.onsetDate).toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
          })}.`
        );
      }
    });

    anomalyFindings.forEach((finding) => {
      if (!finding.metric) return;
      addReason(finding.metric, 'An anomaly was detected in recent periods.');
    });

    driverFindings.forEach((finding) => {
      if (finding.metric === 'Net Income') {
        addReason('Revenue', 'Identified as a driver of recent net income movement.');
        addReason('Operating Expense', 'Identified as a driver of recent net income movement.');
      }
    });

    focusFindings.forEach((finding) => {
      if (!finding.metric) return;
      addReason(finding.metric, 'Focus score elevated due to peer or plan variance.');
    });

    if (cashGoal) addReason('Cash Balance', 'Tracked against operational goal.');
    if (arGoal) addReason('Total AR', 'Tracked against operational goal.');
    if (inventoryGoal) addReason('Inventory', 'Tracked against operational goal.');

    if (grossMarginBenchmark != null) {
      addReason('Gross Margin', 'Benchmarked against Industry Group peers.');
    }

    return rationales;
  }, [findings, cashGoal, arGoal, inventoryGoal, grossMarginBenchmark]);

  const renderRationale = (metric: string, fallback: string) => {
    const reasons = chartRationales[metric] || [];
    const isPriority = priorityVarianceMetrics.has(metric);
    return (
        <div style={{ marginBottom: '6px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>Why this chart</div>
        <div style={{ marginTop: '4px', fontSize: '12px', fontWeight: 600, color: isPriority ? '#1d4ed8' : '#475569' }}>
          {isPriority ? 'Role: Priority Variance' : 'Role: Context / Driver'}
        </div>
        {reasons.length > 0 ? (
          <div style={{ marginTop: '4px', fontSize: '13px', color: '#334155' }}>
            {reasons.slice(0, 3).join(' ')}
          </div>
        ) : (
          <div style={{ marginTop: '4px', fontSize: '13px', color: '#334155' }}>{fallback}</div>
        )}
        {metric === 'Gross Margin' && grossMarginPeerNarrative && (
          <div style={{ marginTop: '6px', fontSize: '13px', color: '#334155' }}>
            {grossMarginPeerNarrative}
          </div>
        )}
        {driverNarrative?.driverMap?.[metric as keyof typeof driverNarrative.driverMap] && (
          <div style={{ marginTop: '6px', fontSize: '13px', color: '#334155' }}>
            {driverNarrative.summary}
          </div>
        )}
        {chartSoWhat[metric] && (
          <div style={{ marginTop: '6px', fontSize: '13px', color: '#334155' }}>
            {chartSoWhat[metric]}
          </div>
        )}
        {chartNarratives[metric] && (
          <div style={{ marginTop: '6px', fontSize: '13px', color: '#64748b' }}>
            {chartNarratives[metric]}
          </div>
        )}
      </div>
    );
  };
 
   if (loading) {
     return <div style={{ padding: '32px', color: '#475569' }}>Loading trend explorer…</div>;
   }
 
   if (error) {
     return <div style={{ padding: '32px', color: '#b91c1c' }}>{error}</div>;
   }
 
   return (
     <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Trend Explorer</h1>

      {context?.meta?.trendSource && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
          Source:{' '}
          <span style={{ fontWeight: 600, color: context.meta.trendSource === 'dfs' ? '#0f766e' : '#475569' }}>
            {context.meta.trendSource === 'dfs' ? 'Daily GL (live)' : 'Monthly Financials'}
          </span>
          {context.meta.trendSource === 'dfs' && context.meta.dfs?.lastSnapshot && (
            <>
              {' · '}
              Through {new Date(context.meta.dfs.lastSnapshot).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ padding: '12px 14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Why These Charts
          </div>
          <div style={{ marginTop: '6px', fontSize: '14px', color: '#334155' }}>
            We prioritize charts with meaningful baseline shifts, clear deviation from goals, or material peer gaps. If a chart appears here,
            it either explains a significant movement, represents a core value driver, or highlights operational risk or opportunity.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Window</label>
          <select
            value={monthsWindow}
            onChange={(e) => setMonthsWindow(parseInt(e.target.value, 10))}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#1e293b' }}
          >
            <option value={12}>Last 12 months</option>
            <option value={24}>Last 24 months</option>
            <option value={36}>Last 36 months</option>
          </select>
        </div>
      </div>
 
      {topMoves.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>Priority Variances</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            {topMoves.map((move) => (
              <div key={move.id} style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                  {move.metric || move.payload?.title || 'Trend Move'}
                </div>
                <div style={{ fontSize: '13px', color: '#334155', marginTop: '6px' }}>
                  {move.payload?.summary || 'No summary available yet.'}
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                  Confidence: {move.confidence != null ? Math.round(move.confidence * 100) + '%' : '—'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '10px', fontSize: '13px', color: '#334155' }}>
            These are the Priority Variances. Charts marked “Context / Driver” below explain what’s causing them.
          </div>
        </div>
      )}

      <div style={{ marginTop: '24px' }}>
         <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>Financial Trends</h2>
         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))', gap: '18px' }}>
          <div>
            {renderRationale('Revenue', 'Revenue is a top-line indicator and anchors most variance analysis.')}
            <LineChart
              title="Revenue"
              data={pnlMonthly.map((m: any) => ({ month: m.month, value: m.revenue }))}
              color="#667eea"
              compact
              labelFormat="m-yy-adaptive"
              formatter={formatCurrency}
            />
          </div>
          <div>
            {renderRationale('Gross Margin', 'Gross margin highlights pricing and cost structure vs peers.')}
            <LineChart
              title="Gross Margin %"
              data={grossMarginData}
              color="#16a34a"
              compact
              labelFormat="m-yy-adaptive"
              formatter={formatPercent}
              benchmarkValue={grossMarginBenchmark}
            />
          </div>
          <div>
            {renderRationale(
              'Operating Expense',
              'Operating expense % is total operating expenses (payroll, rent, etc.) divided by revenue. It shows how cost discipline is tracking relative to sales.'
            )}
            <LineChart
              title="Total Operating Expense % of Revenue"
              data={operatingExpensePctData}
              color="#ef4444"
              compact
              labelFormat="m-yy-adaptive"
              formatter={formatPercent}
            />
          </div>
         </div>
       </div>
 
       <div style={{ marginTop: '32px' }}>
         <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>Operational Trends</h2>
         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))', gap: '18px' }}>
          <div>
            {renderRationale('Cash Balance', 'Cash balance indicates liquidity and runway risk.')}
            <LineChart
              title="Cash Balance"
              data={monthly.map((m: any) => ({ month: m.month, value: m.cash }))}
              color="#10b981"
              compact
              labelFormat="m-yy-adaptive"
              formatter={formatCurrency}
              goalLineData={cashGoal}
            />
          </div>
          <div>
            {renderRationale('Total AR', 'Receivables track collection health and cash conversion.')}
            <LineChart
              title="Accounts Receivable"
              data={monthly.map((m: any) => ({ month: m.month, value: m.ar }))}
              color="#f59e0b"
              compact
              labelFormat="m-yy-adaptive"
              formatter={formatCurrency}
              goalLineData={arGoal}
            />
          </div>
          <div>
            {renderRationale('Inventory', 'Inventory levels highlight working capital and demand alignment.')}
            <LineChart
              title="Inventory"
              data={monthly.map((m: any) => ({ month: m.month, value: m.inventory }))}
              color="#6366f1"
              compact
              labelFormat="m-yy-adaptive"
              formatter={formatCurrency}
              goalLineData={inventoryGoal}
            />
          </div>
          <div>
            {renderRationale(
              'Accounts Payable',
              'Accounts payable balance tracks vendor obligations and short-term funding from suppliers.'
            )}
            <LineChart
              title="Accounts Payable"
              data={apData}
              color="#a855f7"
              compact
              labelFormat="m-yy-adaptive"
              formatter={formatCurrency}
            />
          </div>
          <div>
            {renderRationale(
              'Working Capital',
              'Working capital (current assets minus current liabilities) measures short-term liquidity headroom. Negative values indicate reliance on supplier financing or revolver credit.'
            )}
            <LineChart
              title="Working Capital (Current Assets − Current Liabilities)"
              data={workingCapitalData}
              color="#0ea5e9"
              compact
              labelFormat="m-yy-adaptive"
              formatter={formatCurrency}
            />
          </div>
          <div>
            {renderRationale(
              'Debt to Equity',
              'Interest-bearing debt (LOC + LTD) divided by total equity. Bank-style leverage view; excludes operating liabilities like AP. Months where equity is near zero are shown as gaps to avoid misleading spikes.'
            )}
            <LineChart
              title="Debt / Equity (Interest-Bearing)"
              data={debtToEquityData}
              color="#dc2626"
              compact
              labelFormat="m-yy-adaptive"
              formatter={formatRatio}
              benchmarkValue={debtToEquityBenchmark}
            />
            {debtToEquityHasGaps && (
              <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>
                Some months omitted: total equity below ${EQUITY_NEAR_ZERO_THRESHOLD.toLocaleString()} (ratio undefined).
              </div>
            )}
          </div>
         </div>
       </div>
 
      <div style={{ marginTop: '24px', fontSize: '13px', color: '#334155' }}>
         Peer bands (P25/P75) can be added once percentile benchmarks are available; current charts show the Industry Group benchmark line.
       </div>
     </div>
   );
 }
