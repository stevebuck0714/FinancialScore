// @ts-nocheck
'use client';

import React from 'react';
import { useMasterData } from '@/lib/master-data-store';
import toast from 'react-hot-toast';
import { useCompanyMoneyFormatter } from '@/app/hooks/useCompanyMoneyFormatter';
import PageCurrencyBadge from './PageCurrencyBadge';
import {
  COGS_TOTAL_BENCHMARK_METRICS,
  EXPENSE_CATEGORY_BENCHMARK_METRICS,
  OPERATIONAL_GOAL_BENCHMARK_METRICS,
  OPEX_TOTAL_BENCHMARK_METRICS,
} from '@/app/constants';

interface GoalsViewProps {
  selectedCompanyId: string;
  companyName: string | null;
  monthly: any[];
  expenseGoals: { [key: string]: number };
  setExpenseGoals: (goals: { [key: string]: number }) => void;
  masterDataCategories?: any[];
  setMasterDataCategories?: (categories: any[]) => void;
  benchmarks?: any[];
}

function normalizeBenchmarkName(name: string): string {
  return String(name)
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findExactBenchmarkValue(benchmarks: any[] | undefined, metricName: string): number | null {
  if (!benchmarks?.length) return null;
  const needle = normalizeBenchmarkName(metricName);
  const match = benchmarks.find(
    (row) => typeof row?.metricName === 'string' && normalizeBenchmarkName(row.metricName) === needle
  );
  const value = match?.fiveYearValue;
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value);
}

function sumBenchmarkValues(benchmarks: any[] | undefined, metricNames: string[]): number | null {
  let total = 0;
  let found = 0;
  for (const name of metricNames) {
    const value = findExactBenchmarkValue(benchmarks, name);
    if (value != null) {
      total += value;
      found += 1;
    }
  }
  return found > 0 ? total : null;
}

function getOperationalBenchmarkValue(benchmarks: any[] | undefined, metricKey: string): number | null {
  const metricNames = OPERATIONAL_GOAL_BENCHMARK_METRICS[metricKey];
  if (!metricNames?.length) return null;
  return sumBenchmarkValues(benchmarks, metricNames);
}

function operationalBenchmarkFormat(metricKey: string): 'percent' | 'days' | undefined {
  if (metricKey.startsWith('days_')) return 'days';
  if (OPERATIONAL_GOAL_BENCHMARK_METRICS[metricKey]) return 'percent';
  return undefined;
}

function renderBenchmarkCell(value: number | null, opts?: { bold?: boolean; format?: 'percent' | 'days' }) {
  const bold = Boolean(opts?.bold);
  let display = '—';
  if (value != null) {
    display = opts?.format === 'days' ? `${Math.round(value)}d` : `${value.toFixed(1)}%`;
  }
  return (
    <td
      style={{
        textAlign: 'center',
        padding: bold ? '16px 12px' : '12px',
        fontSize: bold ? '16px' : '14px',
        fontWeight: bold ? '700' : '600',
        color: value != null ? '#1e293b' : '#94a3b8',
      }}
    >
      {display}
    </td>
  );
}

function utcMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function computeDaysOutstanding(sortedMonthly: any[], index: number): { daysAR: number; daysInv: number; daysAP: number } {
  const cur = sortedMonthly[index];
  if (!cur) return { daysAR: 0, daysInv: 0, daysAP: 0 };

  const window = sortedMonthly.slice(Math.max(0, index - 11), index + 1);
  const ltmCogs = window.reduce((sum, row) => sum + (Number(row.cogsTotal) || 0), 0);
  const ltmSales = window.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0);
  const yearAgo = index >= 12 ? sortedMonthly[index - 12] : cur;
  const avgInventory = ((Number(cur.inventory) || 0) + (Number(yearAgo.inventory) || 0)) / 2;
  const avgAr = ((Number(cur.ar) || 0) + (Number(yearAgo.ar) || 0)) / 2;
  const avgAp = ((Number(cur.ap) || 0) + (Number(yearAgo.ap) || 0)) / 2;
  const invTurnover = avgInventory > 0 ? ltmCogs / avgInventory : 0;
  const arTurnover = avgAr > 0 ? ltmSales / avgAr : 0;
  const apTurnover = avgAp > 0 ? ltmCogs / avgAp : 0;

  return {
    daysInv: invTurnover > 0 ? 365 / invTurnover : 0,
    daysAR: arTurnover > 0 ? 365 / arTurnover : 0,
    daysAP: apTurnover > 0 ? 365 / apTurnover : 0,
  };
}

const PERCENT_OF_ASSETS_GOAL_KEYS = ['total_cash', 'inventory_value'];

function percentOfAssets(amount: number, totalAssets: number): number {
  return totalAssets > 0 ? (amount / totalAssets) * 100 : 0;
}

function sanitizeOperationalGoals(goals: { [key: string]: number } | null | undefined): { [key: string]: number } {
  if (!goals || typeof goals !== 'object') return {};
  const next = { ...goals };
  for (const key of PERCENT_OF_ASSETS_GOAL_KEYS) {
    const value = Number(next[key]);
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      delete next[key];
    }
  }
  return next;
}

