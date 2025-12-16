'use client';

import React from 'react';
import { useMasterData, masterDataStore } from '@/lib/master-data-store';
import toast from 'react-hot-toast';

interface GoalsViewProps {
  selectedCompanyId: string;
  companyName: string | null;
  monthly: any[];
  expenseGoals: { [key: string]: number };
  setExpenseGoals: (goals: { [key: string]: number }) => void;
}

export default function GoalsView({
  selectedCompanyId,
  companyName,
  monthly,
  expenseGoals,
  setExpenseGoals
}: GoalsViewProps) {
  const [isSaving, setIsSaving] = React.useState(false);
  
  // Use the master data store hook
  const { data: masterData, loading, error } = useMasterData(selectedCompanyId);

  // Clear cache on component mount to ensure updated filtering
  React.useEffect(() => {
    if (selectedCompanyId) {
      masterDataStore.clearCompanyCache(selectedCompanyId);
    }
  }, [selectedCompanyId]);

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

  // Save goals to database
  const handleSave = async () => {
    if (!selectedCompanyId) {
      toast.error('No company selected');
      return;
    }

    setIsSaving(true);
    try {
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
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Expense Goals</h1>
        {companyName && <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
      </div>

      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
              <th style={{ textAlign: 'center', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#667eea' }}>
                Goal %<br />
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
                      padding: '8px 12px',
                      fontSize: '14px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      textAlign: 'center',
                      color: '#1e293b'
                    }}
                  />
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
                <td style={{ textAlign: 'center', padding: '16px 12px' }}>
                  {/* Empty cell for goal column */}
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
                      padding: '8px 12px',
                      fontSize: '14px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      textAlign: 'center',
                      color: '#1e293b'
                    }}
                  />
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
                <td style={{ textAlign: 'center', padding: '16px 12px' }}>
                  {/* Empty cell for goal column */}
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
    </div>
  );
}