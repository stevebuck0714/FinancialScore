'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Finding = {
   id: string;
   type: 'trend' | 'anomaly' | 'driver' | 'focus' | 'opportunity';
   metric?: string | null;
   severity?: string | null;
   confidence?: number | null;
   payload?: any;
   updatedAt?: string;
 };
 
 interface OpportunityWorkspaceProps {
   companyId: string;
 }
 
const OPPORTUNITY_STATUSES = ['Discover', 'Validate', 'Plan', 'Execute', 'Realized'] as const;

 const severityLabel = (value?: string | null) => {
   if (!value) return 'Unrated';
   return value.charAt(0).toUpperCase() + value.slice(1);
 };
 
const formatCurrency = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
};

const formatImpactRange = (impact?: { unit?: string; low?: number | null; high?: number | null }) => {
  if (!impact) return 'N/A';
  if (impact.low == null && impact.high == null) return 'N/A';
  const low = formatCurrency(impact.low ?? null);
  const high = formatCurrency(impact.high ?? null);
  const unit = impact.unit ? ` ${impact.unit}` : '';
  return `${low} to ${high}${unit}`;
};

const evidenceLevel = (confidence?: number | null) => {
  if (confidence == null) return 'Weak';
  if (confidence >= 0.7) return 'Strong';
  if (confidence >= 0.5) return 'Medium';
  return 'Weak';
};

 export default function OpportunityWorkspace({ companyId }: OpportunityWorkspaceProps) {
   const [findings, setFindings] = useState<Finding[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [objectiveFilter, setObjectiveFilter] = useState<'All' | 'Cash' | 'Margin' | 'Growth' | 'Risk'>('All');
  const [timeFilter, setTimeFilter] = useState<'All' | '0–30 days' | '30–90 days' | '90–180+ days'>('All');
  const [ownerFilter, setOwnerFilter] = useState<'All' | 'Sales' | 'Ops' | 'Finance' | 'Marketing'>('All');
  const [evidenceFilter, setEvidenceFilter] = useState<'All' | 'Strong' | 'Medium' | 'Weak'>('All');
 
   useEffect(() => {
     let isMounted = true;
    const loadFindings = async () => {
       setLoading(true);
       setError(null);
       try {
         const response = await fetch(`/api/performance-analytics/findings?companyId=${companyId}&type=opportunity`);
         if (!response.ok) {
           let message = 'Failed to load opportunities';
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
           setFindings(data.findings || []);
           if (!selectedId && data.findings?.length) {
             setSelectedId(data.findings[0].id);
           }
         }
       } catch (err: any) {
         if (isMounted) setError(err.message || 'Failed to load opportunities');
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
  }, [companyId, selectedId]);

  const refreshFindings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/performance-analytics/findings?companyId=${companyId}&type=opportunity`);
      if (!response.ok) {
        let message = 'Failed to load opportunities';
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
      setFindings(data.findings || []);
      if (!selectedId && data.findings?.length) {
        setSelectedId(data.findings[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load opportunities');
    } finally {
      setLoading(false);
    }
  };

  const runAgents = async () => {
    setRunStatus('running');
    setRunMessage(null);
    try {
      const response = await fetch('/api/performance-analytics/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, replace: true })
      });
      if (!response.ok) {
        let message = 'Failed to run performance agents';
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
      await refreshFindings();
    } catch (err: any) {
      setRunStatus('error');
      setRunMessage(err.message || 'Failed to run agents');
    }
  };
 
  const rankedFindings = useMemo(() => {
    return [...findings].sort((a, b) => {
      const scoreA = a.payload?.score?.value ?? a.confidence ?? 0;
      const scoreB = b.payload?.score?.value ?? b.confidence ?? 0;
      return scoreB - scoreA;
    });
  }, [findings]);

  const filteredFindings = useMemo(() => {
    return rankedFindings.filter((finding) => {
      const payload = finding.payload || {};
      const objective = payload.objective || 'Growth';
      const timeLabel = payload.timeToImpact?.label || '—';
      const owner = payload.owner || 'Finance';
      const evidence = evidenceLevel(finding.confidence);

      if (objectiveFilter !== 'All' && objective !== objectiveFilter) return false;
      if (timeFilter !== 'All' && timeLabel !== timeFilter) return false;
      if (ownerFilter !== 'All' && owner !== ownerFilter) return false;
      if (evidenceFilter !== 'All' && evidence !== evidenceFilter) return false;
      return true;
    });
  }, [rankedFindings, objectiveFilter, timeFilter, ownerFilter, evidenceFilter]);
 
  const selectedFinding = filteredFindings.find((finding) => finding.id === selectedId) || filteredFindings[0] || null;
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    OPPORTUNITY_STATUSES.forEach((status) => {
      counts[status] = 0;
    });
    findings.forEach((finding) => {
      const status = finding.payload?.status || 'Discover';
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [findings]);
 
   if (loading) {
     return <div style={{ padding: '32px', color: '#475569' }}>Loading opportunity workspace…</div>;
   }
 
   if (error) {
     return <div style={{ padding: '32px', color: '#b91c1c' }}>{error}</div>;
   }
 
   return (
     <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Actions/Monitor</h1>
       <p style={{ marginTop: '12px', fontSize: '15px', color: '#475569' }}>
        Identify where to press when you are strong, and where to fix when you are underperforming. Opportunities are ranked by impact, confidence, and time-to-impact.
       </p>
       {findings.some((f) => f.payload?.sectorLabel) && (
         <p style={{ marginTop: '6px', fontSize: '13px', color: '#64748b' }}>
           Sector: {findings.find((f) => f.payload?.sectorLabel)?.payload?.sectorLabel ?? '—'}
         </p>
       )}

      <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={runAgents}
          disabled={runStatus === 'running'}
          style={{
            padding: '6px 12px',
            borderRadius: '8px',
            border: 'none',
            background: runStatus === 'done' ? '#10b981' : runStatus === 'error' ? '#ef4444' : '#667eea',
            color: 'white',
            fontSize: '12px',
            fontWeight: 600,
            cursor: runStatus === 'running' ? 'not-allowed' : 'pointer',
          }}
        >
          {runStatus === 'running' ? 'Running…' : 'Run Agents'}
        </button>
        {runMessage && (
          <span style={{ fontSize: '12px', color: runStatus === 'error' ? '#b91c1c' : '#475569' }}>
            {runMessage}
          </span>
        )}
      </div>
 
      <div style={{ marginTop: '18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        {OPPORTUNITY_STATUSES.map((status) => (
          <div key={status} style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{status}</div>
            <div style={{ marginTop: '6px', fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>
              {statusCounts[status] ?? 0}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <label style={{ fontSize: '12px', color: '#475569' }}>
          Objective
          <select value={objectiveFilter} onChange={(e) => setObjectiveFilter(e.target.value as any)} style={{ width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <option>All</option>
            <option>Cash</option>
            <option>Margin</option>
            <option>Growth</option>
            <option>Risk</option>
          </select>
        </label>
        <label style={{ fontSize: '12px', color: '#475569' }}>
          Time-to-impact
          <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value as any)} style={{ width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <option>All</option>
            <option>0–30 days</option>
            <option>30–90 days</option>
            <option>90–180+ days</option>
          </select>
        </label>
        <label style={{ fontSize: '12px', color: '#475569' }}>
          Owner
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value as any)} style={{ width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <option>All</option>
            <option>Sales</option>
            <option>Ops</option>
            <option>Finance</option>
            <option>Marketing</option>
          </select>
        </label>
        <label style={{ fontSize: '12px', color: '#475569' }}>
          Evidence
          <select value={evidenceFilter} onChange={(e) => setEvidenceFilter(e.target.value as any)} style={{ width: '100%', marginTop: '6px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <option>All</option>
            <option>Strong</option>
            <option>Medium</option>
            <option>Weak</option>
          </select>
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 2fr', gap: '18px', marginTop: '18px' }}>
         <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: 'white', padding: '12px' }}>
           <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '10px' }}>
            Opportunity Cards
           </div>
          {filteredFindings.length === 0 && (
             <div style={{ fontSize: '12px', color: '#94a3b8' }}>
               No opportunities generated yet. Run agents to populate this list.
             </div>
           )}
          {filteredFindings.map((finding) => (
             <button
               key={finding.id}
               onClick={() => setSelectedId(finding.id)}
               style={{
                 width: '100%',
                 textAlign: 'left',
                 border: '1px solid #e2e8f0',
                 borderRadius: '10px',
                 padding: '10px 12px',
                 marginBottom: '8px',
                background: finding.id === selectedFinding?.id ? '#ecfccb' : 'white',
                 cursor: 'pointer',
               }}
             >
               <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                 {finding.payload?.title || finding.metric || 'Opportunity'}
               </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <span>Type: {finding.payload?.type || 'General'}</span>
                <span>•</span>
                <span>Objective: {finding.payload?.objective || 'Growth'}</span>
                <span>•</span>
                <span>Score: {finding.payload?.score?.value ?? Math.round((finding.confidence ?? 0) * 100) / 100}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                Impact: {formatImpactRange(finding.payload?.impact)} • {finding.payload?.timeToImpact?.label || 'Time: N/A'}
              </div>
             </button>
           ))}
         </div>
 
         <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: 'white', padding: '16px' }}>
           <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '10px' }}>
             Opportunity Brief
           </div>
           {selectedFinding ? (
             <>
               <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
                 {selectedFinding.payload?.title || selectedFinding.metric || 'Opportunity'}
               </div>
               <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                Type: {selectedFinding.payload?.type || 'General'} • Objective:{' '}
                {selectedFinding.payload?.objective || 'Growth'} • Evidence:{' '}
                {evidenceLevel(selectedFinding.confidence)} • Severity: {severityLabel(selectedFinding.severity)}
                {selectedFinding.payload?.sectorLabel && (
                  <span> • Sector: {selectedFinding.payload.sectorLabel}</span>
                )}
                {selectedFinding.payload?.source === 'playbook' && (
                  <span style={{ marginLeft: '6px', padding: '2px 6px', background: '#e0e7ff', color: '#3730a3', borderRadius: '4px', fontSize: '11px' }}>Playbook</span>
                )}
               </div>
               <div style={{ marginTop: '12px', fontSize: '13px', color: '#475569' }}>
                {selectedFinding.payload?.summary || selectedFinding.payload?.why?.join(' ') || 'No summary available yet.'}
               </div>
              {selectedFinding.payload?.evidence?.columns?.length > 0 && Array.isArray(selectedFinding.payload?.evidence?.rows) && selectedFinding.payload.evidence.rows.length > 0 && (
                <div style={{ marginTop: '14px', padding: '12px', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#9a3412', marginBottom: '8px' }}>
                    {selectedFinding.payload.evidence.title || 'Top drivers'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9a3412', marginBottom: '10px' }}>
                    {selectedFinding.payload.evidence.methodology}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `minmax(180px, 1.6fr) repeat(${Math.max(0, selectedFinding.payload.evidence.columns.length - 1)}, minmax(90px, 0.8fr))`,
                      gap: '8px',
                      fontSize: '11px',
                      color: '#7c2d12',
                      fontWeight: 700,
                    }}
                  >
                    {selectedFinding.payload.evidence.columns.map((c: any) => (
                      <div key={c.key} style={{ textAlign: c.align || 'left' }}>
                        {c.label}
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: '6px', display: 'grid', gap: '6px' }}>
                    {selectedFinding.payload.evidence.rows.slice(0, 10).map((row: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `minmax(180px, 1.6fr) repeat(${Math.max(0, selectedFinding.payload.evidence.columns.length - 1)}, minmax(90px, 0.8fr))`,
                          gap: '8px',
                          fontSize: '11px',
                          color: '#7c2d12',
                        }}
                      >
                        {selectedFinding.payload.evidence.columns.map((c: any) => {
                          const v = row?.[c.key];
                          const fmt = String(c.format || 'text');
                          const align = c.align || (fmt === 'text' ? 'left' : 'right');
                          let text = '—';
                          if (v != null && v !== '') {
                            if (typeof v === 'number') {
                              if (fmt === 'money') text = `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
                              else if (fmt === 'pct') text = `${(v * 100).toFixed(0)}%`;
                              else if (fmt === 'days') text = `${v.toFixed(0)}d`;
                              else text = v.toLocaleString(undefined, { maximumFractionDigits: 1 });
                            } else {
                              text = String(v);
                            }
                          }
                          return (
                            <div key={c.key} style={{ textAlign: align, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {text}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedFinding.payload?.evidence?.topItems?.length > 0 && (
                <div style={{ marginTop: '14px', padding: '12px', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#9a3412', marginBottom: '8px' }}>
                    Top drivers (item-level)
                  </div>
                  <div style={{ fontSize: '11px', color: '#9a3412', marginBottom: '10px' }}>
                    {selectedFinding.payload.evidence.methodology}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 0.7fr 0.7fr 0.7fr', gap: '8px', fontSize: '11px', color: '#7c2d12', fontWeight: 700 }}>
                    <div>Item</div>
                    <div style={{ textAlign: 'right' }}>Inv $ Δ</div>
                    <div style={{ textAlign: 'right' }}>Qty Δ</div>
                    <div style={{ textAlign: 'right' }}>Weeks OH</div>
                    <div style={{ textAlign: 'right' }}>GM%</div>
                  </div>
                  <div style={{ marginTop: '6px', display: 'grid', gap: '6px' }}>
                    {selectedFinding.payload.evidence.topItems.slice(0, 8).map((it: any, idx: number) => (
                      <div key={`${it.itemId || it.itemName}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 0.7fr 0.7fr 0.7fr', gap: '8px', fontSize: '11px', color: '#7c2d12' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {it.itemName}{it.sku ? ` (${it.sku})` : ''}
                        </div>
                        <div style={{ textAlign: 'right' }}>{Number(it.inventoryAssetDelta || 0).toLocaleString()}</div>
                        <div style={{ textAlign: 'right' }}>{Number(it.inventoryQtyDelta || 0).toLocaleString()}</div>
                        <div style={{ textAlign: 'right' }}>{it.estimatedWeeksOnHand != null ? it.estimatedWeeksOnHand : '—'}</div>
                        <div style={{ textAlign: 'right' }}>{it.recentGrossMarginPct != null ? `${Number(it.recentGrossMarginPct).toFixed(1)}%` : '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedFinding.payload?.impact && (
                 <div style={{ marginTop: '12px', fontSize: '13px', color: '#1e293b' }}>
                  <strong>Impact estimate:</strong> {formatImpactRange(selectedFinding.payload.impact)}
                 </div>
               )}
              {selectedFinding.payload?.timeToImpact && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
                  <strong>Time-to-impact:</strong> {selectedFinding.payload.timeToImpact.label} (signal ~
                  {selectedFinding.payload.timeToImpact.signalDays} days, run-rate ~
                  {selectedFinding.payload.timeToImpact.runRateDays} days)
                </div>
              )}
              {Array.isArray(selectedFinding.payload?.why) && selectedFinding.payload.why.length > 0 && (
                 <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Why it surfaced</div>
                   <ul style={{ marginTop: '6px', paddingLeft: '18px', fontSize: '12px', color: '#64748b' }}>
                    {selectedFinding.payload.why.map((item: string) => (
                       <li key={item} style={{ marginBottom: '4px' }}>
                         {item}
                       </li>
                     ))}
                   </ul>
                 </div>
               )}
              {Array.isArray(selectedFinding.payload?.dependencies) && selectedFinding.payload.dependencies.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Dependencies</div>
                  <ul style={{ marginTop: '6px', paddingLeft: '18px', fontSize: '12px', color: '#64748b' }}>
                    {selectedFinding.payload.dependencies.map((item: string) => (
                      <li key={item} style={{ marginBottom: '4px' }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedFinding.payload?.peerEvidence && (
                <div style={{ marginTop: '12px', fontSize: '12px', color: '#475569' }}>
                  <strong>Peer evidence:</strong> {selectedFinding.payload.peerEvidence}
                </div>
              )}
              {Array.isArray(selectedFinding.payload?.validationTests) && selectedFinding.payload.validationTests.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Validation tests</div>
                  <ul style={{ marginTop: '6px', paddingLeft: '18px', fontSize: '12px', color: '#64748b' }}>
                    {selectedFinding.payload.validationTests.map((item: string) => (
                      <li key={item} style={{ marginBottom: '4px' }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(selectedFinding.payload?.guardrails) && selectedFinding.payload.guardrails.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#b45309' }}>Risks & guardrails</div>
                  <ul style={{ marginTop: '6px', paddingLeft: '18px', fontSize: '12px', color: '#b45309' }}>
                    {selectedFinding.payload.guardrails.map((item: string) => (
                      <li key={item} style={{ marginBottom: '4px' }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(selectedFinding.payload?.nextActions) && selectedFinding.payload.nextActions.length > 0 && (
                <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#166534', marginBottom: '10px' }}>Next 3 Actions</div>
                  <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#14532d' }}>
                    {selectedFinding.payload.nextActions.map((task: { description: string; owner?: string; dueHorizon: string; dataReference?: string }, idx: number) => (
                      <li key={idx} style={{ marginBottom: '10px' }}>
                        <span style={{ fontWeight: 600 }}>{task.description}</span>
                        <div style={{ fontSize: '11px', color: '#15803d', marginTop: '4px' }}>
                          {task.owner && <span>Owner: {task.owner}</span>}
                          {task.dueHorizon && <span>{task.owner ? ' • ' : ''}Due: {task.dueHorizon}</span>}
                          {task.dataReference && <span> • Data: {task.dataReference}</span>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {selectedFinding.payload?.monitoring && (
                <div style={{ marginTop: '16px', padding: '12px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e40af', marginBottom: '10px' }}>Monitoring — when is this done?</div>
                  <div style={{ fontSize: '12px', color: '#1e3a8a' }}>
                    <div><strong>Primary KPI:</strong> {selectedFinding.payload.monitoring.primaryKpi}</div>
                    {Array.isArray(selectedFinding.payload.monitoring.leadingIndicators) && selectedFinding.payload.monitoring.leadingIndicators.length > 0 && (
                      <div style={{ marginTop: '6px' }}><strong>Leading indicators:</strong> {selectedFinding.payload.monitoring.leadingIndicators.join(', ')}</div>
                    )}
                    <div style={{ marginTop: '6px' }}><strong>Time window:</strong> {selectedFinding.payload.monitoring.timeWindowDays} days</div>
                    <div style={{ marginTop: '6px' }}><strong>Stop / continue rule:</strong> {selectedFinding.payload.monitoring.stopContinueRule}</div>
                  </div>
                </div>
              )}
              {selectedFinding.payload?.owner && (
                <div style={{ marginTop: '12px', fontSize: '12px', color: '#475569' }}>
                  <strong>Owner:</strong> {selectedFinding.payload.owner} • <strong>Status:</strong>{' '}
                  {selectedFinding.payload.status || 'Discover'}
                  {(!selectedFinding.payload?.nextActions?.length && selectedFinding.payload?.nextAction) && (
                    <> • <strong>Next action:</strong> {selectedFinding.payload.nextAction}</>
                  )}
                </div>
              )}
              {selectedFinding.payload?.title === 'No qualified opportunities detected' && (
                <div style={{ marginTop: '16px', fontSize: '12px', color: '#94a3b8' }}>
                  This is a placeholder entry until a qualified opportunity is detected.
                </div>
              )}
             </>
           ) : (
             <div style={{ fontSize: '12px', color: '#94a3b8' }}>Select an opportunity to view details.</div>
           )}
         </div>
       </div>
     </div>
   );
 }
