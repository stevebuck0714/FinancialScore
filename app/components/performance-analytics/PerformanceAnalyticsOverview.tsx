'use client';

import React, { useEffect, useState } from 'react';
import { INDUSTRY_SECTORS } from '../../../data/industrySectors';

type ContextResponse = {
   company: {
     id: string;
     name: string | null;
     industryGroupId: string | null;
     industryGroupName: string | null;
     industrySectorCategory: string | null;
   };
   benchmarks: {
     count: number;
     sample: Array<{ metricName: string; fiveYearValue: number | null; industryName: string | null }>;
   };
   goals: {
     expense: Record<string, any>;
     operational: Record<string, any>;
   };
   operationalProfile: {
     sector: string;
     label: string;
     groups: Array<{ category: string; items: string[] }>;
     suggestedGoals: string[];
   };
   ranges: {
     financials: { count: number; start: string | null; end: string | null };
     cash: { count: number; start: string | null; end: string | null };
     ar: { count: number; start: string | null; end: string | null };
     ap: { count: number; start: string | null; end: string | null };
     customers: { count: number; start: string | null; end: string | null };
     products: { count: number; start: string | null; end: string | null };
     inventory: { count: number; start: string | null; end: string | null };
   };
 };
 
 interface PerformanceAnalyticsOverviewProps {
   companyId: string;
 }
 
const OPERATIONAL_FOCUS_KEY = '__focusWatchlist';

