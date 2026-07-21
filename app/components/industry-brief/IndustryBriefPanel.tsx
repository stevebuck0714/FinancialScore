'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DailyIndustryBrief, GrowthOpportunity, IndustryBriefImpact, IndustryBriefStatus } from '@/lib/industry-brief/types';

type Props = {
  companyId: string;
};

const cardStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  background: 'white',
  padding: '16px',
};

function statusTone(status: IndustryBriefStatus | unknown) {
  const normalized = renderText(status).toLowerCase();
  if (normalized === 'stable') return { label: 'Stable', bg: '#dcfce7', fg: '#166534', border: '#bbf7d0' };
  if (normalized === 'watch') return { label: 'Watch', bg: '#fef3c7', fg: '#92400e', border: '#fde68a' };
  return { label: 'Risk', bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' };
}

function impactTone(impact: IndustryBriefImpact | unknown) {
  const normalized = renderText(impact).toLowerCase();
  if (normalized === 'positive') return { bg: '#dcfce7', fg: '#166534', label: 'Positive' };
  if (normalized === 'negative') return { bg: '#fee2e2', fg: '#991b1b', label: 'Negative' };
  return { bg: '#f1f5f9', fg: '#475569', label: 'Neutral' };
}

function scoreColor(score: number | null): string {
  if (score == null) return '#64748b';
  if (score >= 75) return '#16a34a';
  if (score >= 55) return '#d97706';
  return '#dc2626';
}

function renderText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(renderText).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const text = renderText(item);
        return text ? `${key}: ${text}` : '';
      })
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

function renderScore(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : null;
}

function renderScoreLabel(value: unknown): string {
  const score = renderScore(value);
  return score == null ? 'N/A' : String(score);
}

function urgencyLabel(value: GrowthOpportunity['urgency']): string {
  const labels: Record<GrowthOpportunity['urgency'], string> = {
    today: 'Today',
    this_week: 'This week',
    '30_days': '30 days',
    '90_days': '90 days',
  };
  return labels[value] || renderText(value);
}

function formatDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function renderFormattedOutlookText(text: unknown): React.ReactNode {
  const lines = renderText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {lines.map((line, index) => {
        const heading = line.match(/^#{1,4}\s+(.+)$/);
        if (heading) {
          return (
            <div key={`${index}-${line}`} style={{ fontSize: index === 0 ? '16px' : '14px', color: '#0f172a', fontWeight: 900, marginTop: index === 0 ? 0 : '8px' }}>
              {renderText(heading[1])}
            </div>
          );
        }
        if (/^[-*]\s+/.test(line)) {
          return (
            <div key={`${index}-${line}`} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr)', gap: '6px', fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
              <span style={{ color: '#2751d0', fontWeight: 900 }}>•</span>
              <span>{line.replace(/^[-*]\s+/, '')}</span>
            </div>
          );
        }
        if (/^\d+\.\s+/.test(line)) {
          const marker = line.match(/^(\d+)\.\s+/)?.[1] || '';
          return (
            <div key={`${index}-${line}`} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', gap: '6px', fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
              <span style={{ color: '#2751d0', fontWeight: 900 }}>{marker}.</span>
              <span>{line.replace(/^\d+\.\s+/, '')}</span>
            </div>
          );
        }
        const label = line.match(/^([A-Z][A-Za-z &/()-]{2,45}):\s+(.+)$/);
        if (label) {
          return (
            <div key={`${index}-${line}`} style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
              <strong style={{ color: '#0f172a' }}>{renderText(label[1])}:</strong> {renderText(label[2])}
            </div>
          );
        }
        return (
          <div key={`${index}-${line}`} style={{ fontSize: '13px', color: '#334155', lineHeight: 1.55 }}>
            {line}
          </div>
        );
      })}
    </div>
  );
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (text) {
    try {
      const payload = JSON.parse(text);
      if (payload?.error) return String(payload.error);
      if (payload?.message) return String(payload.message);
    } catch {
      const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 240);
      if (snippet) return `Failed to load industry brief (${response.status} ${response.statusText}): ${snippet}`;
    }
  }
  return `Failed to load industry brief (${response.status} ${response.statusText})`;
}

