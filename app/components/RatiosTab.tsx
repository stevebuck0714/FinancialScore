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
  initialTab?: 'all-ratios' | 'priority-ratios' | 'monthly-ratios';
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

  const [kpiDashboardTab, setKpiDashboardTab] = useState<'all-ratios' | 'priority-ratios' | 'monthly-ratios'>(initialTab);
  const [priorityRatios, setPriorityRatios] = useState<string[]>([]);

  useEffect(() => {
    setKpiDashboardTab(initialTab);
  }, [initialTab]);

  // Load saved priority ratios
  useEffect(() => {
    if (selectedCompanyId) {
      const saved = localStorage.getItem(`priorityRatios_${selectedCompanyId}`);
      if (saved) {
        setPriorityRatios(JSON.parse(saved));
      }
    }
  }, [selectedCompanyId]);

  const trendData = React.useMemo(() => buildRatioTrendData(monthly as MonthlyDataRow[]), [monthly]);

  // Using getBenchmarkValue from utils/data-processing which handles:
  // - Case-insensitive matching
  // - KPI_TO_BENCHMARK_MAP mappings
  // - fiveYearValue property (not 'value')
  // - Partial matching fallback

  const savePriorityRatios = () => {
    if (selectedCompanyId) {
      localStorage.setItem(`priorityRatios_${selectedCompanyId}`, JSON.stringify(priorityRatios));
      alert('Priority ratios saved successfully!');
    }
  };

  const ratioCategories = {
    'Liquidity': ['Current Ratio', 'Quick Ratio'],
    'Activity': ['Inventory Turnover', 'Receivables Turnover', 'Payables Turnover', 'Days\' Inventory', 'Days\' Receivables', 'Days\' Payables', 'Sales/Working Capital'],
    'Coverage': ['Interest Coverage', 'Debt Service Coverage', 'Cash Flow to Debt'],
    'Leverage': ['Debt/Net Worth', 'Fixed Assets/Net Worth', 'Leverage Ratio'],
    'Operating': ['Total Asset Turnover', 'Return on Equity (ROE)', 'Return on Assets (ROA)', 'EBITDA Margin', 'EBIT Margin']
  };

  const ratioKeyMap: { [key: string]: string } = {
    'Current Ratio': 'currentRatio',
    'Quick Ratio': 'quickRatio',
    'Inventory Turnover': 'invTurnover',
    'Receivables Turnover': 'arTurnover',
    'Payables Turnover': 'apTurnover',
    'Days\' Inventory': 'daysInv',
    'Days\' Receivables': 'daysAR',
    'Days\' Payables': 'daysAP',
    'Sales/Working Capital': 'salesWC',
    'Interest Coverage': 'interestCov',
    'Debt Service Coverage': 'debtSvcCov',
    'Cash Flow to Debt': 'cfToDebt',
    'Debt/Net Worth': 'debtToNW',
    'Fixed Assets/Net Worth': 'fixedToNW',
    'Leverage Ratio': 'leverage',
    'Total Asset Turnover': 'totalAssetTO',
    'Return on Equity (ROE)': 'roe',
    'Return on Assets (ROA)': 'roa',
    'EBITDA Margin': 'ebitdaMargin',
    'EBIT Margin': 'ebitMargin'
  };

  const getColorForRatio = (ratioName: string): string => {
    const colors: { [key: string]: string } = {
      'Current Ratio': '#10b981',
      'Quick Ratio': '#14b8a6',
      'Inventory Turnover': '#f59e0b',
      'Receivables Turnover': '#f97316',
      'Payables Turnover': '#ef4444',
      'Days\' Inventory': '#fbbf24',
      'Days\' Receivables': '#fb923c',
      'Days\' Payables': '#f87171',
      'Sales/Working Capital': '#06b6d4',
      'Interest Coverage': '#8b5cf6',
      'Debt Service Coverage': '#a78bfa',
      'Cash Flow to Debt': '#c4b5fd',
      'Debt/Net Worth': '#ec4899',
      'Fixed Assets/Net Worth': '#f472b6',
      'Leverage Ratio': '#f9a8d4',
      'Total Asset Turnover': '#3b82f6',
      'Return on Equity (ROE)': '#60a5fa',
      'Return on Assets (ROA)': '#93c5fd',
      'EBITDA Margin': '#2563eb',
      'EBIT Margin': '#1e40af'
    };
    return colors[ratioName] || '#667eea';
  };

  const getFormatterForRatio = (ratioName: string) => {
    if (ratioName.includes('Margin') || ratioName.includes('ROE') || ratioName.includes('ROA')) {
      return (v: number) => (v * 100).toFixed(1) + '%';
    }
    if (ratioName.includes('Days')) {
      return (v: number) => v.toFixed(0);
    }
    return (v: number) => v.toFixed(1);
  };

  const formatRatioCell = (value: unknown, formatterFn: (v: number) => string) =>
    Number.isFinite(value) ? formatterFn(Number(value)) : 'N/A';

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

      {/* Benchmark Status Indicator - Only show on non-priority tabs */}
      {kpiDashboardTab !== 'priority-ratios' && (
        benchmarks.length > 0 ? (
          <div className="no-print" style={{ background: '#d1fae5', border: '1px solid #10b981', borderRadius: '8px', padding: '12px', marginBottom: '12px', fontSize: '13px', color: '#065f46' }}>
            ✓ Industry benchmarks loaded: {benchmarks.length} metrics for {benchmarks[0]?.industryName || 'Unknown Industry'} ({benchmarks[0]?.assetSizeCategory || 'N/A'})
          </div>
        ) : (
          <div className="no-print" style={{ background: '#fef2f2', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px', marginBottom: '12px', fontSize: '13px', color: '#991b1b' }}>
            ⚠️ No industry benchmarks loaded.
          </div>
        )
      )}

      {/* Tab Navigation */}
      <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '32px', borderBottom: '2px solid #e2e8f0' }}>
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
          Ratio Graphs
        </button>
        <button
          onClick={() => setKpiDashboardTab('priority-ratios')}
          style={{
            padding: '12px 24px',
            background: 'none',
            color: kpiDashboardTab === 'priority-ratios' ? '#2751d0' : '#64748b',
            border: 'none',
            borderBottom: kpiDashboardTab === 'priority-ratios' ? '3px solid #2751d0' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Priority Ratios
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
          Monthly Ratios by Category
        </button>
      </div>

      {/* Ratio Graphs Tab */}
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
              <LineChart title="EBITDA Margin" data={trendData} valueKey="ebitdaMargin" color="#2563eb" compact yMax={0.5} benchmarkValue={(() => { const bm = getBenchmarkValue(benchmarks, 'EBITDA/Revenue'); return bm !== null ? bm / 100 : null; })()} formatter={(v) => (v * 100).toFixed(1) + '%'} showFormulaButton onFormulaClick={() => onFormulaClick('EBITDA Margin')} />
              <LineChart title="EBIT Margin" data={trendData} valueKey="ebitMargin" color="#1e40af" compact yMax={0.5} benchmarkValue={(() => { const bm = getBenchmarkValue(benchmarks, 'EBIT/Revenue'); return bm !== null ? bm / 100 : null; })()} formatter={(v) => (v * 100).toFixed(1) + '%'} showFormulaButton onFormulaClick={() => onFormulaClick('EBIT Margin')} />
            </div>
          </div>
        </>
      )}

      {/* Priority Ratios Tab */}
      {kpiDashboardTab === 'priority-ratios' && (
        <div>
          <div className="no-print" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '20px', marginBottom: '24px', alignItems: 'stretch' }}>
            {/* Left: Customize Section */}
            <div style={{ padding: '5px 20px 20px 20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Customize Your Priority Ratios</h3>
              <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
                Select up to 10 ratios to track as your priority KPIs. These selections will be saved and persist across sessions.
              </p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <select
                  value=""
                  onChange={(e) => {
                    const newRatio = e.target.value;
                    if (newRatio && !priorityRatios.includes(newRatio)) {
                      if (priorityRatios.length < 10) {
                        const updated = [...priorityRatios, newRatio];
                        setPriorityRatios(updated);
                        // Auto-save to localStorage
                        if (selectedCompanyId) {
                          localStorage.setItem(`priorityRatios_${selectedCompanyId}`, JSON.stringify(updated));
                        }
                      } else {
                        alert('Maximum of 10 priority ratios allowed. Please remove one first.');
                      }
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'white',
                    minWidth: '240px',
                    fontWeight: '500'
                  }}
                >
                  <option value="">+ Add Ratio...</option>
                  {Object.entries(ratioCategories).map(([category, ratios]) => (
                    <optgroup key={category} label={category}>
                      {ratios.map(ratio => (
                        <option 
                          key={ratio} 
                          value={ratio}
                          disabled={priorityRatios.includes(ratio)}
                        >
                          {ratio}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>
                  Selected: {priorityRatios.length}/10 ratios
                </div>
              </div>
            </div>

            {/* Right: Industry Benchmark Status */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {benchmarks.length > 0 ? (
                <div style={{ background: '#d1fae5', border: '1px solid #10b981', borderRadius: '8px', padding: '5px 20px 20px 20px', fontSize: '13px', color: '#065f46', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', flex: 1 }}>
                  <div style={{ fontSize: '20px' }}>✓</div>
                  <div>
                    <div style={{ fontWeight: '600', marginBottom: '2px' }}>Industry Benchmarks Loaded</div>
                    <div style={{ fontSize: '12px', opacity: 0.9 }}>{benchmarks.length} metrics for {benchmarks[0]?.industryName || 'Unknown Industry'} ({benchmarks[0]?.assetSizeCategory || 'N/A'})</div>
                  </div>
                </div>
              ) : (
                <div style={{ background: '#fef2f2', border: '1px solid #ef4444', borderRadius: '8px', padding: '5px 20px 20px 20px', fontSize: '13px', color: '#991b1b', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', flex: 1 }}>
                  <div style={{ fontSize: '20px' }}>⚠️</div>
                  <div>
                    <div style={{ fontWeight: '600', marginBottom: '2px' }}>No Industry Benchmarks</div>
                    <div style={{ fontSize: '12px' }}>Load benchmarks for comparison</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Display Selected Priority Ratios */}
          {priorityRatios.length > 0 && (
            <div>
              <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '20px' }}>
                <select
                  value={printOrientation}
                  onChange={(e) => setPrintOrientation(e.target.value as 'portrait' | 'landscape')}
                  style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white', cursor: 'pointer', marginRight: '12px' }}
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
                <button
                  onClick={() => window.print()}
                  style={{
                    padding: '10px 20px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  🖨️ Print
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                {priorityRatios.map(ratioName => {
                  const valueKey = ratioKeyMap[ratioName];
                  const color = getColorForRatio(ratioName);
                  const formatter = getFormatterForRatio(ratioName);
                  const benchmarkValue = getBenchmarkValue(benchmarks, ratioName);

                  const handleDelete = () => {
                    const updated = priorityRatios.filter(ratio => ratio !== ratioName);
                    setPriorityRatios(updated);
                    // Auto-save to localStorage
                    if (selectedCompanyId) {
                      localStorage.setItem(`priorityRatios_${selectedCompanyId}`, JSON.stringify(updated));
                    }
                  };

                  return (
                    <div key={ratioName} style={{ position: 'relative' }}>
                      <button
                        onClick={handleDelete}
                        className="no-print"
                        style={{
                          position: 'absolute',
                          top: '60px',
                          right: '8px',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          zIndex: 10,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                        title="Remove this ratio"
                      >
                        ✕
                      </button>
                      <LineChart
                        title={ratioName}
                        data={trendData}
                        valueKey={valueKey}
                        color={color}
                        compact
                        benchmarkValue={benchmarkValue}
                        formatter={formatter}
                        showFormulaButton
                        onFormulaClick={() => onFormulaClick(ratioName)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {priorityRatios.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
                No Priority Ratios Selected
              </div>
              <div style={{ fontSize: '14px', color: '#94a3b8' }}>
                Select up to 10 ratios from the dropdown menu above to create your custom dashboard
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monthly Ratios by Category Tab */}
      {kpiDashboardTab === 'monthly-ratios' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
              Financial Ratios Overview
            </h2>
            <button
              onClick={() => exportMonthlyRatiosToExcel(trendData, companyName)}
              style={{
                background: '#10b981',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = '#059669'}
              onMouseOut={(e) => e.currentTarget.style.background = '#10b981'}
            >
              📊 Export to Excel
            </button>
          </div>
          
          {/* Liquidity Ratios */}
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px', marginTop: '24px' }}>Liquidity Ratios</h3>
          <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b', minWidth: '120px' }}>Ratio</th>
                  {trendData.slice(-12).map((data, i) => (
                    <th key={i} style={{ textAlign: 'right', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '60px' }}>
                      {data.month}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Current Ratio</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.currentRatio, (v) => v.toFixed(1))}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Quick Ratio</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.quickRatio, (v) => v.toFixed(1))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          
          {/* Activity Ratios */}
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px', marginTop: '24px' }}>Activity Ratios</h3>
          <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b', minWidth: '120px' }}>Ratio</th>
                  {trendData.slice(-12).map((data, i) => (
                    <th key={i} style={{ textAlign: 'right', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '60px' }}>
                      {data.month}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Inventory Turnover</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.invTurnover, (v) => v.toFixed(1))}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Receivables Turnover</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.arTurnover, (v) => v.toFixed(1))}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Payables Turnover</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.apTurnover, (v) => v.toFixed(1))}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Days Inventory</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.daysInv, (v) => v.toFixed(0))}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Days Receivables</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.daysAR, (v) => v.toFixed(0))}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Days Payables</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.daysAP, (v) => v.toFixed(0))}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Sales/Working Capital</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.salesWC, (v) => v.toFixed(1))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          
          {/* Coverage Ratios */}
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px', marginTop: '24px' }}>Coverage Ratios</h3>
          <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b', minWidth: '120px' }}>Ratio</th>
                  {trendData.slice(-12).map((data, i) => (
                    <th key={i} style={{ textAlign: 'right', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '60px' }}>
                      {data.month}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Interest Coverage</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.interestCov, (v) => v.toFixed(1))}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Debt Service Coverage</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.debtSvcCov, (v) => v.toFixed(1))}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Cash Flow to Debt</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.cfToDebt, (v) => v.toFixed(2))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          
          {/* Leverage Ratios */}
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px', marginTop: '24px' }}>Leverage Ratios</h3>
          <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b', minWidth: '120px' }}>Ratio</th>
                  {trendData.slice(-12).map((data, i) => (
                    <th key={i} style={{ textAlign: 'right', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '60px' }}>
                      {data.month}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Debt/Net Worth</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.debtToNW, (v) => v.toFixed(1))}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Fixed Assets/Net Worth</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.fixedToNW, (v) => v.toFixed(1))}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Leverage Ratio</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.leverage, (v) => v.toFixed(1))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          
          {/* Operating Ratios */}
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px', marginTop: '24px' }}>Operating Ratios</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b', minWidth: '120px' }}>Ratio</th>
                  {trendData.slice(-12).map((data, i) => (
                    <th key={i} style={{ textAlign: 'right', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '60px' }}>
                      {data.month}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Total Asset Turnover</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.totalAssetTO, (v) => v.toFixed(2))}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>ROE</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.roe, (v) => `${(v * 100).toFixed(1)}%`)}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>ROA</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.roa, (v) => `${(v * 100).toFixed(1)}%`)}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>EBITDA Margin</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.ebitdaMargin, (v) => `${(v * 100).toFixed(1)}%`)}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>EBIT Margin</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {formatRatioCell(data?.ebitMargin, (v) => `${(v * 100).toFixed(1)}%`)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