function sanitizeFocusValues(raw: any): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

 const formatDate = (value: string | null) => {
   if (!value) return '—';
   const date = new Date(value);
   return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
 };
 
 export default function PerformanceAnalyticsOverview({ companyId }: PerformanceAnalyticsOverviewProps) {
   const [context, setContext] = useState<ContextResponse | null>(null);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [monthsWindow, setMonthsWindow] = useState(24);
  const [operationalFocusValues, setOperationalFocusValues] = useState<Record<string, string>>({});
  const [focusLoaded, setFocusLoaded] = useState(false);
  const lastSavedFocusJsonRef = React.useRef<string>('');

  const persistOperationalFocusValues = async () => {
    if (!companyId || !context) return;
    const focusJson = JSON.stringify(operationalFocusValues);
    if (focusJson === lastSavedFocusJsonRef.current) return;
    const mergedGoals = {
      ...(context.goals?.operational || {}),
      [OPERATIONAL_FOCUS_KEY]: operationalFocusValues,
    };
    const response = await fetch('/api/operational-goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, goals: mergedGoals }),
    });
    if (!response.ok) {
      throw new Error('Failed to save operational focus values');
    }
    lastSavedFocusJsonRef.current = focusJson;
  };
 
   useEffect(() => {
     let isMounted = true;
    const loadContext = async () => {
       setLoading(true);
       setError(null);
       try {
        const response = await fetch(
          `/api/performance-analytics/context?companyId=${companyId}&months=${monthsWindow}`,
          { cache: 'no-store' }
        );
        if (!response.ok) {
          let message = 'Failed to load performance analytics context';
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
        if (isMounted) {
          const savedFocus = sanitizeFocusValues(data?.goals?.operational?.[OPERATIONAL_FOCUS_KEY]);
          const savedFocusJson = JSON.stringify(savedFocus);
          setOperationalFocusValues(savedFocus);
          lastSavedFocusJsonRef.current = savedFocusJson;
          setFocusLoaded(true);
          setContext(data);
        }
       } catch (err: any) {
         if (isMounted) setError(err.message || 'Failed to load context');
       } finally {
         if (isMounted) setLoading(false);
       }
     };
 
     if (companyId) {
       loadContext();
     }
 
     return () => {
       isMounted = false;
     };
  }, [companyId, monthsWindow]);

  useEffect(() => {
    if (!focusLoaded || !companyId || !context) return;
    const focusJson = JSON.stringify(operationalFocusValues);
    if (focusJson === lastSavedFocusJsonRef.current) return;

    const timeoutId = setTimeout(async () => {
      try {
        await persistOperationalFocusValues();
      } catch (error) {
        console.error('Failed to save operational focus values', error);
      }
    }, 450);

    return () => clearTimeout(timeoutId);
  }, [operationalFocusValues, focusLoaded, companyId, context]);

  const runAgents = async () => {
    setRunStatus('running');
    setRunMessage(null);
    try {
      await persistOperationalFocusValues();
      const response = await fetch('/api/performance-analytics/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, replace: true, frequency: 'daily' })
      });
      if (!response.ok) {
        let message = 'Failed to run performance analytics agents';
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
      setRunMessage(`Generated ${data.inserted ?? 0} findings.`);
      setRunStatus('done');
    } catch (err: any) {
      setRunStatus('error');
      setRunMessage(err.message || 'Failed to run agents');
    }
  };
 
   if (loading) {
     return <div style={{ padding: '32px', color: '#475569' }}>Loading performance analytics context…</div>;
   }
 
   if (error) {
     return <div style={{ padding: '32px', color: '#b91c1c' }}>{error}</div>;
   }
 
   if (!context) {
     return <div style={{ padding: '32px', color: '#475569' }}>No performance analytics context available.</div>;
   }
 
  const industryGroupId = context.company.industryGroupId;
  const industryGroupName =
    context.company.industryGroupName ||
    (industryGroupId
      ? INDUSTRY_SECTORS.find((sector) => String(sector.id) === String(industryGroupId))?.name
      : null);
  const industryGroupDisplay = industryGroupId && industryGroupName
    ? `${industryGroupId} - ${industryGroupName}`
    : industryGroupName || industryGroupId || 'Not set';

   return (
     <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Operational Data</h1>
      <p style={{ marginTop: '12px', fontSize: '15px', color: '#475569' }}>
        Benchmarks and analysis use Industry Group data. Operational profile is shown separately.
      </p>

      <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Window</label>
          <select
            value={monthsWindow}
            onChange={(e) => setMonthsWindow(parseInt(e.target.value, 10))}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
          >
            <option value={12}>Last 12 months</option>
            <option value={24}>Last 24 months</option>
            <option value={36}>Last 36 months</option>
          </select>
        </div>
        <button
          onClick={runAgents}
          disabled={runStatus === 'running'}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            border: 'none',
            background: runStatus === 'done' ? '#10b981' : runStatus === 'error' ? '#ef4444' : '#2751d0',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: runStatus === 'running' ? 'not-allowed' : 'pointer'
          }}
        >
          {runStatus === 'running' ? 'Running Agents…' : 'Run Performance Agents'}
        </button>
        {runMessage && (
          <span style={{ fontSize: '13px', color: runStatus === 'error' ? '#b91c1c' : '#0f172a' }}>
            {runMessage}
          </span>
        )}
      </div>
 
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '24px' }}>
        <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white' }}>
          <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Industry</div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginTop: '6px' }}>
            {industryGroupDisplay}
          </div>
        </div>
        <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white' }}>
          <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Operational Profile</div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginTop: '6px' }}>
            {context.operationalProfile.label}
          </div>
        </div>
         <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white' }}>
           <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Benchmarks Loaded</div>
           <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginTop: '6px' }}>
             {context.benchmarks.count}
           </div>
         </div>
         <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white' }}>
           <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Goals Loaded</div>
           <div style={{ fontSize: '14px', color: '#1e293b', marginTop: '6px' }}>
             Expense: {Object.keys(context.goals.expense || {}).length} • Operational:{' '}
             {Object.keys(context.goals.operational || {}).length}
           </div>
         </div>
       </div>
 
       <div style={{ marginTop: '32px' }}>
         <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>Operational Focus Areas</h2>
         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
           {[
            'Liquidity',
            'Working Capital',
            'Demand',
            'Fulfillment',
            'Unit Economics',
           ].map((group) => (
            <div key={group} style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white' }}>
               <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                {group}
               </div>
              {[1, 2].map((row) => (
                <div key={row} style={{ marginBottom: row === 1 ? '6px' : 0 }}>
                  <input
                    type="text"
                    value={operationalFocusValues[`${group}_row${row}`] || ''}
                    onChange={(e) => setOperationalFocusValues(prev => ({ ...prev, [`${group}_row${row}`]: e.target.value }))}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#f8fafc' }}
                  />
                </div>
              ))}
             </div>
           ))}
         </div>
       </div>

      <div style={{ marginTop: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>Data Coverage</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          {[
            { label: 'COA Monthly', range: context.ranges.financials },
            { label: 'Cash', range: context.ranges.cash },
            { label: 'AR Aging', range: context.ranges.ar },
            { label: 'AP Aging', range: context.ranges.ap },
            { label: 'Customers', range: context.ranges.customers },
            { label: 'Products', range: context.ranges.products },
            { label: 'Inventory', range: context.ranges.inventory },
          ].map((item) => (
            <div key={item.label} style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{item.label}</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                {item.range.count} records • {formatDate(item.range.start)} → {formatDate(item.range.end)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>Definitions</h2>
        <div style={{ padding: '12px 14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', color: '#475569', marginBottom: '8px' }}>
            <strong>Focus score</strong>: weighted score (0–100) combining materiality, plan/peer deviation, trend acceleration, and confidence.
          </div>
          <div style={{ fontSize: '12px', color: '#475569', marginBottom: '8px' }}>
            <strong>Severity</strong>: Low/Medium/High based on magnitude and urgency (e.g., breached covenant = High).
          </div>
          <div style={{ fontSize: '12px', color: '#475569', marginBottom: '8px' }}>
            <strong>Confidence</strong>: model confidence based on data completeness and signal consistency.
          </div>
          <div style={{ fontSize: '12px', color: '#475569' }}>
            <strong>Covenant alerts tracked</strong>: WARNING, BREACHED, CRITICAL, plus compliant covenants within 10% of thresholds.
          </div>
        </div>
      </div>
     </div>
   );
 }
