'use client';

import React, { useState } from 'react';
import { LineChart } from './charts/Charts';
import { useMasterData, masterDataStore } from '@/lib/master-data-store';
import { useCompanyMoneyFormatter } from '@/app/hooks/useCompanyMoneyFormatter';
import PageCurrencyBadge from './PageCurrencyBadge';
import { getCogsTargetFieldOptions } from '@/lib/constants/sector-target-fields';
import { getFieldDisplayName } from '@/lib/constants/field-display-names';

const LEGACY_COGS_KEYS = [
  'cogsPayroll',
  'cogsOwnerPay',
  'cogsContractors',
  'cogsMaterials',
  'cogsCommissions',
  'cogsOther',
];

interface TrendAnalysisViewProps {
  selectedCompanyId: string;
  companyName: string | null;
  monthly: any[];
  expenseGoals: { [key: string]: number };
  selectedExpenseItems: string[];
  setSelectedExpenseItems: (items: string[]) => void;
  selectedItemTrends: string[];
  setSelectedItemTrends: (items: string[]) => void;
  industrySectorCategory?: string | null;
}

export default function TrendAnalysisView({
  selectedCompanyId,
  companyName,
  monthly,
  expenseGoals,
  selectedExpenseItems,
  setSelectedExpenseItems,
  selectedItemTrends,
  setSelectedItemTrends,
  industrySectorCategory = null,
}: TrendAnalysisViewProps) {
  const money = useCompanyMoneyFormatter(selectedCompanyId);
  const [trendAnalysisTab, setTrendAnalysisTab] = useState<'item-trends' | 'expense-analysis' | 'cogs-analysis'>('item-trends');
  const [selectedCogsItems, setSelectedCogsItems] = useState<string[]>([]);
  const normalizeMonthLabel = (primaryMonthValue: unknown, fallbackMonthValue?: unknown): string => {
    const formatDate = (value: unknown): string | null => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value as string);
      if (Number.isNaN(date.getTime())) return null;
      // UTC bucketing — see lib/date-utils.ts
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
      return `${String(month).padStart(2, '0')}-${year}`;
    };

    const normalizedPrimary = formatDate(primaryMonthValue);
    if (normalizedPrimary) return normalizedPrimary;

    if (typeof fallbackMonthValue === 'string') {
      const trimmed = fallbackMonthValue.trim();
      if (!trimmed) return '';

      const mmYYYY = trimmed.match(/^(\d{1,2})[-/](\d{4})$/);
      if (mmYYYY) {
        const month = Number(mmYYYY[1]);
        const year = Number(mmYYYY[2]);
        if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
          return `${String(month).padStart(2, '0')}-${year}`;
        }
      }

      const yyyyMM = trimmed.match(/^(\d{4})-(\d{1,2})$/);
      if (yyyyMM) {
        const year = Number(yyyyMM[1]);
        const month = Number(yyyyMM[2]);
        if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
          return `${String(month).padStart(2, '0')}-${year}`;
        }
      }
    }

    return '';
  };

  const toNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getCogsAccountAmount = (m: any, key: string): number => {
    if (key === 'cogsTotal') return toNumber(m?.cogsTotal);
    const direct = toNumber(m?.[key]);
    if (Math.abs(direct) > 0.0001) return direct;
    return toNumber(m?.cogsBreakdown?.[key]);
  };

  const cogsAccounts = React.useMemo(() => {
    const accounts: Array<{ key: string; label: string }> = [];
    const seen = new Set<string>();
    const addAccount = (key: string, label?: string) => {
      if (!key || key === 'cogsBreakdown' || key === 'cogs_total') return;
      if (seen.has(key)) return;
      seen.add(key);
      accounts.push({
        key,
        label: label || getFieldDisplayName(key),
      });
    };

    getCogsTargetFieldOptions(industrySectorCategory).forEach((option) => {
      addAccount(option.value, option.label);
    });

    monthly.forEach((m) => {
      Object.keys(m || {}).forEach((key) => {
        if (key === 'cogsTotal' || key === 'cogsBreakdown') return;
        const isSector = key.startsWith('cogs_');
        const isLegacy = LEGACY_COGS_KEYS.includes(key);
        if ((isSector || isLegacy) && Math.abs(toNumber((m as any)[key])) > 0.0001) {
          addAccount(key);
        }
      });
      const breakdown = (m as any)?.cogsBreakdown;
      if (breakdown && typeof breakdown === 'object') {
        Object.entries(breakdown).forEach(([key, value]) => {
          if (Math.abs(toNumber(value)) > 0.0001) addAccount(key);
        });
      }
    });

    addAccount('cogsTotal', 'Total COGS');
    return accounts;
  }, [monthly, industrySectorCategory]);

  React.useEffect(() => {
    setSelectedCogsItems((prev) => {
      const available = cogsAccounts.map((account) => account.key);
      if (prev.length === 0) return available;
      const kept = prev.filter((key) => available.includes(key));
      return kept.length > 0 ? kept : available;
    });
  }, [cogsAccounts]);

  const hasLoadedFinancialData = (m: any): boolean => {
    const keys = [
      'revenue',
      'expense',
      'cogsTotal',
      'cash',
      'ar',
      'inventory',
      'ap',
      'tca',
      'tcl',
      'totalAssets',
      'totalLiabilities',
      'equity',
      'netIncome',
    ];
    return keys.some((key) => Math.abs(toNumber(m?.[key])) > 0.0001);
  };

  // Get master data for dynamic expense categories
  const masterData = useMasterData(selectedCompanyId);
  const expenseCategories = masterData.data?.expenseCategories || [];
  const extendedExpenseCategories = React.useMemo(() => {
    return [
      ...expenseCategories,
      { key: 'total-operating-expenses-pct', label: 'Total Operating Expenses', category: 'Expense' as const }
    ];
  }, [expenseCategories]);

  const dataStartIndex = React.useMemo(
    () => monthly.findIndex((m) => hasLoadedFinancialData(m)),
    [monthly]
  );

  const getOperatingExpenseTotal = (m: any) => {
    const computed =
      (m.payroll || 0) +
      (m.ownerBasePay || 0) +
      (m.benefits || 0) +
      (m.insurance || 0) +
      (m.professionalFees || 0) +
      (m.subcontractors || 0) +
      (m.rent || 0) +
      (m.taxLicense || 0) +
      (m.phoneComm || 0) +
      (m.infrastructure || 0) +
      (m.autoTravel || 0) +
      (m.salesExpense || 0) +
      (m.marketing || 0) +
      (m.trainingCert || 0) +
      (m.mealsEntertainment || 0) +
      (m.otherExpense || 0);
    return computed !== 0 ? computed : (m.operatingExpenseTotal || m.expense || 0);
  };

  // Clear master data cache when component mounts
  React.useEffect(() => {
    if (selectedCompanyId) {
      masterDataStore.clearCompanyCache(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  return (
    <div style={{ maxWidth: '100%', minWidth: 0, padding: '24px 16px 32px 16px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Trend Analysis</h1>
          <PageCurrencyBadge currency={money.currency} locale={money.locale} baseCurrency={money.baseCurrency} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => setTrendAnalysisTab('item-trends')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            fontSize: '16px',
            fontWeight: '600',
            color: trendAnalysisTab === 'item-trends' ? '#2751d0' : '#64748b',
            cursor: 'pointer',
            borderBottom: trendAnalysisTab === 'item-trends' ? '3px solid #2751d0' : '3px solid transparent',
            marginBottom: '-2px',
            transition: 'all 0.2s'
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
            color: trendAnalysisTab === 'expense-analysis' ? '#2751d0' : '#64748b',
            cursor: 'pointer',
            borderBottom: trendAnalysisTab === 'expense-analysis' ? '3px solid #2751d0' : '3px solid transparent',
            marginBottom: '-2px',
            transition: 'all 0.2s'
          }}
        >
          Expense Analysis
        </button>
        <button
          onClick={() => setTrendAnalysisTab('cogs-analysis')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            fontSize: '16px',
            fontWeight: '600',
            color: trendAnalysisTab === 'cogs-analysis' ? '#2751d0' : '#64748b',
            cursor: 'pointer',
            borderBottom: trendAnalysisTab === 'cogs-analysis' ? '3px solid #2751d0' : '3px solid transparent',
            marginBottom: '-2px',
            transition: 'all 0.2s'
          }}
        >
          COGS Analysis
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
                'Cash', 'Accounts Receivable', 'Current Assets', 'Fixed Assets', 'Total Assets',
                'Accounts Payable', 'Current Liabilities', 'Long Term Debt', 'Total Equity'
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px', width: '100%' }}>
            {/* Dynamic financial metric charts */}
            {selectedItemTrends.map((metric, index) => {
              const getMetricData = (m: any) => {
                switch (metric) {
                  case 'Revenue':
                    return toNumber(m.revenue);
                  case 'Gross Profit':
                    return toNumber(m.revenue) - toNumber(m.cogsTotal);
                  case 'Total Operating Expenses':
                    return toNumber(m.expense);
                  case 'EBIT':
                    const revenue = toNumber(m.revenue);
                    const cogs = toNumber(m.cogsTotal);
                    // Calculate total operating expenses (excluding interest expense)
                    const operatingExpenses = toNumber(m.payroll) + toNumber(m.ownerBasePay) + toNumber(m.benefits) +
                      toNumber(m.insurance) + toNumber(m.professionalFees) + toNumber(m.subcontractors) +
                      toNumber(m.rent) + toNumber(m.taxLicense) + toNumber(m.phoneComm) + toNumber(m.infrastructure) +
                      toNumber(m.autoTravel) + toNumber(m.salesExpense) + toNumber(m.marketing) +
                      toNumber(m.trainingCert) + toNumber(m.mealsEntertainment) + toNumber(m.otherExpense);
                    return revenue - cogs - operatingExpenses;
                  case 'EBITDA':
                    const rev = toNumber(m.revenue);
                    const cog = toNumber(m.cogsTotal);
                    // Calculate total operating expenses (excluding interest expense)
                    const operatingExpensesEbitda = toNumber(m.payroll) + toNumber(m.ownerBasePay) + toNumber(m.benefits) +
                      toNumber(m.insurance) + toNumber(m.professionalFees) + toNumber(m.subcontractors) +
                      toNumber(m.rent) + toNumber(m.taxLicense) + toNumber(m.phoneComm) + toNumber(m.infrastructure) +
                      toNumber(m.autoTravel) + toNumber(m.salesExpense) + toNumber(m.marketing) +
                      toNumber(m.trainingCert) + toNumber(m.mealsEntertainment) + toNumber(m.otherExpense);
                    const depreciation = toNumber(m.depreciationAmortization);
                    const ebit = rev - cog - operatingExpensesEbitda;
                    return ebit + depreciation;
                  case 'Cash':
                    return toNumber(m.cash);
                  case 'Accounts Receivable':
                    return toNumber(m.ar);
                  case 'Current Assets':
                    return toNumber(m.tca) || (toNumber(m.cash) + toNumber(m.ar) + toNumber(m.inventory) + toNumber(m.otherCA));
                  case 'Fixed Assets':
                    return toNumber(m.fixedAssets);
                  case 'Total Assets':
                    return toNumber(m.totalAssets);
                  case 'Accounts Payable':
                    return toNumber(m.ap);
                  case 'Current Liabilities':
                    return toNumber(m.tcl) || (toNumber(m.ap) + toNumber(m.otherCL));
                  case 'Long Term Debt':
                    return toNumber(m.ltd);
                  case 'Total Equity':
                    return toNumber(m.totalEquity);
                  case 'Net Income':
                    // Calculate as EBIT - Interest Expense + Other Income, but for simplicity use the stored value or calculate basic version
                    return toNumber(m.netIncome) || (toNumber(m.revenue) - toNumber(m.cogsTotal) - toNumber(m.expense));
                  default:
                    return 0;
                }
              };

              const getFormatter = (metric: string) => {
                // Balance sheet items use $K format, P&L items use $K format
                return (val: number) => money.fmtCompact(val);
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
                  data={monthly
                    .map(m => ({
                      month: normalizeMonthLabel((m as any).monthDate || (m as any).date, m.month),
                      value: dataStartIndex >= 0 && hasLoadedFinancialData(m) ? getMetricData(m) : null
                    }))
                    .filter((point) => point.month)}
                  color={color}
                  compact
                  showTable={true}
                  labelFormat="m-yy-adaptive"
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
              {extendedExpenseCategories.map(category => (
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px', width: '100%' }}>
            {/* Dynamic expense category charts */}
            {extendedExpenseCategories
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
                    data={monthly
                      .map(m => ({
                        month: normalizeMonthLabel((m as any).monthDate || (m as any).date, m.month),
                        value: dataStartIndex >= 0 && hasLoadedFinancialData(m) && toNumber(m.revenue) > 0
                          ? ((category.key === 'total-operating-expenses-pct'
                              ? getOperatingExpenseTotal(m)
                              : toNumber((m as any)[category.key])
                            ) / toNumber(m.revenue)) * 100
                          : null
                      }))
                      .filter((point) => point.month)}
                    color={color}
                    compact
                    showTable={true}
                    labelFormat="m-yy-adaptive"
                    formatter={(val: number) => `${val.toFixed(1)}%`}
                    goalLineData={expenseGoals[category.key] ? monthly.map(() => expenseGoals[category.key]) : undefined}
                  />
                );
              })}
          </div>
        </div>
      )}

      {trendAnalysisTab === 'cogs-analysis' && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Select COGS Accounts to Analyze</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              {cogsAccounts.map((account) => (
                <label key={account.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedCogsItems.includes(account.key)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCogsItems([...selectedCogsItems, account.key]);
                      } else {
                        setSelectedCogsItems(selectedCogsItems.filter((item) => item !== account.key));
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '14px', color: '#374151' }}>
                    {account.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px', width: '100%' }}>
            {cogsAccounts
              .filter((account) => selectedCogsItems.includes(account.key))
              .map((account, index) => {
                const colors = [
                  '#0f766e', '#0369a1', '#7c3aed', '#c2410c', '#be185d',
                  '#15803d', '#1d4ed8', '#a16207', '#6d28d9', '#b91c1c',
                  '#0e7490', '#4f46e5'
                ];
                const color = colors[index % colors.length];
                return (
                  <LineChart
                    key={account.key}
                    title={account.label}
                    data={monthly
                      .map((m) => ({
                        month: normalizeMonthLabel((m as any).monthDate || (m as any).date, m.month),
                        value: dataStartIndex >= 0 && hasLoadedFinancialData(m) ? getCogsAccountAmount(m, account.key) : null
                      }))
                      .filter((point) => point.month)}
                    color={color}
                    compact
                    showTable={true}
                    labelFormat="m-yy-adaptive"
                    formatter={(val: number) => money.fmtCompact(val)}
                  />
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
