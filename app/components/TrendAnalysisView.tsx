'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { LineChart } from './charts/Charts';
import { useMasterData, masterDataStore } from '@/lib/master-data-store';

interface TrendAnalysisViewProps {
  selectedCompanyId: string;
  companyName: string | null;
  monthly: any[];
  expenseGoals: { [key: string]: number };
  selectedExpenseItems: string[];
  setSelectedExpenseItems: (items: string[]) => void;
  selectedItemTrends: string[];
  setSelectedItemTrends: (items: string[]) => void;
}

export default function TrendAnalysisView({
  selectedCompanyId,
  companyName,
  monthly,
  expenseGoals,
  selectedExpenseItems,
  setSelectedExpenseItems,
  selectedItemTrends,
  setSelectedItemTrends
}: TrendAnalysisViewProps) {
  const [trendAnalysisTab, setTrendAnalysisTab] = useState<'item-trends' | 'expense-analysis'>('item-trends');

  // Get master data for dynamic expense categories
  const masterData = useMasterData(selectedCompanyId);
  const expenseCategories = masterData.data?.expenseCategories || [];

  // Clear master data cache when component mounts
  React.useEffect(() => {
    if (selectedCompanyId) {
      masterDataStore.clearCompanyCache(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  return (
    <div style={{ maxWidth: '100%', padding: '32px 32px 32px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Trend Analysis</h1>
        {companyName && <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => setTrendAnalysisTab('item-trends')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            fontSize: '16px',
            fontWeight: '600',
            color: trendAnalysisTab === 'item-trends' ? '#667eea' : '#64748b',
            cursor: 'pointer',
            borderBottom: trendAnalysisTab === 'item-trends' ? '3px solid #667eea' : '3px solid transparent',
            marginBottom: '-2px'
          }}
        >
          Item Trends
        </button>
        <button
          onClick={() => setTrendAnalysisTab('expense-analysis')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            fontSize: '16px',
            fontWeight: '600',
            color: trendAnalysisTab === 'expense-analysis' ? '#667eea' : '#64748b',
            cursor: 'pointer',
            borderBottom: trendAnalysisTab === 'expense-analysis' ? '3px solid #667eea' : '3px solid transparent',
            marginBottom: '-2px'
          }}
        >
          Expense Analysis
        </button>
      </div>

      {/* Item Trends Tab */}
      {trendAnalysisTab === 'item-trends' && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {/* Item Trends Selector */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Select Financial Metrics to Analyze</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              {[
                'Revenue', 'Gross Profit', 'Total Operating Expenses', 'EBIT', 'EBITDA', 'Net Income',
                'Cash', 'Current Assets', 'Fixed Assets', 'Total Assets',
                'Accounts Payable', 'Long Term Debt', 'Total Equity'
              ].map(metric => (
                <label key={metric} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedItemTrends.includes(metric)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItemTrends([...selectedItemTrends, metric]);
                      } else {
                        setSelectedItemTrends(selectedItemTrends.filter(item => item !== metric));
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '14px', color: '#374151' }}>
                    {metric}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
            {/* Dynamic financial metric charts */}
            {selectedItemTrends.map((metric, index) => {
              const getMetricData = (m: any) => {
                switch (metric) {
                  case 'Revenue':
                    return m.revenue || 0;
                  case 'Gross Profit':
                    return (m.revenue || 0) - (m.cogsTotal || 0);
                  case 'Total Operating Expenses':
                    return m.expense || 0;
                  case 'EBIT':
                    return (m.revenue || 0) - (m.cogsTotal || 0) - (m.expense || 0);
                  case 'EBITDA':
                    return (m.revenue || 0) - (m.cogsTotal || 0) - (m.expense || 0) + (m.depreciationAmortization || 0);
                  case 'Net Income':
                    return m.netIncome || ((m.revenue || 0) - (m.cogsTotal || 0) - (m.expense || 0) - (m.interestExpense || 0));
                  case 'Cash':
                    return m.cash || 0;
                  case 'Current Assets':
                    return m.currentAssets || 0;
                  case 'Fixed Assets':
                    return m.fixedAssets || 0;
                  case 'Total Assets':
                    return m.totalAssets || (m.currentAssets || 0) + (m.fixedAssets || 0);
                  case 'Accounts Payable':
                    return m.accountsPayable || 0;
                  case 'Long Term Debt':
                    return m.longTermDebt || 0;
                  case 'Total Equity':
                    return m.totalEquity || (m.totalAssets || 0) - (m.totalLiabilities || 0);
                  default:
                    return 0;
                }
              };

              const getFormatter = (metric: string) => {
                // Balance sheet items use $K format, P&L items use $K format
                return (val: number) => `$${(val / 1000).toFixed(0)}K`;
              };

              const colors = [
                '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#f59e0b',
                '#06b6d4', '#84cc16', '#5eead4', '#a78bfa', '#f97316',
                '#ec4899', '#64748b'
              ];
              const color = colors[index % colors.length];

              return (
                <LineChart
                  key={metric}
                  title={metric}
                  data={monthly.map(m => ({
                    month: m.month,
                    value: getMetricData(m)
                  }))}
                  color={color}
                  compact
                  showTable={true}
                  labelFormat="quarterly"
                  formatter={getFormatter(metric)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Expense Analysis Tab */}
      {trendAnalysisTab === 'expense-analysis' && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {/* Expense Categories Selector */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Select Expense Categories to Analyze</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              {expenseCategories.map(category => (
                <label key={category.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedExpenseItems.includes(category.key)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedExpenseItems([...selectedExpenseItems, category.key]);
                      } else {
                        setSelectedExpenseItems(selectedExpenseItems.filter(item => item !== category.key));
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '14px', color: '#374151' }}>
                    {category.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
            {/* Dynamic expense category charts */}
            {expenseCategories
              .filter(category => selectedExpenseItems.includes(category.key))
              .map((category, index) => {
                const colors = [
                  '#ef4444', '#f59e0b', '#06b6d4', '#84cc16', '#5eead4', '#a78bfa',
                  '#f97316', '#ec4899', '#64748b', '#14b8a6', '#8b5cf6', '#fef3c7',
                  '#fce7f3', '#fb7185', '#e0f2fe'
                ];
                const color = colors[index % colors.length];

                return (
                  <LineChart
                    key={category.key}
                    title={`${category.label} (% of Revenue)`}
                    data={monthly.map(m => ({
                      month: m.month,
                      value: m.revenue > 0 ? (((m as any)[category.key] || 0) / m.revenue) * 100 : 0
                    }))}
                    color={color}
                    compact
                    showTable={true}
                    labelFormat="quarterly"
                    formatter={(val: number) => `${val.toFixed(1)}%`}
                    goalLineData={expenseGoals[category.key] ? monthly.map(() => expenseGoals[category.key]) : undefined}
                  />
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { LineChart } from './charts/Charts';
import { useMasterData, masterDataStore } from '@/lib/master-data-store';

interface TrendAnalysisViewProps {
  selectedCompanyId: string;
  companyName: string | null;
  monthly: any[];
  expenseGoals: { [key: string]: number };
  selectedExpenseItems: string[];
  setSelectedExpenseItems: (items: string[]) => void;
  selectedItemTrends: string[];
  setSelectedItemTrends: (items: string[]) => void;
}

export default function TrendAnalysisView({
  selectedCompanyId,
  companyName,
  monthly,
  expenseGoals,
  selectedExpenseItems,
  setSelectedExpenseItems,
  selectedItemTrends,
  setSelectedItemTrends
}: TrendAnalysisViewProps) {
  const [trendAnalysisTab, setTrendAnalysisTab] = useState<'item-trends' | 'expense-analysis'>('item-trends');

  // Get master data for dynamic expense categories
  const masterData = useMasterData(selectedCompanyId);
  const expenseCategories = masterData.data?.expenseCategories || [];

  // Clear master data cache when component mounts
  React.useEffect(() => {
    if (selectedCompanyId) {
      masterDataStore.clearCompanyCache(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  return (
    <div style={{ maxWidth: '100%', padding: '32px 32px 32px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Trend Analysis</h1>
        {companyName && <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => setTrendAnalysisTab('item-trends')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            fontSize: '16px',
            fontWeight: '600',
            color: trendAnalysisTab === 'item-trends' ? '#667eea' : '#64748b',
            cursor: 'pointer',
            borderBottom: trendAnalysisTab === 'item-trends' ? '3px solid #667eea' : '3px solid transparent',
            marginBottom: '-2px'
          }}
        >
          Item Trends
        </button>
        <button
          onClick={() => setTrendAnalysisTab('expense-analysis')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            fontSize: '16px',
            fontWeight: '600',
            color: trendAnalysisTab === 'expense-analysis' ? '#667eea' : '#64748b',
            cursor: 'pointer',
            borderBottom: trendAnalysisTab === 'expense-analysis' ? '3px solid #667eea' : '3px solid transparent',
            marginBottom: '-2px'
          }}
        >
          Expense Analysis
        </button>
      </div>

      {/* Item Trends Tab */}
      {trendAnalysisTab === 'item-trends' && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {/* Item Trends Selector */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Select Financial Metrics to Analyze</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              {[
                'Revenue', 'Gross Profit', 'Total Operating Expenses', 'EBIT', 'EBITDA', 'Net Income',
                'Cash', 'Current Assets', 'Fixed Assets', 'Total Assets',
                'Accounts Payable', 'Long Term Debt', 'Total Equity'
              ].map(metric => (
                <label key={metric} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedItemTrends.includes(metric)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItemTrends([...selectedItemTrends, metric]);
                      } else {
                        setSelectedItemTrends(selectedItemTrends.filter(item => item !== metric));
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '14px', color: '#374151' }}>
                    {metric}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
            {/* Dynamic financial metric charts */}
            {selectedItemTrends.map((metric, index) => {
              const getMetricData = (m: any) => {
                switch (metric) {
                  case 'Revenue':
                    return m.revenue || 0;
                  case 'Gross Profit':
                    return (m.revenue || 0) - (m.cogsTotal || 0);
                  case 'Total Operating Expenses':
                    return m.expense || 0;
                  case 'EBIT':
                    const revenue = m.revenue || 0;
                    const cogs = m.cogsTotal || 0;
                    const expenses = m.expense || 0;
                    return revenue - cogs - expenses;
                  case 'EBITDA':
                    const rev = m.revenue || 0;
                    const cog = m.cogsTotal || 0;
                    const exp = m.expense || 0;
                    const depreciation = m.depreciationAmortization || 0;
                    return (rev - cog - exp) + depreciation;
                  case 'Cash':
                    return m.cash || 0;
                  case 'Current Assets':
                    return m.currentAssets || 0;
                  case 'Fixed Assets':
                    return m.fixedAssets || 0;
                  case 'Total Assets':
                    return m.totalAssets || 0;
                  case 'Accounts Payable':
                    return m.accountsPayable || 0;
                  case 'Long Term Debt':
                    return m.longTermDebt || 0;
                  case 'Total Equity':
                    return m.totalEquity || 0;
                  case 'Net Income':
                    // Calculate as EBIT - Interest Expense + Other Income, but for simplicity use the stored value or calculate basic version
                    return m.netIncome || ((m.revenue || 0) - (m.cogsTotal || 0) - (m.expense || 0));
                  default:
                    return 0;
                }
              };

              const getFormatter = (metric: string) => {
                // Balance sheet items use $K format, P&L items use $K format
                return (val: number) => `$${(val / 1000).toFixed(0)}K`;
              };

              const colors = [
                '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#f59e0b',
                '#06b6d4', '#84cc16', '#5eead4', '#a78bfa', '#f97316',
                '#ec4899', '#64748b'
              ];
              const color = colors[index % colors.length];

              return (
                <LineChart
                  key={metric}
                  title={metric}
                  data={monthly.map(m => ({
                    month: m.month,
                    value: getMetricData(m)
                  }))}
                  color={color}
                  compact
                  showTable={true}
                  labelFormat="quarterly"
                  formatter={getFormatter(metric)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Expense Analysis Tab */}
      {trendAnalysisTab === 'expense-analysis' && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {/* Expense Categories Selector */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Select Expense Categories to Analyze</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              {expenseCategories.map(category => (
                <label key={category.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedExpenseItems.includes(category.key)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedExpenseItems([...selectedExpenseItems, category.key]);
                      } else {
                        setSelectedExpenseItems(selectedExpenseItems.filter(item => item !== category.key));
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '14px', color: '#374151' }}>
                    {category.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
            {/* Dynamic expense category charts */}
            {expenseCategories
              .filter(category => selectedExpenseItems.includes(category.key))
              .map((category, index) => {
                const colors = [
                  '#ef4444', '#f59e0b', '#06b6d4', '#84cc16', '#5eead4', '#a78bfa',
                  '#f97316', '#ec4899', '#64748b', '#14b8a6', '#8b5cf6', '#fef3c7',
                  '#fce7f3', '#fb7185', '#e0f2fe'
                ];
                const color = colors[index % colors.length];

                return (
                  <LineChart
                    key={category.key}
                    title={`${category.label} (% of Revenue)`}
                    data={monthly.map(m => ({
                      month: m.month,
                      value: m.revenue > 0 ? (((m as any)[category.key] || 0) / m.revenue) * 100 : 0
                    }))}
                    color={color}
                    compact
                    showTable={true}
                    labelFormat="quarterly"
                    formatter={(val: number) => `${val.toFixed(1)}%`}
                    goalLineData={expenseGoals[category.key] ? monthly.map(() => expenseGoals[category.key]) : undefined}
                  />
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
