'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { LineChart } from '../charts/Charts';

type Finding = {
   id: string;
   type: 'trend' | 'anomaly' | 'driver' | 'focus' | 'opportunity';
   metric?: string | null;
   severity?: string | null;
   confidence?: number | null;
   payload?: any;
   updatedAt?: string;
 };
 
 interface FocusBoardProps {
   companyId: string;
 }
 
const BUCKETS = [
  { id: 'fix-now', label: 'Fix Now' },
  { id: 'investigate', label: 'Investigate' },
  { id: 'monitor', label: 'Monitor' },
  { id: 'opportunities', label: 'Opportunities' },
];

const BUCKET_PRIORITY: Record<string, number> = {
  'fix-now': 3,
  investigate: 2,
  monitor: 1,
  opportunities: 0,
};

const formatCurrency = (value: number) => `$${(value / 1000).toFixed(0)}k`;
const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const normalizeMetric = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

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

const buildSeries = (monthly: any[], selector: (m: any) => number) =>
  monthly.map((m) => ({
    month: m.month,
    value: selector(m),
  }));

const findMatchingKey = (metricName: string, sample: any) => {
  if (!sample) return null;
  const target = normalizeMetric(metricName);
  if (!target) return null;
  const keys = Object.keys(sample);
  for (const key of keys) {
    if (normalizeMetric(key) === target) return key;
  }
  return null;
};

const resolveChartConfig = (metricName: string, monthly: any[]) => {
  if (!metricName || monthly.length === 0) return null;
  const normalized = normalizeMetric(metricName);

  if (normalized.includes('cogs') || normalized.includes('costofgoods')) {
    return {
      title: 'COGS',
      data: buildSeries(monthly, (m) => m.cogsTotal || 0),
      formatter: formatCurrency,
    };
  }

  if (normalized.includes('grossmargin')) {
    return {
      title: 'Gross Margin %',
      data: buildSeries(monthly, (m) => (m.revenue ? ((m.revenue - (m.cogsTotal || 0)) / m.revenue) * 100 : 0)),
      formatter: formatPercent,
    };
  }

  if (normalized.includes('grossprofit')) {
    return {
      title: 'Gross Profit',
      data: buildSeries(monthly, (m) => (m.revenue || 0) - (m.cogsTotal || 0)),
      formatter: formatCurrency,
    };
  }

  if (normalized.includes('revenue') || normalized.includes('sales')) {
    return {
      title: 'Revenue',
      data: buildSeries(monthly, (m) => m.revenue || 0),
      formatter: formatCurrency,
    };
  }

  if (normalized.includes('operatingexpense') && (normalized.includes('percent') || normalized.includes('pct'))) {
    return {
      title: 'Operating Expense %',
      data: buildSeries(monthly, (m) => (m.revenue ? (getOperatingExpenseTotal(m) / m.revenue) * 100 : 0)),
      formatter: formatPercent,
    };
  }

  if (normalized.includes('operatingexpense') || normalized.includes('opex')) {
    return {
      title: 'Operating Expense',
      data: buildSeries(monthly, (m) => getOperatingExpenseTotal(m)),
      formatter: formatCurrency,
    };
  }

  if (normalized.includes('netincome') || normalized.includes('netprofit')) {
    return {
      title: 'Net Income',
      data: buildSeries(monthly, (m) => (m.revenue || 0) - (m.cogsTotal || 0) - getOperatingExpenseTotal(m)),
      formatter: formatCurrency,
    };
  }

  if (normalized.includes('cash')) {
    return {
      title: 'Cash Balance',
      data: buildSeries(monthly, (m) => m.cash || 0),
      formatter: formatCurrency,
    };
  }

  if (normalized.includes('accountsreceivable') || normalized.includes('totalar') || normalized === 'ar') {
    return {
      title: 'Accounts Receivable',
      data: buildSeries(monthly, (m) => m.ar || 0),
      formatter: formatCurrency,
    };
  }

  if (normalized.includes('inventory')) {
    return {
      title: 'Inventory',
      data: buildSeries(monthly, (m) => m.inventory || 0),
      formatter: formatCurrency,
    };
  }

  if (normalized.includes('payroll')) {
    return {
      title: 'Payroll',
      data: buildSeries(monthly, (m) => m.payroll || 0),
      formatter: formatCurrency,
    };
  }

  if (normalized.includes('rent')) {
    return {
      title: 'Rent',
      data: buildSeries(monthly, (m) => m.rent || 0),
      formatter: formatCurrency,
    };
  }

  if (normalized.includes('marketing')) {
    return {
      title: 'Marketing',
      data: buildSeries(monthly, (m) => m.marketing || 0),
      formatter: formatCurrency,
    };
  }

  if (normalized.includes('insurance')) {
    return {
      title: 'Insurance',
      data: buildSeries(monthly, (m) => m.insurance || 0),
      formatter: formatCurrency,
    };
  }

  if (normalized.includes('interestexpense')) {
    return {
      title: 'Interest Expense',
      data: buildSeries(monthly, (m) => m.interestExpense || 0),
      formatter: formatCurrency,
    };
  }

  const fallbackKey = findMatchingKey(metricName, monthly[0]);
  if (fallbackKey) {
    return {
      title: metricName,
      data: buildSeries(monthly, (m) => Number(m[fallbackKey]) || 0),
      formatter: formatCurrency,
    };
  }

  return null;
};

