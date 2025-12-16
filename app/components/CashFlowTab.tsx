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

  // Calculate cash flow data based on view
  const dataMonths = cashFlowDisplay === 'quarterly' ? 12 : (cashFlowDisplay === 'annual' ? 36 : 12);
  const dataSet = monthly.slice(-dataMonths);
  
  const cashFlowData = dataSet.map((curr, idx) => {
    const prev = idx === 0 && monthly.length > dataMonths ? monthly[monthly.length - dataMonths - 1] : (idx > 0 ? dataSet[idx - 1] : curr);
    
    // Operating Activities
    const netIncome = (curr.revenue || 0) - (curr.cogsTotal || 0) - (curr.expense || 0);
    const depreciation = curr.depreciationAmortization || 0;
    const changeInAR = (curr.ar || 0) - (prev.ar || 0);
    const changeInInventory = (curr.inventory || 0) - (prev.inventory || 0);
    const changeInAP = (curr.ap || 0) - (prev.ap || 0);
    const changeInWorkingCapital = -(changeInAR + changeInInventory - changeInAP);
    const operatingCashFlow = netIncome + depreciation + changeInWorkingCapital;
    
    // Investing Activities
    const changeInFixedAssets = (curr.fixedAssets || 0) - (prev.fixedAssets || 0);
    const capitalExpenditures = changeInFixedAssets + depreciation;
    const investingCashFlow = -capitalExpenditures;
    
    // Financing Activities
    const changeInDebt = (curr.ltd || 0) - (prev.ltd || 0);
    const changeInEquity = (curr.totalEquity || 0) - (prev.totalEquity || 0);
    const financingCashFlow = changeInDebt + changeInEquity;
    
    // Net Change and FCF
    const netCashChange = operatingCashFlow + investingCashFlow + financingCashFlow;
    const freeCashFlow = operatingCashFlow - Math.max(0, capitalExpenditures);
    const endingCash = curr.cash || 0;
    
    // Cash Flow Margin
    const cashFlowMargin = (curr.revenue || 0) > 0 ? (operatingCashFlow / (curr.revenue || 1)) * 100 : 0;
    
    // Days Cash on Hand
    const monthlyOperatingExpenses = ((curr.cogsTotal || 0) + (curr.expense || 0)) / 30;
    const daysCashOnHand = monthlyOperatingExpenses > 0 ? endingCash / monthlyOperatingExpenses : 0;
    
    // Working Capital Metrics (LTM-based for stability)
    const ltmRevenue = monthly.slice(-12).reduce((sum, m) => sum + (m.revenue || 0), 0);
    const ltmCOGS = monthly.slice(-12).reduce((sum, m) => sum + (m.cogsTotal || 0), 0);
    const avgInventory = ((curr.inventory || 0) + (prev.inventory || 0)) / 2;
    const avgAR = ((curr.ar || 0) + (prev.ar || 0)) / 2;
    const avgAP = ((curr.ap || 0) + (prev.ap || 0)) / 2;
    
    const inventoryTurnover = avgInventory > 0 ? ltmCOGS / avgInventory : 0;
    const receivablesTurnover = avgAR > 0 ? ltmRevenue / avgAR : 0;
    const payablesTurnover = avgAP > 0 ? ltmCOGS / avgAP : 0;
    
    const DIO = inventoryTurnover > 0 ? 365 / inventoryTurnover : 0;
    const DSO = receivablesTurnover > 0 ? 365 / receivablesTurnover : 0;
    const DPO = payablesTurnover > 0 ? 365 / payablesTurnover : 0;
    const CCC = DIO + DSO - DPO;
    
    const monthValue = curr.monthDate || curr.month;
    return {
      month: formatMonth(monthValue),
      netIncome,
      depreciation,
      changeInWorkingCapital,
      operatingCashFlow,
      capitalExpenditures,
      investingCashFlow,
      changeInDebt,
      changeInEquity,
      financingCashFlow,
      netCashChange,
      freeCashFlow,
      endingCash,
      cashFlowMargin,
      daysCashOnHand,
      DIO,
      DSO,
      DPO,
      CCC
    };
  });

  // Aggregate data based on display selection
  let displayData = cashFlowData;
  if (cashFlowDisplay === 'quarterly') {
    // Aggregate into quarters (3 months each)
    displayData = [];
    for (let i = 0; i < cashFlowData.length; i += 3) {
      const quarter = cashFlowData.slice(i, i + 3);
      const quarterEndMonth = quarter[quarter.length - 1].month;
      // Format quarter label (e.g., "Q1 2024" or "03-2024")
      let quarterLabel = quarterEndMonth;
      const monthMatch = quarterEndMonth.match(/^(\d{2})-(\d{4})$/);
      if (monthMatch) {
        const monthNum = parseInt(monthMatch[1]);
        const year = monthMatch[2];
        const quarterNum = Math.ceil(monthNum / 3);
        quarterLabel = `Q${quarterNum} ${year}`;
      }
      const aggregated = {
        month: quarterLabel,
        netIncome: quarter.reduce((sum, d) => sum + d.netIncome, 0),
        depreciation: quarter.reduce((sum, d) => sum + d.depreciation, 0),
        changeInWorkingCapital: quarter.reduce((sum, d) => sum + d.changeInWorkingCapital, 0),
        operatingCashFlow: quarter.reduce((sum, d) => sum + d.operatingCashFlow, 0),
        capitalExpenditures: quarter.reduce((sum, d) => sum + d.capitalExpenditures, 0),
        investingCashFlow: quarter.reduce((sum, d) => sum + d.investingCashFlow, 0),
        changeInDebt: quarter.reduce((sum, d) => sum + d.changeInDebt, 0),
        changeInEquity: quarter.reduce((sum, d) => sum + d.changeInEquity, 0),
        financingCashFlow: quarter.reduce((sum, d) => sum + d.financingCashFlow, 0),
        netCashChange: quarter.reduce((sum, d) => sum + d.netCashChange, 0),
        freeCashFlow: quarter.reduce((sum, d) => sum + d.freeCashFlow, 0),
        cashFlowMargin: quarter.reduce((sum, d) => sum + d.cashFlowMargin, 0) / quarter.length,
        daysCashOnHand: quarter[quarter.length - 1].daysCashOnHand,
        endingCash: quarter[quarter.length - 1].endingCash,
        DIO: quarter[quarter.length - 1].DIO,
        DSO: quarter[quarter.length - 1].DSO,
        DPO: quarter[quarter.length - 1].DPO,
        CCC: quarter[quarter.length - 1].CCC
      };
      displayData.push(aggregated);
    }
  } else if (cashFlowDisplay === 'annual') {
    // Aggregate into 3 annual periods (12 months each)
    displayData = [];
    const totalMonths = cashFlowData.length;
    const yearsToShow = Math.min(3, Math.floor(totalMonths / 12));
    
    for (let i = 0; i < yearsToShow; i++) {
      const yearStart = totalMonths - (yearsToShow - i) * 12;
      const yearEnd = yearStart + 12;
      const yearData = cashFlowData.slice(yearStart, yearEnd);
      
      if (yearData.length > 0) {
        const yearEndMonth = yearData[yearData.length - 1].month;
        // Format year label (e.g., "2024" or extract year from "MM-YYYY")
        let yearLabel = yearEndMonth;
        const yearMatch = yearEndMonth.match(/-(\d{4})$/);
        if (yearMatch) {
          yearLabel = yearMatch[1];
        } else {
          // Try to extract year from date string
          const date = new Date(yearEndMonth);
          if (!isNaN(date.getTime())) {
            yearLabel = String(date.getFullYear());
          }
        }
        displayData.push({
          month: yearLabel,
          netIncome: yearData.reduce((sum, d) => sum + d.netIncome, 0),
          depreciation: yearData.reduce((sum, d) => sum + d.depreciation, 0),
          changeInWorkingCapital: yearData.reduce((sum, d) => sum + d.changeInWorkingCapital, 0),
          operatingCashFlow: yearData.reduce((sum, d) => sum + d.operatingCashFlow, 0),
          capitalExpenditures: yearData.reduce((sum, d) => sum + d.capitalExpenditures, 0),
          investingCashFlow: yearData.reduce((sum, d) => sum + d.investingCashFlow, 0),
          changeInDebt: yearData.reduce((sum, d) => sum + d.changeInDebt, 0),
          changeInEquity: yearData.reduce((sum, d) => sum + d.changeInEquity, 0),
          financingCashFlow: yearData.reduce((sum, d) => sum + d.financingCashFlow, 0),
          netCashChange: yearData.reduce((sum, d) => sum + d.netCashChange, 0),
          freeCashFlow: yearData.reduce((sum, d) => sum + d.freeCashFlow, 0),
          cashFlowMargin: yearData.reduce((sum, d) => sum + d.cashFlowMargin, 0) / yearData.length,
          daysCashOnHand: yearData[yearData.length - 1].daysCashOnHand,
          endingCash: yearData[yearData.length - 1].endingCash,
          DIO: yearData[yearData.length - 1].DIO,
          DSO: yearData[yearData.length - 1].DSO,
          DPO: yearData[yearData.length - 1].DPO,
          CCC: yearData[yearData.length - 1].CCC
        });
      }
    }
  }

  // Summary metrics - always use last 12 months for consistency
  const last12MonthsData = monthly.slice(-12).map((curr, idx) => {
    const prev = idx === 0 && monthly.length > 12 ? monthly[monthly.length - 13] : (idx > 0 ? monthly.slice(-12)[idx - 1] : curr);
    const netIncome = (curr.revenue || 0) - (curr.cogsTotal || 0) - (curr.expense || 0);
    const depreciation = curr.depreciationAmortization || 0;
    const changeInAR = (curr.ar || 0) - (prev.ar || 0);
    const changeInInventory = (curr.inventory || 0) - (prev.inventory || 0);
    const changeInAP = (curr.ap || 0) - (prev.ap || 0);
    const changeInWorkingCapital = -(changeInAR + changeInInventory - changeInAP);
    const operatingCashFlow = netIncome + depreciation + changeInWorkingCapital;
    const changeInFixedAssets = (curr.fixedAssets || 0) - (prev.fixedAssets || 0);
    const capitalExpenditures = changeInFixedAssets + depreciation;
    const investingCashFlow = -capitalExpenditures;
    const changeInDebt = (curr.ltd || 0) - (prev.ltd || 0);
    const changeInEquity = (curr.totalEquity || 0) - (prev.totalEquity || 0);
    const financingCashFlow = changeInDebt + changeInEquity;
    const freeCashFlow = operatingCashFlow - Math.max(0, capitalExpenditures);
    const cashFlowMargin = (curr.revenue || 0) > 0 ? (operatingCashFlow / (curr.revenue || 1)) * 100 : 0;
    return { operatingCashFlow, investingCashFlow, financingCashFlow, freeCashFlow, cashFlowMargin };
  });
  
  const totalOperatingCF = last12MonthsData.reduce((sum, d) => sum + d.operatingCashFlow, 0);
  const totalInvestingCF = last12MonthsData.reduce((sum, d) => sum + d.investingCashFlow, 0);
  const totalFinancingCF = last12MonthsData.reduce((sum, d) => sum + d.financingCashFlow, 0);
  const totalFreeCF = last12MonthsData.reduce((sum, d) => sum + d.freeCashFlow, 0);
  const avgCashFlowMargin = last12MonthsData.reduce((sum, d) => sum + d.cashFlowMargin, 0) / last12MonthsData.length;

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
          
          .cf-summary-cards > div {
            padding: 12px !important;
          }
          
          .cf-summary-cards > div > div:first-child {
            font-size: 10px !important;
          }
          
          .cf-summary-cards > div > div:nth-child(2) {
            font-size: 20px !important;
          }
          
          .cf-summary-cards > div > div:last-child {
            font-size: 9px !important;
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

      {/* Educational Resources - Side by Side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Cash Flow Metrics Definitions */}
        <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '12px 24px', border: '1px solid #e2e8f0' }}>
          <details>
            <summary style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', cursor: 'pointer', marginBottom: '16px' }}>
              💰 Cash Flow Metrics - Definitions & Examples
            </summary>
          
          <div style={{ display: 'grid', gap: '20px', marginTop: '16px' }}>
            {/* Operating Cash Flow */}
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#10b981', fontSize: '14px', fontWeight: '700' }}>Operating Cash Flow (OCF)</h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                <strong>Definition:</strong> Cash generated from normal business operations. Shows the company's ability to generate cash from its core activities.
              </p>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', fontFamily: 'monospace', background: '#f1f5f9', padding: '8px', borderRadius: '4px' }}>
                <strong>Formula:</strong> Net Income + Depreciation + Change in Working Capital
              </p>
              <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.6' }}>
                <strong>Example:</strong> If Net Income = $50,000, Depreciation = $5,000, and Working Capital decreased by $3,000 (a source of cash), then OCF = $50,000 + $5,000 + $3,000 = <strong>$58,000</strong>
              </p>
            </div>

            {/* Investing Cash Flow */}
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#ef4444', fontSize: '14px', fontWeight: '700' }}>Investing Cash Flow</h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                <strong>Definition:</strong> Cash used for investments in long-term assets like equipment, property, and other capital expenditures. Typically negative as it represents cash outflows.
              </p>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', fontFamily: 'monospace', background: '#f1f5f9', padding: '8px', borderRadius: '4px' }}>
                <strong>Formula:</strong> -(Capital Expenditures)
              </p>
              <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.6' }}>
                <strong>Example:</strong> If the company purchased $15,000 in new equipment, then Investing Cash Flow = <strong>-$15,000</strong>
              </p>
            </div>

            {/* Financing Cash Flow */}
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#3b82f6', fontSize: '14px', fontWeight: '700' }}>Financing Cash Flow</h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                <strong>Definition:</strong> Cash from or to investors and creditors. Includes debt proceeds/repayments and equity contributions/distributions.
              </p>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', fontFamily: 'monospace', background: '#f1f5f9', padding: '8px', borderRadius: '4px' }}>
                <strong>Formula:</strong> Change in Debt + Change in Equity
              </p>
              <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.6' }}>
                <strong>Example:</strong> If the company received $20,000 in new loans and distributed $5,000 to owners, then Financing CF = $20,000 - $5,000 = <strong>$15,000</strong>
              </p>
            </div>

            {/* Free Cash Flow */}
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #667eea' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#667eea', fontSize: '14px', fontWeight: '700' }}>Free Cash Flow (FCF)</h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                <strong>Definition:</strong> Cash available after maintaining/expanding the asset base. This is the cash truly "free" for distribution or growth initiatives.
              </p>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', fontFamily: 'monospace', background: '#f1f5f9', padding: '8px', borderRadius: '4px' }}>
                <strong>Formula:</strong> Operating Cash Flow - Capital Expenditures
              </p>
              <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.6' }}>
                <strong>Example:</strong> If OCF = $58,000 and CapEx = $15,000, then FCF = $58,000 - $15,000 = <strong>$43,000</strong>
              </p>
            </div>

            {/* Cash Flow Margin */}
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#f59e0b', fontSize: '14px', fontWeight: '700' }}>Cash Flow Margin</h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                <strong>Definition:</strong> Percentage of revenue converted to operating cash flow. Higher percentages indicate better cash generation efficiency.
              </p>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', fontFamily: 'monospace', background: '#f1f5f9', padding: '8px', borderRadius: '4px' }}>
                <strong>Formula:</strong> (Operating Cash Flow ÷ Revenue) × 100
              </p>
              <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.6' }}>
                <strong>Example:</strong> If OCF = $58,000 and Revenue = $250,000, then Cash Flow Margin = ($58,000 ÷ $250,000) × 100 = <strong>23.2%</strong>
              </p>
            </div>

            {/* Days Cash On Hand */}
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #8b5cf6' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#8b5cf6', fontSize: '14px', fontWeight: '700' }}>Days Cash On Hand</h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                <strong>Definition:</strong> Number of days the company can operate with its current cash balance at the current cash flow rate. Indicates financial runway.
              </p>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', fontFamily: 'monospace', background: '#f1f5f9', padding: '8px', borderRadius: '4px' }}>
                <strong>Formula:</strong> Ending Cash ÷ (Daily Operating Expenses)
              </p>
              <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.6' }}>
                <strong>Example:</strong> If Ending Cash = $75,000 and daily expenses = $2,000, then Days Cash On Hand = $75,000 ÷ $2,000 = <strong>37.5 days</strong>
              </p>
            </div>

            {/* DIO */}
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #06b6d4' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#06b6d4', fontSize: '14px', fontWeight: '700' }}>DIO (Days Inventory Outstanding)</h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                <strong>Definition:</strong> Average number of days inventory is held before being sold. Lower values indicate faster inventory turnover and better working capital management.
              </p>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', fontFamily: 'monospace', background: '#f1f5f9', padding: '8px', borderRadius: '4px' }}>
                <strong>Formula:</strong> 365 ÷ Inventory Turnover<br/>
                <span style={{ fontSize: '12px' }}>Where Inventory Turnover = LTM COGS ÷ Avg Inventory</span>
              </p>
              <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.6' }}>
                <strong>Example:</strong> If LTM COGS = $600,000 and Avg Inventory = $50,000, then Inventory Turnover = 12. DIO = 365 ÷ 12 = <strong>30.4 days</strong>
              </p>
            </div>

            {/* DSO */}
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #14b8a6' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#14b8a6', fontSize: '14px', fontWeight: '700' }}>DSO (Days Sales Outstanding)</h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                <strong>Definition:</strong> Average number of days to collect payment from customers after a sale. Lower values indicate faster cash collection and better receivables management.
              </p>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', fontFamily: 'monospace', background: '#f1f5f9', padding: '8px', borderRadius: '4px' }}>
                <strong>Formula:</strong> 365 ÷ Receivables Turnover<br/>
                <span style={{ fontSize: '12px' }}>Where Receivables Turnover = LTM Revenue ÷ Avg A/R</span>
              </p>
              <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.6' }}>
                <strong>Example:</strong> If LTM Revenue = $1,200,000 and Avg A/R = $100,000, then Receivables Turnover = 12. DSO = 365 ÷ 12 = <strong>30.4 days</strong>
              </p>
            </div>

            {/* DPO */}
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #ec4899' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#ec4899', fontSize: '14px', fontWeight: '700' }}>DPO (Days Payables Outstanding)</h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                <strong>Definition:</strong> Average number of days the company takes to pay its suppliers. Higher values can indicate better use of supplier credit, but be careful not to damage supplier relationships.
              </p>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', fontFamily: 'monospace', background: '#f1f5f9', padding: '8px', borderRadius: '4px' }}>
                <strong>Formula:</strong> 365 ÷ Payables Turnover<br/>
                <span style={{ fontSize: '12px' }}>Where Payables Turnover = LTM COGS ÷ Avg A/P</span>
              </p>
              <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.6' }}>
                <strong>Example:</strong> If LTM COGS = $600,000 and Avg A/P = $75,000, then Payables Turnover = 8. DPO = 365 ÷ 8 = <strong>45.6 days</strong>
              </p>
            </div>

            {/* Cash Conversion Cycle */}
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #f97316' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#f97316', fontSize: '14px', fontWeight: '700' }}>Cash Conversion Cycle (CCC)</h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                <strong>Definition:</strong> Number of days between paying suppliers and collecting cash from customers. Shows how efficiently the company manages working capital. Lower (or negative) values are better.
              </p>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', fontFamily: 'monospace', background: '#f1f5f9', padding: '8px', borderRadius: '4px' }}>
                <strong>Formula:</strong> DIO + DSO - DPO
              </p>
              <p style={{ margin: '0', fontSize: '13px', color: '#64748b', lineHeight: '1.6' }}>
                <strong>Example:</strong> If DIO = 30.4 days, DSO = 30.4 days, and DPO = 45.6 days, then CCC = 30.4 + 30.4 - 45.6 = <strong>15.2 days</strong>. This means cash is tied up for about 15 days.
              </p>
            </div>
          </div>
        </details>
        </div>

        {/* Cash Flow Management Article */}
        <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '12px 24px', border: '1px solid #e2e8f0' }}>
          <details>
            <summary style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', cursor: 'pointer', marginBottom: '16px' }}>
              💡 Why Cash Flow Management is Critical for your Business
            </summary>
          
          <div style={{ marginTop: '16px', fontSize: '14px', lineHeight: '1.8', color: '#475569' }}>
            <p style={{ marginBottom: '16px' }}>
              For small businesses, cash flow management isn't just a back-office function—it's the lifeblood of the business. While profitability matters, it's liquidity that ensures you can meet payroll, pay suppliers, and seize new opportunities. Many profitable businesses fail simply because they run out of cash. Here's how to stay ahead.
            </p>

            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', marginTop: '24px', marginBottom: '12px' }}>
              What is Cash Flow Management?
            </h3>
            <p style={{ marginBottom: '16px' }}>
              Cash flow management is the process of monitoring, analyzing, and optimizing the timing of cash inflows and outflows. It's about making sure you have enough cash on hand to meet your obligations while also investing in growth.
            </p>

            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', marginTop: '24px', marginBottom: '12px' }}>
              Key Strategies for Improving Cash Flow
            </h3>

            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginTop: '20px', marginBottom: '8px' }}>
              1. Develop a Cash Flow Forecast
            </h4>
            <p style={{ marginBottom: '16px' }}>
              A cash flow forecast is your financial crystal ball. It projects your incoming cash from sales and outgoing cash for expenses over a specific period, typically 30, 60, or 90 days. This projection helps you anticipate shortfalls and plan ahead.
            </p>
            <p style={{ marginBottom: '16px' }}>
              Begin with historical data, analyze seasonal trends, and account for upcoming expenses. Tools like spreadsheets or accounting software can streamline this process. By knowing when cash will be tight, you can take proactive steps—like securing short-term financing or delaying non-essential purchases—before problems arise.
            </p>

            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginTop: '20px', marginBottom: '8px' }}>
              2. Speed Up Collections
            </h4>
            <p style={{ marginBottom: '12px' }}>
              Accelerating cash inflows is one of the most effective ways to improve liquidity. Start by optimizing your invoicing and collection processes:
            </p>
            <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
              <li><strong>Set clear payment terms:</strong> Clearly outline due dates and penalties for late payments in contracts.</li>
              <li><strong>Send invoices promptly:</strong> The faster you send invoices, the sooner you'll get paid.</li>
              <li><strong>Offer incentives:</strong> Discounts for early payments encourage timely cash inflows.</li>
              <li><strong>Follow up persistently:</strong> Don't hesitate to send polite reminders for overdue payments.</li>
            </ul>

            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginTop: '20px', marginBottom: '8px' }}>
              3. Optimize Accounts Payable
            </h4>
            <p style={{ marginBottom: '12px' }}>
              Balancing outgoing payments is just as important as collecting receivables. Avoid paying too early, which could leave your business cash-strapped. On the other hand, paying too late may harm vendor relationships. Use these best practices:
            </p>
            <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
              <li>Take advantage of the full payment terms offered by suppliers.</li>
              <li>Negotiate favorable terms, such as discounts for bulk orders or extended deadlines.</li>
              <li>Schedule payments strategically to align with cash flow peaks.</li>
            </ul>

            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginTop: '20px', marginBottom: '8px' }}>
              4. Control Operational Expenses
            </h4>
            <p style={{ marginBottom: '16px' }}>
              Every dollar saved is a dollar added to your liquidity. Regularly audit your operational expenses and look for areas where you can cut costs without sacrificing quality. Consider adopting zero-based budgeting, where all expenses must be justified rather than relying on past budgets.
            </p>
            <p style={{ marginBottom: '16px' }}>
              Focus on reducing discretionary spending, renegotiating supplier contracts, and switching to cost-efficient alternatives. Even small adjustments can have a significant impact on your overall cash flow.
            </p>

            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginTop: '20px', marginBottom: '8px' }}>
              5. Improve Inventory Management
            </h4>
            <p style={{ marginBottom: '16px' }}>
              Inventory ties up cash, especially when stock levels are too high. Use data to forecast demand accurately and implement just-in-time (JIT) inventory systems to minimize overstocking. Regularly review inventory levels to ensure that slow-moving or obsolete stock isn't draining your resources.
            </p>
            <p style={{ marginBottom: '16px' }}>
              Efficient inventory management not only frees up cash but also reduces storage and insurance costs.
            </p>

            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginTop: '20px', marginBottom: '8px' }}>
              6. Establish a Cash Reserve
            </h4>
            <p style={{ marginBottom: '16px' }}>
              A strong cash reserve acts as a buffer during challenging times. Set aside a portion of profits regularly to build an emergency fund that can cover at least three to six months of operating expenses. This reserve will protect your business from unexpected events like economic downturns, supply chain disruptions, or market fluctuations.
            </p>

            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginTop: '20px', marginBottom: '8px' }}>
              7. Use Short-Term Financing Wisely
            </h4>
            <p style={{ marginBottom: '16px' }}>
              Short-term financing options, such as lines of credit or invoice financing, can help bridge gaps when cash flow is tight. However, it's essential to use these options strategically. Only borrow what you can comfortably repay, and ensure that repayment terms align with your cash flow forecast to avoid over-leveraging.
            </p>
            <p style={{ marginBottom: '16px' }}>
              Short-term loans can be particularly helpful during seasonal slowdowns or when expanding inventory to meet rising demand.
            </p>

            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginTop: '20px', marginBottom: '8px' }}>
              8. Automate Financial Processes
            </h4>
            <p style={{ marginBottom: '16px' }}>
              Manual financial tracking is time-consuming and prone to errors. Adopting tools for automating cash flow forecasting, invoice management, and financial reporting saves time and improves accuracy. Automation ensures you always have a clear view of your business's financial health.
            </p>

            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginTop: '20px', marginBottom: '8px' }}>
              9. Monitor and Adjust Frequently
            </h4>
            <p style={{ marginBottom: '16px' }}>
              The financial landscape is ever-changing, and your cash flow strategy should adapt to it. Regularly review your cash flow reports, identify trends, and adjust your plans as needed. This proactive approach helps you avoid surprises and ensures your business stays on solid financial footing.
            </p>
            <p style={{ marginBottom: '16px' }}>
              Tracking key performance indicators (KPIs), such as days sales outstanding (DSO) and current ratio, can provide deeper insights into your financial health.
            </p>

            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', marginTop: '24px', marginBottom: '12px' }}>
              Conclusion: Liquidity is the Key to Resilience
            </h3>
            <p style={{ marginBottom: '0' }}>
              Small businesses thrive when they have strong control over their cash flow. By implementing the strategies outlined above, you can stay ahead of cash flow challenges, maintain liquidity, and focus on what matters most—growing your business.
            </p>
          </div>
          </details>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="cf-summary-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #10b981' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Operating Cash Flow (12mo)</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#10b981' }}>
            ${totalOperatingCF.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Cash from operations</div>
        </div>
        
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #ef4444' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Investing Cash Flow (12mo)</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#ef4444' }}>
            ${totalInvestingCF.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>CapEx & investments</div>
        </div>
        
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #3b82f6' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Financing Cash Flow (12mo)</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#3b82f6' }}>
            ${totalFinancingCF.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Debt & equity changes</div>
        </div>
        
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Free Cash Flow (12mo)</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: totalFreeCF >= 0 ? '#10b981' : '#ef4444' }}>
            ${totalFreeCF.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>OCF - CapEx</div>
        </div>
        
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #f59e0b' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Avg Cash Flow Margin</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>
            {avgCashFlowMargin.toFixed(1)}%
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>OCF / Revenue</div>
        </div>
      </div>

      {/* Cash Flow Statement Table */}
      <div className="cf-table-container" style={{ background: 'white', borderRadius: '12px', padding: '32px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Statement of Cash Flows</h2>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '13px', fontWeight: '600', color: '#64748b', position: 'sticky', left: 0, background: 'white', minWidth: '200px' }}>Cash Flow Item</th>
                {displayData.map((cf, i) => (
                  <th key={i} style={{ textAlign: 'right', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '90px' }}>
                    {cf.month}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Operating Activities */}
              <tr style={{ background: '#f0fdf4' }}>
                <td colSpan={displayData.length + 1} style={{ padding: '12px 10px', fontSize: '14px', fontWeight: '700', color: '#065f46' }}>
                  OPERATING ACTIVITIES
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569', paddingLeft: '24px' }}>Net Income</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                    ${Math.round(cf.netIncome).toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569', paddingLeft: '24px' }}>+ Depreciation</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                    ${Math.round(cf.depreciation).toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569', paddingLeft: '24px' }}>+ Change in Working Capital</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: cf.changeInWorkingCapital >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>
                    ${Math.round(cf.changeInWorkingCapital).toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '2px solid #10b981', background: '#f0fdf4' }}>
                <td style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#065f46' }}>Operating Cash Flow</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#065f46', textAlign: 'right' }}>
                    ${Math.round(cf.operatingCashFlow).toLocaleString()}
                  </td>
                ))}
              </tr>
              
              {/* Investing Activities */}
              <tr style={{ background: '#fef2f2' }}>
                <td colSpan={displayData.length + 1} style={{ padding: '12px 10px', fontSize: '14px', fontWeight: '700', color: '#991b1b' }}>
                  INVESTING ACTIVITIES
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569', paddingLeft: '24px' }}>Capital Expenditures</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#ef4444', textAlign: 'right' }}>
                    (${Math.round(cf.capitalExpenditures).toLocaleString()})
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '2px solid #ef4444', background: '#fef2f2' }}>
                <td style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#991b1b' }}>Investing Cash Flow</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#991b1b', textAlign: 'right' }}>
                    ${Math.round(cf.investingCashFlow).toLocaleString()}
                  </td>
                ))}
              </tr>
              
              {/* Financing Activities */}
              <tr style={{ background: '#eff6ff' }}>
                <td colSpan={displayData.length + 1} style={{ padding: '12px 10px', fontSize: '14px', fontWeight: '700', color: '#1e40af' }}>
                  FINANCING ACTIVITIES
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569', paddingLeft: '24px' }}>Change in Long-Term Debt</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: cf.changeInDebt >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>
                    ${Math.round(cf.changeInDebt).toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569', paddingLeft: '24px' }}>Change in Equity</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: cf.changeInEquity >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>
                    ${Math.round(cf.changeInEquity).toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '2px solid #3b82f6', background: '#eff6ff' }}>
                <td style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#1e40af' }}>Financing Cash Flow</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#1e40af', textAlign: 'right' }}>
                    ${Math.round(cf.financingCashFlow).toLocaleString()}
                  </td>
                ))}
              </tr>
              
              {/* Net Change */}
              <tr style={{ borderBottom: '3px double #1e293b', background: '#f8fafc' }}>
                <td style={{ padding: '12px 10px', fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>Net Change in Cash</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '12px 10px', fontSize: '14px', fontWeight: '700', color: cf.netCashChange >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>
                    ${Math.round(cf.netCashChange).toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr style={{ background: '#fef3c7' }}>
                <td style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#92400e' }}>Free Cash Flow</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: cf.freeCashFlow >= 0 ? '#065f46' : '#991b1b', textAlign: 'right' }}>
                    ${Math.round(cf.freeCashFlow).toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <td style={{ padding: '10px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>Ending Cash Balance</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '10px', fontSize: '13px', fontWeight: '600', color: '#1e293b', textAlign: 'right' }}>
                    ${Math.round(cf.endingCash).toLocaleString()}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cash Flow Metrics */}
      <div className="cf-metrics-section" style={{ background: 'white', borderRadius: '12px', padding: '32px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Cash Flow Metrics</h2>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '10px', fontSize: '13px', fontWeight: '600', color: '#64748b', position: 'sticky', left: 0, background: 'white', minWidth: '180px' }}>Metric</th>
                {displayData.map((cf, i) => (
                  <th key={i} style={{ textAlign: 'right', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '90px' }}>
                    {cf.month}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569' }}>Cash Flow Margin (%)</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                    {cf.cashFlowMargin.toFixed(1)}%
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569' }}>Days Cash on Hand</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                    {cf.daysCashOnHand.toFixed(0)} days
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569' }}>Cash Conversion Rate</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                    {cf.netIncome > 0 ? ((cf.operatingCashFlow / cf.netIncome) * 100).toFixed(0) : 'N/A'}%
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569' }}>DIO (Days Inventory Outstanding)</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                    {cf.DIO ? cf.DIO.toFixed(0) : 'N/A'} days
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569' }}>DSO (Days Sales Outstanding)</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                    {cf.DSO ? cf.DSO.toFixed(0) : 'N/A'} days
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569' }}>DPO (Days Payables Outstanding)</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                    {cf.DPO ? cf.DPO.toFixed(0) : 'N/A'} days
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569', fontWeight: '600' }}>Cash Conversion Cycle (CCC)</td>
                {displayData.map((cf, i) => (
                  <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: cf.CCC < 30 ? '#10b981' : (cf.CCC > 60 ? '#ef4444' : '#1e293b'), textAlign: 'right', fontWeight: '600' }}>
                    {cf.CCC ? cf.CCC.toFixed(0) : 'N/A'} days
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Key Insights */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Cash Flow Insights</h2>
        
        <div style={{ display: 'grid', gap: '16px' }}>
          {totalOperatingCF > 0 ? (
            <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#065f46', marginBottom: '4px' }}>✓ Positive Operating Cash Flow</div>
              <div style={{ fontSize: '13px', color: '#047857' }}>
                The company generated ${(totalOperatingCF / 1000).toFixed(0)}K in cash from operations over the last 12 months, indicating healthy operational performance.
              </div>
            </div>
          ) : (
            <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#991b1b', marginBottom: '4px' }}>⚠️ Negative Operating Cash Flow</div>
              <div style={{ fontSize: '13px', color: '#dc2626' }}>
                The company consumed ${Math.abs(totalOperatingCF / 1000).toFixed(0)}K in cash from operations, which may indicate operational challenges.
              </div>
            </div>
          )}
          
          {totalFreeCF > 0 ? (
            <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#065f46', marginBottom: '4px' }}>✓ Positive Free Cash Flow</div>
              <div style={{ fontSize: '13px', color: '#047857' }}>
                After capital expenditures, the company has ${(totalFreeCF / 1000).toFixed(0)}K in free cash flow available for growth, debt reduction, or distributions.
              </div>
            </div>
          ) : (
            <div style={{ padding: '16px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', marginBottom: '4px' }}>⚠️ Negative Free Cash Flow</div>
              <div style={{ fontSize: '13px', color: '#b45309' }}>
                Capital expenditures exceed operating cash flow by ${Math.abs(totalFreeCF / 1000).toFixed(0)}K, requiring external financing.
              </div>
            </div>
          )}
          
          {avgCashFlowMargin > 15 ? (
            <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#065f46', marginBottom: '4px' }}>✓ Strong Cash Flow Margin</div>
              <div style={{ fontSize: '13px', color: '#047857' }}>
                At {avgCashFlowMargin.toFixed(1)}%, the company is effectively converting revenue to operating cash flow, demonstrating strong operational efficiency.
              </div>
            </div>
          ) : avgCashFlowMargin > 0 ? (
            <div style={{ padding: '16px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', marginBottom: '4px' }}>⚠️ Moderate Cash Flow Margin</div>
              <div style={{ fontSize: '13px', color: '#b45309' }}>
                The cash flow margin of {avgCashFlowMargin.toFixed(1)}% suggests room for improvement in converting revenue to cash. Focus on working capital management and expense control.
              </div>
            </div>
          ) : (
            <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#991b1b', marginBottom: '4px' }}>⚠️ Negative Cash Flow Margin</div>
              <div style={{ fontSize: '13px', color: '#dc2626' }}>
                The negative cash flow margin indicates the business is consuming cash faster than generating it from revenue. Immediate attention to cash management is required.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
