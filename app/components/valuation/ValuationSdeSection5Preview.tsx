'use client';

import dynamic from 'next/dynamic';
import type { MonthlyDataRow } from '@/app/types';
import type { SdeValuationPreviewModel } from '@/lib/sde-valuation-preview-model';
import type { SdeExecutiveSummary, SdeExecutiveFinancialSummary, SdeRecommendation } from '@/lib/sde-recommendations';
import ValuationBalanceSheetQualityPreview from './ValuationBalanceSheetQualityPreview';

const LineChart = dynamic(() => import('@/app/components/charts/Charts').then((mod) => mod.LineChart), { ssr: false });

type Selections = Record<string, boolean>;

type Props = {
  model: SdeValuationPreviewModel;
  monthly: MonthlyDataRow[];
  selections: Selections;
  companyName: string;
  latestFinancialSource: string | null;
  sdeExecutiveSummaryApi: SdeExecutiveSummary | null;
  sdeExecutiveFinancialSummaryApi: SdeExecutiveFinancialSummary | null;
  sdeRecommendationsApi: SdeRecommendation[];
};

const sectionTitle = (title: string) => (
  <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', margin: '16px 0 10px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
    {title}
  </div>
);

export function EbitdaMarginComboChart({ data }: { data: Array<{ year: number; revenue: number; ebitdaMargin: number }> }) {
  if (data.length === 0) {
    return <div style={{ fontSize: '12px', color: '#64748b', padding: '24px 0' }}>Not enough data to render chart.</div>;
  }
  return (
    <svg viewBox="0 0 760 320" style={{ width: '100%', height: 'auto' }}>
      {(() => {
        const width = 760;
        const height = 320;
        const pad = { top: 28, right: 56, bottom: 42, left: 56 };
        const chartW = width - pad.left - pad.right;
        const chartH = height - pad.top - pad.bottom;
        const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
        const maxMargin = Math.max(...data.map((d) => d.ebitdaMargin), 1);
        const xStep = chartW / data.length;
        const barW = Math.min(56, xStep * 0.55);
        const linePoints = data
          .map((d, idx) => {
            const x = pad.left + xStep * idx + xStep / 2;
            const y = pad.top + chartH - (Math.max(0, d.ebitdaMargin) / maxMargin) * chartH;
            return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
          })
          .join(' ');

        return (
          <>
            <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke="#cbd5e1" strokeWidth="2" />
            <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke="#cbd5e1" strokeWidth="2" />
            <line x1={width - pad.right} y1={pad.top} x2={width - pad.right} y2={height - pad.bottom} stroke="#cbd5e1" strokeWidth="1" />
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const y = pad.top + chartH - chartH * pct;
              const leftVal = Math.round((maxRevenue * pct) / 1_000_000);
              const rightVal = (maxMargin * pct).toFixed(1);
              return (
                <g key={pct}>
                  <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                  <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
                    ${leftVal}M
                  </text>
                  <text x={width - pad.right + 8} y={y + 4} textAnchor="start" fontSize="10" fill="#64748b">
                    {rightVal}%
                  </text>
                </g>
              );
            })}
            {data.map((d, idx) => {
              const centerX = pad.left + xStep * idx + xStep / 2;
              const barH = (d.revenue / maxRevenue) * chartH;
              const barY = pad.top + chartH - barH;
              const marginY = pad.top + chartH - (Math.max(0, d.ebitdaMargin) / maxMargin) * chartH;
              return (
                <g key={d.year}>
                  <rect x={centerX - barW / 2} y={barY} width={barW} height={barH} fill="#1d76c3" rx="3" />
                  <text x={centerX} y={barY + 16} textAnchor="middle" fontSize="10" fill="white" fontWeight="700">
                    ${Math.round(d.revenue / 1_000_000)}
                  </text>
                  <circle cx={centerX} cy={marginY} r="4" fill="#5fbcd3" stroke="white" strokeWidth="1.5" />
                  <text x={centerX} y={marginY - 8} textAnchor="middle" fontSize="10" fill="#0f766e" fontWeight="700">
                    {d.ebitdaMargin.toFixed(1)}%
                  </text>
                  <text x={centerX} y={height - pad.bottom + 16} textAnchor="middle" fontSize="10" fill="#475569">
                    {d.year}
                  </text>
                </g>
              );
            })}
            <path d={linePoints} fill="none" stroke="#5fbcd3" strokeWidth="2.5" />
          </>
        );
      })()}
    </svg>
  );
}

