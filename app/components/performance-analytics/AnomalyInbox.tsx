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

type Initiative = {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  confidence: number;
  updatedAt: string | null;
  metricFamily: string;
  findings: Finding[];
  score: number;
};

const severityRank = (severity?: string | null) => {
  const s = String(severity || '').toLowerCase();
  if (s === 'high' || s === 'critical' || s === 'breached') return 3;
  if (s === 'medium' || s === 'warning') return 2;
  return 1;
};

const normalizeKey = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const safeText = (v: any) => String(v || '').replace(/\s+/g, ' ').trim();

function metricFamilyFromFinding(f: Finding): string {
  const metric = normalizeKey(String(f.metric || f.payload?.metric || f.payload?.title || ''));
  if (metric.includes('covenant') || metric.includes('debt') || metric.includes('leverage')) return 'Debt & Covenants';
  if (metric.includes('working capital') || metric.includes('cash conversion') || metric.includes('ccc')) return 'Working Capital';
  if (metric.includes('cash')) return 'Cash';
  if (metric.includes('accounts receivable') || metric.includes('total ar') || metric === 'ar') return 'AR';
  if (metric.includes('accounts payable') || metric.includes('total ap') || metric === 'ap') return 'AP';
  if (metric.includes('inventory')) return 'Inventory';
  if (metric.includes('gross margin') || metric.includes('margin')) return 'Margin';
  if (metric.includes('cogs') || metric.includes('cost of goods')) return 'COGS';
  if (metric.includes('revenue') || metric.includes('sales')) return 'Revenue';
  if (metric.includes('operating expense') || metric.includes('expense') || metric.includes('payroll') || metric.includes('rent') || metric.includes('insurance') || metric.includes('marketing')) {
    return 'Expense';
  }
  return 'Other';
}

function buildInitiatives(findings: Finding[]): Initiative[] {
  const usable = findings.filter((f) => ['anomaly', 'trend', 'focus'].includes(String(f.type)));
  const byKey = new Map<string, Initiative>();

  for (const f of usable) {
    const family = metricFamilyFromFinding(f);
    const metricKey = normalizeKey(String(f.metric || f.payload?.metric || family));
    const key = `${family}|${metricKey}`;

    const conf = typeof f.confidence === 'number' ? f.confidence : 0.5;
    const sev = (String(f.severity || 'low').toLowerCase() as any) || 'low';
    const sevScore = severityRank(sev);
    const materiality = typeof f.payload?.materiality === 'number' ? Math.abs(f.payload.materiality) : 0;
    const materialityBoost = materiality ? Math.min(2, Math.log10(materiality + 1) / 3) : 0;
    const score = sevScore * 100 + conf * 10 + materialityBoost;

    const updatedAt = safeText(f.updatedAt) || null;
    const title = safeText(f.payload?.title) || safeText(f.metric) || `${family} signal`;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        id: key,
        title,
        severity: sev === 'high' || sev === 'medium' ? sev : 'low',
        confidence: conf,
        updatedAt,
        metricFamily: family,
        findings: [f],
        score,
      });
      continue;
    }

    existing.findings.push(f);
    existing.score = Math.max(existing.score, score);
    existing.confidence = Math.max(existing.confidence, conf);
    if (severityRank(sev) > severityRank(existing.severity)) existing.severity = sev;
    if (updatedAt && (!existing.updatedAt || new Date(updatedAt) > new Date(existing.updatedAt))) {
      existing.updatedAt = updatedAt;
      // Prefer the most recent title if available (usually the clearest).
      if (safeText(f.payload?.title) || safeText(f.metric)) {
        existing.title = title;
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const s = severityRank(b.severity) - severityRank(a.severity);
    if (s !== 0) return s;
    return b.score - a.score;
  });
}

