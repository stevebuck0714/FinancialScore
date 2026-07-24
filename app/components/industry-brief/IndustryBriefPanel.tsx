'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DailyIndustryBrief, GrowthOpportunity, IndustryBriefImpact, IndustryBriefStatus, IndustryOutlookItem } from '@/lib/industry-brief/types';

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

function formatMonthLabel(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function formatMetricValue(value: number, unit?: string): string {
  const formatted = Math.abs(value) >= 1000 ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function isCorelyticsOperatingContext(item: IndustryOutlookItem): boolean {
  return renderText(item.provider).toLowerCase() === 'corelytics company profile';
}

function parseLabeledSummary(value: unknown): Array<{ label: string; value: string }> {
  const sections: Array<{ label: string; value: string }> = [];
  const lines = renderText(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const labeled = line.match(/^([^:]{3,90}):\s*(.+)$/);
    if (labeled) {
      sections.push({ label: labeled[1].trim(), value: labeled[2].trim() });
      continue;
    }
    const last = sections[sections.length - 1];
    if (last) {
      last.value = `${last.value}\n${line}`;
    } else {
      sections.push({ label: 'Context', value: line });
    }
  }

  return sections;
}

function operatingContextLabel(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes('top products')) return 'Product Mix';
  if (normalized.includes('theme mix')) return 'Product Theme Mix';
  if (normalized.includes('inferred product')) return 'Inferred Product Themes';
  if (normalized.includes('top customers')) return 'Customer & Channel Mix';
  if (normalized.includes('inferred customer')) return 'Inferred Customer Channels';
  if (normalized.includes('strategic market')) return 'Strategic Market Read';
  return label;
}

function splitOperatingEvidence(value: string, limit = 8): string[] {
  const primaryParts = value.includes(';') ? value.split(';') : value.split(',');
  return primaryParts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => {
      const normalized = part.toLowerCase();
      return part
        && !normalized.includes('unknown item')
        && !normalized.includes('*** revised ***')
        && !normalized.includes('*** frozen ***')
        && !/:\s*\$0(?:\D|$)/.test(part);
    })
    .slice(0, limit);
}