export default function GoalsView({
  selectedCompanyId,
  companyName,
  monthly,
  expenseGoals,
  setExpenseGoals,
  masterDataCategories,
  setMasterDataCategories,
  benchmarks = [],
}: GoalsViewProps) {
  const money = useCompanyMoneyFormatter(selectedCompanyId);
  const [activeTab, setActiveTab] = React.useState<'expense' | 'operational'>('expense');
  const [isSaving, setIsSaving] = React.useState(false);
  const [operationalGoals, setOperationalGoals] = React.useState<{ [key: string]: number }>({});
  const [operationalData, setOperationalData] = React.useState<any>({
    arAging: [],
    apAging: [],
    cash: [],
    inventory: [],
  });
  const [loadingOperational, setLoadingOperational] = React.useState(false);
  const [operationalLoadError, setOperationalLoadError] = React.useState<string | null>(null);
  
  // Use the master data store hook
  const { data: masterData, loading, error } = useMasterData(selectedCompanyId);

  // Load operational goals when component mounts or company changes
  React.useEffect(() => {
    if (selectedCompanyId) {
      setOperationalData({ arAging: [], apAging: [], cash: [], inventory: [] });
      setOperationalLoadError(null);
      loadOperationalGoals();
    }
  }, [selectedCompanyId]);

  // Last 6 completed calendar months (oldest -> newest). Skip the current
  // month because a full month of data has not been loaded yet.
  const operationalMonthDates = React.useMemo(() => {
    const now = new Date();
    const months: Date[] = [];
    for (let i = 6; i >= 1; i--) {
      months.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
    }
    return months;
  }, []);

  const operationalMonthLabels = React.useMemo(
    () => operationalMonthDates.map(d => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })),
    [operationalMonthDates]
  );

  // Load operational data when tab switches to operational
  React.useEffect(() => {
    if (activeTab === 'operational' && selectedCompanyId && !operationalData) {
      loadOperationalData();
    }
  }, [activeTab, selectedCompanyId]);

  const loadOperationalGoals = async () => {
    try {
      const response = await fetch(`/api/operational-goals?companyId=${selectedCompanyId}`);
      if (response.ok) {
        const data = await response.json();
        setOperationalGoals(sanitizeOperationalGoals(data.goals || {}));
      }
    } catch (error) {
      console.error('Error loading operational goals:', error);
    }
  };

  const loadOperationalData = async () => {
    setLoadingOperational(true);
    setOperationalLoadError(null);
    try {
      // Last 6 completed months (exclude the current incomplete month).
      const now = new Date();
      const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
      const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));

      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        frequency: 'monthly',
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      });

      const fetchOperationalType = async (type: string) => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(`/api/operational-data?${params}&type=${type}`, {
            signal: controller.signal,
            cache: 'no-store',
          });
          if (!response.ok) throw new Error(`${type} request failed (${response.status})`);
          return await response.json();
        } finally {
          window.clearTimeout(timeoutId);
        }
      };

      // Metrics are optional context for the goals form. Do not let one slow
      // production endpoint block the other metrics or the goals themselves.
      const results = await Promise.allSettled([
        fetchOperationalType('ar-aging'),
        fetchOperationalType('ap-aging'),
        fetchOperationalType('cash'),
        fetchOperationalType('inventory'),
      ]);
      const [arResult, apResult, cashResult, inventoryResult] = results;
      const failedCount = results.filter(result => result.status === 'rejected').length;

      setOperationalData({
        arAging: arResult.status === 'fulfilled' ? arResult.value.records || [] : [],
        apAging: apResult.status === 'fulfilled' ? apResult.value.records || [] : [],
        cash: cashResult.status === 'fulfilled' ? cashResult.value.records || [] : [],
        inventory: inventoryResult.status === 'fulfilled' ? inventoryResult.value.records || [] : [],
      });
      if (failedCount > 0) {
        setOperationalLoadError(
          failedCount === results.length
            ? 'Operational metrics could not be loaded. Your goals are still available.'
            : `${failedCount} operational metric${failedCount === 1 ? '' : 's'} could not be loaded.`
        );
      }
    } catch (error) {
      console.error('Error loading operational data:', error);
      setOperationalData({ arAging: [], apAging: [], cash: [], inventory: [] });
      setOperationalLoadError('Operational metrics could not be loaded. Your goals are still available.');
    } finally {
      setLoadingOperational(false);
    }
  };

  // Get data from master data store with fallbacks for empty table structure
  const cogsCategories = masterData?.cogsCategories || [];
  const expenseCategories = masterData?.expenseCategories || [];

  const last6Months = masterData?.last6Months || [
    { month: 'Jan 2024', date: new Date('2024-01-01') },
    { month: 'Feb 2024', date: new Date('2024-02-01') },
    { month: 'Mar 2024', date: new Date('2024-03-01') },
    { month: 'Apr 2024', date: new Date('2024-04-01') },
    { month: 'May 2024', date: new Date('2024-05-01') },
    { month: 'Jun 2024', date: new Date('2024-06-01') }
  ];

  // Calculate monthly totals for COGS categories
  const cogsMonthlyTotals = React.useMemo(() => {
    const totals: number[] = [];
    const monthsCount = last6Months.length;
    for (let i = 0; i < monthsCount; i++) {
      let total = 0;
      cogsCategories.forEach(category => {
        if (category.monthlyPercentages && category.monthlyPercentages[i]) {
          const mp = category.monthlyPercentages[i];
          if (mp && !isNaN(mp.percentage)) {
            total += mp.percentage;
          }
        }
      });
      totals.push(total);
    }
    return totals;
  }, [cogsCategories, last6Months]);

  // Calculate average of COGS monthly totals (6-Mo Avg)
  const cogsTotalAverage = React.useMemo(() => {
    if (cogsMonthlyTotals.length === 0) return 0;
    const sum = cogsMonthlyTotals.reduce((acc, total) => acc + total, 0);
    return sum / cogsMonthlyTotals.length;
  }, [cogsMonthlyTotals]);

  // Calculate monthly totals for Operating Expenses categories
  const expenseMonthlyTotals = React.useMemo(() => {
    const totals: number[] = [];
    const monthsCount = last6Months.length;
    for (let i = 0; i < monthsCount; i++) {
      let total = 0;
      expenseCategories.forEach(category => {
        if (category.monthlyPercentages && category.monthlyPercentages[i]) {
          const mp = category.monthlyPercentages[i];
          if (mp && !isNaN(mp.percentage)) {
            total += mp.percentage;
          }
        }
      });
      totals.push(total);
    }
    return totals;
  }, [expenseCategories, last6Months]);

  // Calculate average of Operating Expenses monthly totals (6-Mo Avg)
  const expenseTotalAverage = React.useMemo(() => {
    if (expenseMonthlyTotals.length === 0) return 0;
    const sum = expenseMonthlyTotals.reduce((acc, total) => acc + total, 0);
    return sum / expenseMonthlyTotals.length;
  }, [expenseMonthlyTotals]);

  const cogsGoalTotal = React.useMemo(() => {
    return cogsCategories.reduce((sum, cat) => sum + (expenseGoals[cat.key] || 0), 0);
  }, [cogsCategories, expenseGoals]);

  const expenseGoalTotal = React.useMemo(() => {
    return expenseCategories.reduce((sum, cat) => sum + (expenseGoals[cat.key] || 0), 0);
  }, [expenseCategories, expenseGoals]);

  const cogsTotalBenchmark = React.useMemo(
    () => sumBenchmarkValues(benchmarks, COGS_TOTAL_BENCHMARK_METRICS),
    [benchmarks]
  );
  const expenseTotalBenchmark = React.useMemo(
    () => sumBenchmarkValues(benchmarks, OPEX_TOTAL_BENCHMARK_METRICS),
    [benchmarks]
  );
  const expenseColumnCount = last6Months.length + 4;

  // Save goals to database
  const handleSave = async () => {
    if (!selectedCompanyId) {
      toast.error('No company selected');
      return;
    }

    setIsSaving(true);
    try {
      if (activeTab === 'expense') {
        const response = await fetch('/api/expense-goals', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            companyId: selectedCompanyId,
            goals: expenseGoals,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to save goals');
        }
      } else {
        const response = await fetch('/api/operational-goals', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            companyId: selectedCompanyId,
            goals: operationalGoals,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to save operational goals');
        }
      }

      toast.success('Goals saved successfully!');
    } catch (error: any) {
      console.error('Error saving goals:', error);
      toast.error(error.message || 'Failed to save goals. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '32px' }}>
      <style>{`
        input[type=number].no-spinner::-webkit-outer-spin-button,
        input[type=number].no-spinner::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number].no-spinner {
          -moz-appearance: textfield;
        }
        .goals-table th,
        .goals-table td {
          padding-top: 6px !important;
          padding-bottom: 6px !important;
          line-height: 1.2;
        }
      `}</style>

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'flex-end',
        gap: '8px', 
        borderBottom: '2px solid #e2e8f0',
        marginBottom: '32px'
      }}>
        <button
          onClick={() => setActiveTab('expense')}
          style={{
            background: 'none',
            border: 'none',
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: '600',
            color: activeTab === 'expense' ? '#2751d0' : '#64748b',
            cursor: 'pointer',
            borderBottom: activeTab === 'expense' ? '3px solid #2751d0' : '3px solid transparent',
            marginBottom: '-2px',
            transition: 'all 0.2s'
          }}
        >
          Expense Goals
        </button>
        <button
          onClick={() => setActiveTab('operational')}
          style={{
            background: 'none',
            border: 'none',
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: '600',
            color: activeTab === 'operational' ? '#2751d0' : '#64748b',
            cursor: 'pointer',
            borderBottom: activeTab === 'operational' ? '3px solid #2751d0' : '3px solid transparent',
            marginBottom: '-2px',
            transition: 'all 0.2s'
          }}
        >
          Operational Goals
        </button>
        <div style={{ marginLeft: 'auto', padding: '6px 0 10px 16px', flexShrink: 0 }}>
          <PageCurrencyBadge currency={money.currency} locale={money.locale} baseCurrency={money.baseCurrency} />
        </div>
      </div>

      {/* Expense Goals Tab */}
      {activeTab === 'expense' && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
          <table className="goals-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Expense Category</th>
              {last6Months.map((month, i) => (
                <th key={i} style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>
                  {month.month}
                  <br />
                  <span style={{ fontSize: '12px', fontWeight: '400' }}>% of Revenue</span>
                </th>
              ))}
              <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>
                6-Mo Avg<br />
                <span style={{ fontSize: '12px', fontWeight: '400' }}>% of Revenue</span>
              </th>
              <th style={{ textAlign: 'center', padding: '12px', fontSize: '14px', fontWeight: '700', color: '#667eea' }}>
                <strong>Goal %</strong><br />
                <span style={{ fontSize: '12px', fontWeight: '400' }}>of Revenue</span>
              </th>
              <th style={{ textAlign: 'center', padding: '12px', fontSize: '14px', fontWeight: '700', color: '#64748b' }}>
                Benchmark %<br />
                <span style={{ fontSize: '12px', fontWeight: '400' }}>of Revenue</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Render COGS categories */}
            {cogsCategories.length > 0 && (
              <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                <td colSpan={expenseColumnCount} style={{ padding: '16px 12px 8px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                  COGS (Cost of Goods Sold)
                </td>
              </tr>
            )}
            {cogsCategories.map((category) => (
              <tr key={category.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>
                  {category.label}
                </td>
                {category.monthlyPercentages.map((mp, i) => {
                  const goalPct = expenseGoals[category.key];
                  const hasGoal = goalPct && goalPct > 0;
                  return (
                    <td key={i} style={{ textAlign: 'right', padding: '12px', fontSize: '14px', color: hasGoal && mp.percentage > goalPct ? '#ef4444' : '#64748b' }}>
                      {(isNaN(mp.percentage) ? 0 : mp.percentage).toFixed(1)}%
                    </td>
                  );
                })}
                <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>
                  {(isNaN(category.averagePercentage) ? 0 : category.averagePercentage).toFixed(1)}%
                </td>
                <td style={{ textAlign: 'center', padding: '12px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="number"
                      className="no-spinner"
                      min="0"
                      max="100"
                      step="0.1"
                      value={expenseGoals[category.key] || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setExpenseGoals(prev => {
                          const newGoals = { ...prev };
                          if (value === '' || value === null || value === undefined) {
                            delete newGoals[category.key];
                          } else {
                            const numValue = parseFloat(value);
                            if (!isNaN(numValue) && numValue > 0) {
                              newGoals[category.key] = numValue;
                            } else {
                              delete newGoals[category.key];
                            }
                          }
                          return newGoals;
                        });
                      }}
                      placeholder=""
                      style={{
                        width: '80px',
                        padding: '8px 32px 8px 12px',
                        fontSize: '14px',
                        fontWeight: '700',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        textAlign: 'center',
                        color: '#1e293b',
                        backgroundColor: '#fefce8'
                      }}
                    />
                    <span style={{ position: 'absolute', right: '12px', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>%</span>
                  </div>
                </td>
                {renderBenchmarkCell(null)}
              </tr>
            ))}

            {/* COGS Total Row */}
            {cogsCategories.length > 0 && (
              <tr style={{ borderTop: '2px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <td style={{ padding: '16px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                  Total COGS
                </td>
                {cogsMonthlyTotals.map((total, i) => (
                  <td key={i} style={{ textAlign: 'right', padding: '16px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                    {total.toFixed(1)}%
                  </td>
                ))}
                <td style={{ textAlign: 'right', padding: '16px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                  {cogsTotalAverage.toFixed(1)}%
                </td>
                <td style={{ textAlign: 'center', padding: '16px 12px', fontSize: '16px', fontWeight: '700', color: cogsGoalTotal > 0 ? '#667eea' : '#94a3b8' }}>
                  {cogsGoalTotal > 0 ? `${cogsGoalTotal.toFixed(1)}%` : '—'}
                </td>
                {renderBenchmarkCell(cogsTotalBenchmark, { bold: true })}
              </tr>
            )}

            {/* Render Expense categories */}
            {expenseCategories.length > 0 && (
              <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                <td colSpan={expenseColumnCount} style={{ padding: '16px 12px 8px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                  Operating Expenses
                </td>
              </tr>
            )}
            {expenseCategories.map((category) => (
              <tr key={category.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>
                  {category.label}
                </td>
                {category.monthlyPercentages.map((mp, i) => {
                  const goalPct = expenseGoals[category.key];
                  const hasGoal = goalPct && goalPct > 0;
                  return (
                    <td key={i} style={{ textAlign: 'right', padding: '12px', fontSize: '14px', color: hasGoal && mp.percentage > goalPct ? '#ef4444' : '#64748b' }}>
                      {(isNaN(mp.percentage) ? 0 : mp.percentage).toFixed(1)}%
                    </td>
                  );
                })}
                <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>
                  {(isNaN(category.averagePercentage) ? 0 : category.averagePercentage).toFixed(1)}%
                </td>
                <td style={{ textAlign: 'center', padding: '12px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="number"
                      className="no-spinner"
                      min="0"
                      max="100"
                      step="0.1"
                      value={expenseGoals[category.key] || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setExpenseGoals(prev => {
                          const newGoals = { ...prev };
                          if (value === '' || value === null || value === undefined) {
                            delete newGoals[category.key];
                          } else {
                            const numValue = parseFloat(value);
                            if (!isNaN(numValue) && numValue > 0) {
                              newGoals[category.key] = numValue;
                            } else {
                              delete newGoals[category.key];
                            }
                          }
                          return newGoals;
                        });
                      }}
                      placeholder=""
                      style={{
                        width: '80px',
                        padding: '8px 32px 8px 12px',
                        fontSize: '14px',
                        fontWeight: '700',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        textAlign: 'center',
                        color: '#1e293b',
                        backgroundColor: '#fefce8'
                      }}
                    />
                    <span style={{ position: 'absolute', right: '12px', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>%</span>
                  </div>
                </td>
                {renderBenchmarkCell(sumBenchmarkValues(benchmarks, EXPENSE_CATEGORY_BENCHMARK_METRICS[category.key] || []))}
              </tr>
            ))}

            {/* Operating Expenses Total Row */}
            {expenseCategories.length > 0 && (
              <tr style={{ borderTop: '2px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <td style={{ padding: '16px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                  Total Operating Expenses
                </td>
                {expenseMonthlyTotals.map((total, i) => (
                  <td key={i} style={{ textAlign: 'right', padding: '16px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                    {total.toFixed(1)}%
                  </td>
                ))}
                <td style={{ textAlign: 'right', padding: '16px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                  {expenseTotalAverage.toFixed(1)}%
                </td>
                <td style={{ textAlign: 'center', padding: '16px 12px', fontSize: '16px', fontWeight: '700', color: expenseGoalTotal > 0 ? '#667eea' : '#94a3b8' }}>
                  {expenseGoalTotal > 0 ? `${expenseGoalTotal.toFixed(1)}%` : '—'}
                </td>
                {renderBenchmarkCell(expenseTotalBenchmark, { bold: true })}
              </tr>
            )}
          </tbody>
        </table>

          {/* Save Button */}
          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleSave}
              disabled={isSaving}
              style={{
                padding: '12px 32px',
                fontSize: '16px',
                fontWeight: '600',
                color: 'white',
                backgroundColor: isSaving ? '#94a3b8' : '#667eea',
                border: 'none',
                borderRadius: '8px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.backgroundColor = '#5568d3';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.backgroundColor = '#667eea';
                }
              }}
            >
              {isSaving ? 'Saving...' : 'Save Goals'}
            </button>
          </div>
        </div>
      )}

      {/* Operational Goals Tab */}
      {activeTab === 'operational' && (() => {
  // Render operational goals

  if (!operationalData) {
    return (
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: '14px', color: '#64748b' }}>Preparing operational goals…</div>
      </div>
    );
  }

  const arMetrics = [
    { key: 'ar_current_pct', label: 'AR Current %', getValue: (r: any) => r.totalAR > 0 ? (r.current / r.totalAR) * 100 : 0, format: (v: number) => v.toFixed(1) + '%', goalType: 'percentage' },
    { key: 'ar_over30_pct', label: 'AR Over 30 Days %', getValue: (r: any) => r.totalAR > 0 ? ((r.days1to30 + r.days31to60 + r.days61to90 + r.days90plus) / r.totalAR) * 100 : 0, format: (v: number) => v.toFixed(1) + '%', goalType: 'percentage' },
    { key: 'ar_over90_pct', label: 'AR Over 90 Days %', getValue: (r: any) => r.totalAR > 0 ? (r.days90plus / r.totalAR) * 100 : 0, format: (v: number) => v.toFixed(1) + '%', goalType: 'percentage' },
  ];

  const apMetrics = [
    { key: 'ap_current_pct', label: 'AP Current %', getValue: (r: any) => r.totalAP > 0 ? (r.current / r.totalAP) * 100 : 0, format: (v: number) => v.toFixed(1) + '%', goalType: 'percentage' },
    { key: 'ap_over30_pct', label: 'AP Over 30 Days %', getValue: (r: any) => r.totalAP > 0 ? ((r.days1to30 + r.days31to60 + r.days61to90 + r.days90plus) / r.totalAP) * 100 : 0, format: (v: number) => v.toFixed(1) + '%', goalType: 'percentage' },
    { key: 'ap_over90_pct', label: 'AP Over 90 Days %', getValue: (r: any) => r.totalAP > 0 ? (r.days90plus / r.totalAP) * 100 : 0, format: (v: number) => v.toFixed(1) + '%', goalType: 'percentage' },
  ];

  // Process data for each metric
  const processMetrics = (metrics: any[], records: any[]) => {
    // Keep one record per month (latest snapshot), then project onto fixed 6-month timeline.
    // UTC bucketing — see lib/date-utils.ts
    const monthlyRecordMap = records.reduce((acc: any, r: any) => {
      const snapshot = new Date(r.snapshotDate);
      const monthKey = `${snapshot.getUTCFullYear()}-${String(snapshot.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!acc[monthKey] || new Date(r.snapshotDate) > new Date(acc[monthKey].snapshotDate)) {
        acc[monthKey] = r;
      }
      return acc;
    }, {});

    return metrics.map(metric => {
      const values = operationalMonthDates.map(monthDate => {
        const monthKey = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`;
        const record = monthlyRecordMap[monthKey];
        return record ? metric.getValue(record) : 0;
      });
      const avg = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
      return { ...metric, values, avg, months: operationalMonthLabels };
    });
  };

  const arProcessed = processMetrics(arMetrics, operationalData.arAging || []);
  const apProcessed = processMetrics(apMetrics, operationalData.apAging || []);

  const operationalAmountByMonth = (records: any[], amountKey: string) => {
    return (records || []).reduce((acc: Record<string, number>, record: any) => {
      const snapshot = new Date(record.snapshotDate);
      if (Number.isNaN(snapshot.getTime())) return acc;
      const monthKey = utcMonthKey(snapshot);
      acc[monthKey] = (acc[monthKey] || 0) + (Number(record[amountKey]) || 0);
      return acc;
    }, {});
  };
  const opCashByMonth = operationalAmountByMonth(operationalData.cash, 'cashBalance');
  const opInventoryByMonth = operationalAmountByMonth(operationalData.inventory, 'assetValue');

  const sortedMonthly = [...(monthly || [])]
    .map((row) => ({ row, date: new Date(row.date || row.monthDate || row.month) }))
    .filter((item) => !Number.isNaN(item.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const sortedMonthlyRows = sortedMonthly.map((item) => item.row);
  const monthlyIndexByKey = sortedMonthly.reduce((acc: Record<string, number>, item, index) => {
    acc[utcMonthKey(item.date)] = index;
    return acc;
  }, {});
  const financialByMonthKey = sortedMonthly.reduce((acc: Record<string, any>, item) => {
    acc[utcMonthKey(item.date)] = item.row;
    return acc;
  }, {});

  const buildPercentOfAssetsMetric = (
    key: string,
    label: string,
    field: 'cash' | 'inventory',
    operationalByMonth: Record<string, number>
  ) => {
    const values = operationalMonthDates.map((monthDate) => {
      const monthKey = utcMonthKey(monthDate);
      const financial = financialByMonthKey[monthKey];
      const totalAssets = Number(financial?.totalAssets) || 0;
      const statementAmount = Number(financial?.[field]) || 0;
      const amount = statementAmount || operationalByMonth[monthKey] || 0;
      return percentOfAssets(amount, totalAssets);
    });
    const avg = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return {
      key,
      label,
      goalType: 'percentage',
      format: (v: number) => `${(isNaN(v) ? 0 : v).toFixed(1)}%`,
      values,
      avg,
      months: operationalMonthLabels,
    };
  };

  const daysByMonth = operationalMonthDates.map((monthDate) => {
    const index = monthlyIndexByKey[utcMonthKey(monthDate)];
    if (index == null) return { daysAR: 0, daysInv: 0, daysAP: 0 };
    return computeDaysOutstanding(sortedMonthlyRows, index);
  });
  const buildDaysMetric = (key: string, label: string, field: 'daysAR' | 'daysInv' | 'daysAP') => {
    const values = daysByMonth.map((row) => row[field]);
    const avg = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return {
      key,
      label,
      goalType: 'days',
      format: (v: number) => `${Math.round(v)}d`,
      values,
      avg,
      months: operationalMonthLabels,
    };
  };

  const cashProcessed = [buildPercentOfAssetsMetric('total_cash', 'Cash % of Assets', 'cash', opCashByMonth)];
  const arRows = [...arProcessed, buildDaysMetric('days_receivables', "Days' Receivables", 'daysAR')];
  const apRows = [...apProcessed, buildDaysMetric('days_payables', "Days' Payables", 'daysAP')];
  const inventoryRows = [
    buildPercentOfAssetsMetric('inventory_value', 'Inventory % of Assets', 'inventory', opInventoryByMonth),
    buildDaysMetric('days_inventory', "Days' Inventory", 'daysInv'),
  ];

  const months = operationalMonthLabels;
  const operationalStatusMessage = loadingOperational
    ? 'Loading optional operational metrics… Your goals remain available.'
    : operationalLoadError;

  return (
    <div>
      {operationalStatusMessage && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', padding: '10px 12px', borderRadius: '8px', background: operationalLoadError ? '#fff7ed' : '#eff6ff', color: operationalLoadError ? '#9a3412' : '#1e40af', fontSize: '13px' }}>
          <span>{operationalStatusMessage}</span>
          {operationalLoadError && (
            <button
              type="button"
              onClick={loadOperationalData}
              disabled={loadingOperational}
              style={{ border: '1px solid currentColor', borderRadius: '6px', padding: '5px 10px', background: 'white', color: 'inherit', cursor: loadingOperational ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
            >
              Retry
            </button>
          )}
        </div>
      )}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
      <table className="goals-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Operational Metric</th>
            {months.map((month, i) => (
              <th key={i} style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>
                {month}
              </th>
            ))}
            <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>
              6-Mo Avg
            </th>
            <th style={{ textAlign: 'center', padding: '12px', fontSize: '18px', fontWeight: '700', color: '#667eea' }}>
              <strong>Goal</strong>
            </th>
            <th style={{ textAlign: 'center', padding: '12px', fontSize: '14px', fontWeight: '700', color: '#64748b' }}>
              Benchmark
            </th>
          </tr>
        </thead>
        <tbody>
          {/* AR Aging Section */}
          <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
            <td colSpan={months.length + 4} style={{ padding: '16px 12px 8px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
              Accounts Receivable
            </td>
          </tr>
          {arRows.map((metric) => (
            <tr key={metric.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>
                {metric.label}
              </td>
              {metric.values.map((value: number, i: number) => (
                <td key={i} style={{ textAlign: 'right', padding: '12px', fontSize: '14px', color: '#64748b' }}>
                  {metric.format(value)}
                </td>
              ))}
              <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>
                {metric.format(metric.avg)}
              </td>
              <td style={{ textAlign: 'center', padding: '12px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                  {metric.goalType === 'currency' && (
                    <span style={{ position: 'absolute', left: '12px', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>$</span>
                  )}
                  <input
                    type={metric.goalType === 'currency' ? 'text' : 'number'}
                    className="no-spinner"
                    min={metric.goalType === 'percentage' || metric.goalType === 'days' ? '0' : undefined}
                    max={metric.goalType === 'percentage' ? '100' : undefined}
                    step={metric.goalType === 'currency' ? undefined : metric.goalType === 'days' ? '1' : '0.1'}
                    value={metric.goalType === 'currency' && operationalGoals[metric.key] ? operationalGoals[metric.key].toLocaleString() : (operationalGoals[metric.key] || '')}
                    onChange={(e) => {
                      const value = metric.goalType === 'currency' ? e.target.value.replace(/,/g, '') : e.target.value;
                      setOperationalGoals((prev: any) => {
                        const newGoals = { ...prev };
                        if (value === '' || value === null || value === undefined) {
                          delete newGoals[metric.key];
                        } else {
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue) && numValue > 0) {
                            newGoals[metric.key] = numValue;
                          } else {
                            delete newGoals[metric.key];
                          }
                        }
                        return newGoals;
                      });
                    }}
                    onKeyDown={metric.goalType === 'currency' ? (e) => {
                      // Allow: backspace, delete, tab, escape, enter
                      if ([8, 9, 27, 13, 46].indexOf(e.keyCode) !== -1 ||
                        // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                        (e.keyCode === 65 && e.ctrlKey === true) ||
                        (e.keyCode === 67 && e.ctrlKey === true) ||
                        (e.keyCode === 86 && e.ctrlKey === true) ||
                        (e.keyCode === 88 && e.ctrlKey === true) ||
                        // Allow: home, end, left, right
                        (e.keyCode >= 35 && e.keyCode <= 39)) {
                        return;
                      }
                      // Ensure that it is a number and stop the keypress
                      if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
                        e.preventDefault();
                      }
                    } : undefined}
                    placeholder=""
                    style={{
                      width: metric.goalType === 'currency' ? '140px' : '80px',
                      padding: metric.goalType === 'currency' ? '8px 12px 8px 24px' : '8px 32px 8px 12px',
                      fontSize: '14px',
                      fontWeight: '700',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      textAlign: 'center',
                      color: '#1e293b',
                      backgroundColor: '#fefce8'
                    }}
                  />
                  {(metric.goalType === 'percentage' || metric.goalType === 'days') && (
                    <span style={{ position: 'absolute', right: '12px', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>
                      {metric.goalType === 'days' ? 'd' : '%'}
                    </span>
                  )}
                </div>
              </td>
              {renderBenchmarkCell(getOperationalBenchmarkValue(benchmarks, metric.key), {
                format: operationalBenchmarkFormat(metric.key),
              })}
            </tr>
          ))}

          {/* AP Aging Section */}
          <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
            <td colSpan={months.length + 4} style={{ padding: '16px 12px 8px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
              Accounts Payable
            </td>
          </tr>
          {apRows.map((metric) => (
            <tr key={metric.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>
                {metric.label}
              </td>
              {metric.values.map((value: number, i: number) => (
                <td key={i} style={{ textAlign: 'right', padding: '12px', fontSize: '14px', color: '#64748b' }}>
                  {metric.format(value)}
                </td>
              ))}
              <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>
                {metric.format(metric.avg)}
              </td>
              <td style={{ textAlign: 'center', padding: '12px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                  {metric.goalType === 'currency' && (
                    <span style={{ position: 'absolute', left: '12px', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>$</span>
                  )}
                  <input
                    type={metric.goalType === 'currency' ? 'text' : 'number'}
                    className="no-spinner"
                    min={metric.goalType === 'percentage' || metric.goalType === 'days' ? '0' : undefined}
                    max={metric.goalType === 'percentage' ? '100' : undefined}
                    step={metric.goalType === 'currency' ? undefined : metric.goalType === 'days' ? '1' : '0.1'}
                    value={metric.goalType === 'currency' && operationalGoals[metric.key] ? operationalGoals[metric.key].toLocaleString() : (operationalGoals[metric.key] || '')}
                    onChange={(e) => {
                      const value = metric.goalType === 'currency' ? e.target.value.replace(/,/g, '') : e.target.value;
                      setOperationalGoals((prev: any) => {
                        const newGoals = { ...prev };
                        if (value === '' || value === null || value === undefined) {
                          delete newGoals[metric.key];
                        } else {
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue) && numValue > 0) {
                            newGoals[metric.key] = numValue;
                          } else {
                            delete newGoals[metric.key];
                          }
                        }
                        return newGoals;
                      });
                    }}
                    onKeyDown={metric.goalType === 'currency' ? (e) => {
                      // Allow: backspace, delete, tab, escape, enter
                      if ([8, 9, 27, 13, 46].indexOf(e.keyCode) !== -1 ||
                        // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                        (e.keyCode === 65 && e.ctrlKey === true) ||
                        (e.keyCode === 67 && e.ctrlKey === true) ||
                        (e.keyCode === 86 && e.ctrlKey === true) ||
                        (e.keyCode === 88 && e.ctrlKey === true) ||
                        // Allow: home, end, left, right
                        (e.keyCode >= 35 && e.keyCode <= 39)) {
                        return;
                      }
                      // Ensure that it is a number and stop the keypress
                      if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
                        e.preventDefault();
                      }
                    } : undefined}
                    placeholder=""
                    style={{
                      width: metric.goalType === 'currency' ? '140px' : '80px',
                      padding: metric.goalType === 'currency' ? '8px 12px 8px 24px' : '8px 32px 8px 12px',
                      fontSize: '14px',
                      fontWeight: '700',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      textAlign: 'center',
                      color: '#1e293b',
                      backgroundColor: '#fefce8'
                    }}
                  />
                  {(metric.goalType === 'percentage' || metric.goalType === 'days') && (
                    <span style={{ position: 'absolute', right: '12px', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>
                      {metric.goalType === 'days' ? 'd' : '%'}
                    </span>
                  )}
                </div>
              </td>
              {renderBenchmarkCell(getOperationalBenchmarkValue(benchmarks, metric.key), {
                format: operationalBenchmarkFormat(metric.key),
              })}
            </tr>
          ))}

          {/* Cash Section */}
          <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
            <td colSpan={months.length + 4} style={{ padding: '16px 12px 8px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
              Cash Management
            </td>
          </tr>
          {cashProcessed.map((metric) => (
            <tr key={metric.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>
                {metric.label}
              </td>
              {metric.values.map((value: number, i: number) => (
                <td key={i} style={{ textAlign: 'right', padding: '12px', fontSize: '14px', color: '#64748b' }}>
                  {metric.format(value)}
                </td>
              ))}
              <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>
                {metric.format(metric.avg)}
              </td>
              <td style={{ textAlign: 'center', padding: '12px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                  <input
                    type="number"
                    className="no-spinner"
                    min="0"
                    max="100"
                    step="0.1"
                    value={operationalGoals[metric.key] || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setOperationalGoals((prev: any) => {
                        const newGoals = { ...prev };
                        if (value === '' || value === null || value === undefined) {
                          delete newGoals[metric.key];
                        } else {
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue) && numValue > 0) {
                            newGoals[metric.key] = numValue;
                          } else {
                            delete newGoals[metric.key];
                          }
                        }
                        return newGoals;
                      });
                    }}
                    placeholder=""
                    style={{
                      width: '80px',
                      padding: '8px 32px 8px 12px',
                      fontSize: '14px',
                      fontWeight: '700',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      textAlign: 'center',
                      color: '#1e293b',
                      backgroundColor: '#fefce8'
                    }}
                  />
                  <span style={{ position: 'absolute', right: '12px', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>%</span>
                </div>
              </td>
              {renderBenchmarkCell(getOperationalBenchmarkValue(benchmarks, metric.key), {
                format: operationalBenchmarkFormat(metric.key),
              })}
            </tr>
          ))}
          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>
              Cash Swing Threshold
            </td>
            {months.map((_, i) => (
              <td key={i} style={{ textAlign: 'right', padding: '12px', fontSize: '14px', color: '#94a3b8' }}>
                —
              </td>
            ))}
            <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#94a3b8' }}>
              —
            </td>
            <td style={{ textAlign: 'center', padding: '12px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>$</span>
                <input
                  type="text"
                  className="no-spinner"
                  value={operationalGoals.cash_swing_threshold ? operationalGoals.cash_swing_threshold.toLocaleString() : ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/,/g, '');
                    setOperationalGoals((prev: any) => {
                      const newGoals = { ...prev };
                      if (value === '' || value === null || value === undefined) {
                        delete newGoals.cash_swing_threshold;
                      } else {
                        const numValue = parseFloat(value);
                        if (!isNaN(numValue) && numValue > 0) {
                          newGoals.cash_swing_threshold = numValue;
                        } else {
                          delete newGoals.cash_swing_threshold;
                        }
                      }
                      return newGoals;
                    });
                  }}
                  onKeyDown={(e) => {
                    if ([8, 9, 27, 13, 46].indexOf(e.keyCode) !== -1 ||
                      (e.keyCode === 65 && e.ctrlKey === true) ||
                      (e.keyCode === 67 && e.ctrlKey === true) ||
                      (e.keyCode === 86 && e.ctrlKey === true) ||
                      (e.keyCode === 88 && e.ctrlKey === true) ||
                      (e.keyCode >= 35 && e.keyCode <= 39)) {
                      return;
                    }
                    if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
                      e.preventDefault();
                    }
                  }}
                  placeholder=""
                  style={{
                    width: '140px',
                    padding: '8px 12px 8px 24px',
                    fontSize: '14px',
                    fontWeight: '700',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    textAlign: 'center',
                    color: '#1e293b',
                    backgroundColor: '#fefce8'
                  }}
                />
              </div>
            </td>
            {renderBenchmarkCell(null)}
          </tr>

          {/* Inventory Section */}
          <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
            <td colSpan={months.length + 4} style={{ padding: '16px 12px 8px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
              Inventory Management
            </td>
          </tr>
          {inventoryRows.map((metric) => (
            <tr key={metric.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>
                {metric.label}
              </td>
              {metric.values.map((value: number, i: number) => (
                <td key={i} style={{ textAlign: 'right', padding: '12px', fontSize: '14px', color: '#64748b' }}>
                  {metric.format(value)}
                </td>
              ))}
              <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>
                {metric.format(metric.avg)}
              </td>
              <td style={{ textAlign: 'center', padding: '12px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                  <input
                    type="number"
                    className="no-spinner"
                    min="0"
                    max={metric.goalType === 'percentage' ? '100' : undefined}
                    step={metric.goalType === 'days' ? '1' : '0.1'}
                    value={operationalGoals[metric.key] || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setOperationalGoals((prev: any) => {
                        const newGoals = { ...prev };
                        if (value === '' || value === null || value === undefined) {
                          delete newGoals[metric.key];
                        } else {
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue) && numValue > 0) {
                            newGoals[metric.key] = numValue;
                          } else {
                            delete newGoals[metric.key];
                          }
                        }
                        return newGoals;
                      });
                    }}
                    placeholder=""
                    style={{
                      width: '80px',
                      padding: '8px 32px 8px 12px',
                      fontSize: '14px',
                      fontWeight: '700',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      textAlign: 'center',
                      color: '#1e293b',
                      backgroundColor: '#fefce8'
                    }}
                  />
                  <span style={{ position: 'absolute', right: '12px', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>
                    {metric.goalType === 'days' ? 'd' : '%'}
                  </span>
                </div>
              </td>
              {renderBenchmarkCell(getOperationalBenchmarkValue(benchmarks, metric.key), {
                format: operationalBenchmarkFormat(metric.key),
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Save Button */}
      <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            padding: '12px 32px',
            fontSize: '16px',
            fontWeight: '600',
            color: 'white',
            backgroundColor: isSaving ? '#94a3b8' : '#667eea',
            border: 'none',
            borderRadius: '8px',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
          onMouseEnter={(e) => {
            if (!isSaving) {
              e.currentTarget.style.backgroundColor = '#5568d3';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSaving) {
              e.currentTarget.style.backgroundColor = '#667eea';
            }
          }}
        >
          {isSaving ? 'Saving...' : 'Save Goals'}
        </button>
      </div>
      </div>
    </div>
  );
})()}
    </div>
  );
}