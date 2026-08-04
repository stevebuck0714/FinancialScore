// @ts-nocheck
'use client';

import React from 'react';
import { useMasterData } from '@/lib/master-data-store';
import toast from 'react-hot-toast';

interface GoalsViewProps {
  selectedCompanyId: string;
  companyName: string | null;
  monthly: any[];
  expenseGoals: { [key: string]: number };
  setExpenseGoals: (goals: { [key: string]: number }) => void;
  masterDataCategories?: any[];
  setMasterDataCategories?: (categories: any[]) => void;
}

export default function GoalsView({
  selectedCompanyId,
  companyName,
  monthly,
  expenseGoals,
  setExpenseGoals,
  masterDataCategories,
  setMasterDataCategories
}: GoalsViewProps) {
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

  // Build a stable "last 6 months" timeline for operational goals (oldest -> newest).
  // UTC bucketing — see lib/date-utils.ts
  const operationalMonthDates = React.useMemo(() => {
    const now = new Date();
    const months: Date[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push(d);
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
        setOperationalGoals(data.goals || {});
      }
    } catch (error) {
      console.error('Error loading operational goals:', error);
    }
  };

  const loadOperationalData = async () => {
    setLoadingOperational(true);
    setOperationalLoadError(null);
    try {
      // Get last 6 months of data
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 6);

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
            </tr>
          </thead>
          <tbody>
            {/* Render COGS categories */}
            {cogsCategories.length > 0 && (
              <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                <td colSpan={last6Months.length + 3} style={{ padding: '16px 12px 8px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
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
              </tr>
            )}

            {/* Render Expense categories */}
            {expenseCategories.length > 0 && (
              <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                <td colSpan={last6Months.length + 3} style={{ padding: '16px 12px 8px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
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

  const cashMetrics = [
    { key: 'total_cash', label: 'Total Cash Balance', getValue: (r: any) => r.cashBalance || 0, format: (v: number) => '$' + Math.round(v).toLocaleString(), goalType: 'currency' },
  ];

  const inventoryMetrics = [
    { key: 'inventory_value', label: 'Inventory Value', getValue: (r: any) => r.assetValue || 0, format: (v: number) => '$' + Math.round(v).toLocaleString(), goalType: 'currency' },
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
  
  // For cash and inventory, we need to aggregate by month
  const cashByMonth = (operationalData.cash || []).reduce((acc: any, r: any) => {
    const month = new Date(r.snapshotDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    if (!acc[month]) acc[month] = { snapshotDate: r.snapshotDate, cashBalance: 0 };
    acc[month].cashBalance += r.cashBalance;
    return acc;
  }, {});
  const cashRecords = Object.values(cashByMonth);

  const inventoryByMonth = (operationalData.inventory || []).reduce((acc: any, r: any) => {
    const month = new Date(r.snapshotDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    if (!acc[month]) acc[month] = { snapshotDate: r.snapshotDate, assetValue: 0 };
    acc[month].assetValue += r.assetValue;
    return acc;
  }, {});
  const inventoryRecords = Object.values(inventoryByMonth);

  const cashProcessed = processMetrics(cashMetrics, cashRecords as any[]);
  const inventoryProcessed = processMetrics(inventoryMetrics, inventoryRecords as any[]);

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
          </tr>
        </thead>
        <tbody>
          {/* AR Aging Section */}
          <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
            <td colSpan={months.length + 3} style={{ padding: '16px 12px 8px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
              Accounts Receivable Aging
            </td>
          </tr>
          {arProcessed.map((metric) => (
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
                    min={metric.goalType === 'percentage' ? '0' : undefined}
                    max={metric.goalType === 'percentage' ? '100' : undefined}
                    step={metric.goalType === 'currency' ? undefined : '0.1'}
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
                  {metric.goalType === 'percentage' && (
                    <span style={{ position: 'absolute', right: '12px', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>%</span>
                  )}
                </div>
              </td>
            </tr>
          ))}

          {/* AP Aging Section */}
          <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
            <td colSpan={months.length + 3} style={{ padding: '16px 12px 8px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
              Accounts Payable Aging
            </td>
          </tr>
          {apProcessed.map((metric) => (
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
                    min={metric.goalType === 'percentage' ? '0' : undefined}
                    max={metric.goalType === 'percentage' ? '100' : undefined}
                    step={metric.goalType === 'currency' ? undefined : '0.1'}
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
                  {metric.goalType === 'percentage' && (
                    <span style={{ position: 'absolute', right: '12px', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>%</span>
                  )}
                </div>
              </td>
            </tr>
          ))}

          {/* Cash Section */}
          <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
            <td colSpan={months.length + 3} style={{ padding: '16px 12px 8px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
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
                  <span style={{ position: 'absolute', left: '12px', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>$</span>
                  <input
                    type="text"
                    className="no-spinner"
                    value={operationalGoals[metric.key] ? operationalGoals[metric.key].toLocaleString() : ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/,/g, '');
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
                    onKeyDown={(e) => {
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
          </tr>

          {/* Inventory Section */}
          <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
            <td colSpan={months.length + 3} style={{ padding: '16px 12px 8px 12px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
              Inventory Management
            </td>
          </tr>
          {inventoryProcessed.map((metric) => (
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
                  <span style={{ position: 'absolute', left: '12px', fontSize: '14px', color: '#64748b', pointerEvents: 'none' }}>$</span>
                  <input
                    type="text"
                    className="no-spinner"
                    value={operationalGoals[metric.key] ? operationalGoals[metric.key].toLocaleString() : ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/,/g, '');
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
                    onKeyDown={(e) => {
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