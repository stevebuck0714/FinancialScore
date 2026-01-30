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
 };
 
 interface TrendExplorerProps {
   companyId: string;
 }
 
 const formatCurrency = (value: number) => `$${(value / 1000).toFixed(0)}k`;
 const formatPercent = (value: number) => `${value.toFixed(1)}%`;
 
 export default function TrendExplorer({ companyId }: TrendExplorerProps) {
   const [context, setContext] = useState<ContextResponse | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
 
   useEffect(() => {
     let isMounted = true;
    const loadContext = async () => {
       setLoading(true);
       setError(null);
       try {
         const response = await fetch(`/api/performance-analytics/context?companyId=${companyId}`);
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
   }, [companyId]);
 
   const monthly = useMemo(() => {
     if (!context?.data?.monthlyFinancials) return [];
     return context.data.monthlyFinancials.map((m: any) => ({
       month: m.monthDate ? new Date(m.monthDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : '',
       revenue: m.revenue || 0,
       cogsTotal: m.cogsTotal || 0,
       expense: m.expense || 0,
       cash: m.cash || 0,
       ar: m.ar || 0,
       inventory: m.inventory || 0,
     }));
   }, [context]);
 
   const grossMarginData = useMemo(() => {
     return monthly.map((m: any) => ({
       month: m.month,
       value: m.revenue > 0 ? ((m.revenue - m.cogsTotal) / m.revenue) * 100 : 0,
     }));
   }, [monthly]);
 
   const operatingExpensePctData = useMemo(() => {
     return monthly.map((m: any) => ({
       month: m.month,
       value: m.revenue > 0 ? (m.expense / m.revenue) * 100 : 0,
     }));
   }, [monthly]);
 
   const benchmarks = context?.benchmarks?.items || [];
   const grossMarginBenchmark = getBenchmarkValue(benchmarks as any, 'Gross Margin');
 
   const operationalGoals = context?.goals?.operational || {};
   const cashGoal = operationalGoals.total_cash ? monthly.map(() => operationalGoals.total_cash) : undefined;
   const arGoal = operationalGoals.total_ar ? monthly.map(() => operationalGoals.total_ar) : undefined;
   const inventoryGoal = operationalGoals.inventory_value ? monthly.map(() => operationalGoals.inventory_value) : undefined;

  const driverNarrative = useMemo(() => {
    if (monthly.length < 6) return null;
    const prior = monthly.slice(-6, -3);
    const recent = monthly.slice(-3);
    const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / (values.length || 1);

    const priorRevenue = avg(prior.map((m: any) => m.revenue || 0));
    const recentRevenue = avg(recent.map((m: any) => m.revenue || 0));
    const priorCogs = avg(prior.map((m: any) => m.cogsTotal || 0));
    const recentCogs = avg(recent.map((m: any) => m.cogsTotal || 0));
    const priorExpense = avg(prior.map((m: any) => m.expense || 0));
    const recentExpense = avg(recent.map((m: any) => m.expense || 0));

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
  }, [monthly]);

  const grossMarginPeerNarrative = useMemo(() => {
    if (grossMarginBenchmark == null || grossMarginData.length === 0) return null;
    const latest = grossMarginData[grossMarginData.length - 1]?.value ?? 0;
    const delta = latest - grossMarginBenchmark;
    const direction = delta >= 0 ? 'above' : 'below';
    return `Gross margin is ${Math.abs(delta).toFixed(1)} pts ${direction} Industry Group peer benchmark.`;
  }, [grossMarginBenchmark, grossMarginData]);

  const chartSoWhat = useMemo(() => {
    if (monthly.length < 6) return {};
    const prior = monthly.slice(-6, -3);
    const recent = monthly.slice(-3);
    const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
    const formatDollar = (value: number) => `$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

    const priorRevenue = avg(prior.map((m: any) => m.revenue || 0));
    const recentRevenue = avg(recent.map((m: any) => m.revenue || 0));
    const revenueDelta = recentRevenue - priorRevenue;
    const revenueChangePct = priorRevenue ? revenueDelta / Math.abs(priorRevenue) : 0;

    const priorExpensePct = avg(prior.map((m: any) => (m.revenue ? (m.expense / m.revenue) * 100 : 0)));
    const recentExpensePct = avg(recent.map((m: any) => (m.revenue ? (m.expense / m.revenue) * 100 : 0)));
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
        ? `Operating expense % ${expensePctDelta > 0 ? 'increased' : 'decreased'} ${Math.abs(expensePctDelta).toFixed(1)} pts.`
        : 'Operating expense % is flat vs the prior baseline.',
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
  }, [monthly]);

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
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Why this chart</div>
        <div style={{ marginTop: '4px', fontSize: '11px', fontWeight: 600, color: isPriority ? '#1d4ed8' : '#64748b' }}>
          {isPriority ? 'Role: Priority Variance' : 'Role: Context / Driver'}
        </div>
        {reasons.length > 0 ? (
          <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
            {reasons.slice(0, 3).join(' ')}
          </div>
        ) : (
          <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>{fallback}</div>
        )}
        {metric === 'Gross Margin' && grossMarginPeerNarrative && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
            {grossMarginPeerNarrative}
          </div>
        )}
        {driverNarrative?.driverMap?.[metric as keyof typeof driverNarrative.driverMap] && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
            {driverNarrative.summary}
          </div>
        )}
        {chartSoWhat[metric] && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
            {chartSoWhat[metric]}
          </div>
        )}
        {chartNarratives[metric] && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#94a3b8' }}>
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

      <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '12px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Why These Charts
        </div>
        <div style={{ marginTop: '6px', fontSize: '13px', color: '#64748b' }}>
          We prioritize charts with meaningful baseline shifts, clear deviation from goals, or material peer gaps. If a chart appears here,
          it either explains a significant movement, represents a core value driver, or highlights operational risk or opportunity.
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
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                  {move.payload?.summary || 'No summary available yet.'}
                </div>
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>
                  Confidence: {move.confidence != null ? Math.round(move.confidence * 100) + '%' : '—'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#64748b' }}>
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
              data={monthly.map((m: any) => ({ month: m.month, value: m.revenue }))}
              color="#667eea"
              compact
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
              formatter={formatPercent}
              benchmarkValue={grossMarginBenchmark}
            />
          </div>
          <div>
            {renderRationale('Operating Expense', 'Operating expense reveals cost discipline relative to revenue.')}
            <LineChart
              title="Operating Expense %"
              data={operatingExpensePctData}
              color="#ef4444"
              compact
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
              formatter={formatCurrency}
              goalLineData={inventoryGoal}
            />
          </div>
         </div>
       </div>
 
       <div style={{ marginTop: '24px', fontSize: '12px', color: '#64748b' }}>
         Peer bands (P25/P75) can be added once percentile benchmarks are available; current charts show the Industry Group benchmark line.
       </div>
     </div>
   );
 }
