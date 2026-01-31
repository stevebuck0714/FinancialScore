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

const getBucketId = (finding: Finding) => {
  const override = finding.payload?.boardBucket;
  if (override === 'investigate' || override === 'monitor' || override === 'fix-now') {
    return override;
  }
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
 
  if (loading) {
    return <div style={{ padding: '32px', color: '#334155' }}>Loading focus board…</div>;
  }
 
   if (error) {
     return <div style={{ padding: '32px', color: '#b91c1c' }}>{error}</div>;
   }
 
   return (
     <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
       <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Focus Board</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginTop: '24px' }}>
         {BUCKETS.map((bucket) => (
           <div key={bucket.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
             <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>
               {bucket.label}
             </div>
             {findingsByBucket[bucket.id]?.length ? (
               findingsByBucket[bucket.id].map((finding) => (
                <div key={finding.id} style={{ padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', marginBottom: '10px' }}>
                 <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>
                     {finding.metric || finding.payload?.title || 'Untitled Finding'}
                   </div>
                  <div style={{ fontSize: '13px', color: '#334155', marginTop: '6px' }}>
                     {finding.payload?.summary || 'No summary provided yet.'}
                   </div>
                  {finding.type === 'focus' && finding.payload?.focusScore != null && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                      Focus score: {Number(finding.payload.focusScore).toFixed(1)} / 100 • Higher = bigger, more actionable gap.
                    </div>
                  )}
                  {finding.type === 'focus' && finding.payload?.focusScoreComponents && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#94a3b8' }}>
                      Components: materiality {finding.payload.focusScoreComponents.materiality}, peer deviation {finding.payload.focusScoreComponents.deviationPeers}, trend {finding.payload.focusScoreComponents.trendAcceleration}, confidence {finding.payload.focusScoreComponents.confidence}
                    </div>
                  )}
                 </div>
               ))
             ) : (
              <div style={{ fontSize: '13px', color: '#64748b' }}>No findings yet.</div>
             )}
           </div>
         ))}
       </div>
     </div>
   );
 }