export default function AnomalyInbox({ companyId }: AnomalyInboxProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null); // initiative id
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [runMessage, setRunMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadFindings = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/performance-analytics/findings?companyId=${companyId}&limit=250`, {
          cache: 'no-store',
        });
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
  }, [companyId]);

  const refreshFindings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/performance-analytics/findings?companyId=${companyId}&limit=250`, {
        cache: 'no-store',
      });
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
        body: JSON.stringify({ companyId, replace: true, frequency: 'daily' })
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

  const initiatives = useMemo(() => buildInitiatives(findings), [findings]);

  useEffect(() => {
    if (!selectedId && initiatives.length > 0) {
      setSelectedId(initiatives[0].id);
    }
  }, [initiatives, selectedId]);

  const filteredInitiatives = useMemo(() => {
    if (severityFilter === 'all') return initiatives;
    return initiatives.filter((i) => i.severity === severityFilter);
  }, [initiatives, severityFilter]);

  const selectedInitiative = filteredInitiatives.find((i) => i.id === selectedId) || filteredInitiatives[0] || null;

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { all: initiatives.length };
    SEVERITY_OPTIONS.forEach((severity) => {
      counts[severity] = initiatives.filter((i) => i.severity === severity).length;
    });
    return counts;
  }, [initiatives]);

  if (loading) {
    return <div style={{ padding: '32px', color: '#475569' }}>Loading anomaly inbox…</div>;
  }

  if (error) {
    return <div style={{ padding: '32px', color: '#b91c1c' }}>{error}</div>;
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Anomalies</h1>
      <p style={{ marginTop: '12px', fontSize: '15px', color: '#475569' }}>
        Ranked triage across anomalies, trends, and focus signals (grouped into initiatives), with severity-first ordering.
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
            background: runStatus === 'done' ? '#10b981' : runStatus === 'error' ? '#ef4444' : '#2751d0',
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
          {filteredInitiatives.length === 0 && (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              {initiatives.length === 0
                ? 'No findings generated yet. Run agents to populate this queue.'
                : 'No items match this filter. Try a different severity or All.'}
            </div>
          )}
          {filteredInitiatives.map((i) => (
            <button
              key={i.id}
              onClick={() => setSelectedId(i.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '10px 12px',
                marginBottom: '8px',
                background: i.id === selectedId ? '#eef2ff' : 'white',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                {i.title}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                Severity: {severityLabel(i.severity)} • Family: {i.metricFamily} • Items: {i.findings.length}
              </div>
            </button>
          ))}
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: 'white', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '10px' }}>
            Case File
          </div>
          {selectedInitiative ? (
            <>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
                {selectedInitiative.title}
              </div>
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                Severity: {severityLabel(selectedInitiative.severity)} • Confidence:{' '}
                {selectedInitiative.confidence != null ? Math.round(selectedInitiative.confidence * 100) + '%' : '—'} • Family:{' '}
                {selectedInitiative.metricFamily}
              </div>

              {(() => {
                const sorted = selectedInitiative.findings
                  .slice()
                  .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || (Number(b.confidence || 0) - Number(a.confidence || 0)));
                const primary = sorted[0] || null;
                const summary = safeText(primary?.payload?.summary) || safeText(primary?.payload?.likelyCause) || '';
                const likelyCause = safeText(primary?.payload?.likelyCause) || '';
                const sectorLabel = safeText(primary?.payload?.sectorLabel) || '';
                const sectorContext = primary?.payload?.sectorContext || null;
                const nextSteps = Array.from(
                  new Set(
                    sorted
                      .flatMap((f) => (Array.isArray(f.payload?.nextSteps) ? f.payload.nextSteps : []))
                      .map((s) => safeText(s))
                      .filter(Boolean),
                  ),
                ).slice(0, 10);

                return (
                  <>
                    {summary ? (
                      <div style={{ marginTop: '12px', fontSize: '13px', color: '#475569' }}>{summary}</div>
                    ) : (
                      <div style={{ marginTop: '12px', fontSize: '13px', color: '#94a3b8' }}>
                        No summary available yet for this initiative.
                      </div>
                    )}
                    {likelyCause && (
                      <div style={{ marginTop: '12px', fontSize: '13px', color: '#1e293b' }}>
                        <strong>Likely cause:</strong> {likelyCause}
                      </div>
                    )}
                    {(sectorLabel || sectorContext) && (
                      <div style={{ marginTop: '12px', padding: '10px', background: '#f1f5f9', borderRadius: '8px', fontSize: '12px', color: '#475569' }}>
                        {sectorLabel && <div style={{ fontWeight: 600, color: '#334155' }}>Sector: {sectorLabel}</div>}
                        {(sectorContext?.seasonalityNote || sectorContext?.typicalVarianceNote) && (
                          <div style={{ marginTop: '6px' }}>
                            {sectorContext.seasonalityNote && <div>Seasonality: {sectorContext.seasonalityNote}</div>}
                            {sectorContext.typicalVarianceNote && <div style={{ marginTop: '4px' }}>Typical variance: {sectorContext.typicalVarianceNote}</div>}
                          </div>
                        )}
                      </div>
                    )}
                    {nextSteps.length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Suggested checks</div>
                        <ul style={{ marginTop: '6px', paddingLeft: '18px', fontSize: '12px', color: '#64748b' }}>
                          {nextSteps.map((step) => (
                            <li key={step} style={{ marginBottom: '4px' }}>
                              {step}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div style={{ marginTop: '14px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Evidence</div>
                      <div style={{ marginTop: '8px', display: 'grid', gap: '10px' }}>
                        {sorted.slice(0, 8).map((f) => (
                          <div key={f.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                                {safeText(f.payload?.title) || safeText(f.metric) || f.type}
                              </div>
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                {f.type} • {severityLabel(f.severity)}
                              </div>
                            </div>
                            {safeText(f.payload?.summary) && (
                              <div style={{ marginTop: '6px', fontSize: '13px', color: '#475569' }}>{safeText(f.payload.summary)}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Select an item to view details.</div>
          )}
        </div>
      </div>
    </div>
  );
}
