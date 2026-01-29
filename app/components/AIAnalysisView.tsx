'use client';

import { useEffect, useMemo, useState } from 'react';

type AskResponse = {
  shortAnswer: string;
  longAnswer: string;
  citedBullets: Array<{
    text: string;
    citations: Array<{
      url: string;
      title?: string;
      publishedDate?: string | null;
    }>;
  }>;
  howThisImpactsUs: string;
  sources: Array<{
    url: string;
    title?: string;
    publishedDate?: string | null;
    snippet?: string;
  }>;
};

type PeriodReviewResponse = {
  period: {
    start: string;
    end: string;
    label: string;
  };
  executiveSummary: string;
  performanceVsGoals: string;
  peerAndMarketContext: string;
  operationalTrends: {
    negativeTrendAlerts: Array<{
      metric: string;
      signal: string;
      whyItMatters: string;
      evidence: string;
    }>;
    narrative: string;
  };
  driversAndRisks: string;
  opportunities: string;
  appendix: {
    notes: string[];
    sources: Array<{ url: string; title?: string; publishedDate?: string | null }>;
  };
};

type MonthlyDataLike = {
  date: Date;
  month: string;
  revenue?: number;
  expense?: number;
};

export default function AIAnalysisView(props: {
  selectedCompanyId: string;
  companyName?: string;
  monthly: MonthlyDataLike[];
}) {
  const { selectedCompanyId, companyName, monthly } = props;
  const [tab, setTab] = useState<'ask' | 'period-review'>('ask');

  // Ask
  const [question, setQuestion] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [askResponse, setAskResponse] = useState<AskResponse | null>(null);
  const [useExternalSources, setUseExternalSources] = useState(false);

  // Period review
  const defaultPeriodLabel = useMemo(() => {
    if (!monthly || monthly.length === 0) return '';
    return monthly[monthly.length - 1]?.month || '';
  }, [monthly]);

  const [periodLabel, setPeriodLabel] = useState<string>(defaultPeriodLabel);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [periodResponse, setPeriodResponse] = useState<PeriodReviewResponse | null>(null);

  const presetQuestions = useMemo(() => {
    const name = companyName?.trim() || 'the company';
    return {
      Company: [
        `What are the top drivers of margin change this period for ${name}?`,
        `Which KPIs are below our peer group KPIs for ${name}, and what are the likely causes?`,
        `What are the top 3 risks to performance over the next 90 days for ${name}?`,
      ],
      'Daily Operations': [
        `Which daily operational metrics show sustained negative trends over the last 14 and 30 days for ${name}?`,
        `What leading indicators correlate with deteriorating cash/AR performance in the last 30 days for ${name}?`,
        `Where are we seeing signs of customer concentration risk worsening recently for ${name}?`,
      ],
      'Monthly COA': [
        `Which COA expense categories drove the largest month-over-month variance, and are they structural or one-time for ${name}?`,
        `Is there evidence of run-rate cost creep in specific COA categories over the last 6 months for ${name}?`,
        `What is the earliest month the current expense run-rate shift began for ${name}?`,
      ],
      'Peers / Market': [
        `How are peers in our industry talking about demand, pricing, labor, or churn in the last 90 days?`,
        `What are the most important industry trends likely to affect ${name} over the next 6–12 months?`,
      ],
      Opportunities: [
        `If ${name} is extremely successful, what acquisition archetypes would best accelerate growth in our markets and why?`,
        `Give example capital deployment plans (M&A, reinvestment, debt paydown, distributions) and the outcomes they could drive for ${name}.`,
      ],
    } as const;
  }, [companyName]);

  useEffect(() => {
    // Keep default period aligned when company changes / data loads
    if (defaultPeriodLabel && !periodLabel) setPeriodLabel(defaultPeriodLabel);
  }, [defaultPeriodLabel, periodLabel]);

  async function runAsk(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;

    setAskLoading(true);
    setAskError(null);
    setAskResponse(null);

    try {
      const res = await fetch('/api/ai-analysis/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          companyName,
          question: trimmed,
          useExternalSources,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to run AI Search');
      }
      setAskResponse(data as AskResponse);
    } catch (e: any) {
      setAskError(e?.message || 'Unknown error');
    } finally {
      setAskLoading(false);
    }
  }

  async function runPeriodReview() {
    if (!periodLabel) return;
    setPeriodLoading(true);
    setPeriodError(null);
    setPeriodResponse(null);

    try {
      const res = await fetch('/api/ai-analysis/period-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          periodLabel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to run Period Review');
      }
      setPeriodResponse(data as PeriodReviewResponse);
    } catch (e: any) {
      setPeriodError(e?.message || 'Unknown error');
    } finally {
      setPeriodLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', margin: 0 }}>AI Analysis</h1>
          <div style={{ marginTop: '6px', fontSize: '14px', color: '#64748b' }}>
            {companyName ? `${companyName} • ` : ''}AI Search (with citations) + Period Review (daily ops + monthly COA)
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => setTab('ask')}
          style={{
            padding: '12px 20px',
            background: tab === 'ask' ? '#667eea' : 'transparent',
            color: tab === 'ask' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: tab === 'ask' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '700',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
          }}
        >
          Ask (AI Search)
        </button>
        <button
          onClick={() => setTab('period-review')}
          style={{
            padding: '12px 20px',
            background: tab === 'period-review' ? '#667eea' : 'transparent',
            color: tab === 'period-review' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: tab === 'period-review' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '700',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
          }}
        >
          Period Review
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '16px' }}>
        {/* Presets */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', height: 'fit-content' }}>
          <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', marginBottom: '10px' }}>Suggested questions</div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {Object.entries(presetQuestions).map(([category, questions]) => (
              <div key={category}>
                <div style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                  {category}
                </div>
                <div style={{ display: 'grid', gap: '6px' }}>
                  {questions.map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setQuestion(q);
                        setTab('ask');
                      }}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        color: '#0f172a',
                        fontSize: '13px',
                        lineHeight: '1.35',
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {tab === 'ask' && (
            <div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a question…"
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    fontSize: '15px',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      runAsk(question);
                    }
                  }}
                />
                <button
                  onClick={() => runAsk(question)}
                  disabled={askLoading || !question.trim()}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    background: askLoading ? '#94a3b8' : '#0ea5e9',
                    color: 'white',
                    fontWeight: '800',
                    cursor: askLoading ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title="Run (Ctrl/Cmd+Enter)"
                >
                  {askLoading ? 'Searching…' : 'Search & Answer'}
                </button>
              </div>
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={useExternalSources}
                    onChange={(e) => setUseExternalSources(e.target.checked)}
                  />
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 600 }}>Use external web sources</span>
                </label>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Off = internal financial/operational data only.
                </span>
              </div>

              {askError && (
                <div style={{ marginTop: '12px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '10px' }}>
                  {askError}
                </div>
              )}

              {askResponse && (
                <div style={{ marginTop: '16px', display: 'grid', gap: '14px' }}>
                  <Section title="Short answer">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.65', color: '#0f172a' }}>{askResponse.shortAnswer}</div>
                  </Section>
                  <Section title="Long answer">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7', color: '#0f172a' }}>{askResponse.longAnswer}</div>
                  </Section>
                  <Section title="Cited bullets (every bullet is sourced)">
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {askResponse.citedBullets.map((b, idx) => (
                        <div key={idx} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                          <div style={{ color: '#0f172a', lineHeight: '1.55' }}>• {b.text}</div>
                          <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {(b.citations || []).map((c, cIdx) => (
                              <a
                                key={`${idx}-${cIdx}`}
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'none' }}
                                title={c.title || c.url}
                              >
                                {c.title ? c.title : new URL(c.url).hostname}
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                  <Section title="How this impacts us">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7', color: '#0f172a' }}>{askResponse.howThisImpactsUs}</div>
                  </Section>
                  <Section title="Sources">
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {askResponse.sources.map((s, idx) => (
                        <a
                          key={idx}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: '10px 12px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            color: '#0f172a',
                            textDecoration: 'none',
                            background: '#fff',
                          }}
                        >
                          <div style={{ fontSize: '14px', fontWeight: '800' }}>{s.title || s.url}</div>
                          {s.publishedDate && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{s.publishedDate}</div>}
                          {s.snippet && <div style={{ fontSize: '13px', color: '#334155', marginTop: '6px', lineHeight: '1.45' }}>{s.snippet}</div>}
                        </a>
                      ))}
                    </div>
                  </Section>
                </div>
              )}
            </div>
          )}

          {tab === 'period-review' && (
            <div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ minWidth: '260px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                    Period (month)
                  </div>
                  <select
                    value={periodLabel}
                    onChange={(e) => setPeriodLabel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 12px',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                    }}
                  >
                    {monthly.map((m) => (
                      <option key={m.month} value={m.month}>
                        {m.month}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={runPeriodReview}
                  disabled={periodLoading || !periodLabel}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    background: periodLoading ? '#94a3b8' : '#667eea',
                    color: 'white',
                    fontWeight: '800',
                    cursor: periodLoading ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                    height: '42px',
                  }}
                >
                  {periodLoading ? 'Analyzing…' : 'Run Period Review'}
                </button>
              </div>

              {periodError && (
                <div style={{ marginTop: '12px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '10px' }}>
                  {periodError}
                </div>
              )}

              {periodResponse && (
                <div style={{ marginTop: '16px', display: 'grid', gap: '14px' }}>
                  <Section title={`Executive summary — ${periodResponse.period.label}`}>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{periodResponse.executiveSummary}</div>
                  </Section>
                  <Section title="Performance vs goals">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{periodResponse.performanceVsGoals}</div>
                  </Section>
                  <Section title="Peer & market context (sourced)">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{periodResponse.peerAndMarketContext}</div>
                  </Section>
                  <Section title="Operational trends (focus on negative)">
                    {periodResponse.operationalTrends.negativeTrendAlerts.length > 0 && (
                      <div style={{ display: 'grid', gap: '10px', marginBottom: '10px' }}>
                        {periodResponse.operationalTrends.negativeTrendAlerts.map((a, idx) => (
                          <div key={idx} style={{ padding: '12px', borderRadius: '10px', background: '#fff1f2', border: '1px solid #fecdd3' }}>
                            <div style={{ fontWeight: '900', color: '#9f1239' }}>{a.metric}</div>
                            <div style={{ marginTop: '6px', color: '#0f172a' }}><strong>Signal:</strong> {a.signal}</div>
                            <div style={{ marginTop: '6px', color: '#0f172a' }}><strong>Why it matters:</strong> {a.whyItMatters}</div>
                            <div style={{ marginTop: '6px', color: '#0f172a' }}><strong>Evidence:</strong> {a.evidence}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{periodResponse.operationalTrends.narrative}</div>
                  </Section>
                  <Section title="Drivers & risks">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{periodResponse.driversAndRisks}</div>
                  </Section>
                  <Section title="Opportunities (extremely successful scenario)">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{periodResponse.opportunities}</div>
                  </Section>
                  <Section title="Appendix (sources + run notes)">
                    {periodResponse.appendix.sources.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontWeight: '800', marginBottom: '6px' }}>Sources</div>
                        <div style={{ display: 'grid', gap: '6px' }}>
                          {periodResponse.appendix.sources.map((s, idx) => (
                            <a key={idx} href={s.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>
                              {s.title || s.url}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {periodResponse.appendix.notes.length > 0 && (
                      <div>
                        <div style={{ fontWeight: '800', marginBottom: '6px' }}>Notes</div>
                        <ul style={{ margin: 0, paddingLeft: '18px', color: '#0f172a' }}>
                          {periodResponse.appendix.notes.map((n, idx) => (
                            <li key={idx} style={{ marginBottom: '4px' }}>{n}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Section>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section(props: { title: string; children: any }) {
  return (
    <div style={{ padding: '14px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
      <div style={{ fontSize: '12px', fontWeight: '900', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '8px' }}>
        {props.title}
      </div>
      {props.children}
    </div>
  );
}

