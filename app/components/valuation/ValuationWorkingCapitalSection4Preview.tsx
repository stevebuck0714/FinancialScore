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
  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', margin: '16px 0 10px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
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
          .valuation-wc-print-root .valuation-print-category + .valuation-print-category {
            break-before: page;
            page-break-before: always;
          }
        }
      `}</style>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Corelytics Valuation Report</div>
        <div style={{ fontSize: '24px', color: '#1e293b', fontWeight: 800, marginTop: '4px' }}>4. Working Capital</div>
        <div style={{ fontSize: '14px', color: '#475569', marginTop: '4px' }}>
          Prepared for: <strong>{companyName || 'Selected Company'}</strong> | Generated: {new Date().toLocaleDateString('en-US')}
        </div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
          Data source: Company financial data ({latestFinancialSource || 'connected source'}) — aligned with Working Capital analytics
        </div>
      </div>

      <div style={{ padding: '16px 18px', display: 'grid', gap: '8px' }}>
        {selections.wc_normalizedWorkingCapital && (
          <div className="valuation-print-category">
            {sectionTitle('Normalized Working Capital')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Normalized WC target</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{fmt(wc.normalizedTarget)}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Current operating WC</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{fmt(wc.currentWc)}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>WC adjustment</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: wc.wcAdjustment >= 0 ? '#1e293b' : '#ef4444' }}>
                  {fmt(wc.wcAdjustment)}
                </div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', background: '#f8fafc' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Avg WC intensity (12M)</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{wc.avgWcIntensity12.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        )}

        {selections.wc_arapAnalysis && (
          <div className="valuation-print-category">
            {sectionTitle('AR/AP Analysis')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Latest AR</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{fmt(latest?.ar || 0)}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Latest Inventory</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{fmt(latest?.inventory || 0)}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Latest AP</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{fmt(latest?.ap || 0)}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Latest operating WC</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{fmt(latest?.operatingWc || 0)}</div>
              </div>
            </div>
            <LineChart
              title="Operating Working Capital Trend (Last 24 Months)"
              data={wcSeries.slice(-24).map((r) => ({ month: r.month, value: r.operatingWc }))}
              color="#1d76c3"
              compact
              formatter={(v) => fmt(v)}
            />
          </div>
        )}

        {selections.wc_cashConversion && (
          <div className="valuation-print-category">
            {sectionTitle('Cash Conversion')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Current CCC</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{wc.currentCcc.toFixed(1)} days</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Prior 12M CCC</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{wc.priorCcc.toFixed(1)} days</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>CCC trend (12M)</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: wc.cccTrend12 > 0 ? '#ef4444' : '#1e293b' }}>
                  {wc.cccTrend12 >= 0 ? '+' : ''}
                  {wc.cccTrend12.toFixed(1)} days
                </div>
              </div>
            </div>
            <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.55, marginBottom: '10px' }}>{wc.cccInterpretation}</p>
            <div style={{ display: 'grid', gap: '8px', marginBottom: '10px' }}>
              {wc.flags.map((flag) => (
                <div key={flag.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{flag.title}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{flag.detail}</div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'capitalize' }}>{flag.severity}</span>
                </div>
              ))}
            </div>
            <LineChart title="Cash Conversion Cycle Trend (Last 12 Months)" data={wc.cccMiniSeries} color="#0ea5e9" compact formatter={(v) => `${v.toFixed(1)} days`} />
          </div>
        )}
      </div>
    </div>
  );
}
