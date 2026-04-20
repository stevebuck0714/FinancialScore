'use client';

import dynamic from 'next/dynamic';
import type { MonthlyDataRow } from '@/app/types';
import type { SdeValuationPreviewModel } from '@/lib/sde-valuation-preview-model';
import { EbitdaMarginComboChart } from './ValuationSdeSection5Preview';
import ValuationBalanceSheetQualityPreview from './ValuationBalanceSheetQualityPreview';

const LineChart = dynamic(() => import('@/app/components/charts/Charts').then((mod) => mod.LineChart), { ssr: false });

type Selections = Record<string, boolean>;

type Props = {
  model: SdeValuationPreviewModel;
  monthly: MonthlyDataRow[];
  selections: Selections;
  companyName: string;
  latestFinancialSource: string | null;
  ttmEbitda: number;
  ebitdaMultiplier: number;
  ebitdaEstimatedValue: number;
  ttmFreeCashFlow: number;
};

const sectionTitle = (title: string) => (
  <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', margin: '16px 0 10px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
    {title}
  </div>
);

export default function ValuationEbitdaSection6Preview(props: Props) {
  const { model, monthly, selections, companyName, latestFinancialSource, ttmEbitda, ebitdaMultiplier, ebitdaEstimatedValue, ttmFreeCashFlow } = props;
  const fmt = model.formatDollars;

  const recent12 = monthly.slice(-12);
  const ttmRevenue = recent12.reduce((s, m) => s + Number((m as any)?.revenue || 0), 0);
  const ebitdaMargin = ttmRevenue > 0 && Number.isFinite(ttmEbitda) ? (ttmEbitda / ttmRevenue) * 100 : Number.NaN;

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
    <div className="valuation-ebitda-print-root" style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
      <style>{`
        @media print {
          .valuation-ebitda-print-root .valuation-print-category + .valuation-print-category {
            break-before: page;
            page-break-before: always;
          }
          .valuation-ebitda-print-root table,
          .valuation-ebitda-print-root svg,
          .valuation-ebitda-print-root .ebitda-chart-block,
          .valuation-ebitda-print-root .recharts-wrapper {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .valuation-ebitda-print-root thead {
            display: table-header-group;
          }
          .valuation-ebitda-print-root tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <div style={{ fontSize: '20px', color: '#0f172a', fontWeight: 800, letterSpacing: '-0.02em' }}>Corelytics Valuation Report</div>
        <div style={{ fontSize: '18px', color: '#1e293b', fontWeight: 800, marginTop: '6px' }}>EBITDA Valuation</div>
        <div style={{ fontSize: '16px', color: '#475569', marginTop: '4px', lineHeight: 1.45 }}>
          Prepared for: <strong>{companyName || 'Selected Company'}</strong> | Generated: {new Date().toLocaleDateString('en-US')}
        </div>
      </div>

      <div style={{ padding: '16px 18px', display: 'grid', gap: '8px' }}>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e3a8a', marginBottom: '8px' }}>EBITDA method snapshot</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
            <div style={{ background: '#fff', borderRadius: '8px', padding: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>TTM EBITDA</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#1d4ed8' }}>{fmt(ttmEbitda)}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: '8px', padding: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>EBITDA multiple</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#1d4ed8' }}>{ebitdaMultiplier.toFixed(2)}x</div>
            </div>
            <div style={{ background: '#fff', borderRadius: '8px', padding: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Implied value (EBITDA)</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#1d4ed8' }}>{fmt(ebitdaEstimatedValue)}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: '8px', padding: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>EBITDA margin / TTM FCF</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                {Number.isFinite(ebitdaMargin) ? `${ebitdaMargin.toFixed(1)}%` : 'N/A'} · {fmt(ttmFreeCashFlow)}
              </div>
            </div>
          </div>
        </div>

        {selections.ebitda_revenueQuality && (
          <div className="valuation-print-category">
            {sectionTitle('Revenue Quality')}
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, marginBottom: '10px' }}>Buyer-focused revenue reliability checks (same signals as EBITDA workspace).</p>
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

        {selections.ebitda_customerMixConcentration && (
          <div className="valuation-print-category">
            {sectionTitle('Customer Mix / Concentration')}
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
                <div className="ebitda-chart-block">
                  <LineChart title="Top 1 Customer % (Last 36 Months)" data={model.customerQualityInsights.top1Series} color="#f59e0b" compact formatter={(v) => `${v.toFixed(1)}%`} />
                </div>
                <div className="ebitda-chart-block">
                  <LineChart title="Top 5 Customers % (Last 36 Months)" data={model.customerQualityInsights.top5Series} color="#ef4444" compact formatter={(v) => `${v.toFixed(1)}%`} />
                </div>
              </div>
            )}
          </div>
        )}

        {selections.ebitda_cashFlowQuality && (
          <div className="valuation-print-category">
            {sectionTitle('Cash Flow Quality')}
            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '10px', lineHeight: 1.55 }}>
              EBITDA-based cash conversion: TTM EBITDA {fmt(ttmEbitda)} at {ebitdaMultiplier.toFixed(2)}x → implied {fmt(ebitdaEstimatedValue)}.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '10px', marginBottom: '10px' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>EBITDA margin (TTM)</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{Number.isFinite(ebitdaMargin) ? `${ebitdaMargin.toFixed(1)}%` : 'N/A'}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>TTM free cash flow</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{fmt(ttmFreeCashFlow)}</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Cash conversion % (TTM)</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{model.cashFlowQualityInsights.cashConversionPct.toFixed(1)}%</div>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>FCF / EBITDA</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>
                  {Number.isFinite(ttmEbitda) && ttmEbitda !== 0 ? `${((ttmFreeCashFlow / ttmEbitda) * 100).toFixed(1)}%` : 'N/A'}
                </div>
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
            <div className="ebitda-chart-block" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#f8fafc', marginBottom: '10px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>EBITDA margin and total revenue</div>
              <EbitdaMarginComboChart data={model.annualRevenueEbitdaData} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="ebitda-chart-block">
                <LineChart
                  title="Cash Conversion % (Last 36 Months)"
                  data={model.cashFlowQualitySeries.slice(-36).map((r) => ({ month: r.month, value: r.cashConversionPct }))}
                  color="#0ea5e9"
                  compact
                  formatter={(v) => `${v.toFixed(1)}%`}
                />
              </div>
              <div className="ebitda-chart-block">
                <LineChart
                  title="Free Cash Flow (Last 36 Months)"
                  data={model.cashFlowQualitySeries.slice(-36).map((r) => ({ month: r.month, value: r.freeCashFlow }))}
                  color="#f59e0b"
                  compact
                  formatter={(v) => `$${Math.round(v / 1000)}K`}
                />
              </div>
            </div>
          </div>
        )}

        {selections.ebitda_balanceSheetQuality && (
          <ValuationBalanceSheetQualityPreview
            monthly={monthly}
            className="valuation-print-category"
            description="Liquidity, leverage, equity cushion, and balance-sheet integrity — aligned with the EBITDA Balance Sheet Quality tab."
          />
        )}
      </div>
    </div>
  );
}
