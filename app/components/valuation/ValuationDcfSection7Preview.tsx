'use client';

import dynamic from 'next/dynamic';
import type { MonthlyDataRow } from '@/app/types';
import type { SdeValuationPreviewModel } from '@/lib/sde-valuation-preview-model';
import ValuationBalanceSheetQualityPreview from './ValuationBalanceSheetQualityPreview';
import { formatMoneyCompact } from '@/lib/format/currency';

const LineChart = dynamic(() => import('@/app/components/charts/Charts').then((mod) => mod.LineChart), { ssr: false });

type Selections = Record<string, boolean>;

type RevenueMix = {
  recurring: number | null;
  contracted: number | null;
  projectBased: number | null;
  transactional: number | null;
};

type Props = {
  model: SdeValuationPreviewModel;
  monthly: MonthlyDataRow[];
  selections: Selections;
  companyName: string;
  latestFinancialSource: string | null;
  dcfEstimatedValue: number;
  dcfDiscountRate: number;
  dcfTerminalGrowth: number;
  ttmFreeCashFlow: number;
  growth24mo: number;
  revenueMix: RevenueMix;
  currency?: string | null;
  locale?: string | null;
};

const sectionTitle = (title: string) => (
  <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', margin: '16px 0 10px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
    {title}
  </div>
);

export default function ValuationDcfSection7Preview(props: Props) {
  const { model, monthly, selections, companyName, latestFinancialSource, dcfEstimatedValue, dcfDiscountRate, dcfTerminalGrowth, ttmFreeCashFlow, growth24mo, revenueMix, currency, locale } = props;
  const fmt = model.formatDollars;
  const compact = (value: number) => formatMoneyCompact(value, { currency, locale });
  const sensitivityLow = dcfEstimatedValue * 0.9;
  const sensitivityHigh = dcfEstimatedValue * 1.1;

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

  const mixPct = (v: number | null) => (v != null && Number.isFinite(Number(v)) ? `${Number(v).toFixed(1)}%` : 'N/A');
  const durablePct =
    revenueMix.recurring != null && revenueMix.contracted != null && Number.isFinite(Number(revenueMix.recurring)) && Number.isFinite(Number(revenueMix.contracted))
      ? Number(revenueMix.recurring) + Number(revenueMix.contracted)
      : null;

  return (
    <div className="valuation-dcf-print-root" style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
      <style>{`
        @media print {
          .valuation-dcf-print-root .valuation-print-category + .valuation-print-category {
            break-before: page;
            page-break-before: always;
          }
        }
      `}</style>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <div style={{ fontSize: '20px', color: '#0f172a', fontWeight: 800, letterSpacing: '-0.02em' }}>Corelytics Valuation Report</div>
        <div style={{ fontSize: '18px', color: '#1e293b', fontWeight: 800, marginTop: '6px' }}>DCF Valuation</div>
        <div style={{ fontSize: '16px', color: '#475569', marginTop: '4px', lineHeight: 1.45 }}>
          Prepared for: <strong>{companyName || 'Selected Company'}</strong> | Generated: {new Date().toLocaleDateString('en-US')}
        </div>
      </div>

      <div style={{ padding: '16px 18px', display: 'grid', gap: '8px' }}>
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#14532d', marginBottom: '8px' }}>DCF method snapshot</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
            <div style={{ background: '#fff', borderRadius: '8px', padding: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>TTM free cash flow</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803d' }}>{fmt(ttmFreeCashFlow)}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: '8px', padding: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Discount rate</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803d' }}>{dcfDiscountRate.toFixed(2)}%</div>
            </div>
            <div style={{ background: '#fff', borderRadius: '8px', padding: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Terminal growth</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803d' }}>{dcfTerminalGrowth.toFixed(2)}%</div>
            </div>
            <div style={{ background: '#fff', borderRadius: '8px', padding: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Implied DCF value</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803d' }}>{fmt(dcfEstimatedValue)}</div>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#475569', marginTop: '10px' }}>
            Sensitivity (±10% on DCF result): {fmt(sensitivityLow)} to {fmt(sensitivityHigh)}.
          </div>
        </div>

        {selections.dcf_workingCapital && (
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

        {selections.dcf_cashFlowQuality && (
          <div className="valuation-print-category">
            {sectionTitle('Cash Flow Quality')}
            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '10px', lineHeight: 1.55 }}>
              DCF starting point: TTM free cash flow {fmt(ttmFreeCashFlow)}. Discount {dcfDiscountRate.toFixed(2)}% · terminal growth {dcfTerminalGrowth.toFixed(2)}% → implied {fmt(dcfEstimatedValue)}.
            </p>
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
                formatter={(v) => compact(v)}
              />
            </div>
          </div>
        )}

        {selections.dcf_revenueDurability && (
          <div className="valuation-print-category">
            {sectionTitle('Revenue Durability')}
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, marginBottom: '10px' }}>
              Contractual and recurring mix supports forecastability in DCF projections.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', marginBottom: '10px' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>24-mo revenue growth</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>{growth24mo.toFixed(1)}%</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Durable revenue (recurring + contracted)</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: durablePct != null && Number.isFinite(durablePct) ? '#059669' : '#64748b' }}>
                  {durablePct != null && Number.isFinite(durablePct) ? `${durablePct.toFixed(1)}%` : 'N/A'}
                </div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Recurring</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{mixPct(revenueMix.recurring)}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Transactional / one-time</div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{mixPct(revenueMix.transactional)}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px', fontSize: '13px', color: '#334155' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <strong>Contracted</strong>: {mixPct(revenueMix.contracted)}
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <strong>Project-based</strong>: {mixPct(revenueMix.projectBased)}
              </div>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Revenue reliability flags</div>
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
          </div>
        )}

        {selections.dcf_balanceSheetQuality && (
          <ValuationBalanceSheetQualityPreview
            monthly={monthly}
            className="valuation-print-category"
            description="Liquidity, leverage, equity cushion, and balance-sheet integrity — aligned with the DCF Balance Sheet Quality tab."
          />
        )}
      </div>
    </div>
  );
}