function QoeWaterfallChart({
  ttmEbitdaAnalysis,
  qoeOwnerSalaryAdjustment,
  qoePersonalAutoLease,
  qoeOneTimeExpenses,
  qoeOneTimeRevenue,
  qualityOfEarnings,
}: {
  ttmEbitdaAnalysis: number;
  qoeOwnerSalaryAdjustment: number;
  qoePersonalAutoLease: number;
  qoeOneTimeExpenses: number;
  qoeOneTimeRevenue: number;
  qualityOfEarnings: number;
}) {
  const steps = [
    { label: 'EBITDA', type: 'base' as const, value: ttmEbitdaAnalysis },
    { label: 'Compensation adj.', type: 'delta' as const, value: qoeOwnerSalaryAdjustment },
    { label: 'Personal exp.', type: 'delta' as const, value: qoePersonalAutoLease },
    { label: 'Non-Recurring', type: 'delta' as const, value: qoeOneTimeExpenses },
    { label: 'One-time rev', type: 'delta' as const, value: qoeOneTimeRevenue },
    { label: 'Quality of Earnings', type: 'total' as const, value: qualityOfEarnings },
  ];

  let running = 0;
  const bars = steps.map((step) => {
    if (step.type === 'base') {
      running = step.value;
      return { ...step, start: 0, end: step.value };
    }
    if (step.type === 'delta') {
      const start = running;
      running = running + step.value;
      return { ...step, start, end: running };
    }
    return { ...step, start: 0, end: step.value };
  });

  const extentValues = [0, ...bars.flatMap((b) => [b.start, b.end])];
  const minY = Math.min(...extentValues);
  const maxY = Math.max(...extentValues);
  const range = Math.max(1, maxY - minY);

  return (
    <svg viewBox="0 0 760 320" style={{ width: '100%', height: 'auto' }}>
      {(() => {
        const width = 760;
        const height = 320;
        const pad = { top: 24, right: 20, bottom: 58, left: 70 };
        const chartW = width - pad.left - pad.right;
        const chartH = height - pad.top - pad.bottom;
        const yOf = (v: number) => pad.top + chartH - ((v - minY) / range) * chartH;
        const zeroY = yOf(0);
        const xStep = chartW / bars.length;
        const barW = Math.min(80, xStep * 0.62);

        return (
          <>
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const val = minY + range * pct;
              const y = yOf(val);
              return (
                <g key={pct}>
                  <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                  <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
                    {`$${Math.round(val / 1000).toLocaleString()}K`}
                  </text>
                </g>
              );
            })}
            <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke="#94a3b8" strokeWidth="1.5" />
            <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke="#cbd5e1" strokeWidth="2" />

            {bars.map((bar, idx) => {
              const cx = pad.left + xStep * idx + xStep / 2;
              const yTop = yOf(Math.max(bar.start, bar.end));
              const yBottom = yOf(Math.min(bar.start, bar.end));
              const isIncrease = bar.end >= bar.start;
              const fill =
                bar.type === 'base' || bar.type === 'total' ? '#1d76c3' : isIncrease ? '#10b981' : '#ef4444';
              const delta = bar.end - bar.start;
              return (
                <g key={bar.label}>
                  <rect x={cx - barW / 2} y={yTop} width={barW} height={Math.max(2, yBottom - yTop)} fill={fill} rx="3" />
                  <text x={cx} y={yTop - 6} textAnchor="middle" fontSize="10" fill="#334155" fontWeight="700">
                    {bar.type === 'delta'
                      ? `${delta >= 0 ? '+' : '-'}$${Math.round(Math.abs(delta) / 1000).toLocaleString()}K`
                      : `$${Math.round(bar.end / 1000).toLocaleString()}K`}
                  </text>
                  <text x={cx} y={height - pad.bottom + 14} textAnchor="middle" fontSize="9" fill="#475569">
                    {bar.label}
                  </text>
                  {idx < bars.length - 1 && (
                    <line
                      x1={cx + barW / 2}
                      y1={yOf(bar.end)}
                      x2={pad.left + xStep * (idx + 1) + xStep / 2 - barW / 2}
                      y2={yOf(bar.end)}
                      stroke="#94a3b8"
                      strokeWidth="1.5"
                      strokeDasharray="4,3"
                    />
                  )}
                </g>
              );
            })}
          </>
        );
      })()}
    </svg>
  );
}

