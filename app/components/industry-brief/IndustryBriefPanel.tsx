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

function statusTone(status: IndustryBriefStatus) {
  if (status === 'stable') return { label: 'Stable', bg: '#dcfce7', fg: '#166534', border: '#bbf7d0' };
  if (status === 'watch') return { label: 'Watch', bg: '#fef3c7', fg: '#92400e', border: '#fde68a' };
  return { label: 'Risk', bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' };
}

function impactTone(impact: IndustryBriefImpact) {
  if (impact === 'positive') return { bg: '#dcfce7', fg: '#166534', label: 'Positive' };
  if (impact === 'negative') return { bg: '#fee2e2', fg: '#991b1b', label: 'Negative' };
  return { bg: '#f1f5f9', fg: '#475569', label: 'Neutral' };
}

function scoreColor(score: number): string {
  if (score >= 75) return '#16a34a';
  if (score >= 55) return '#d97706';
  return '#dc2626';
}

function urgencyLabel(value: GrowthOpportunity['urgency']): string {
  const labels: Record<GrowthOpportunity['urgency'], string> = {
    today: 'Today',
    this_week: 'This week',
    '30_days': '30 days',
    '90_days': '90 days',
  };
  return labels[value] || value;
}

function formatDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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
      setBrief(await response.json());
    } catch (err: any) {
      setError(err?.message || 'Failed to load industry brief');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadBrief();
  }, [loadBrief]);

  const topOpportunities = useMemo(
    () => [...(brief?.growthOpportunities || [])].sort((a, b) => b.score - a.score),
    [brief],
  );

  if (loading && !brief) {
    return <div style={{ ...cardStyle, color: '#475569', marginTop: '14px' }}>Loading Daily Industry Brief...</div>;
  }

  if (error && !brief) {
    return <div style={{ ...cardStyle, color: '#b91c1c', marginTop: '14px' }}>{error}</div>;
  }

  if (!brief) return null;
  const tone = statusTone(brief.executiveSummary.status);

  return (
    <div style={{ marginTop: '14px', display: 'grid', gap: '14px' }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#2751d0', textTransform: 'uppercase' }}>Daily Industry Brief</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{brief.company.name}</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '3px' }}>
              {brief.company.revenueLabel} revenue | {brief.company.industry} | {brief.company.segment} | {brief.company.location}
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
            <div style={{ fontSize: '38px', fontWeight: 900, color: scoreColor(brief.overallScore), lineHeight: 1 }}>{brief.overallScore}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>out of 100</div>
          </div>
          <div>
            <div style={{ fontSize: '17px', color: '#0f172a', fontWeight: 800 }}>{brief.executiveSummary.headline}</div>
            <div style={{ marginTop: '8px', display: 'grid', gap: '5px' }}>
              {brief.executiveSummary.bullets.map((bullet) => (
                <div key={bullet} style={{ fontSize: '14px', color: '#334155' }}>- {bullet}</div>
              ))}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
              Generated {formatDateTime(brief.generatedAt)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {brief.healthIndicators.map((indicator) => (
          <div key={indicator.key} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '13px', color: '#475569', fontWeight: 800 }}>{indicator.label}</div>
              <div style={{ fontSize: '20px', color: scoreColor(indicator.score), fontWeight: 900 }}>{indicator.score}</div>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px', textTransform: 'capitalize' }}>{indicator.trend}</div>
            <div style={{ fontSize: '13px', color: '#334155', marginTop: '7px' }}>{indicator.note}</div>
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
            <div key={opportunity.id} style={{ border: '1px solid #dbeafe', background: '#f8fbff', borderRadius: '12px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e3a8a' }}>{opportunity.title}</div>
                  <div style={{ fontSize: '13px', color: '#334155', marginTop: '5px' }}>{opportunity.whyNow}</div>
                </div>
                <div style={{ minWidth: '90px', textAlign: 'right' }}>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: scoreColor(opportunity.score), lineHeight: 1 }}>{opportunity.score}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>Opportunity</div>
                </div>
              </div>
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#1d4ed8', background: '#dbeafe', borderRadius: '999px', padding: '4px 8px' }}>Revenue: {opportunity.revenuePotential}</span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#166534', background: '#dcfce7', borderRadius: '999px', padding: '4px 8px' }}>Margin: {opportunity.marginPotential}</span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#92400e', background: '#fef3c7', borderRadius: '999px', padding: '4px 8px' }}>Urgency: {urgencyLabel(opportunity.urgency)}</span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', background: '#f1f5f9', borderRadius: '999px', padding: '4px 8px' }}>Confidence: {opportunity.confidence}</span>
              </div>
              <div style={{ marginTop: '10px', fontSize: '14px', color: '#0f172a' }}>
                <strong>Recommended action:</strong> {opportunity.recommendedAction}
              </div>
              <div style={{ marginTop: '6px', fontSize: '13px', color: '#475569' }}>
                <strong>Owner:</strong> {opportunity.owner} | <strong>Estimated impact:</strong> {opportunity.estimatedImpact}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)', gap: '14px' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Market Signals</div>
          <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
            {brief.marketSignals.map((signal) => {
              const impact = impactTone(signal.impact);
              return (
                <div key={`${signal.category}-${signal.title}`} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>{signal.category}: {signal.title}</div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: impact.fg, background: impact.bg, borderRadius: '999px', padding: '3px 8px' }}>{impact.label}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '3px' }}>{signal.currentValue} | {signal.trend}</div>
                  <div style={{ fontSize: '13px', color: '#334155', marginTop: '4px' }}>{signal.companyImplication}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Recommended Actions</div>
          <div style={{ marginTop: '10px', display: 'grid', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#475569', fontWeight: 900, textTransform: 'uppercase' }}>Today</div>
              {brief.recommendedActions.today.map((action) => <div key={action} style={{ fontSize: '13px', color: '#334155', marginTop: '5px' }}>- {action}</div>)}
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#475569', fontWeight: 900, textTransform: 'uppercase' }}>Next 30 Days</div>
              {brief.recommendedActions.next30Days.map((action) => <div key={action} style={{ fontSize: '13px', color: '#334155', marginTop: '5px' }}>- {action}</div>)}
            </div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>AI Insight</div>
        <div style={{ fontSize: '14px', color: '#334155', marginTop: '8px' }}>{brief.aiInsight}</div>
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {brief.aiMetadata && (
            <span title={`Scan model: ${brief.aiMetadata.scanModel}`} style={{ fontSize: '11px', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '999px', padding: '4px 8px' }}>
              AI model: {brief.aiMetadata.finalModel}
            </span>
          )}
          {brief.sourceNotes.map((source) => (
            <span key={source.name} title={source.note} style={{ fontSize: '11px', color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '999px', padding: '4px 8px' }}>
              {source.name}: {source.status}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
