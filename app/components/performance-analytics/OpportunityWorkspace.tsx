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
 
 const severityLabel = (value?: string | null) => {
   if (!value) return 'Unrated';
   return value.charAt(0).toUpperCase() + value.slice(1);
 };
 
 export default function OpportunityWorkspace({ companyId }: OpportunityWorkspaceProps) {
   const [findings, setFindings] = useState<Finding[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [runMessage, setRunMessage] = useState<string | null>(null);
 
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
       const confA = a.confidence ?? 0;
       const confB = b.confidence ?? 0;
       return confB - confA;
     });
   }, [findings]);
 
   const selectedFinding = rankedFindings.find((finding) => finding.id === selectedId) || null;
 
   if (loading) {
     return <div style={{ padding: '32px', color: '#475569' }}>Loading opportunity workspace…</div>;
   }
 
   if (error) {
     return <div style={{ padding: '32px', color: '#b91c1c' }}>{error}</div>;
   }
 
   return (
     <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
       <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Opportunity Workspace</h1>
       <p style={{ marginTop: '12px', fontSize: '15px', color: '#475569' }}>
         Opportunities are ranked by confidence and expected impact. Each entry includes prerequisites and risks.
       </p>

      <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
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
 
       <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 2fr', gap: '18px', marginTop: '18px' }}>
         <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: 'white', padding: '12px' }}>
           <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '10px' }}>
             Ranked Ideas
           </div>
           {rankedFindings.length === 0 && (
             <div style={{ fontSize: '12px', color: '#94a3b8' }}>
               No opportunities generated yet. Run agents to populate this list.
             </div>
           )}
           {rankedFindings.map((finding) => (
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
                 background: finding.id === selectedId ? '#ecfccb' : 'white',
                 cursor: 'pointer',
               }}
             >
               <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                 {finding.payload?.title || finding.metric || 'Opportunity'}
               </div>
               <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                 Confidence: {finding.confidence != null ? Math.round(finding.confidence * 100) + '%' : '—'} • Severity:{' '}
                 {severityLabel(finding.severity)}
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
                 Confidence: {selectedFinding.confidence != null ? Math.round(selectedFinding.confidence * 100) + '%' : '—'} • Severity:{' '}
                 {severityLabel(selectedFinding.severity)}
               </div>
               <div style={{ marginTop: '12px', fontSize: '13px', color: '#475569' }}>
                 {selectedFinding.payload?.summary || 'No summary available yet.'}
               </div>
               {selectedFinding.payload?.expectedImpact && (
                 <div style={{ marginTop: '12px', fontSize: '13px', color: '#1e293b' }}>
                   <strong>Expected impact:</strong> {selectedFinding.payload.expectedImpact}
                 </div>
               )}
               {Array.isArray(selectedFinding.payload?.prerequisites) && selectedFinding.payload.prerequisites.length > 0 && (
                 <div style={{ marginTop: '12px' }}>
                   <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Prerequisites</div>
                   <ul style={{ marginTop: '6px', paddingLeft: '18px', fontSize: '12px', color: '#64748b' }}>
                     {selectedFinding.payload.prerequisites.map((item: string) => (
                       <li key={item} style={{ marginBottom: '4px' }}>
                         {item}
                       </li>
                     ))}
                   </ul>
                 </div>
               )}
               {selectedFinding.payload?.risks && (
                 <div style={{ marginTop: '12px', fontSize: '12px', color: '#b45309' }}>
                   <strong>Risks:</strong> {selectedFinding.payload.risks}
                 </div>
               )}
               {selectedFinding.payload?.title === 'No qualified opportunities detected' ? (
                 <div style={{ marginTop: '16px', fontSize: '12px', color: '#94a3b8' }}>
                   This is a placeholder entry until a qualified opportunity is detected.
                 </div>
               ) : (
                 selectedFinding.payload && (
                   <div style={{ marginTop: '16px', padding: '12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                     <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Evidence bundle</div>
                     <pre style={{ marginTop: '8px', fontSize: '11px', color: '#475569', whiteSpace: 'pre-wrap' }}>
                       {JSON.stringify(selectedFinding.payload, null, 2)}
                     </pre>
                   </div>
                 )
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
