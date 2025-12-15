'use client';

import React from 'react';
import { useMasterData, masterDataStore } from '@/lib/master-data-store';

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
          </tbody>
        </table>
      </div>
    </div>
  );
}