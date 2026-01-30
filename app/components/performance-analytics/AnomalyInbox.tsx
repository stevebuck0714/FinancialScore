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

interface AnomalyInboxProps {
  companyId: string;
}

const SEVERITY_OPTIONS = ['high', 'medium', 'low'] as const;

const severityLabel = (value?: string | null) => {
  if (!value) return 'Unrated';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export default function AnomalyInbox({ companyId }: AnomalyInboxProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [runMessage, setRunMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadFindings = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/performance-analytics/findings?companyId=${companyId}&type=anomaly`);
        if (!response.ok) {
          let message = 'Failed to load anomalies';
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
        if (isMounted) setError(err.message || 'Failed to load anomalies');
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
      const response = await fetch(`/api/performance-analytics/findings?companyId=${companyId}&type=anomaly`);
      if (!response.ok) {
        let message = 'Failed to load anomalies';
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
      setError(err.message || 'Failed to load anomalies');
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

  const filteredFindings = useMemo(() => {
    if (severityFilter === 'all') return findings;
    return findings.filter((finding) => finding.severity === severityFilter);
  }, [findings, severityFilter]);

  const selectedFinding = filteredFindings.find((finding) => finding.id === selectedId) || null;

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { all: findings.length };
    SEVERITY_OPTIONS.forEach((severity) => {
      counts[severity] = findings.filter((finding) => finding.severity === severity).length;
    });
    return counts;
  }, [findings]);

  if (loading) {
    return <div style={{ padding: '32px', color: '#475569' }}>Loading anomaly inbox…</div>;
  }

  if (error) {
    return <div style={{ padding: '32px', color: '#b91c1c' }}>{error}</div>;
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Anomaly Inbox</h1>
      <p style={{ marginTop: '12px', fontSize: '15px', color: '#475569' }}>
        Each anomaly includes supporting evidence and the likely cause so you can triage quickly.
      </p>

      <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Severity</label>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
        >
          <option value="all">All ({severityCounts.all})</option>
          {SEVERITY_OPTIONS.map((severity) => (
            <option key={severity} value={severity}>
              {severityLabel(severity)} ({severityCounts[severity] || 0})
            </option>
          ))}
        </select>
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
            Queue
          </div>
          {filteredFindings.length === 0 && (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              {findings.length === 0
                ? 'No anomalies generated yet. Run agents to populate this queue.'
                : 'No anomalies match this filter. Try a different severity or All.'}
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
                background: finding.id === selectedId ? '#eef2ff' : 'white',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                {finding.metric || finding.payload?.title || 'Anomaly'}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                Severity: {severityLabel(finding.severity)}
              </div>
            </button>
          ))}
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: 'white', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '10px' }}>
            Case File
          </div>
          {selectedFinding ? (
            <>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
                {selectedFinding.metric || selectedFinding.payload?.title || 'Anomaly'}
              </div>
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                Severity: {severityLabel(selectedFinding.severity)} • Confidence:{' '}
                {selectedFinding.confidence != null ? Math.round(selectedFinding.confidence * 100) + '%' : '—'}
              </div>
              <div style={{ marginTop: '12px', fontSize: '13px', color: '#475569' }}>
                {selectedFinding.payload?.summary || 'No summary available yet.'}
              </div>
              {selectedFinding.payload?.likelyCause && (
                <div style={{ marginTop: '12px', fontSize: '13px', color: '#1e293b' }}>
                  <strong>Likely cause:</strong> {selectedFinding.payload.likelyCause}
                </div>
              )}
              {Array.isArray(selectedFinding.payload?.nextSteps) && selectedFinding.payload.nextSteps.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Suggested checks</div>
                  <ul style={{ marginTop: '6px', paddingLeft: '18px', fontSize: '12px', color: '#64748b' }}>
                    {selectedFinding.payload.nextSteps.map((step: string) => (
                      <li key={step} style={{ marginBottom: '4px' }}>
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedFinding.payload?.title === 'No anomaly signals detected' ? (
                <div style={{ marginTop: '16px', fontSize: '12px', color: '#94a3b8' }}>
                  This is a placeholder entry until an anomaly is detected.
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
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Select an anomaly to view details.</div>
          )}
        </div>
      </div>
    </div>
  );
}
