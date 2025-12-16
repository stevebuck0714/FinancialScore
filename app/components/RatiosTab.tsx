'use client';

import React, { useState, useEffect } from 'react';
import { useMasterData } from '@/lib/master-data-store';
import type { MonthlyDataRow } from '../types';
import dynamic from 'next/dynamic';
import { exportMonthlyRatiosToExcel } from '../utils/excel-export';
import { getBenchmarkValue } from '../utils/data-processing';

const LineChart = dynamic(() => import('./charts/Charts').then(mod => mod.LineChart), { ssr: false });

interface RatiosTabProps {
  selectedCompanyId: string;
  companyName: string;
  benchmarks: any[];
  onFormulaClick: (formula: string) => void;
}

export default function RatiosTab({
  selectedCompanyId,
  companyName,
  benchmarks,
  onFormulaClick,
}: RatiosTabProps) {
  const { monthlyData, loading, error } = useMasterData(selectedCompanyId);
  const monthly = monthlyData || [];

  // Debug: Log benchmarks when component receives them
  React.useEffect(() => {
    console.log('[RatiosTab] Benchmarks received:', {
      count: benchmarks?.length || 0,
      sample: benchmarks?.slice(0, 3).map((b: any) => ({ metricName: b.metricName, value: b.fiveYearValue }))
    });
  }, [benchmarks]);

  const [kpiDashboardTab, setKpiDashboardTab] = useState<'all-ratios' | 'priority-ratios' | 'monthly-ratios'>('all-ratios');
  const [priorityRatios, setPriorityRatios] = useState<string[]>([]);

  // Load saved priority ratios
  useEffect(() => {
    if (selectedCompanyId) {
      const saved = localStorage.getItem(`priorityRatios_${selectedCompanyId}`);
      if (saved) {
        setPriorityRatios(JSON.parse(saved));
      }
    }
  }, [selectedCompanyId]);

  // Format month as MM-YYYY
  const formatMonth = (monthValue: any): string => {
    if (!monthValue) return '';
    
    // If already in MM-YYYY format, return as is
    if (typeof monthValue === 'string' && /^\d{2}-\d{4}$/.test(monthValue)) {
      return monthValue;
    }
    
    // If already in MM/YYYY format, convert to MM-YYYY
    if (typeof monthValue === 'string' && /^\d{1,2}\/\d{4}$/.test(monthValue)) {
      const [month, year] = monthValue.split('/');
      return `${month.padStart(2, '0')}-${year}`;
    }
    
    // Try to parse as date
    const date = monthValue instanceof Date ? monthValue : new Date(monthValue);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      // If it's a string that doesn't match expected formats, return as is
      return String(monthValue);
    }
    
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${month}-${year}`;
  };

  // Calculate trendData from monthly data (ratios/KPIs)
  const trendData = React.useMemo(() => {
    if (!monthly || monthly.length === 0) return [];

    return monthly.map((m: MonthlyDataRow) => {
      const revenue = m.revenue || 0;
      const cogs = m.cogsTotal || 0;
      const grossProfit = revenue - cogs;
      
      // Calculate total operating expenses
      const operatingExpenses = (m.payroll || 0) + (m.ownerBasePay || 0) + (m.benefits || 0) +
        (m.insurance || 0) + (m.professionalFees || 0) + (m.subcontractors || 0) +
        (m.rent || 0) + (m.taxLicense || 0) + (m.phoneComm || 0) + (m.infrastructure || 0) +
        (m.autoTravel || 0) + (m.salesExpense || 0) + (m.marketing || 0) +
        (m.trainingCert || 0) + (m.mealsEntertainment || 0) + (m.otherExpense || 0);

      const ebit = grossProfit - operatingExpenses;
      const ebitda = ebit + (m.depreciationAmortization || 0);
      const netProfit = ebit - (m.interestExpense || 0);

      // Balance sheet items
      const cash = m.cash || 0;
      const ar = m.ar || 0;
      const inventory = m.inventory || 0;
      const otherCA = m.otherCA || 0;
      const tca = m.tca || (cash + ar + inventory + otherCA);
      
      const fixedAssets = m.fixedAssets || 0;
      const otherNCA = m.otherNCA || 0;
      const totalAssets = m.totalAssets || (tca + fixedAssets + otherNCA);
      
      const ap = m.ap || 0;
      const otherCL = m.otherCL || 0;
      const tcl = m.tcl || (ap + otherCL);
      
      const ltDebt = m.ltDebt || 0;
      const otherLTL = m.otherLTL || 0;
      const totalLiabilities = m.totalLiabilities || (tcl + ltDebt + otherLTL);
      
      const equity = m.equity || (totalAssets - totalLiabilities);

      // Calculate ratios
      const currentRatio = tcl > 0 ? tca / tcl : 0;
      const quickRatio = tcl > 0 ? (tca - inventory) / tcl : 0;
      const workingCapital = tca - tcl;

      // Activity ratios
      const invTurnover = inventory > 0 ? cogs / inventory : 0;
      const arTurnover = ar > 0 ? revenue / ar : 0;
      const apTurnover = ap > 0 ? cogs / ap : 0;
      const daysInv = invTurnover > 0 ? 365 / invTurnover : 0;
      const daysAR = arTurnover > 0 ? 365 / arTurnover : 0;
      const daysAP = apTurnover > 0 ? 365 / apTurnover : 0;
      const salesWC = workingCapital > 0 ? revenue / workingCapital : 0;

      // Coverage ratios
      const interestCov = m.interestExpense > 0 ? ebit / m.interestExpense : 0;
      const debtSvcCov = (ltDebt + tcl) > 0 ? (netProfit + (m.depreciationAmortization || 0)) / (ltDebt + tcl) : 0;
      const cfToDebt = (ltDebt + tcl) > 0 ? netProfit / (ltDebt + tcl) : 0;

      // Leverage ratios
      const debtToNW = equity > 0 ? totalLiabilities / equity : 0;
      const fixedToNW = equity > 0 ? fixedAssets / equity : 0;
      const leverage = equity > 0 ? totalAssets / equity : 0;

      // Operating ratios
      const totalAssetTO = totalAssets > 0 ? revenue / totalAssets : 0;
      const roe = equity > 0 ? netProfit / equity : 0;
      const roa = totalAssets > 0 ? netProfit / totalAssets : 0;
      const ebitdaMargin = revenue > 0 ? ebitda / revenue : 0;
      const ebitMargin = revenue > 0 ? ebit / revenue : 0;

      const monthValue = m.monthDate || m.month;
      return {
        month: formatMonth(monthValue),
        monthDate: m.monthDate,
        // Liquidity
        currentRatio,
        quickRatio,
        workingCapital,
        // Activity
        invTurnover,
        arTurnover,
        apTurnover,
        daysInv,
        daysAR,
        daysAP,
        salesWC,
        // Coverage
        interestCov,
        debtSvcCov,
        cfToDebt,
        // Leverage
        debtToNW,
        fixedToNW,
        leverage,
        // Operating
        totalAssetTO,
        roe,
        roa,
        ebitdaMargin,
        ebitMargin,
      };
    });
  }, [monthly]);

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

  if (loading) {
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
            size: letter;
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

      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Ratios</h1>
        {companyName && <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
      </div>
      
      {/* Benchmark Status Indicator */}
      {benchmarks.length > 0 ? (
        <div className="no-print" style={{ background: '#d1fae5', border: '1px solid #10b981', borderRadius: '8px', padding: '12px', marginBottom: '12px', fontSize: '13px', color: '#065f46' }}>
          ✓ Industry benchmarks loaded: {benchmarks.length} metrics for {benchmarks[0]?.industryName || 'Unknown Industry'} ({benchmarks[0]?.assetSizeCategory || 'N/A'})
        </div>
      ) : (
        <div className="no-print" style={{ background: '#fef2f2', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px', marginBottom: '12px', fontSize: '13px', color: '#991b1b' }}>
          ⚠️ No industry benchmarks loaded.
        </div>
      )}

      {/* Tab Navigation */}
      <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '32px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => setKpiDashboardTab('all-ratios')}
          style={{
            padding: '12px 24px',
            background: kpiDashboardTab === 'all-ratios' ? '#667eea' : 'transparent',
            color: kpiDashboardTab === 'all-ratios' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: kpiDashboardTab === 'all-ratios' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          Ratio Graphs
        </button>
        <button
          onClick={() => setKpiDashboardTab('priority-ratios')}
          style={{
            padding: '12px 24px',
            background: kpiDashboardTab === 'priority-ratios' ? '#667eea' : 'transparent',
            color: kpiDashboardTab === 'priority-ratios' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: kpiDashboardTab === 'priority-ratios' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          Priority Ratios
        </button>
        <button
          onClick={() => setKpiDashboardTab('monthly-ratios')}
          style={{
            padding: '12px 24px',
            background: kpiDashboardTab === 'monthly-ratios' ? '#667eea' : 'transparent',
            color: kpiDashboardTab === 'monthly-ratios' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: kpiDashboardTab === 'monthly-ratios' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
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
          <div className="no-print" style={{ marginBottom: '12px', padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>Customize Your Priority Ratios</h3>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
              Select up to 6 ratios to track as your priority KPIs. These selections will be saved and persist across sessions.
            </p>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              {Object.entries(ratioCategories).map(([category, ratios]) => (
                <div key={category} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', whiteSpace: 'nowrap' }}>
                    {category}:
                  </label>
                  <select
                    value={priorityRatios.find(ratio => ratios.includes(ratio)) || ''}
                    onChange={(e) => {
                      const newRatio = e.target.value;
                      if (newRatio) {
                        const currentRatioFromCategory = priorityRatios.find(ratio => ratios.includes(ratio));
                        if (currentRatioFromCategory) {
                          setPriorityRatios(prev => prev.map(ratio => 
                            ratio === currentRatioFromCategory ? newRatio : ratio
                          ));
                        } else if (priorityRatios.length < 6) {
                          setPriorityRatios(prev => [...prev, newRatio]);
                        } else {
                          alert('Maximum of 6 priority ratios allowed. Please remove one first.');
                        }
                      }
                    }}
                    style={{
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: 'white',
                      minWidth: '140px'
                    }}
                  >
                    <option value="">Select...</option>
                    {ratios.map(ratio => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Selected: {priorityRatios.length}/6 ratios
              </div>
              <button
                onClick={savePriorityRatios}
                style={{
                  padding: '6px 12px',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </div>

          {/* Display Selected Priority Ratios */}
          {priorityRatios.length > 0 && (
            <div>
              <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                  Your Priority Ratios ({priorityRatios.length}/6)
                </h3>
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

                  return (
                    <LineChart
                      key={ratioName}
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
                Select up to 6 ratios from the dropdown menus above to create your custom dashboard
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
                      {data?.currentRatio !== undefined ? data.currentRatio.toFixed(1) : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Quick Ratio</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.quickRatio !== undefined ? data.quickRatio.toFixed(1) : 'N/A'}
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
                      {data?.invTurnover !== undefined ? data.invTurnover.toFixed(1) : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Receivables Turnover</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.arTurnover !== undefined ? data.arTurnover.toFixed(1) : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Payables Turnover</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.apTurnover !== undefined ? data.apTurnover.toFixed(1) : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Days Inventory</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.daysInv !== undefined ? data.daysInv.toFixed(0) : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Days Receivables</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.daysAR !== undefined ? data.daysAR.toFixed(0) : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Days Payables</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.daysAP !== undefined ? data.daysAP.toFixed(0) : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Sales/Working Capital</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.salesWC !== undefined ? data.salesWC.toFixed(1) : 'N/A'}
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
                      {data?.interestCov !== undefined ? data.interestCov.toFixed(1) : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Debt Service Coverage</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.debtSvcCov !== undefined ? data.debtSvcCov.toFixed(1) : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Cash Flow to Debt</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.cfToDebt !== undefined ? data.cfToDebt.toFixed(2) : 'N/A'}
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
                      {data?.debtToNW !== undefined ? data.debtToNW.toFixed(1) : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Fixed Assets/Net Worth</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.fixedToNW !== undefined ? data.fixedToNW.toFixed(1) : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Leverage Ratio</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.leverage !== undefined ? data.leverage.toFixed(1) : 'N/A'}
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
                      {data?.totalAssetTO !== undefined ? data.totalAssetTO.toFixed(2) : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>ROE</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.roe !== undefined ? `${(data.roe * 100).toFixed(1)}%` : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>ROA</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.roa !== undefined ? `${(data.roa * 100).toFixed(1)}%` : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>EBITDA Margin</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.ebitdaMargin !== undefined ? `${(data.ebitdaMargin * 100).toFixed(1)}%` : 'N/A'}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>EBIT Margin</td>
                  {trendData.slice(-12).map((data, i) => (
                    <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                      {data?.ebitMargin !== undefined ? `${(data.ebitMargin * 100).toFixed(1)}%` : 'N/A'}
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