export default function ValuationSdeSection5Preview(props: Props) {
  const { model, monthly, selections, companyName, latestFinancialSource, sdeExecutiveSummaryApi, sdeExecutiveFinancialSummaryApi, sdeRecommendationsApi } = props;
  const fmt = model.formatDollars;

  const flagBadge = (triggered: boolean, severity: string) => (
    <span
      style={{
        fontSize: '12px',
        fontWeight: 700,
        color: triggered ? 'white' : '#334155',
        background: triggered ? (severity === 'high' ? '#ef4444' : severity === 'low' ? '#94a3b8' : '#f59e0b') : '#e2e8f0',
        borderRadius: '999px',
        padding: '5px 10px',
        minWidth: '72px',
        textAlign: 'center',
      }}
    >
      {triggered ? `Flagged (${severity})` : 'Normal'}
    </span>
  );

  return (
    <div className="valuation-sde-print-root" style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
      <style>{`
        /* Screen: each category (a–g) is its own “page” in the preview — scroll one viewport per block */
        @media screen {
          .valuation-sde-print-root .valuation-print-category {
            min-height: min(88vh, 960px);
            box-sizing: border-box;
            padding-bottom: 32px;
            margin-bottom: 0;
            border-bottom: 1px solid #e2e8f0;
          }
          .valuation-sde-print-root .valuation-print-category:last-child {
            border-bottom: none;
          }
        }
        @media print {
          .valuation-sde-print-root .valuation-print-category {
            min-height: auto !important;
            padding-bottom: 0 !important;
            border-bottom: none !important;
          }
          .valuation-sde-print-root .valuation-print-category + .valuation-print-category {
            break-before: page;
            page-break-before: always;
          }
        }
      `}</style>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <div style={{ fontSize: '20px', color: '#0f172a', fontWeight: 800, letterSpacing: '-0.02em' }}>Corelytics Valuation Report</div>
        <div style={{ fontSize: '18px', color: '#1e293b', fontWeight: 800, marginTop: '6px' }}>SDE Valuation</div>
        <div style={{ fontSize: '16px', color: '#475569', marginTop: '4px', lineHeight: 1.45 }}>
          Prepared for: <strong>{companyName || 'Selected Company'}</strong> | Generated: {new Date().toLocaleDateString('en-US')}
        </div>
      </div>

      <div style={{ padding: '16px 18px', display: 'grid', gap: 0 }}>
        {selections.sde_executiveSummary && (
          <div className="valuation-print-category">
            {sectionTitle('Executive Summary')}
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '10px' }}>Seller&apos;s Discretionary Earnings (SDE) Method</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>Trailing 12 Months SDE</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981' }}>${Math.round(model.ttmSDE).toLocaleString()}</div>
                </div>
                <div style={{ background: '#ffffff', borderRadius: '8px', padding: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>Estimated Business Value (SDE)</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981' }}>${Math.round(model.sdeValuation).toLocaleString()}</div>
                </div>
                <div style={{ background: '#ecfdf5', borderRadius: '8px', padding: '12px', border: '1px solid #86efac' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#14532d' }}>SDE multiple</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#14532d' }}>{model.sdeMultiplier.toFixed(1)}x</div>
                </div>
              </div>
              {sdeExecutiveSummaryApi && (
                <div style={{ marginTop: '10px', padding: '10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>Readiness (API)</div>
                  <div style={{ fontSize: '13px', color: '#475569' }}>
                    Score: <strong>{sdeExecutiveSummaryApi.readinessScore}</strong> · Rating: <strong>{sdeExecutiveSummaryApi.rating}</strong> · High/Med/Low flags:{' '}
                    {sdeExecutiveSummaryApi.highCount}/{sdeExecutiveSummaryApi.mediumCount}/{sdeExecutiveSummaryApi.lowCount}
                  </div>
                </div>
              )}
              {sdeExecutiveFinancialSummaryApi?.scorecard && sdeExecutiveFinancialSummaryApi.scorecard.length > 0 && (
                <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '8px' }}>
                  {sdeExecutiveFinancialSummaryApi.scorecard.map((row) => (
                    <div key={row.area} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#fff' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'capitalize' }}>{row.area.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{row.headlineMetric}</div>
                      <div style={{ fontSize: '12px', color: '#475569' }}>{row.value}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{row.impactValue}</div>
                    </div>
                  ))}
                </div>
              )}
              {sdeRecommendationsApi.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Recommendations</div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {sdeRecommendationsApi.slice(0, 12).map((rec) => (
                      <div key={rec.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{rec.title}</span>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>
                            {rec.priority} · {rec.module}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px', lineHeight: 1.5 }}>{rec.rationale}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                          EBITDA impact (range): ${Math.round(rec.impactRange.low).toLocaleString()} – ${Math.round(rec.impactRange.high).toLocaleString()} · {rec.horizon}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {selections.sde_ebitdaAdjustments && (
          <div className="valuation-print-category">
            {sectionTitle('EBITDA Adjustments')}
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>SDE Analysis</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>EBITDA, Trailing 12 Months</div>
                {[
                  ['Net Income', fmt(model.ttmNetIncomeAfterTax)],
                  ['Interest', fmt(model.ttmInterest)],
                  ['Taxes', fmt(model.ttmTaxesAnalysis)],
                  ['Depreciation', fmt(model.ttmDepreciationOnly)],
                  ['Amortization', fmt(model.ttmAmortizationOnly)],
                  ['EBITDA', fmt(model.ttmEbitdaAnalysis)],
                ].map(([label, value]) => (
                  <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0', fontWeight: label === 'EBITDA' ? 700 : 400 }}>
                    <span>{label}</span>
                    <span style={{ fontWeight: label === 'EBITDA' ? 700 : 600 }}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>1. Owner Compensation Adjustment</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>Replace owner pay with market salary.</div>
                {model.ownerCompRows.map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0', fontWeight: row.label === 'Adjustment' ? 700 : 400 }}>
                    <span>{row.label}</span>
                    <span>{fmt(row.value)}</span>
                  </div>
                ))}
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>2. Personal / Discretionary Expenses</div>
                {model.personalRows.map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0' }}>
                    <span>{row.label}</span>
                    <span>{fmt(row.value)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0', fontWeight: 700 }}>
                  <span>Adjustment</span>
                  <span>{fmt(model.personalDiscretionaryAdj)}</span>
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>QoE Adjustments</div>
                {[
                  ['1. Owner Compensation Adjustment', fmt(model.qoeOwnerSalaryAdjustment)],
                  ['2. Personal / Discretionary Expenses', fmt(model.qoePersonalAutoLease)],
                  ['3. Non-Recurring Expenses', fmt(model.qoeOneTimeExpenses)],
                  ['4. One-Time Revenue', fmt(model.qoeOneTimeRevenue)],
                  ['Total adjustments', fmt(model.qoeTotalAdjustments)],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0', fontWeight: label === 'Total adjustments' ? 700 : 400 }}>
                    <span>{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Quality of Earnings</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>{fmt(model.qualityOfEarnings)}</span>
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>3. Non-Recurring Expenses</div>
                {model.nonRecurringRows.map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0' }}>
                    <span>{row.label}</span>
                    <span>{fmt(row.value)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0', fontWeight: 700 }}>
                  <span>Adjustment</span>
                  <span>{fmt(model.nonRecurringExpenseAdj)}</span>
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>4. One-Time Revenue</div>
                {model.oneTimeRevenueRows.map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0' }}>
                    <span>{row.label}</span>
                    <span>{fmt(row.value)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '3px 0', fontWeight: 700 }}>
                  <span>Adjustment</span>
                  <span>{fmt(model.oneTimeRevenueAdj)}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>EBITDA Margin and Total Revenue</div>
                <EbitdaMarginComboChart data={model.annualRevenueEbitdaData} />
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>QoE Waterfall Bridge</div>
                <QoeWaterfallChart
                  ttmEbitdaAnalysis={model.ttmEbitdaAnalysis}
                  qoeOwnerSalaryAdjustment={model.qoeOwnerSalaryAdjustment}
                  qoePersonalAutoLease={model.qoePersonalAutoLease}
                  qoeOneTimeExpenses={model.qoeOneTimeExpenses}
                  qoeOneTimeRevenue={model.qoeOneTimeRevenue}
                  qualityOfEarnings={model.qualityOfEarnings}
                />
              </div>
            </div>
          </div>
        )}

        {selections.sde_revenueQuality && (
          <div className="valuation-print-category">
            {sectionTitle('Revenue Quality')}
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, marginBottom: '10px' }}>Buyer-focused revenue reliability checks (same signals as SDE module).</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Top Revenue Bucket % (proxy)</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
                  {model.revenueQualityInsights.topBucketSharePct !== null ? `${model.revenueQualityInsights.topBucketSharePct.toFixed(1)}%` : 'N/A'}
                </div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Revenue-to-Cash Gap (avg 12M)</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: Math.abs(model.revenueQualityInsights.avgGap12) > 8 ? '#ef4444' : '#1e293b' }}>
                  {model.revenueQualityInsights.avgGap12 >= 0 ? '+' : ''}
                  {model.revenueQualityInsights.avgGap12.toFixed(1)}%
                </div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>DSO Trend (12M)</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: model.revenueQualityInsights.dsoTrend12 > model.sdeSectorBenchmarks.dso.trendWarn ? '#ef4444' : '#1e293b' }}>
                  {model.revenueQualityInsights.dsoTrend12 >= 0 ? '+' : ''}
                  {model.revenueQualityInsights.dsoTrend12.toFixed(1)} days
                </div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>AR vs Revenue Growth Spread</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: model.revenueQualityInsights.arRevenueSpread > model.sdeSectorBenchmarks.dso.spreadWarn ? '#ef4444' : '#1e293b' }}>
                  {model.revenueQualityInsights.arRevenueSpread >= 0 ? '+' : ''}
                  {model.revenueQualityInsights.arRevenueSpread.toFixed(1)} pts
                </div>
              </div>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Revenue Quality Flags</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              {model.revenueQualityInsights.flags.map((flag) => (
                <div key={flag.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{flag.title}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{flag.detail}</div>
                  </div>
                  {flagBadge(flag.triggered, flag.severity)}
                </div>
              ))}
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: '#334155' }}>Metric</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: '#334155' }}>Company</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: '#334155' }}>Sector</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: '#334155' }}>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px', color: '#475569' }}>DSO (days)</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>{model.revenueQualityInsights.currentDso.toFixed(1)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>{model.sdeSectorBenchmarks.benchmarkTargets.dso.toFixed(1)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: (model.revenueQualityInsights.currentDso - model.sdeSectorBenchmarks.benchmarkTargets.dso) > 0 ? '#ef4444' : '#10b981' }}>
                      {(model.revenueQualityInsights.currentDso - model.sdeSectorBenchmarks.benchmarkTargets.dso) >= 0 ? '+' : ''}
                      {(model.revenueQualityInsights.currentDso - model.sdeSectorBenchmarks.benchmarkTargets.dso).toFixed(1)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px', color: '#475569' }}>CCC (days)</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>{model.workingCapitalInsights.currentCcc.toFixed(1)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>{model.sdeSectorBenchmarks.benchmarkTargets.ccc.toFixed(1)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: (model.workingCapitalInsights.currentCcc - model.sdeSectorBenchmarks.benchmarkTargets.ccc) > 0 ? '#ef4444' : '#10b981' }}>
                      {(model.workingCapitalInsights.currentCcc - model.sdeSectorBenchmarks.benchmarkTargets.ccc) >= 0 ? '+' : ''}
                      {(model.workingCapitalInsights.currentCcc - model.sdeSectorBenchmarks.benchmarkTargets.ccc).toFixed(1)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 10px', color: '#475569' }}>Inventory days (DIO)</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>
                      {(model.workingCapitalSeries.length > 0 ? model.workingCapitalSeries[model.workingCapitalSeries.length - 1].dio : 0).toFixed(1)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>{model.sdeSectorBenchmarks.benchmarkTargets.inventoryDays.toFixed(1)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selections.sde_customerQuality && (
          <div className="valuation-print-category">
            {sectionTitle('Customer Quality')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '10px', marginBottom: '10px' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Top 1 %</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{model.customerQualityInsights.hasData ? `${model.customerQualityInsights.top1Pct.toFixed(1)}%` : 'N/A'}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Top 5 %</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{model.customerQualityInsights.hasData ? `${model.customerQualityInsights.top5Pct.toFixed(1)}%` : 'N/A'}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>HHI</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{model.customerQualityInsights.hasData ? Math.round(model.customerQualityInsights.hhi).toLocaleString() : 'N/A'}</div>
              </div>
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Customer Quality Flags</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginBottom: '10px' }}>
              {model.customerQualityInsights.flags.map((flag) => (
                <div key={flag.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{flag.title}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{flag.detail}</div>
                  </div>
                  {flagBadge(flag.triggered, flag.severity)}
                </div>
              ))}
            </div>
            {model.customerQualityInsights.hasData && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <LineChart title="Top 1 Customer % (Last 36 Months)" data={model.customerQualityInsights.top1Series} color="#f59e0b" compact formatter={(v) => `${v.toFixed(1)}%`} />
                <LineChart title="Top 5 Customers % (Last 36 Months)" data={model.customerQualityInsights.top5Series} color="#ef4444" compact formatter={(v) => `${v.toFixed(1)}%`} />
              </div>
            )}
          </div>
        )}

        {selections.sde_workingCapital && (
          <div className="valuation-print-category">
            {sectionTitle('Working Capital')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '10px', marginBottom: '10px' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Normalized WC target</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{fmt(model.workingCapitalInsights.normalizedTarget)}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Current operating WC</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{fmt(model.workingCapitalInsights.currentWc)}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>WC adjustment</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{fmt(model.workingCapitalInsights.wcAdjustment)}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>CCC (latest)</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{model.workingCapitalInsights.currentCcc.toFixed(1)} days</div>
              </div>
            </div>
            <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.55, marginBottom: '10px' }}>{model.workingCapitalInsights.cccInterpretation}</p>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Working Capital Flags</div>
            <div style={{ display: 'grid', gap: '8px', marginBottom: '10px' }}>
              {model.workingCapitalInsights.flags.map((flag) => (
                <div key={flag.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{flag.title}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{flag.detail}</div>
                  </div>
                  {flagBadge(flag.triggered, flag.severity)}
                </div>
              ))}
            </div>
            <LineChart title="Cash Conversion Cycle (Last 12 Months)" data={model.workingCapitalInsights.cccMiniSeries} color="#0ea5e9" compact formatter={(v) => `${v.toFixed(1)} days`} />
          </div>
        )}

        {selections.sde_cashFlowQuality && (
          <div className="valuation-print-category">
            {sectionTitle('Cash Flow Quality')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '10px', marginBottom: '10px' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Cash conversion % (TTM)</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{model.cashFlowQualityInsights.cashConversionPct.toFixed(1)}%</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>FCF durability % of EBITDA</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{model.cashFlowQualityInsights.fcfDurabilityPct.toFixed(1)}%</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Maintenance CapEx estimate</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{fmt(model.cashFlowQualityInsights.maintenanceCapexEstimate)}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>CapEx gap</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{fmt(model.cashFlowQualityInsights.capexGap)}</div>
              </div>
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Cash Flow Quality Flags</div>
            <div style={{ display: 'grid', gap: '8px', marginBottom: '10px' }}>
              {model.cashFlowQualityInsights.flags.map((flag) => (
                <div key={flag.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{flag.title}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{flag.detail}</div>
                  </div>
                  {flagBadge(flag.triggered, flag.severity)}
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <LineChart
                title="Cash Conversion % (Last 36 Months)"
                data={model.cashFlowQualitySeries.slice(-36).map((r) => ({ month: r.month, value: r.cashConversionPct }))}
                color="#0ea5e9"
                compact
                formatter={(v) => `${v.toFixed(1)}%`}
              />
              <LineChart
                title="Free Cash Flow (Last 36 Months)"
                data={model.cashFlowQualitySeries.slice(-36).map((r) => ({ month: r.month, value: r.freeCashFlow }))}
                color="#f59e0b"
                compact
                formatter={(v) => `$${Math.round(v / 1000)}K`}
              />
            </div>
          </div>
        )}

        {selections.sde_balanceSheetQuality && (
          <ValuationBalanceSheetQualityPreview monthly={monthly} className="valuation-print-category" />
        )}
      </div>
    </div>
  );
}
