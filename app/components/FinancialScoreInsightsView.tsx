'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

type TrendPoint = {
  month?: string;
  financialScore?: number;
  profitabilityScore?: number;
  adsScore?: number;
  rgs?: number;
  rgsAdj?: number;
  expenseAdj?: number;
  alr1?: number;
  alrGrowth?: number;
  currentRatio?: number;
  quickRatio?: number;
  debtToNW?: number;
  roe?: number;
  ebitdaMargin?: number;
};

type MonthlyRow = {
  month?: string;
  revenue?: number;
  expense?: number;
  totalAssets?: number;
  totalLiab?: number;
  payroll?: number;
  professionalFees?: number;
  rent?: number;
  salesExpense?: number;
  marketing?: number;
  interestExpense?: number;
  otherExpense?: number;
};

interface FinancialScoreInsightsViewProps {
  selectedCompanyId: string;
  companyName: string | null;
  monthly: MonthlyRow[];
  trendData: TrendPoint[];
  finalScore: number;
  profitabilityScore: number;
  assetDevScore: number;
  baseRGS: number;
  adjustedRGS: number;
  growth_24mo: number;
  growth_6mo: number;
  expenseAdjustment: number;
  alr1: number | string;
  alrGrowth: number;
}

type InsightsResult = {
  situation: string;
  trend: string;
  driverInCharge: string;
  doNow: string[];
  dont: string[];
  scoreSensitivity: string[];
  evidence: string[];
};

const EXPENSE_KEYS: Array<keyof MonthlyRow> = [
  'payroll',
  'professionalFees',
  'rent',
  'salesExpense',
  'marketing',
  'interestExpense',
  'otherExpense',
];

export default function FinancialScoreInsightsView({
  selectedCompanyId,
  companyName,
  monthly,
  trendData,
  finalScore,
  profitabilityScore,
  assetDevScore,
  baseRGS,
  adjustedRGS,
  growth_24mo,
  growth_6mo,
  expenseAdjustment,
  alr1,
  alrGrowth,
}: FinancialScoreInsightsViewProps) {
  const [insights, setInsights] = useState<InsightsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(() => {
    const latestMonth = monthly[monthly.length - 1] || {};
    const expenseMix = EXPENSE_KEYS.reduce((acc, key) => {
      const value = Number(latestMonth[key] || 0);
      if (value) acc[key] = value;
      return acc;
    }, {} as Record<string, number>);

    return {
      companyId: selectedCompanyId,
      companyName,
      current: {
        financialScore: finalScore,
        profitabilityScore,
        assetDevScore,
        baseRGS,
        adjustedRGS,
        growth_24mo,
        growth_6mo,
        expenseAdjustment,
        alr1,
        alrGrowth,
        latestExpenseMix: expenseMix,
      },
      history: trendData.slice(-24).map((point) => ({
        month: point.month,
        financialScore: point.financialScore,
        profitabilityScore: point.profitabilityScore,
        adsScore: point.adsScore,
        rgs: point.rgs,
        rgsAdj: point.rgsAdj,
        expenseAdj: point.expenseAdj,
        alr1: point.alr1,
        alrGrowth: point.alrGrowth,
        currentRatio: point.currentRatio,
        quickRatio: point.quickRatio,
        debtToNW: point.debtToNW,
        roe: point.roe,
        ebitdaMargin: point.ebitdaMargin,
      })),
      recentMonths: monthly.slice(-12).map((row) => ({
        month: row.month,
        revenue: row.revenue,
        expense: row.expense,
        totalAssets: row.totalAssets,
        totalLiab: row.totalLiab,
      })),
    };
  }, [
    selectedCompanyId,
    companyName,
    monthly,
    trendData,
    finalScore,
    profitabilityScore,
    assetDevScore,
    baseRGS,
    adjustedRGS,
    growth_24mo,
    growth_6mo,
    expenseAdjustment,
    alr1,
    alrGrowth,
  ]);

  const loadInsights = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/financial-score/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to generate insights');
      }
      setInsights(data.insights);
    } catch (err: any) {
      setInsights(null);
      setError(err?.message || 'Failed to generate insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId, payload]);

  const section = (title: string, body: ReactNode, accent = '#1F70C1') => (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 18px', boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
      <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: accent, marginBottom: '8px' }}>
        {title}
      </div>
      {body}
    </div>
  );

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '16px 24px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Corelytics Score Insights</h1>
          <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            Recommendations from score history, profitability vs. asset development, and the underlying monthly data.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadInsights()}
          disabled={loading}
          style={{
            padding: '8px 14px',
            background: loading ? '#94a3b8' : '#1F70C1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Analyzing…' : 'Refresh insights'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {loading && !insights && (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '32px', textAlign: 'center', color: '#64748b' }}>
          Analyzing Corelytics Score trends…
        </div>
      )}

      {insights && (
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
            {section('Situation', <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: '#1e293b' }}>{insights.situation || '—'}</p>)}
            {section('Trend', <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: '#1e293b' }}>{insights.trend || '—'}</p>, '#0f766e')}
            {section('Driver in charge', <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: '#1e293b' }}>{insights.driverInCharge || '—'}</p>, '#7c3aed')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px' }}>
            {section(
              'Do now',
              insights.doNow.length ? (
                <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '14px', lineHeight: 1.65, color: '#1e293b' }}>
                  {insights.doNow.map((item, index) => <li key={`do-${index}`} style={{ marginBottom: '6px' }}>{item}</li>)}
                </ol>
              ) : <p style={{ margin: 0, color: '#64748b' }}>—</p>,
              '#166534',
            )}
            {section(
              "Don't",
              insights.dont.length ? (
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '14px', lineHeight: 1.65, color: '#1e293b' }}>
                  {insights.dont.map((item, index) => <li key={`dont-${index}`} style={{ marginBottom: '6px' }}>{item}</li>)}
                </ul>
              ) : <p style={{ margin: 0, color: '#64748b' }}>—</p>,
              '#b45309',
            )}
          </div>
          {section(
            'Score sensitivity',
            insights.scoreSensitivity.length ? (
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '14px', lineHeight: 1.65, color: '#1e293b' }}>
                {insights.scoreSensitivity.map((item, index) => <li key={`sens-${index}`} style={{ marginBottom: '6px' }}>{item}</li>)}
              </ul>
            ) : <p style={{ margin: 0, color: '#64748b' }}>—</p>,
          )}
          {section(
            'Evidence from the data',
            insights.evidence.length ? (
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '14px', lineHeight: 1.65, color: '#334155' }}>
                {insights.evidence.map((item, index) => <li key={`ev-${index}`} style={{ marginBottom: '6px' }}>{item}</li>)}
              </ul>
            ) : <p style={{ margin: 0, color: '#64748b' }}>—</p>,
            '#475569',
          )}
        </div>
      )}
    </div>
  );
}
