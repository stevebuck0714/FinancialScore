'use client';

import React, { useState, useEffect } from 'react';
import { useMasterData } from '@/lib/master-data-store';
import type { MonthlyDataRow } from '../types';
import dynamic from 'next/dynamic';
import { exportMonthlyRatiosToExcel } from '../utils/excel-export';
import { getBenchmarkValue } from '../utils/data-processing';
import { buildRatioTrendData } from '../utils/ratio-trend-data';

const BaseLineChart = dynamic(() => import('./charts/Charts').then(mod => mod.LineChart), { ssr: false });
const LineChart = (props: any) => <BaseLineChart {...props} labelFormat="m-yy-adaptive" />;

interface RatiosTabProps {
  selectedCompanyId: string;
  companyName: string;
  benchmarks: any[];
  onFormulaClick: (formula: string) => void;
  initialTab?: 'all-ratios' | 'monthly-ratios';
  prefetchedMonthlyData?: MonthlyDataRow[];
}

export default function RatiosTab({
  selectedCompanyId,
  companyName,
  benchmarks,
  onFormulaClick,
  initialTab = 'all-ratios',
  prefetchedMonthlyData,
}: RatiosTabProps) {
  const { monthlyData, loading, error } = useMasterData(selectedCompanyId);
  const hasPrefetchedData = Array.isArray(prefetchedMonthlyData) && prefetchedMonthlyData.length > 0;
  const monthly = hasPrefetchedData ? prefetchedMonthlyData : (monthlyData || []);
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('portrait');

  // Debug: Log benchmarks when component receives them
  React.useEffect(() => {
    console.log('[RatiosTab] Benchmarks received:', {
      count: benchmarks?.length || 0,
      sample: benchmarks?.slice(0, 3).map((b: any) => ({ metricName: b.metricName, value: b.fiveYearValue }))
    });
  }, [benchmarks]);

  const [kpiDashboardTab, setKpiDashboardTab] = useState<'all-ratios' | 'monthly-ratios'>(
    initialTab === 'monthly-ratios' ? 'monthly-ratios' : 'all-ratios'
  );

  useEffect(() => {
    setKpiDashboardTab(initialTab === 'monthly-ratios' ? 'monthly-ratios' : 'all-ratios');
  }, [initialTab]);

  const trendData = React.useMemo(() => buildRatioTrendData(monthly as MonthlyDataRow[]), [monthly]);
  const recentTrendColumns = React.useMemo(
    () => [...trendData.slice(-12)].reverse(),
    [trendData]
  );

  const formatRatioCell = (value: unknown, formatterFn: (v: number) => string) =>
    Number.isFinite(value) ? formatterFn(Number(value)) : 'N/A';

  const isWorseThanBenchmark = (
    companyValue: unknown,
    benchmarkValue: unknown,
    worseIf: 'lower' | 'higher',
    companyIsDecimalPercent = false
  ) => {
    const company = Number(companyValue);
    const benchmark = Number(benchmarkValue);
    if (!Number.isFinite(company) || !Number.isFinite(benchmark) || benchmark === 0) return false;
    const companyComparable = companyIsDecimalPercent ? company * 100 : company;
    const ratioToBenchmark = companyComparable / benchmark;
    if (worseIf === 'lower') return ratioToBenchmark < 0.8;
    return ratioToBenchmark > 1.2;
  };

  const formatOneDecimal = (v: number) => v.toFixed(1);
  const formatZeroDecimal = (v: number) => v.toFixed(0);
  const formatTwoDecimal = (v: number) => v.toFixed(2);
  const formatPercentFromDecimal = (v: number) => `${(v * 100).toFixed(1)}%`;
  const formatPercentFromWhole = (v: number) => `${v.toFixed(1)}%`;

  const trendRatioGroups: Array<{
    title: string;
    last?: boolean;
    rows: Array<{
      name: string;
      valueKey: string;
      metricName: string;
      formatValue: (v: number) => string;
      formatBenchmark?: (v: number) => string;
      worseIf: 'lower' | 'higher';
      companyIsDecimalPercent?: boolean;
    }>;
  }> = [
    {
      title: 'Liquidity Ratios',
      rows: [
        { name: 'Current Ratio', valueKey: 'currentRatio', metricName: 'Current Ratio', formatValue: formatOneDecimal, worseIf: 'lower' },
        { name: 'Quick Ratio', valueKey: 'quickRatio', metricName: 'Quick Ratio', formatValue: formatOneDecimal, worseIf: 'lower' },
      ],
    },
    {
      title: 'Activity Ratios',
      rows: [
        { name: 'Inventory Turnover', valueKey: 'invTurnover', metricName: 'Inventory Turnover', formatValue: formatOneDecimal, worseIf: 'lower' },
        { name: 'Receivables Turnover', valueKey: 'arTurnover', metricName: 'Receivables Turnover', formatValue: formatOneDecimal, worseIf: 'lower' },
        { name: 'Payables Turnover', valueKey: 'apTurnover', metricName: 'Payables Turnover', formatValue: formatOneDecimal, worseIf: 'lower' },
        { name: 'Days Inventory', valueKey: 'daysInv', metricName: 'Days Inventory', formatValue: formatZeroDecimal, worseIf: 'higher' },
        { name: 'Days Receivables', valueKey: 'daysAR', metricName: 'Days Receivables', formatValue: formatZeroDecimal, worseIf: 'higher' },
        { name: 'Days Payables', valueKey: 'daysAP', metricName: 'Days Payables', formatValue: formatZeroDecimal, worseIf: 'higher' },
        { name: 'Sales/Working Capital', valueKey: 'salesWC', metricName: 'Sales/Working Capital', formatValue: formatOneDecimal, worseIf: 'lower' },
      ],
    },
    {
      title: 'Coverage Ratios',
      rows: [
        { name: 'Interest Coverage', valueKey: 'interestCov', metricName: 'Interest Coverage', formatValue: formatOneDecimal, worseIf: 'lower' },
        { name: 'Debt Service Coverage', valueKey: 'debtSvcCov', metricName: 'Debt Service Coverage', formatValue: formatOneDecimal, worseIf: 'lower' },
        { name: 'Cash Flow to Debt', valueKey: 'cfToDebt', metricName: 'Cash Flow to Debt', formatValue: formatTwoDecimal, worseIf: 'lower' },
      ],
    },
    {
      title: 'Leverage Ratios',
      rows: [
        { name: 'Debt/Net Worth', valueKey: 'debtToNW', metricName: 'Debt/Net Worth', formatValue: formatOneDecimal, worseIf: 'higher' },
        { name: 'Fixed Assets/Net Worth', valueKey: 'fixedToNW', metricName: 'Fixed Assets/Net Worth', formatValue: formatOneDecimal, worseIf: 'higher' },
        { name: 'Leverage Ratio', valueKey: 'leverage', metricName: 'Leverage Ratio', formatValue: formatOneDecimal, worseIf: 'higher' },
      ],
    },
    {
      title: 'Operating Ratios',
      last: true,
      rows: [
        { name: 'Total Asset Turnover', valueKey: 'totalAssetTO', metricName: 'Total Asset Turnover', formatValue: formatTwoDecimal, worseIf: 'lower' },
        { name: 'ROE', valueKey: 'roe', metricName: 'ROE', formatValue: formatPercentFromDecimal, formatBenchmark: formatPercentFromWhole, worseIf: 'lower', companyIsDecimalPercent: true },
        { name: 'ROA', valueKey: 'roa', metricName: 'ROA', formatValue: formatPercentFromDecimal, formatBenchmark: formatPercentFromWhole, worseIf: 'lower', companyIsDecimalPercent: true },
        { name: 'EBITDA Margin', valueKey: 'ebitdaMargin', metricName: 'EBITDA/Revenue', formatValue: formatPercentFromDecimal, formatBenchmark: formatPercentFromWhole, worseIf: 'lower', companyIsDecimalPercent: true },
        { name: 'EBIT Margin', valueKey: 'ebitMargin', metricName: 'EBIT/Revenue', formatValue: formatPercentFromDecimal, formatBenchmark: formatPercentFromWhole, worseIf: 'lower', companyIsDecimalPercent: true },
      ],
    },
  ];

  if (!hasPrefetchedData && loading) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#64748b' }}>Loading ratio data...</div>
      </div>
    );
  }

  if (error || !monthly || monthly.length === 0) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#ef4444' }}>No financial data available for ratios</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <style>{`
        @media print {
          @page {
            size: ${printOrientation};
            margin: 0.375in 0.375in 0.75in 0.375in;
          }
          
          .no-print,
          header,
          nav,
          aside,
          [role="navigation"],
          button {
            display: none !important;
          }
          
          .print-header {
            display: block !important;
          }
        }
      `}</style>

      {/* Tab Navigation */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px', marginBottom: '32px', borderBottom: '2px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setKpiDashboardTab('all-ratios')}
            style={{
              padding: '12px 24px',
              background: 'none',
              color: kpiDashboardTab === 'all-ratios' ? '#2751d0' : '#64748b',
              border: 'none',
              borderBottom: kpiDashboardTab === 'all-ratios' ? '3px solid #2751d0' : '3px solid transparent',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Ratios by Type
          </button>
          <button
            onClick={() => setKpiDashboardTab('monthly-ratios')}
            style={{
              padding: '12px 24px',
              background: 'none',
              color: kpiDashboardTab === 'monthly-ratios' ? '#2751d0' : '#64748b',
              border: 'none',
              borderBottom: kpiDashboardTab === 'monthly-ratios' ? '3px solid #2751d0' : '3px solid transparent',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Ratio Trends
          </button>
        </div>
        {kpiDashboardTab === 'monthly-ratios' && (
          <button
            onClick={() => exportMonthlyRatiosToExcel(trendData, companyName)}
            style={{
              background: '#10b981',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '6px',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#059669'}
            onMouseOut={(e) => e.currentTarget.style.background = '#10b981'}
          >
            📊 Export to Excel
          </button>
        )}
      </div>

      {/* Ratios by Type Tab */}
      {kpiDashboardTab === 'all-ratios' && (
        <>
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Liquidity Ratios</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
              <LineChart title="Current Ratio" data={trendData} valueKey="currentRatio" color="#10b981" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Current Ratio')} formatter={(v) => v.toFixed(1)} showFormulaButton onFormulaClick={() => onFormulaClick('Current Ratio')} />
              <LineChart title="Quick Ratio" data={trendData} valueKey="quickRatio" color="#14b8a6" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Quick Ratio')} formatter={(v) => v.toFixed(1)} showFormulaButton onFormulaClick={() => onFormulaClick('Quick Ratio')} />
            </div>
          </div>

          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Activity Ratios</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
              <LineChart title="Inventory Turnover" data={trendData} valueKey="invTurnover" color="#f59e0b" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Inventory Turnover')} formatter={(v) => v.toFixed(1)} showFormulaButton onFormulaClick={() => onFormulaClick('Inventory Turnover')} />
              <LineChart title="Receivables Turnover" data={trendData} valueKey="arTurnover" color="#f97316" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Receivables Turnover')} formatter={(v) => v.toFixed(1)} showFormulaButton onFormulaClick={() => onFormulaClick('Receivables Turnover')} />
              <LineChart title="Payables Turnover" data={trendData} valueKey="apTurnover" color="#ef4444" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Payables Turnover')} formatter={(v) => v.toFixed(1)} showFormulaButton onFormulaClick={() => onFormulaClick('Payables Turnover')} />
              <LineChart title="Days' Inventory" data={trendData} valueKey="daysInv" color="#fbbf24" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Days Inventory')} formatter={(v) => v.toFixed(0)} showFormulaButton onFormulaClick={() => onFormulaClick('Days\' Inventory')} />
              <LineChart title="Days' Receivables" data={trendData} valueKey="daysAR" color="#fb923c" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Days Receivables')} formatter={(v) => v.toFixed(0)} showFormulaButton onFormulaClick={() => onFormulaClick('Days\' Receivables')} />
              <LineChart title="Days' Payables" data={trendData} valueKey="daysAP" color="#f87171" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Days Payables')} formatter={(v) => v.toFixed(0)} showFormulaButton onFormulaClick={() => onFormulaClick('Days\' Payables')} />
              <LineChart title="Sales/Working Capital" data={trendData} valueKey="salesWC" color="#06b6d4" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Sales/Working Capital')} formatter={(v) => v.toFixed(1)} showFormulaButton onFormulaClick={() => onFormulaClick('Sales/Working Capital')} />
            </div>
          </div>

          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Coverage Ratios</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
              <LineChart title="Interest Coverage" data={trendData} valueKey="interestCov" color="#8b5cf6" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Interest Coverage')} formatter={(v) => v.toFixed(1)} showFormulaButton onFormulaClick={() => onFormulaClick('Interest Coverage')} />
              <LineChart title="Debt Service Coverage" data={trendData} valueKey="debtSvcCov" color="#a78bfa" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Debt Service Coverage')} formatter={(v) => v.toFixed(1)} showFormulaButton onFormulaClick={() => onFormulaClick('Debt Service Coverage')} />
              <LineChart title="Cash Flow to Debt" data={trendData} valueKey="cfToDebt" color="#c4b5fd" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Cash Flow to Debt')} formatter={(v) => v.toFixed(1)} showFormulaButton onFormulaClick={() => onFormulaClick('Cash Flow to Debt')} />
            </div>
          </div>

          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Leverage Ratios</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
              <LineChart title="Debt/Net Worth" data={trendData} valueKey="debtToNW" color="#ec4899" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Debt/Net Worth')} formatter={(v) => v.toFixed(1)} showFormulaButton onFormulaClick={() => onFormulaClick('Debt/Net Worth')} />
              <LineChart title="Fixed Assets/Net Worth" data={trendData} valueKey="fixedToNW" color="#f472b6" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Fixed Assets/Net Worth')} formatter={(v) => v.toFixed(1)} showFormulaButton onFormulaClick={() => onFormulaClick('Fixed Assets/Net Worth')} />
              <LineChart title="Leverage Ratio" data={trendData} valueKey="leverage" color="#f9a8d4" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Leverage Ratio')} formatter={(v) => v.toFixed(1)} showFormulaButton onFormulaClick={() => onFormulaClick('Leverage Ratio')} />
            </div>
          </div>

          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Operating Ratios</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
              <LineChart title="Total Asset Turnover" data={trendData} valueKey="totalAssetTO" color="#3b82f6" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Total Asset Turnover')} formatter={(v) => v.toFixed(1)} showFormulaButton onFormulaClick={() => onFormulaClick('Total Asset Turnover')} />
              <LineChart title="Return on Equity (ROE)" data={trendData} valueKey="roe" color="#60a5fa" compact benchmarkValue={getBenchmarkValue(benchmarks, 'ROE')} formatter={(v) => (v * 100).toFixed(1) + '%'} showFormulaButton onFormulaClick={() => onFormulaClick('Return on Equity (ROE)')} />
              <LineChart title="Return on Assets (ROA)" data={trendData} valueKey="roa" color="#93c5fd" compact benchmarkValue={getBenchmarkValue(benchmarks, 'ROA')} formatter={(v) => (v * 100).toFixed(1) + '%'} showFormulaButton onFormulaClick={() => onFormulaClick('Return on Assets (ROA)')} />
              <LineChart title="EBITDA Margin" data={trendData} valueKey="ebitdaMargin" color="#2563eb" compact benchmarkValue={(() => { const bm = getBenchmarkValue(benchmarks, 'EBITDA/Revenue'); return bm !== null ? bm / 100 : null; })()} formatter={(v) => (v * 100).toFixed(1) + '%'} showFormulaButton onFormulaClick={() => onFormulaClick('EBITDA Margin')} />
              <LineChart title="EBIT Margin" data={trendData} valueKey="ebitMargin" color="#1e40af" compact benchmarkValue={(() => { const bm = getBenchmarkValue(benchmarks, 'EBIT/Revenue'); return bm !== null ? bm / 100 : null; })()} formatter={(v) => (v * 100).toFixed(1) + '%'} showFormulaButton onFormulaClick={() => onFormulaClick('EBIT Margin')} />
            </div>
          </div>
        </>
      )}

      {/* Ratio Trends Tab */}
      {kpiDashboardTab === 'monthly-ratios' && (
        <div>
          {trendRatioGroups.map((group) => (
            <div key={group.title}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px', marginTop: group.title === 'Liquidity Ratios' ? '0' : '24px' }}>{group.title}</h3>
              <div style={{ overflowX: 'auto', marginBottom: group.last ? '0' : '12px' }}>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b', minWidth: '120px' }}>Ratio</th>
                      <th style={{ textAlign: 'right', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#2751d0', minWidth: '80px' }}>Benchmarks</th>
                      {recentTrendColumns.map((data, i) => (
                        <th key={i} style={{ textAlign: 'right', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '60px' }}>
                          {data.month}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => {
                      const benchmarkValue = getBenchmarkValue(benchmarks, row.metricName);
                      return (
                      <tr key={row.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>{row.name}</td>
                        <td style={{ padding: '8px', fontSize: '12px', color: '#2751d0', textAlign: 'right', fontWeight: '600' }}>
                          {formatRatioCell(benchmarkValue, row.formatBenchmark || row.formatValue)}
                        </td>
                        {recentTrendColumns.map((data, i) => {
                          const companyValue = (data as any)?.[row.valueKey];
                          const worse = isWorseThanBenchmark(
                            companyValue,
                            benchmarkValue,
                            row.worseIf,
                            row.companyIsDecimalPercent
                          );
                          return (
                          <td key={i} style={{ padding: '8px', fontSize: '12px', color: worse ? '#dc2626' : '#1e293b', textAlign: 'right', fontWeight: worse ? '600' : '400' }}>
                            {formatRatioCell(companyValue, row.formatValue)}
                          </td>
                          );
                        })}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