export default function IndustryBriefPanel({ companyId }: Props) {
  const [brief, setBrief] = useState<DailyIndustryBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingMessage, setGeneratingMessage] = useState<string | null>(null);
  const [generatingStatus, setGeneratingStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'brief' | 'outlook'>('brief');

  const loadBrief = useCallback(async (force = false) => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ companyId });
      if (force) params.set('force', 'true');
      const response = await fetch(`/api/industry-brief?${params}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = await response.json();
      if (payload?.status === 'generating') {
        setGeneratingMessage(renderText(payload.message) || 'Daily Industry Brief is being generated. Please check again shortly.');
        setGeneratingStatus(renderText(payload.jobStatus) || null);
        return;
      }
      setGeneratingMessage(null);
      setGeneratingStatus(null);
      setBrief(payload);
    } catch (err: any) {
      setError(err?.message || 'Failed to load industry brief');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadBrief();
  }, [loadBrief]);

  useEffect(() => {
    if (!generatingMessage || brief) return;
    const timer = setTimeout(() => {
      loadBrief(false);
    }, 30000);
    return () => clearTimeout(timer);
  }, [brief, generatingMessage, loadBrief]);

  const topOpportunities = useMemo(
    () => [...(brief?.growthOpportunities || [])].sort((a, b) => (renderScore(b.score) ?? -1) - (renderScore(a.score) ?? -1)),
    [brief],
  );
  const outlookGroups = useMemo(() => {
    const items = brief?.industryOutlook || [];
    const news = items.filter((item) => {
      const provider = renderText(item.provider).toLowerCase();
      const category = renderText(item.category).toLowerCase();
      return provider === 'perplexity' || category.includes('news') || category.includes('competitive');
    });
    const newsIds = new Set(news.map((item) => renderText(item.id)));
    return {
      news,
      metrics: items.filter((item) => !newsIds.has(renderText(item.id))),
    };
  }, [brief]);

  if (loading && !brief) {
    return <div style={{ ...cardStyle, color: '#475569', marginTop: '14px' }}>Loading Daily Industry Brief...</div>;
  }

  if (generatingMessage && !brief) {
    return (
      <div style={{ ...cardStyle, color: '#475569', marginTop: '14px', display: 'grid', gap: '10px' }}>
        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Daily Industry Brief Is Generating</div>
        <div>{generatingMessage}</div>
        {generatingStatus && (
          <div style={{ fontSize: '12px', color: '#64748b' }}>Generation status: {generatingStatus}</div>
        )}
        <div style={{ fontSize: '12px', color: '#64748b' }}>This page will check again automatically.</div>
        <button
          onClick={() => loadBrief(false)}
          disabled={loading}
          style={{ justifySelf: 'start', border: '1px solid #cbd5e1', borderRadius: '999px', background: 'white', color: '#334155', padding: '6px 11px', fontSize: '12px', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Checking...' : 'Check Again'}
        </button>
      </div>
    );
  }

  if (error && !brief) {
    return (
      <div style={{ ...cardStyle, color: '#b91c1c', marginTop: '14px', display: 'grid', gap: '10px' }}>
        <div style={{ fontSize: '16px', fontWeight: 800 }}>Daily Industry Brief Failed</div>
        <div>{error}</div>
        <button
          onClick={() => loadBrief(true)}
          disabled={loading}
          style={{ justifySelf: 'start', border: '1px solid #fecaca', borderRadius: '999px', background: 'white', color: '#991b1b', padding: '6px 11px', fontSize: '12px', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Retrying...' : 'Retry Generation'}
        </button>
      </div>
    );
  }

  if (!brief) return null;
  const tone = statusTone(brief.executiveSummary.status);
  const tabButton = (tab: 'brief' | 'outlook', label: string) => (
    <button
      type="button"
      onClick={() => setActiveTab(tab)}
      style={{
        border: 'none',
        borderBottom: activeTab === tab ? '3px solid #2751d0' : '3px solid transparent',
        background: 'transparent',
        color: activeTab === tab ? '#1e40af' : '#64748b',
        padding: '10px 4px',
        fontSize: '13px',
        fontWeight: 900,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ marginTop: '14px', display: 'grid', gap: '14px' }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#2751d0', textTransform: 'uppercase' }}>Daily Industry Brief</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{renderText(brief.company.name)}</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '3px' }}>
              {renderText(brief.company.revenueLabel)} revenue | {renderText(brief.company.industry)} | {renderText(brief.company.segment)} | {renderText(brief.company.location)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ border: `1px solid ${tone.border}`, borderRadius: '999px', background: tone.bg, color: tone.fg, padding: '5px 10px', fontSize: '12px', fontWeight: 800 }}>
              {tone.label}
            </span>
            <button
              onClick={() => loadBrief(true)}
              disabled={loading}
              style={{ border: '1px solid #cbd5e1', borderRadius: '999px', background: 'white', color: '#334155', padding: '6px 11px', fontSize: '12px', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '170px minmax(0, 1fr)', gap: '16px', alignItems: 'center' }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', textAlign: 'center', background: '#f8fafc' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Industry Score</div>
            <div style={{ fontSize: '38px', fontWeight: 900, color: scoreColor(renderScore(brief.overallScore)), lineHeight: 1 }}>{renderScoreLabel(brief.overallScore)}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>out of 100</div>
          </div>
          <div>
            <div style={{ fontSize: '17px', color: '#0f172a', fontWeight: 800 }}>{renderText(brief.executiveSummary.headline)}</div>
            <div style={{ marginTop: '8px', display: 'grid', gap: '5px' }}>
              {brief.executiveSummary.bullets.map((bullet) => (
                <div key={renderText(bullet)} style={{ fontSize: '14px', color: '#334155' }}>- {renderText(bullet)}</div>
              ))}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
              Generated {formatDateTime(brief.generatedAt)}
            </div>
          </div>
        </div>
      </div>
        <div style={{ display: 'flex', gap: '18px', borderTop: '1px solid #e2e8f0', marginTop: '14px', paddingTop: '2px' }}>
          {tabButton('brief', 'Brief & Actions')}
          {tabButton('outlook', 'Industry Outlook')}
        </div>

      {activeTab === 'outlook' ? (
        <>
          <div style={cardStyle}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Market & Competitive Outlook</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
              Current industry, competitor, channel, and local-market context used by the AI brief.
            </div>
            <div style={{ marginTop: '12px', display: 'grid', gap: '12px' }}>
              {outlookGroups.news.length > 0 ? outlookGroups.news.map((item) => (
                <div key={renderText(item.id)} style={{ border: '1px solid #bfdbfe', borderRadius: '12px', padding: '16px', background: '#f8fbff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#2751d0', fontWeight: 900, textTransform: 'uppercase' }}>{renderText(item.category)}</div>
                      <div style={{ fontSize: '16px', color: '#0f172a', fontWeight: 850, marginTop: '3px' }}>{renderText(item.title)}</div>
                    </div>
                    <span style={{ alignSelf: 'flex-start', fontSize: '11px', color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: '999px', padding: '4px 8px', fontWeight: 900 }}>
                      Live: {renderText(item.provider)}
                    </span>
                  </div>
                  <div style={{ marginTop: '10px' }}>{renderFormattedOutlookText(item.summary)}</div>
                  {item.citations.length > 0 && (
                    <details style={{ marginTop: '10px' }}>
                      <summary style={{ fontSize: '12px', color: '#1d4ed8', fontWeight: 800, cursor: 'pointer' }}>Sources ({item.citations.length})</summary>
                      <div style={{ marginTop: '8px', display: 'grid', gap: '4px' }}>
                        {item.citations.slice(0, 12).map((citation) => (
                          <a key={renderText(citation)} href={renderText(citation)} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#1d4ed8', overflowWrap: 'anywhere' }}>
                            {renderText(citation)}
                          </a>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )) : (
                <div style={{ fontSize: '13px', color: '#64748b' }}>No news or competitive source records were included in today&apos;s live source set.</div>
              )}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Key Economic Signals</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
              Compact live economic values used as evidence by the brief.
            </div>
            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
              {outlookGroups.metrics.map((item) => (
                <div key={renderText(item.id)} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', background: '#f8fafc', minHeight: '110px' }}>
                  <div style={{ fontSize: '11px', color: '#2751d0', fontWeight: 900, textTransform: 'uppercase' }}>{renderText(item.category)}</div>
                  <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 850, marginTop: '4px' }}>{renderText(item.title)}</div>
                  <div style={{ fontSize: '18px', color: '#0f172a', fontWeight: 900, marginTop: '7px' }}>{renderText(item.value) || 'Live source'}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    {item.publishedAt ? `As of ${renderText(item.publishedAt)}` : renderText(item.provider)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '7px' }}>{renderText(item.summary)}</div>
                </div>
              ))}
            </div>
            {brief.industryOutlook.length > 0 && (
              <details style={{ marginTop: '14px' }}>
                <summary style={{ fontSize: '12px', color: '#475569', fontWeight: 900, cursor: 'pointer' }}>Source Detail & Citations</summary>
                <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
                  {brief.industryOutlook.map((item) => (
                    <div key={`source-${renderText(item.id)}`} style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                      <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 850 }}>{renderText(item.provider)}: {renderText(item.title)}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>{renderText(item.category)}{item.publishedAt ? ` | ${renderText(item.publishedAt)}` : ''}</div>
                      {item.citations.length > 0 && (
                        <div style={{ marginTop: '5px', display: 'grid', gap: '3px' }}>
                          {item.citations.slice(0, 5).map((citation) => (
                            <a key={renderText(citation)} href={renderText(citation)} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#1d4ed8', overflowWrap: 'anywhere' }}>
                              {renderText(citation)}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>AI-Classified Market Signals</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
              Broader industry and local signals extracted from the live source set.
            </div>
            <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
              {brief.marketSignals.map((signal) => {
                const impact = impactTone(signal.impact);
                return (
                  <div key={`${renderText(signal.category)}-${renderText(signal.title)}`} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>{renderText(signal.category)}: {renderText(signal.title)}</div>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: impact.fg, background: impact.bg, borderRadius: '999px', padding: '3px 8px' }}>{impact.label}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '3px' }}>{renderText(signal.currentValue)} | {renderText(signal.trend)}</div>
                    <div style={{ fontSize: '13px', color: '#334155', marginTop: '4px' }}>{renderText(signal.companyImplication)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {brief.healthIndicators.map((indicator) => (
          <div key={renderText(indicator.key)} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '13px', color: '#475569', fontWeight: 800 }}>{renderText(indicator.label)}</div>
              <div style={{ fontSize: '20px', color: scoreColor(renderScore(indicator.score)), fontWeight: 900 }}>{renderScoreLabel(indicator.score)}</div>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px', textTransform: 'capitalize' }}>{renderText(indicator.trend)}</div>
            <div style={{ fontSize: '13px', color: '#334155', marginTop: '7px' }}>{renderText(indicator.note)}</div>
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Top Growth Opportunities</div>
        <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
          Ranked by revenue potential, margin potential, strategic fit, urgency, and confidence.
        </div>
        <div style={{ marginTop: '12px', display: 'grid', gap: '12px' }}>
          {topOpportunities.map((opportunity) => (
            <div key={renderText(opportunity.id)} style={{ border: '1px solid #dbeafe', background: '#f8fbff', borderRadius: '12px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e3a8a' }}>{renderText(opportunity.title)}</div>
                  <div style={{ fontSize: '13px', color: '#334155', marginTop: '5px' }}>{renderText(opportunity.whyNow)}</div>
                </div>
                <div style={{ minWidth: '90px', textAlign: 'right' }}>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: scoreColor(renderScore(opportunity.score)), lineHeight: 1 }}>{renderScoreLabel(opportunity.score)}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>Opportunity</div>
                </div>
              </div>
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#1d4ed8', background: '#dbeafe', borderRadius: '999px', padding: '4px 8px' }}>Revenue: {renderText(opportunity.revenuePotential)}</span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#166534', background: '#dcfce7', borderRadius: '999px', padding: '4px 8px' }}>Margin: {renderText(opportunity.marginPotential)}</span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#92400e', background: '#fef3c7', borderRadius: '999px', padding: '4px 8px' }}>Urgency: {urgencyLabel(opportunity.urgency)}</span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', background: '#f1f5f9', borderRadius: '999px', padding: '4px 8px' }}>Confidence: {renderText(opportunity.confidence)}</span>
              </div>
              <div style={{ marginTop: '10px', fontSize: '14px', color: '#0f172a' }}>
                <strong>Recommended action:</strong> {renderText(opportunity.recommendedAction)}
              </div>
              <div style={{ marginTop: '6px', fontSize: '13px', color: '#475569' }}>
                <strong>Owner:</strong> {renderText(opportunity.owner)} | <strong>Estimated impact:</strong> {renderText(opportunity.estimatedImpact)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)', gap: '14px' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Recommended Actions</div>
          <div style={{ marginTop: '10px', display: 'grid', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#475569', fontWeight: 900, textTransform: 'uppercase' }}>Today</div>
              {brief.recommendedActions.today.map((action) => <div key={renderText(action)} style={{ fontSize: '13px', color: '#334155', marginTop: '5px' }}>- {renderText(action)}</div>)}
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#475569', fontWeight: 900, textTransform: 'uppercase' }}>Next 30 Days</div>
              {brief.recommendedActions.next30Days.map((action) => <div key={renderText(action)} style={{ fontSize: '13px', color: '#334155', marginTop: '5px' }}>- {renderText(action)}</div>)}
            </div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>AI Insight</div>
        <div style={{ fontSize: '14px', color: '#334155', marginTop: '8px' }}>{renderText(brief.aiInsight)}</div>
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {brief.aiMetadata && (
            <span title={`Scan model: ${brief.aiMetadata.scanModel}`} style={{ fontSize: '11px', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '999px', padding: '4px 8px' }}>
              AI model: {renderText(brief.aiMetadata.finalModel)}
            </span>
          )}
          {brief.sourceNotes.map((source) => (
            <span key={renderText(source.name)} title={renderText(source.note)} style={{ fontSize: '11px', color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '999px', padding: '4px 8px' }}>
              {renderText(source.name)}: {renderText(source.status)}
            </span>
          ))}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
