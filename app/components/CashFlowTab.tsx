'use client';

import React, { useState } from 'react';
import { useMasterData } from '@/lib/master-data-store';
import type { MonthlyDataRow } from '../types';

interface CashFlowTabProps {
  selectedCompanyId: string;
  companyName: string;
}

export default function CashFlowTab({
  selectedCompanyId,
  companyName,
}: CashFlowTabProps) {
  const { monthlyData, loading, error } = useMasterData(selectedCompanyId);
  const monthly = monthlyData || [];
  
  const [cashFlowDisplay, setCashFlowDisplay] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');

  if (loading) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#64748b' }}>Loading cash flow data...</div>
      </div>
    );
  }

  if (error || !monthly || monthly.length === 0) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#ef4444' }}>No financial data available for cash flow analysis</div>
      </div>
    );
  }

  // Calculate cash flow data from monthly data
  const calculateCashFlowData = (data: MonthlyDataRow[]) => {
    return data.map((m) => {
      const netIncome = m.netProfit || 0;
      const depreciation = m.depreciationAmortization || 0;
      
      // Working capital change (simplified)
      const workingCapitalChange = 0; // This would need proper calculation with previous period
      
      const operatingCashFlow = netIncome + depreciation + workingCapitalChange;
      const investingCashFlow = -(m.capex || 0);
      const financingCashFlow = -(m.dividends || 0);
      const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;
      
      const revenue = m.revenue || 0;
      const cashFlowMargin = revenue > 0 ? (operatingCashFlow / revenue) * 100 : 0;
      
      const cash = m.cash || 0;
      const monthlyOCF = operatingCashFlow / 30;
      const daysCashOnHand = monthlyOCF > 0 ? cash / monthlyOCF : 0;
      
      // Working capital metrics
      const cogs = m.cogsTotal || 0;
      const inventory = m.inventory || 0;
      const ar = m.ar || 0;
      const ap = m.ap || 0;
      
      const invTurnover = inventory > 0 ? cogs / inventory : 0;
      const arTurnover = ar > 0 ? revenue / ar : 0;
      const apTurnover = ap > 0 ? cogs / ap : 0;
      
      const DIO = invTurnover > 0 ? 365 / invTurnover : 0;
      const DSO = arTurnover > 0 ? 365 / arTurnover : 0;
      const DPO = apTurnover > 0 ? 365 / apTurnover : 0;
      const CCC = DIO + DSO - DPO;
      
      return {
        month: m.monthDate || m.month,
        monthName: new Date(m.monthDate || m.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        operatingCashFlow,
        investingCashFlow,
        financingCashFlow,
        netCashFlow,
        cashFlowMargin,
        daysCashOnHand,
        DIO,
        DSO,
        DPO,
        CCC,
        cash,
        revenue,
        netIncome,
        depreciation,
      };
    });
  };

  const cashFlowData = calculateCashFlowData(monthly);
  
  // Get data based on display type
  const getDisplayData = () => {
    if (cashFlowDisplay === 'monthly') {
      return cashFlowData.slice(-12); // Last 12 months
    } else if (cashFlowDisplay === 'quarterly') {
      // Aggregate into quarters
      const quarters = [];
      for (let i = cashFlowData.length - 12; i < cashFlowData.length; i += 3) {
        const quarterData = cashFlowData.slice(i, i + 3);
        if (quarterData.length === 3) {
          const quarter = {
            month: quarterData[2].month,
            monthName: `Q${Math.ceil((new Date(quarterData[2].month).getMonth() + 1) / 3)} ${new Date(quarterData[2].month).getFullYear()}`,
            operatingCashFlow: quarterData.reduce((sum, d) => sum + d.operatingCashFlow, 0),
            investingCashFlow: quarterData.reduce((sum, d) => sum + d.investingCashFlow, 0),
            financingCashFlow: quarterData.reduce((sum, d) => sum + d.financingCashFlow, 0),
            netCashFlow: quarterData.reduce((sum, d) => sum + d.netCashFlow, 0),
            revenue: quarterData.reduce((sum, d) => sum + d.revenue, 0),
            cash: quarterData[2].cash,
            cashFlowMargin: 0,
            daysCashOnHand: 0,
            DIO: 0,
            DSO: 0,
            DPO: 0,
            CCC: 0,
          };
          quarter.cashFlowMargin = quarter.revenue > 0 ? (quarter.operatingCashFlow / quarter.revenue) * 100 : 0;
          quarters.push(quarter);
        }
      }
      return quarters;
    } else {
      // Annual - last 3 years
      const years = [];
      for (let i = 0; i < 3; i++) {
        const yearStart = cashFlowData.length - ((i + 1) * 12);
        const yearEnd = cashFlowData.length - (i * 12);
        const yearData = cashFlowData.slice(Math.max(0, yearStart), yearEnd);
        if (yearData.length > 0) {
          const year = {
            month: yearData[yearData.length - 1].month,
            monthName: new Date(yearData[yearData.length - 1].month).getFullYear().toString(),
            operatingCashFlow: yearData.reduce((sum, d) => sum + d.operatingCashFlow, 0),
            investingCashFlow: yearData.reduce((sum, d) => sum + d.investingCashFlow, 0),
            financingCashFlow: yearData.reduce((sum, d) => sum + d.financingCashFlow, 0),
            netCashFlow: yearData.reduce((sum, d) => sum + d.netCashFlow, 0),
            revenue: yearData.reduce((sum, d) => sum + d.revenue, 0),
            cash: yearData[yearData.length - 1].cash,
            cashFlowMargin: 0,
            daysCashOnHand: 0,
            DIO: 0,
            DSO: 0,
            DPO: 0,
            CCC: 0,
          };
          year.cashFlowMargin = year.revenue > 0 ? (year.operatingCashFlow / year.revenue) * 100 : 0;
          years.unshift(year);
        }
      }
      return years;
    }
  };

  const displayData = getDisplayData();
  
  // Calculate summary metrics
  const latestPeriod = displayData[displayData.length - 1];
  const avgOCF = displayData.reduce((sum, d) => sum + d.operatingCashFlow, 0) / displayData.length;
  const avgCFMargin = displayData.reduce((sum, d) => sum + d.cashFlowMargin, 0) / displayData.length;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <style>{`
        @media print {
          @page {
            size: portrait;
            margin: 0.3in;
          }
          
          .no-print,
          header,
          nav,
          aside,
          [role="navigation"],
          button {
            display: none !important;
          }
          
          * {
            box-shadow: none !important;
          }
          
          .cf-summary-cards {
            page-break-after: avoid;
          }
          
          .cf-metrics-section {
            page-break-before: always;
            margin-top: 0 !important;
          }
          
          .cf-table-container {
            transform: scale(0.75);
            transform-origin: top left;
            width: 133.33%;
          }
          
          h1 {
            font-size: 20px !important;
            margin-bottom: 12px !important;
          }
          
          h2 {
            font-size: 16px !important;
            margin-bottom: 12px !important;
          }
          
          table {
            font-size: 9px !important;
          }
          
          th, td {
            padding: 4px 6px !important;
          }
        }
      `}</style>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Cash Flow Analysis</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {companyName && <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
          {cashFlowDisplay !== 'monthly' && (
            <button 
              className="no-print"
              onClick={() => window.print()} 
              style={{ 
                padding: '12px 24px', 
                background: '#667eea', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                fontSize: '14px', 
                fontWeight: '600', 
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
              }}>
              🖨️ Print
            </button>
          )}
        </div>
      </div>
      
      {/* Display Period Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => setCashFlowDisplay('monthly')}
          style={{
            padding: '12px 24px',
            background: cashFlowDisplay === 'monthly' ? '#667eea' : 'transparent',
            color: cashFlowDisplay === 'monthly' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: cashFlowDisplay === 'monthly' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          Monthly
        </button>
        <button
          onClick={() => setCashFlowDisplay('quarterly')}
          style={{
            padding: '12px 24px',
            background: cashFlowDisplay === 'quarterly' ? '#667eea' : 'transparent',
            color: cashFlowDisplay === 'quarterly' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: cashFlowDisplay === 'quarterly' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          Last 4 Quarters
        </button>
        <button
          onClick={() => setCashFlowDisplay('annual')}
          style={{
            padding: '12px 24px',
            background: cashFlowDisplay === 'annual' ? '#667eea' : 'transparent',
            color: cashFlowDisplay === 'annual' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: cashFlowDisplay === 'annual' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          Last 3 Years
        </button>
      </div>

      {/* Summary Cards */}
      <div className="cf-summary-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '32px' }}>
        <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: '12px', padding: '24px', color: 'white', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}>
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Operating Cash Flow</div>
          <div style={{ fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>
            ${(latestPeriod?.operatingCashFlow || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>
            Avg: ${avgOCF.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', borderRadius: '12px', padding: '24px', color: 'white', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)' }}>
          <div style={{ fontSize: '14px', opacity: 0.9', marginBottom: '8px' }}>Cash Flow Margin</div>
          <div style={{ fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>
            {(latestPeriod?.cashFlowMargin || 0).toFixed(1)}%
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>
            Avg: {avgCFMargin.toFixed(1)}%
          </div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', borderRadius: '12px', padding: '24px', color: 'white', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)' }}>
          <div style={{ fontSize: '14px', opacity: 0.9', marginBottom: '8px' }}>Net Cash Flow</div>
          <div style={{ fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>
            ${(latestPeriod?.netCashFlow || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>Latest Period</div>
        </div>
      </div>

      {/* Cash Flow Table */}
      <div className="cf-table-container" style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
          {cashFlowDisplay === 'monthly' ? 'Monthly' : cashFlowDisplay === 'quarterly' ? 'Quarterly' : 'Annual'} Cash Flow Statement
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Period</th>
              <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#10b981' }}>Operating CF</th>
              <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#ef4444' }}>Investing CF</th>
              <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#3b82f6' }}>Financing CF</th>
              <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#1e293b' }}>Net CF</th>
              <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#f59e0b' }}>CF Margin</th>
            </tr>
          </thead>
          <tbody>
            {displayData.map((row, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 12px', color: '#1e293b', fontWeight: '500' }}>{row.monthName}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: row.operatingCashFlow >= 0 ? '#10b981' : '#ef4444' }}>
                  ${Math.abs(row.operatingCashFlow).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  {row.operatingCashFlow < 0 && ' ⬇'}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: row.investingCashFlow >= 0 ? '#10b981' : '#ef4444' }}>
                  ${Math.abs(row.investingCashFlow).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  {row.investingCashFlow < 0 && ' ⬇'}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: row.financingCashFlow >= 0 ? '#10b981' : '#ef4444' }}>
                  ${Math.abs(row.financingCashFlow).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  {row.financingCashFlow < 0 && ' ⬇'}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: row.netCashFlow >= 0 ? '#10b981' : '#ef4444', fontWeight: '600' }}>
                  ${Math.abs(row.netCashFlow).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  {row.netCashFlow < 0 && ' ⬇'}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>
                  {row.cashFlowMargin.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

