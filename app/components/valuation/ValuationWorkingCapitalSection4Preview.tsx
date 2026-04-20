'use client';

import dynamic from 'next/dynamic';
import type { SdeValuationPreviewModel } from '@/lib/sde-valuation-preview-model';

const LineChart = dynamic(() => import('@/app/components/charts/Charts').then((mod) => mod.LineChart), { ssr: false });

type Selections = Record<string, boolean>;

type Props = {
  model: SdeValuationPreviewModel;
  selections: Selections;
  companyName: string;
  latestFinancialSource: string | null;
};

const sectionTitle = (title: string) => (
  <div className="wc-section-title" style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', margin: '16px 0 10px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
    {title}
  </div>
);

export default function ValuationWorkingCapitalSection4Preview({ model, selections, companyName, latestFinancialSource }: Props) {
  const fmt = model.formatDollars;
  const wc = model.workingCapitalInsights;
  const wcSeries = model.workingCapitalSeries;
  const latest = wcSeries[wcSeries.length - 1];

  return (
    <div className="valuation-wc-print-root" style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
      <style>{`
        @media print {
          @page {
            size: letter landscape;
            margin: 0.4in;
          }
          .valuation-wc-print-root {
            border: none !important;
            border-radius: 0 !important;
          }
          .valuation-wc-print-root .valuation-print-category {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .valuation-wc-print-root .valuation-print-category + .valuation-print-category {
            break-before: page;
            page-break-before: always;
          }
          .valuation-wc-print-root .wc-stat-card {
            padding: 6px 8px !important;
          }
          .valuation-wc-print-root .wc-stat-label {
            font-size: 10px !important;
          }
          .valuation-wc-print-root .wc-stat-value {
            font-size: 14px !important;
          }
          .valuation-wc-print-root .wc-section-title {
            font-size: 13px !important;
            margin: 8px 0 6px 0 !important;
            padding-bottom: 4px !important;
          }
          .valuation-wc-print-root .wc-header-title-main {
            font-size: 16px !important;
          }
          .valuation-wc-print-root .wc-header-title-sub {
            font-size: 14px !important;
            margin-top: 4px !important;
          }
          .valuation-wc-print-root .wc-header-prepared {
            font-size: 11px !important;
            margin-top: 2px !important;
          }
          .valuation-wc-print-root .wc-header-source {
            font-size: 10px !important;
            margin-top: 4px !important;
          }
          .valuation-wc-print-root .wc-header-block {
            padding: 10px 14px !important;
          }
          .valuation-wc-print-root .wc-body {
            padding: 10px 14px !important;
            gap: 6px !important;
          }
          .valuation-wc-print-root .wc-flag-row {
            padding: 6px 8px !important;
          }
          .valuation-wc-print-root .wc-flag-title {
            font-size: 11px !important;
          }
          .valuation-wc-print-root .wc-flag-detail,
          .valuation-wc-print-root .wc-flag-severity {
            font-size: 10px !important;
          }
          .valuation-wc-print-root .wc-ccc-interpretation {
            font-size: 11px !important;
            margin-bottom: 6px !important;
          }
          .valuation-wc-print-root .wc-chart-wrap {
            max-width: 100%;
            overflow: hidden;
          }
          .valuation-wc-print-root .wc-chart-wrap svg {
            width: 100% !important;
            height: auto !important;
            max-height: 220px;
          }
        }
      `}</style>
      <div className="wc-header-block" style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <div className="wc-header-title-main" style={{ fontSize: '20px', color: '#0f172a', fontWeight: 800, letterSpacing: '-0.02em' }}>Corelytics Valuation Report</div>
        <div className="wc-header-title-sub" style={{ fontSize: '18px', color: '#1e293b', fontWeight: 800, marginTop: '6px' }}>Working Capital Analysis</div>
        <div className="wc-header-prepared" style={{ fontSize: '16px', color: '#475569', marginTop: '4px', lineHeight: 1.45 }}>
          Prepared for: <strong>{companyName || 'Selected Company'}</strong> | Generated: {new Date().toLocaleDateString('en-US')}
        </div>
        <div className="wc-header-source" style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
          Data source: Company financial data ({latestFinancialSource || 'connected source'}) — aligned with Working Capital analytics
        </div>
      </div>

      <div className="wc-body" style={{ padding: '16px 18px', display: 'grid', gap: '8px' }}>
        {selections.wc_normalizedWorkingCapital && (
          <div className="valuation-print-category">
            {sectionTitle('Normalized Working Capital')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
              <div className="wc-stat-card" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                <div className="wc-stat-label" style={{ fontSize: '12px', color: '#64748b' }}>Normalized WC target</div>
                <div className="wc-stat-value" style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{fmt(wc.normalizedTarget)}</div>
              </div>
              <div className="wc-stat-card" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                <div className="wc-stat-label" style={{ fontSize: '12px', color: '#64748b' }}>Current operating WC</div>
                <div className="wc-stat-value" style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{fmt(wc.currentWc)}</div>
              </div>
              <div className="wc-stat-card" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                <div className="wc-stat-label" style={{ fontSize: '12px', color: '#64748b' }}>WC adjustment</div>
                <div className="wc-stat-value" style={{ fontSize: '18px', fontWeight: 800, color: wc.wcAdjustment >= 0 ? '#1e293b' : '#ef4444' }}>
                  {fmt(wc.wcAdjustment)}
                </div>
              </div>
              <div className="wc-stat-card" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                <div className="wc-stat-label" style={{ fontSize: '12px', color: '#64748b' }}>Avg WC intensity (12M)</div>
                <div className="wc-stat-value" style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{wc.avgWcIntensity12.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        )}

        {selections.wc_arapAnalysis && (
          <div className="valuation-print-category">
            {sectionTitle('AR/AP Analysis')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <div className="wc-stat-card" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div className="wc-stat-label" style={{ fontSize: '12px', color: '#64748b' }}>Latest AR</div>
                <div className="wc-stat-value" style={{ fontSize: '18px', fontWeight: 700 }}>{fmt(latest?.ar || 0)}</div>
              </div>
              <div className="wc-stat-card" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div className="wc-stat-label" style={{ fontSize: '12px', color: '#64748b' }}>Latest Inventory</div>
                <div className="wc-stat-value" style={{ fontSize: '18px', fontWeight: 700 }}>{fmt(latest?.inventory || 0)}</div>
              </div>
              <div className="wc-stat-card" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div className="wc-stat-label" style={{ fontSize: '12px', color: '#64748b' }}>Latest AP</div>
                <div className="wc-stat-value" style={{ fontSize: '18px', fontWeight: 700 }}>{fmt(latest?.ap || 0)}</div>
              </div>
              <div className="wc-stat-card" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div className="wc-stat-label" style={{ fontSize: '12px', color: '#64748b' }}>Latest operating WC</div>
                <div className="wc-stat-value" style={{ fontSize: '18px', fontWeight: 700 }}>{fmt(latest?.operatingWc || 0)}</div>
              </div>
            </div>
            <div className="wc-chart-wrap">
              <LineChart
                title="Operating Working Capital Trend (Last 24 Months)"
                data={wcSeries.slice(-24).map((r) => ({ month: r.month, value: r.operatingWc }))}
                color="#1d76c3"
                compact
                formatter={(v) => fmt(v)}
              />
            </div>
          </div>
        )}

        {selections.wc_cashConversion && (
          <div className="valuation-print-category">
            {sectionTitle('Cash Conversion')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <div className="wc-stat-card" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div className="wc-stat-label" style={{ fontSize: '12px', color: '#64748b' }}>Current CCC</div>
                <div className="wc-stat-value" style={{ fontSize: '18px', fontWeight: 700 }}>{wc.currentCcc.toFixed(1)} days</div>
              </div>
              <div className="wc-stat-card" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div className="wc-stat-label" style={{ fontSize: '12px', color: '#64748b' }}>Prior 12M CCC</div>
                <div className="wc-stat-value" style={{ fontSize: '18px', fontWeight: 700 }}>{wc.priorCcc.toFixed(1)} days</div>
              </div>
              <div className="wc-stat-card" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div className="wc-stat-label" style={{ fontSize: '12px', color: '#64748b' }}>CCC trend (12M)</div>
                <div className="wc-stat-value" style={{ fontSize: '18px', fontWeight: 700, color: wc.cccTrend12 > 0 ? '#ef4444' : '#1e293b' }}>
                  {wc.cccTrend12 >= 0 ? '+' : ''}
                  {wc.cccTrend12.toFixed(1)} days
                </div>
              </div>
            </div>
            <p className="wc-ccc-interpretation" style={{ fontSize: '12px', color: '#475569', lineHeight: 1.55, marginBottom: '10px' }}>{wc.cccInterpretation}</p>
            <div style={{ display: 'grid', gap: '8px', marginBottom: '10px' }}>
              {wc.flags.map((flag) => (
                <div key={flag.id} className="wc-flag-row" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="wc-flag-title" style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{flag.title}</div>
                    <div className="wc-flag-detail" style={{ fontSize: '12px', color: '#64748b' }}>{flag.detail}</div>
                  </div>
                  <span className="wc-flag-severity" style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'capitalize' }}>{flag.severity}</span>
                </div>
              ))}
            </div>
            <div className="wc-chart-wrap">
              <LineChart title="Cash Conversion Cycle Trend (Last 12 Months)" data={wc.cccMiniSeries} color="#0ea5e9" compact formatter={(v) => `${v.toFixed(1)} days`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