function CorelyticsOperatingContextSection({ items }: { items: IndustryOutlookItem[] }) {
  if (items.length === 0) return null;

  const operationalItems = items.filter((item) => renderText(item.id) === 'corelytics-operational-product-mix');
  const companyItems = items.filter((item) => renderText(item.id) !== 'corelytics-operational-product-mix');
  const operationalSections = operationalItems.flatMap((item) => parseLabeledSummary(item.summary));

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Company Operating Context</div>
          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            First-party product, customer, and setup evidence used to interpret the market outlook.
          </div>
        </div>
        <span style={{ alignSelf: 'flex-start', fontSize: '11px', color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: '999px', padding: '4px 8px', fontWeight: 900 }}>
          Corelytics data
        </span>
      </div>

      {operationalSections.length > 0 && (
        <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
          {operationalSections.map((section) => {
            const evidenceItems = splitOperatingEvidence(section.value, section.label.toLowerCase().includes('strategic') ? 5 : 7);
            return (
              <div key={`${section.label}-${section.value.slice(0, 24)}`} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc', padding: '12px' }}>
                <div style={{ fontSize: '12px', color: '#2751d0', fontWeight: 900, textTransform: 'uppercase' }}>{operatingContextLabel(section.label)}</div>
                <div style={{ marginTop: '8px', display: 'grid', gap: '6px' }}>
                  {evidenceItems.length > 1 ? evidenceItems.map((evidence, evidenceIndex) => (
                    <div key={`${evidence}-${evidenceIndex}`} style={{ fontSize: '13px', color: '#334155', lineHeight: 1.45 }}>{evidence}</div>
                  )) : (
                    <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>{renderFormattedOutlookText(section.value)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {companyItems.length > 0 && (
        <details style={{ marginTop: '14px' }}>
          <summary style={{ fontSize: '12px', color: '#475569', fontWeight: 900, cursor: 'pointer' }}>Company Setup Notes</summary>
          <div style={{ marginTop: '10px', display: 'grid', gap: '10px' }}>
            {companyItems.map((item) => (
              <div key={renderText(item.id)} style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 850 }}>{renderText(item.title)}</div>
                <div style={{ marginTop: '6px' }}>{renderFormattedOutlookText(item.summary)}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function SignalTrendChart({ item }: { item: IndustryOutlookItem }) {
  const history = (item.history || []).filter((point) => Number.isFinite(Number(point.value)));
  if (history.length < 2) {
    return <div style={{ fontSize: '13px', color: '#64748b' }}>Not enough historical observations are available for this signal.</div>;
  }
  const values = history.map((point) => Number(point.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.abs(max - min) < 0.000001 ? 1 : max - min;
  const width = 720;
  const height = 260;
  const padding = { top: 20, right: 24, bottom: 42, left: 58 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const points = history.map((point, index) => {
    const x = padding.left + (history.length === 1 ? 0 : (index / (history.length - 1)) * innerWidth);
    const y = padding.top + ((max - Number(point.value)) / range) * innerHeight;
    return { ...point, x, y, value: Number(point.value) };
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${renderText(item.title)} 12-month trend`} style={{ width: '100%', maxHeight: '320px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc' }}>
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + innerHeight} stroke="#cbd5e1" />
        <line x1={padding.left} y1={padding.top + innerHeight} x2={padding.left + innerWidth} y2={padding.top + innerHeight} stroke="#cbd5e1" />
        {[min, max].map((tick) => {
          const y = padding.top + ((max - tick) / range) * innerHeight;
          return (
            <g key={`tick-${tick}`}>
              <line x1={padding.left} y1={y} x2={padding.left + innerWidth} y2={y} stroke="#e2e8f0" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">{formatMetricValue(tick, item.unit)}</text>
            </g>
          );
        })}
        <path d={path} fill="none" stroke="#2751d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <g key={`${point.date}-${index}`}>
            <circle cx={point.x} cy={point.y} r="4" fill="#2751d0" />
            <title>{`${formatMonthLabel(point.date)}: ${formatMetricValue(point.value, item.unit)}`}</title>
          </g>
        ))}
        {first && <text x={first.x} y={height - 14} textAnchor="middle" fontSize="11" fill="#64748b">{formatMonthLabel(first.date)}</text>}
        {last && <text x={last.x} y={height - 14} textAnchor="middle" fontSize="11" fill="#64748b">{formatMonthLabel(last.date)}</text>}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
        {points.map((point) => (
          <div key={point.date} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px', background: 'white' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>{formatMonthLabel(point.date)}</div>
            <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 900, marginTop: '2px' }}>{formatMetricValue(point.value, item.unit)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.+?\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    const bold = part.match(/^\*\*\s*(.+?)\s*\*\*$/);
    if (bold) {
      return <strong key={`${index}-${part}`} style={{ color: '#0f172a' }}>{bold[1]}</strong>;
    }
    return <React.Fragment key={`${index}-${part}`}>{part.replace(/\*\*/g, '')}</React.Fragment>;
  });
}

function stripMarkdownDelimiters(text: string): string {
  return text
    .replace(/\*\*\s*(.+?)\s*\*\*/g, '$1')
    .replace(/^[-_*]{3,}$/, '')
    .trim();
}

function isAllCapsHeading(line: string): boolean {
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length < 8) return false;
  return line === line.toUpperCase() && /[A-Z]/.test(line);
}

function renderFormattedOutlookText(text: unknown): React.ReactNode {
  const rawLines = renderText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lines: string[] = [];
  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index];
    if (/^[-*•]$/.test(line) && rawLines[index + 1]) {
      lines.push(`- ${rawLines[index + 1]}`);
      index += 1;
    } else if (/^[-_*]{3,}$/.test(line)) {
      continue;
    } else {
      lines.push(line);
    }
  }
  if (lines.length === 0) return null;

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {lines.map((line, index) => {
        const heading = line.match(/^#{1,4}\s+(.+)$/);
        if (heading) {
          const headingText = stripMarkdownDelimiters(renderText(heading[1]));
          return (
            <div key={`${index}-${line}`} style={{ fontSize: index === 0 ? '16px' : '14px', color: '#0f172a', fontWeight: 900, marginTop: index === 0 ? 0 : '8px' }}>
              {headingText}
            </div>
          );
        }
        const boldHeading = line.match(/^\*\*\s*(.+?)\s*\*\*$/);
        const cleanedLine = stripMarkdownDelimiters(line);
        if (boldHeading || isAllCapsHeading(cleanedLine)) {
          return (
            <div key={`${index}-${line}`} style={{ fontSize: index === 0 ? '16px' : '14px', color: '#0f172a', fontWeight: 900, marginTop: index === 0 ? 0 : '8px' }}>
              {cleanedLine}
            </div>
          );
        }
        if (/^[-*•]\s+/.test(line)) {
          const itemText = stripMarkdownDelimiters(line.replace(/^[-*•]\s+/, ''));
          return (
            <div key={`${index}-${line}`} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr)', gap: '6px', fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
              <span style={{ color: '#2751d0', fontWeight: 900 }}>•</span>
              <span>{renderInlineMarkdown(itemText)}</span>
            </div>
          );
        }
        if (/^\d+\.\s+/.test(line)) {
          const marker = line.match(/^(\d+)\.\s+/)?.[1] || '';
          const itemText = stripMarkdownDelimiters(line.replace(/^\d+\.\s+/, ''));
          return (
            <div key={`${index}-${line}`} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', gap: '6px', fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
              <span style={{ color: '#2751d0', fontWeight: 900 }}>{marker}.</span>
              <span>{renderInlineMarkdown(itemText)}</span>
            </div>
          );
        }
        const label = cleanedLine.match(/^([A-Z][A-Za-z &/()-]{2,45}):\s+(.+)$/);
        if (label) {
          return (
            <div key={`${index}-${line}`} style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
              <strong style={{ color: '#0f172a' }}>{renderInlineMarkdown(renderText(label[1]))}:</strong> {renderInlineMarkdown(renderText(label[2]))}
            </div>
          );
        }
        return (
          <div key={`${index}-${line}`} style={{ fontSize: '13px', color: '#334155', lineHeight: 1.55 }}>
            {renderInlineMarkdown(cleanedLine)}
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
  const [activeSignalChart, setActiveSignalChart] = useState<IndustryOutlookItem | null>(null);

  const loadBrief = useCallback(async (force = false, refreshStatus = false) => {
    if (!companyId) return;
    setLoading(true);
    if (!refreshStatus) setError(null);
    try {
      const params = new URLSearchParams({ companyId });
      if (force) params.set('force', 'true');
      if (refreshStatus) params.set('refreshStatus', 'true');
      const response = await fetch(`/api/industry-brief?${params}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = await response.json();
      if (payload?.status === 'generating') {
        setError(null);
        setGeneratingMessage(renderText(payload.message) || 'Daily Industry Brief is being generated. Please check again shortly.');
        setGeneratingStatus(renderText(payload.jobStatus) || null);
        return;
      }
      setError(null);
      setGeneratingMessage(null);
      setGeneratingStatus(null);
      setBrief(payload);
    } catch (err: any) {
      setError(err?.message || 'Failed to load industry brief');
      if (refreshStatus) {
        setGeneratingMessage(null);
        setGeneratingStatus(null);
      }
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadBrief();
  }, [loadBrief]);

  useEffect(() => {
    if (!generatingMessage) return;
    const timer = setTimeout(() => {
      loadBrief(false, Boolean(brief));
    }, 30000);
    return () => clearTimeout(timer);
  }, [brief, generatingMessage, loadBrief]);

  const topOpportunities = useMemo(
    () => [...(brief?.growthOpportunities || [])].sort((a, b) => (renderScore(b.score) ?? -1) - (renderScore(a.score) ?? -1)),
    [brief],
  );
  const outlookGroups = useMemo(() => {
    const items = brief?.industryOutlook || [];
    const context = items.filter(isCorelyticsOperatingContext);
    const contextIds = new Set(context.map((item) => renderText(item.id)));
    const news = items.filter((item) => {
      const provider = renderText(item.provider).toLowerCase();
      const category = renderText(item.category).toLowerCase();
      return !contextIds.has(renderText(item.id)) && (provider === 'perplexity' || category.includes('news') || category.includes('competitive'));
    });
    const newsIds = new Set(news.map((item) => renderText(item.id)));
    return {
      context,
      news,
      metrics: items.filter((item) => !contextIds.has(renderText(item.id)) && !newsIds.has(renderText(item.id))),
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
      {activeSignalChart && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${renderText(activeSignalChart.title)} trend`}
          onClick={() => setActiveSignalChart(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.58)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: '18px' }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ width: 'min(880px, 96vw)', maxHeight: '88vh', overflow: 'auto', borderRadius: '16px', background: 'white', boxShadow: '0 24px 80px rgba(15,23,42,0.35)', padding: '18px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#2751d0', fontWeight: 900, textTransform: 'uppercase' }}>{renderText(activeSignalChart.category)}</div>
                <div style={{ fontSize: '20px', color: '#0f172a', fontWeight: 900, marginTop: '4px' }}>{renderText(activeSignalChart.title)}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  {renderText(activeSignalChart.provider)} | Latest: {renderText(activeSignalChart.value) || 'Live source'}{activeSignalChart.publishedAt ? ` | As of ${renderText(activeSignalChart.publishedAt)}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSignalChart(null)}
                style={{ border: '1px solid #cbd5e1', borderRadius: '999px', background: 'white', color: '#334155', padding: '6px 11px', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
            <div style={{ marginTop: '14px' }}>
              <SignalTrendChart item={activeSignalChart} />
            </div>
          </div>
        </div>
      )}
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

        <div style={{ marginTop: '14px' }}>
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
      {generatingMessage && brief && (
        <div style={{ ...cardStyle, borderColor: '#bfdbfe', background: '#eff6ff', color: '#1e3a8a', display: 'grid', gap: '4px' }}>
          <div style={{ fontSize: '14px', fontWeight: 900 }}>Daily Industry Brief refresh is running</div>
          <div style={{ fontSize: '13px' }}>{generatingMessage}</div>
          {generatingStatus && <div style={{ fontSize: '12px', color: '#475569' }}>Generation status: {generatingStatus}</div>}
          <div style={{ fontSize: '12px', color: '#475569' }}>Current cached brief remains visible until the refresh completes.</div>
        </div>
      )}
      {error && brief && (
        <div style={{ ...cardStyle, borderColor: '#fecaca', background: '#fff7f7', color: '#991b1b', display: 'grid', gap: '4px' }}>
          <div style={{ fontSize: '14px', fontWeight: 900 }}>Daily Industry Brief refresh failed</div>
          <div style={{ fontSize: '13px' }}>{error}</div>
          <div style={{ fontSize: '12px', color: '#7f1d1d' }}>The previous cached brief is still shown below.</div>
        </div>
      )}
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
                  {(item.history?.length || 0) >= 2 ? (
                    <button
                      type="button"
                      onClick={() => setActiveSignalChart(item)}
                      style={{ marginTop: '9px', border: 'none', background: 'transparent', color: '#1d4ed8', padding: 0, fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}
                    >
                      View 12-month trend
                    </button>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '9px', fontWeight: 800 }}>
                      Trend available after next refresh
                    </div>
                  )}
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

          <CorelyticsOperatingContextSection items={outlookGroups.context} />
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
