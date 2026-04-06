'use client';

import dynamic from 'next/dynamic';
import type { MonthlyDataRow } from '@/app/types';

const LineChart = dynamic(() => import('@/app/components/charts/Charts').then((mod) => mod.LineChart), { ssr: false });

const sectionTitle = (title: string) => (
  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', margin: '16px 0 10px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
    {title}
  </div>
);

type Props = {
  monthly: MonthlyDataRow[];
  className?: string;
  /** Shown under the section title */
  description?: string;
};

export default function ValuationBalanceSheetQualityPreview({ monthly, className, description }: Props) {
  const safeDiv = (num: number, den: number) => (Math.abs(den) > 0 ? num / den : 0);
  const bsTrendRows = monthly.slice(-36).map((m) => {
    const equityFromDetail =
      (m.ownersCapital || 0) +
      (m.ownersDraw || 0) +
      (m.commonStock || 0) +
      (m.preferredStock || 0) +
      (m.retainedEarnings || 0) +
      (m.additionalPaidInCapital || 0) +
      (m.treasuryStock || 0);
    const totalEquity = m.totalEquity || equityFromDetail;
    const totalAssets = m.totalAssets || 0;
    const totalLiabilities = m.totalLiab || 0;
    const currentAssets = m.tca || 0;
    const currentLiabilities = m.tcl || 0;
    const integrityGapPct = totalAssets > 0 ? Math.abs(totalAssets - (totalLiabilities + totalEquity)) / totalAssets : 0;
    return {
      month: m.month,
      currentRatio: safeDiv(currentAssets, currentLiabilities),
      debtToEquity: totalEquity > 0 ? safeDiv(totalLiabilities, totalEquity) : 999,
      equityRatioPct: safeDiv(totalEquity, totalAssets) * 100,
      integrityGapPct: integrityGapPct * 100,
    };
  });

  const latestMonth: any = monthly[monthly.length - 1] || {};
  const latestTotalAssets = Number(latestMonth.totalAssets ?? 0);
  const latestTotalLiabilities = Number(latestMonth.totalLiab ?? 0);
  const latestTotalEquity =
    Number(latestMonth.ownersCapital ?? 0) +
    Number(latestMonth.ownersDraw ?? 0) +
    Number(latestMonth.commonStock ?? 0) +
    Number(latestMonth.preferredStock ?? 0) +
    Number(latestMonth.retainedEarnings ?? 0) +
    Number(latestMonth.additionalPaidInCapital ?? 0) +
    Number(latestMonth.treasuryStock ?? 0);
  const latestCurrentAssets = Number(latestMonth.tca ?? 0);
  const latestCurrentLiabilities = Number(latestMonth.tcl ?? 0);
  const currentRatioBs = latestCurrentLiabilities > 0 ? latestCurrentAssets / latestCurrentLiabilities : 0;
  const debtToEquityBs = latestTotalEquity > 0 ? latestTotalLiabilities / latestTotalEquity : 999;
  const equityRatioBs = latestTotalAssets > 0 ? latestTotalEquity / latestTotalAssets : 0;
  const balanceGap = latestTotalAssets - (latestTotalLiabilities + latestTotalEquity);
  const balanceGapPct = latestTotalAssets > 0 ? Math.abs(balanceGap) / latestTotalAssets : 0;

  const statusLabel = (status: 'healthy' | 'moderate_risk' | 'high_risk') => {
    if (status === 'high_risk') return 'High risk';
    if (status === 'moderate_risk') return 'Moderate risk';
    return 'Healthy';
  };
  const statusColor = (status: 'healthy' | 'moderate_risk' | 'high_risk') => {
    if (status === 'high_risk') return '#dc2626';
    if (status === 'moderate_risk') return '#d97706';
    return '#059669';
  };

  const balanceSheetChecks = [
    {
      id: 'current-ratio',
      label: 'Liquidity coverage (Current Ratio)',
      currentText: `${currentRatioBs.toFixed(2)}x`,
      targetText: '>= 1.20x',
      status: currentRatioBs >= 1.2 ? ('healthy' as const) : currentRatioBs >= 1.0 ? ('moderate_risk' as const) : ('high_risk' as const),
      series: bsTrendRows.map((r) => ({ month: r.month, value: r.currentRatio })),
      formatter: (v: number) => `${v.toFixed(2)}x`,
      chartColor: '#0ea5e9',
    },
    {
      id: 'debt-to-equity',
      label: 'Leverage control (Debt / Equity)',
      currentText: `${debtToEquityBs.toFixed(2)}x`,
      targetText: '<= 2.00x',
      status: debtToEquityBs <= 2.0 ? ('healthy' as const) : debtToEquityBs <= 3.0 ? ('moderate_risk' as const) : ('high_risk' as const),
      series: bsTrendRows.map((r) => ({ month: r.month, value: r.debtToEquity })),
      formatter: (v: number) => `${v.toFixed(2)}x`,
      chartColor: '#ef4444',
    },
    {
      id: 'equity-ratio',
      label: 'Equity cushion (Equity / Assets)',
      currentText: `${(equityRatioBs * 100).toFixed(1)}%`,
      targetText: '>= 25.0%',
      status: equityRatioBs >= 0.25 ? ('healthy' as const) : equityRatioBs >= 0.15 ? ('moderate_risk' as const) : ('high_risk' as const),
      series: bsTrendRows.map((r) => ({ month: r.month, value: r.equityRatioPct })),
      formatter: (v: number) => `${v.toFixed(1)}%`,
      chartColor: '#22c55e',
    },
    {
      id: 'integrity-gap',
      label: 'Balance-sheet integrity check',
      currentText: `${(balanceGapPct * 100).toFixed(2)}% gap`,
      targetText: '<= 1.00%',
      status: balanceGapPct <= 0.01 ? ('healthy' as const) : balanceGapPct <= 0.03 ? ('moderate_risk' as const) : ('high_risk' as const),
      series: bsTrendRows.map((r) => ({ month: r.month, value: r.integrityGapPct })),
      formatter: (v: number) => `${v.toFixed(2)}%`,
      chartColor: '#f59e0b',
    },
  ] as const;

  const desc =
    description ??
    'Liquidity, leverage, equity cushion, and balance-sheet integrity — aligned with the SDE Balance Sheet Quality tab.';

  return (
    <div className={className}>
      {sectionTitle('Balance Sheet Quality')}
      <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, marginBottom: '10px' }}>{desc}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.8fr 0.8fr 0.7fr', gap: '8px', marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>Scorecard</div>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>Current</div>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>Target</div>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>Status</div>
        {balanceSheetChecks.map((check) => (
          <div key={check.id} style={{ display: 'contents' }}>
            <div style={{ fontSize: '12px', color: '#334155' }}>{check.label}</div>
            <div style={{ fontSize: '12px', color: '#1e293b', fontWeight: 700 }}>{check.currentText}</div>
            <div style={{ fontSize: '12px', color: '#334155' }}>{check.targetText}</div>
            <div style={{ fontSize: '12px', color: statusColor(check.status), fontWeight: 700 }}>{statusLabel(check.status)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <LineChart title="Current Ratio (Last 36 Months)" data={balanceSheetChecks[0].series} color="#0ea5e9" compact formatter={balanceSheetChecks[0].formatter} />
        <LineChart title="Debt / Equity (Last 36 Months)" data={balanceSheetChecks[1].series} color="#ef4444" compact formatter={balanceSheetChecks[1].formatter} />
      </div>
    </div>
  );
}