const getBucketId = (finding: Finding) => {
  const override = finding.payload?.boardBucket;
  if (override === 'investigate' || override === 'monitor' || override === 'fix-now' || override === 'fix_now') {
    return override === 'fix_now' ? 'fix-now' : override;
  }
  if (override === 'opportunities') return 'opportunities';
  if (finding.type === 'opportunity') return 'opportunities';
  if (finding.type === 'anomaly') {
    if (finding.severity === 'high' || finding.severity === 'medium') return 'fix-now';
    return 'monitor';
  }
  const severity = finding.severity || 'low';
  if (severity === 'high' || severity === 'medium') return 'investigate';
  return 'monitor';
};
 
 export default function FocusBoard({ companyId }: FocusBoardProps) {
   const [findings, setFindings] = useState<Finding[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [chartFinding, setChartFinding] = useState<Finding | null>(null);
  const [chartContext, setChartContext] = useState<any | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
 
   useEffect(() => {
     let isMounted = true;
     const loadFindings = async () => {
       setLoading(true);
       setError(null);
       try {
         const response = await fetch(`/api/performance-analytics/findings?companyId=${companyId}`);
         if (!response.ok) {
           let message = 'Failed to load focus board';
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
         if (isMounted) setFindings(data.findings || []);
       } catch (err: any) {
         if (isMounted) setError(err.message || 'Failed to load focus board');
       } finally {
         if (isMounted) setLoading(false);
       }
     };
 
     if (companyId) {
       loadFindings();
     }
 
     return () => {
       isMounted = false;
     };
   }, [companyId]);

  useEffect(() => {
    let isMounted = true;
    const loadChartContext = async () => {
      if (!companyId || !chartOpen || chartContext) return;
      setChartLoading(true);
      setChartError(null);
      try {
        const response = await fetch(`/api/performance-analytics/context?companyId=${companyId}&months=24`);
        if (!response.ok) {
          let message = 'Failed to load chart data';
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
        if (isMounted) setChartContext(data);
      } catch (err: any) {
        if (isMounted) setChartError(err.message || 'Failed to load chart data');
      } finally {
        if (isMounted) setChartLoading(false);
      }
    };

    loadChartContext();

    return () => {
      isMounted = false;
    };
  }, [companyId, chartOpen, chartContext]);

  const monthly = useMemo(() => {
    if (!chartContext?.data?.monthlyFinancials) return [];
    return chartContext.data.monthlyFinancials.map((m: any) => ({
      ...m,
      month: m.monthDate ? new Date(m.monthDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : '',
    }));
  }, [chartContext]);

  const chartMetricName = chartFinding?.metric || chartFinding?.payload?.title || '';
  const chartConfig = useMemo(() => {
    if (!chartMetricName) return null;
    return resolveChartConfig(chartMetricName, monthly);
  }, [chartMetricName, monthly]);
 
  const findingsByBucket = useMemo(() => {
    const grouped: Record<string, Finding[]> = {};
    BUCKETS.forEach((bucket) => {
      grouped[bucket.id] = [];
    });

    const deduped = new Map<string, { finding: Finding; bucketId: string }>();

    findings.forEach((finding) => {
      const bucketId = getBucketId(finding);
      const key = `${finding.type}:${finding.metric || finding.payload?.title || finding.id}`;
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, { finding, bucketId });
        return;
      }
      const existingPriority = BUCKET_PRIORITY[existing.bucketId] ?? 0;
      const nextPriority = BUCKET_PRIORITY[bucketId] ?? 0;
      if (nextPriority > existingPriority) {
        deduped.set(key, { finding, bucketId });
      }
    });

    deduped.forEach(({ finding, bucketId }) => {
      grouped[bucketId].push(finding);
    });

    return grouped;
  }, [findings]);

  const totalFindings = useMemo(() => {
    return BUCKETS.reduce((acc, bucket) => acc + (findingsByBucket[bucket.id]?.length || 0), 0);
  }, [findingsByBucket]);

  const monitorOnly = useMemo(() => {
    const monitorCount = findingsByBucket.monitor?.length || 0;
    return totalFindings > 0 && monitorCount === totalFindings;
  }, [findingsByBucket, totalFindings]);
 
  if (loading) {
    return <div style={{ padding: '32px', color: '#334155' }}>Loading focus board…</div>;
  }
 
   if (error) {
     return <div style={{ padding: '32px', color: '#b91c1c' }}>{error}</div>;
   }
 
   return (
     <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
       <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Focus Board</h1>
       {findings.some((f) => f.payload?.sectorLabel) && (
         <p style={{ marginTop: '8px', fontSize: '13px', color: '#64748b' }}>
           Sector: {findings.find((f) => f.payload?.sectorLabel)?.payload?.sectorLabel ?? '—'}
         </p>
       )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginTop: '24px' }}>
         {BUCKETS.map((bucket) => {
           const bucketFindings = findingsByBucket[bucket.id] || [];
           const isMonitor = bucket.id === 'monitor';
          const isInvestigate = bucket.id === 'investigate';
           return (
           <div key={bucket.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
             <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>
               {bucket.label}
             </div>
            {isMonitor && bucketFindings.length > 0 && (
              <div style={{ fontSize: '13px', color: '#334155', marginBottom: '10px' }}>
                {monitorOnly
                  ? 'No high-priority gaps detected right now. These are the only signals worth tracking at this time.'
                  : 'Monitor items are lower-urgency signals to track over time while higher-scoring gaps take priority.'}
              </div>
            )}
            {bucketFindings.length ? (
              bucketFindings.map((finding) => (
                <div key={finding.id} style={{ padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', marginBottom: '10px' }}>
                 <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>
                     {finding.metric || finding.payload?.title || 'Untitled Finding'}
                   </div>
                  <div style={{ fontSize: '13px', color: '#334155', marginTop: '6px' }}>
                     {finding.payload?.summary || 'No summary provided yet.'}
                   </div>
                  {finding.type === 'focus' && finding.payload?.focusScore != null && (
                    <div style={{ marginTop: '8px', fontSize: '13px', color: '#334155' }}>
                      Focus score: {Number(finding.payload.focusScore).toFixed(1)} / 100 • Higher = bigger, more actionable gap.
                    </div>
                  )}
                  {isMonitor && finding.type === 'focus' && (
                    <div style={{ marginTop: '6px', fontSize: '13px', color: '#334155' }}>
                      {monitorOnly
                        ? 'This is being monitored because it is the only measurable signal right now, not because it is urgent.'
                        : 'This is a watch item; take action if the score rises or the gap widens.'}
                    </div>
                  )}
                  {finding.type === 'focus' && finding.payload?.focusScoreComponents && (
                    <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                      Components: materiality {finding.payload.focusScoreComponents.materiality}, peer deviation {finding.payload.focusScoreComponents.deviationPeers}, trend {finding.payload.focusScoreComponents.trendAcceleration}, confidence {finding.payload.focusScoreComponents.confidence}
                    </div>
                  )}
                  {isInvestigate && (
                    <div style={{ marginTop: '10px' }}>
                      <button
                        onClick={() => {
                          setChartFinding(finding);
                          setChartOpen(true);
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          background: 'white',
                          color: '#1e293b',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        View Chart
                      </button>
                    </div>
                  )}
                 </div>
               ))
             ) : (
              <div style={{ fontSize: '13px', color: '#64748b' }}>No findings yet.</div>
             )}
           </div>
         )})}
       </div>
      {chartOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
          onClick={() => setChartOpen(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              width: '900px',
              maxWidth: '95vw',
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>
                {chartMetricName || 'Chart'} • Last 24 months
              </div>
              <button
                onClick={() => setChartOpen(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  color: '#475569',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
            {chartLoading && <div style={{ fontSize: '13px', color: '#334155' }}>Loading chart…</div>}
            {chartError && <div style={{ fontSize: '13px', color: '#b91c1c' }}>{chartError}</div>}
            {!chartLoading && !chartError && chartConfig && (
              <LineChart title={chartConfig.title} data={chartConfig.data} color="#2563eb" compact formatter={chartConfig.formatter} />
            )}
            {!chartLoading && !chartError && !chartConfig && (
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                Chart not available for this metric yet.
              </div>
            )}
          </div>
        </div>
      )}
     </div>
   );
 }
