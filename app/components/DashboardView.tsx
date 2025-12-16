'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useMasterData, masterDataStore } from '@/lib/master-data-store';
import { getBenchmarkValue } from '../utils/data-processing';

// Dynamic imports for charts
const LineChart = dynamic(() => import('./charts/Charts').then(mod => mod.LineChart), { ssr: false });
const BarChart = dynamic(() => import('./charts/Charts').then(mod => mod.BarChart), { ssr: false });
const AreaChart = dynamic(() => import('./charts/Charts').then(mod => mod.AreaChart), { ssr: false });

interface MonthlyData {
  date: Date;
  month: string;
  revenue: number;
  expense: number;
  cash: number;
  ar: number;
  inventory: number;
  otherCA: number;
  tca: number;
  ap: number;
  otherCL: number;
  tcl: number;
  totalAssets: number;
  totalLiab: number;
  totalEquity: number;
  cogsTotal?: number;
  cogsPayroll?: number;
  cogsOwnerPay?: number;
  cogsContractors?: number;
  cogsMaterials?: number;
  cogsCommissions?: number;
  cogsOther?: number;
  salesExpense?: number;
  rent?: number;
  infrastructure?: number;
  autoTravel?: number;
  professionalFees?: number;
  insurance?: number;
  marketing?: number;
  payroll?: number;
  ownerBasePay?: number;
  ownersRetirement?: number;
  subcontractors?: number;
  interestExpense?: number;
  depreciationAmortization?: number;
  operatingExpenseTotal?: number;
  nonOperatingIncome?: number;
  extraordinaryItems?: number;
  netProfit?: number;
  fixedAssets?: number;
  otherAssets?: number;
  ltd?: number;
  ownersCapital?: number;
  ownersDraw?: number;
  commonStock?: number;
  preferredStock?: number;
  retainedEarnings?: number;
  additionalPaidInCapital?: number;
  treasuryStock?: number;
  totalLAndE?: number;
}

interface TrendDataPoint {
  month: string;
  revenue: number;
  expense: number;
  currentRatio: number;
  quickRatio: number;
  debtToNW: number;
  roe: number;
  roa: number;
  grossMargin: number;
  ebitdaMargin: number;
  ebitMargin?: number;
  netMargin: number;
  totalAssetTO: number;
  invTO: number;
  arTO: number;
  daysAR: number;
  daysInv: number;
  daysAP: number;
  interestCov: number;
  leverage: number;
  financialScore: number;
}

interface DashboardViewProps {
  monthly: MonthlyData[];
  trendData: TrendDataPoint[];
  companyName: string;
  selectedCompanyId: string;
  selectedDashboardWidgets: string[];
  setSelectedDashboardWidgets: (widgets: string[]) => void;
  showDashboardCustomizer: boolean;
  setShowDashboardCustomizer: (show: boolean) => void;
  sdeMultiplier: number;
  ebitdaMultiplier: number;
  dcfDiscountRate: number;
  dcfTerminalGrowth: number;
  growth_24mo: number;
  benchmarks: any[];
  expenseGoals: {[key: string]: number};
}

export default function DashboardView({
  monthly,
  trendData,
  companyName,
  selectedCompanyId,
  selectedDashboardWidgets,
  setSelectedDashboardWidgets,
  showDashboardCustomizer,
  setShowDashboardCustomizer,
  sdeMultiplier,
  ebitdaMultiplier,
  dcfDiscountRate,
  dcfTerminalGrowth,
  growth_24mo,
  benchmarks,
  expenseGoals
}: DashboardViewProps) {
  
  // Get master data for dynamic expense categories
  const masterData = useMasterData(selectedCompanyId);
  const expenseCategories = masterData.data?.expenseCategories || [];

  // Clear master data cache when component mounts
  useEffect(() => {
    if (selectedCompanyId) {
      masterDataStore.clearCompanyCache(selectedCompanyId);
    }
  }, [selectedCompanyId]);
  
  return (
        <div className="dashboard-container" style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
          <style>{`
            @media print {
              @page {
                size: landscape;
                margin: 0.2in 0.4in 0.3in 0.4in;
              }
              
              /* Hide navigation and UI elements */
              .no-print,
              header,
              nav,
              aside,
              [role="navigation"],
              button {
                display: none !important;
              }
              
              /* Remove background colors and shadows */
              * {
                box-shadow: none !important;
                background: white !important;
              }
              
              /* Remove all padding from body and containers */
              body {
                padding: 0 !important;
                margin: 0 !important;
              }
              
              body > div {
                padding: 0 !important;
                margin: 0 !important;
                height: auto !important;
                overflow: visible !important;
              }
              
              body > div > div {
                padding: 0 !important;
                margin: 0 !important;
                height: auto !important;
                overflow: visible !important;
              }
              
              /* Dashboard container */
              .dashboard-container {
                padding: 0 !important;
                margin: 0 !important;
              }
              
              /* Dashboard title */
              h1 {
                font-size: 18px !important;
                margin: 0 !important;
                padding: 0 0 6px 0 !important;
                page-break-after: avoid;
              }
              
              /* Optimize grid for printing */
              .dashboard-grid {
                display: grid !important;
                grid-template-columns: repeat(2, 1fr) !important;
                gap: 8px !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              
              /* Prevent page breaks inside charts and remove all spacing */
              .dashboard-grid > div {
                page-break-inside: avoid;
                margin: 0 !important;
                padding: 8px !important;
              }
              
              /* Compact chart styling */
              .recharts-wrapper {
                max-height: 200px !important;
              }
              
              .recharts-surface {
                max-height: 180px !important;
              }
              
              /* Working Capital and Valuation containers */
              .dashboard-grid > div[style*="gridColumn"] {
                grid-column: 1 / -1 !important;
                page-break-before: auto;
                page-break-after: auto;
                padding: 8px !important;
                margin: 0 !important;
              }
              
              /* Reduce chart title size */
              .dashboard-grid h3 {
                font-size: 11px !important;
                margin: 0 0 2px 0 !important;
                padding: 0 !important;
              }
              
              /* Reduce chart text size */
              .recharts-text {
                font-size: 9px !important;
              }
            }
          `}</style>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
              Dashboard: {companyName || 'My Dashboard'}
            </h1>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="no-print"
                onClick={() => window.print()}
                style={{
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                  transition: 'all 0.3s'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                🖨️ Print Dashboard
              </button>
              <button
                className="no-print"
                onClick={() => setShowDashboardCustomizer(!showDashboardCustomizer)}
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
                  transition: 'all 0.3s'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                {showDashboardCustomizer ? 'Done Customizing' : '⚙️ Customize Dashboard'}
              </button>
            </div>
          </div>

          {/* Dashboard Customizer */}
          {showDashboardCustomizer && (
            <div style={{ 
              background: 'white', 
              borderRadius: '16px', 
              padding: '32px', 
              marginBottom: '32px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              border: '2px solid #667eea'
            }}>
              <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                🔨 Build Your Custom Dashboard
              </h2>
              <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
                Select the metrics and charts you want to see. Click on any item to add or remove it from your dashboard. Items will appear in the order selected.
              </p>

              {/* Widget Categories */}
              <div style={{ display: 'grid', gap: '24px' }}>
                
              {/* Ratios Section */}
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#667eea', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📊 Financial Ratios
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                  {/* Liquidity Ratios */}
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px', display: 'block' }}>
                      Liquidity Ratios
                    </label>
                    <select
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value && !selectedDashboardWidgets.includes(value)) {
                          setSelectedDashboardWidgets([...selectedDashboardWidgets, value]);
                        }
                        e.target.value = '';
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '2px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '14px',
                        background: 'white',
                        cursor: 'pointer',
                        color: '#1e293b'
                      }}
                    >
                      <option value="">Select a ratio...</option>
                      <option value="Current Ratio">Current Ratio</option>
                      <option value="Quick Ratio">Quick Ratio</option>
                    </select>
                  </div>

                  {/* Activity Ratios */}
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px', display: 'block' }}>
                      Activity Ratios
                    </label>
                    <select
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value && !selectedDashboardWidgets.includes(value)) {
                          setSelectedDashboardWidgets([...selectedDashboardWidgets, value]);
                        }
                        e.target.value = '';
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '2px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '14px',
                        background: 'white',
                        cursor: 'pointer',
                        color: '#1e293b'
                      }}
                    >
                      <option value="">Select a ratio...</option>
                      <option value="Days Receivables">Days' Receivables</option>
                      <option value="Days Inventory">Days' Inventory</option>
                      <option value="Days Payables">Days' Payables</option>
                      <option value="Inventory Turnover">Inventory Turnover</option>
                      <option value="Receivables Turnover">Receivables Turnover</option>
                      <option value="Payables Turnover">Payables Turnover</option>
                      <option value="Sales/Working Capital">Sales/Working Capital</option>
                    </select>
                  </div>

                  {/* Coverage Ratios */}
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px', display: 'block' }}>
                      Coverage Ratios
                    </label>
                    <select
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value && !selectedDashboardWidgets.includes(value)) {
                          setSelectedDashboardWidgets([...selectedDashboardWidgets, value]);
                        }
                        e.target.value = '';
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '2px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '14px',
                        background: 'white',
                        cursor: 'pointer',
                        color: '#1e293b'
                      }}
                    >
                      <option value="">Select a ratio...</option>
                      <option value="Interest Coverage">Interest Coverage</option>
                      <option value="Debt Service Coverage">Debt Service Coverage</option>
                      <option value="Cash Flow to Debt">Cash Flow to Debt</option>
                    </select>
                  </div>

                  {/* Leverage Ratios */}
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px', display: 'block' }}>
                      Leverage Ratios
                    </label>
                    <select
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value && !selectedDashboardWidgets.includes(value)) {
                          setSelectedDashboardWidgets([...selectedDashboardWidgets, value]);
                        }
                        e.target.value = '';
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '2px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '14px',
                        background: 'white',
                        cursor: 'pointer',
                        color: '#1e293b'
                      }}
                    >
                      <option value="">Select a ratio...</option>
                      <option value="Debt/Net Worth">Debt/Net Worth</option>
                      <option value="Fixed Assets/Net Worth">Fixed Assets/Net Worth</option>
                      <option value="Leverage Ratio">Leverage Ratio</option>
                    </select>
                  </div>

                  {/* Operating Ratios */}
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px', display: 'block' }}>
                      Operating Ratios
                    </label>
                    <select
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value && !selectedDashboardWidgets.includes(value)) {
                          setSelectedDashboardWidgets([...selectedDashboardWidgets, value]);
                        }
                        e.target.value = '';
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '2px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '14px',
                        background: 'white',
                        cursor: 'pointer',
                        color: '#1e293b'
                      }}
                    >
                      <option value="">Select a ratio...</option>
                      <option value="ROA">Return on Assets (ROA)</option>
                      <option value="ROE">Return on Equity (ROE)</option>
                      <option value="Total Asset Turnover">Total Asset Turnover</option>
                      <option value="EBITDA Margin">EBITDA Margin</option>
                      <option value="EBIT Margin">EBIT Margin</option>
                    </select>
                  </div>
                </div>

                {/* Display selected ratios */}
                {selectedDashboardWidgets.filter(w => 
                  ['Current Ratio', 'Quick Ratio', 'Days Receivables', 'Days Inventory', 'Days Payables', 'Inventory Turnover', 'Receivables Turnover', 'Payables Turnover', 'Sales/Working Capital', 'Interest Coverage', 'Debt Service Coverage', 'Cash Flow to Debt', 'Debt/Net Worth', 'Fixed Assets/Net Worth', 'Leverage Ratio', 'ROA', 'ROE', 'Total Asset Turnover', 'EBITDA Margin', 'EBIT Margin'].includes(w)
                ).length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Selected Ratios:</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {selectedDashboardWidgets.filter(w => 
                        ['Current Ratio', 'Quick Ratio', 'Days Receivables', 'Days Inventory', 'Days Payables', 'Inventory Turnover', 'Receivables Turnover', 'Payables Turnover', 'Sales/Working Capital', 'Interest Coverage', 'Debt Service Coverage', 'Cash Flow to Debt', 'Debt/Net Worth', 'Fixed Assets/Net Worth', 'Leverage Ratio', 'ROA', 'ROE', 'Total Asset Turnover', 'EBITDA Margin', 'EBIT Margin'].includes(w)
                      ).map(widget => (
                        <div
                          key={widget}
                          style={{
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: 'white',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          <span>{widget}</span>
                          <button
                            onClick={() => setSelectedDashboardWidgets(selectedDashboardWidgets.filter(w => w !== widget))}
                            style={{
                              background: 'rgba(255,255,255,0.2)',
                              border: 'none',
                              color: 'white',
                              cursor: 'pointer',
                              borderRadius: '50%',
                              width: '18px',
                              height: '18px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              padding: 0
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

                {/* Trend Analysis Section */}
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#667eea', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📈 Trend Analysis
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    {/* Item Trends Dropdown */}
                    <div>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px', display: 'block' }}>
                        Item Trends
                      </label>
                      <select
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value && !selectedDashboardWidgets.includes(value)) {
                            setSelectedDashboardWidgets([...selectedDashboardWidgets, value]);
                          }
                          e.target.value = '';
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '2px solid #e2e8f0',
                          borderRadius: '8px',
                          fontSize: '14px',
                          background: 'white',
                          cursor: 'pointer',
                          color: '#1e293b'
                        }}
                      >
                        <option value="">Select an item...</option>
                        <option value="Revenue">Revenue</option>
                        <option value="Gross Profit">Gross Profit</option>
                        <option value="Total Operating Expenses">Total Operating Expenses</option>
                        <option value="EBIT">EBIT</option>
                        <option value="EBITDA">EBITDA</option>
                        <option value="Net Income">Net Income</option>
                        <option value="Cash">Cash</option>
                        <option value="Current Assets">Current Assets</option>
                        <option value="Fixed Assets">Fixed Assets</option>
                        <option value="Total Assets">Total Assets</option>
                        <option value="Accounts Payable">Accounts Payable</option>
                        <option value="Long Term Debt">Long Term Debt</option>
                        <option value="Total Equity">Total Equity</option>
                      </select>
                    </div>

                    {/* Expense Analysis Dropdown */}
                    <div>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px', display: 'block' }}>
                        Expense Analysis (% of Revenue)
                      </label>
                      <select
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value && !selectedDashboardWidgets.includes(value)) {
                            setSelectedDashboardWidgets([...selectedDashboardWidgets, value]);
                          }
                          e.target.value = '';
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '2px solid #e2e8f0',
                          borderRadius: '8px',
                          fontSize: '14px',
                          background: 'white',
                          cursor: 'pointer',
                          color: '#1e293b'
                        }}
                      >
                        <option value="">Select an expense...</option>
                        {expenseCategories.map(category => (
                          <option key={category.key} value={`Expense % - ${category.label}`}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Display selected trend analysis items */}
                  {selectedDashboardWidgets.filter(w => 
                    ['Revenue', 'Gross Profit', 'Total Operating Expenses', 'EBIT', 'EBITDA', 'Net Income',
                     'Cash', 'Current Assets', 'Fixed Assets', 'Total Assets', 'Accounts Payable', 'Long Term Debt', 'Total Equity'].includes(w) ||
                     w.startsWith('Expense % - ')
                  ).length > 0 && (
                    <div style={{ marginTop: '16px' }}>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Selected Trend Items:</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {selectedDashboardWidgets.filter(w => 
                          ['Revenue', 'Gross Profit', 'Total Operating Expenses', 'EBIT', 'EBITDA', 'Net Income',
                           'Cash', 'Current Assets', 'Fixed Assets', 'Total Assets', 'Accounts Payable', 'Long Term Debt', 'Total Equity'].includes(w) ||
                           w.startsWith('Expense % - ')
                        ).map(widget => (
                          <div
                            key={widget}
                            style={{
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              color: 'white',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              fontSize: '13px',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                          >
                            <span>{widget}</span>
                            <button
                              onClick={() => setSelectedDashboardWidgets(selectedDashboardWidgets.filter(w => w !== widget))}
                              style={{
                                background: 'rgba(255,255,255,0.2)',
                                border: 'none',
                                color: 'white',
                                cursor: 'pointer',
                                borderRadius: '50%',
                                width: '18px',
                                height: '18px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                padding: 0
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Working Capital Metrics */}
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#667eea', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    💼 Working Capital Metrics
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                    {['Current Working Capital', 'Working Capital Ratio', 'Days Working Capital', 'Cash Conversion Cycle', 'Working Capital Trend'].map(widget => (
                      <div
                        key={widget}
                        onClick={() => {
                          if (selectedDashboardWidgets.includes(widget)) {
                            setSelectedDashboardWidgets(selectedDashboardWidgets.filter(w => w !== widget));
                          } else {
                            setSelectedDashboardWidgets([...selectedDashboardWidgets, widget]);
                          }
                        }}
                        style={{
                          background: selectedDashboardWidgets.includes(widget) ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f8fafc',
                          color: selectedDashboardWidgets.includes(widget) ? 'white' : '#1e293b',
                          padding: '16px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          border: selectedDashboardWidgets.includes(widget) ? '2px solid #667eea' : '2px solid #e2e8f0',
                          transition: 'all 0.3s',
                          fontWeight: '600',
                          fontSize: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span>{widget}</span>
                        <span>{selectedDashboardWidgets.includes(widget) ? '✓' : '+'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cash Flow Metrics */}
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#667eea', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    💰 Cash Flow
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                    {['Operating Cash Flow', 'Free Cash Flow', 'Cash Position'].map(widget => (
                      <div
                        key={widget}
                        onClick={() => {
                          if (selectedDashboardWidgets.includes(widget)) {
                            setSelectedDashboardWidgets(selectedDashboardWidgets.filter(w => w !== widget));
                          } else {
                            setSelectedDashboardWidgets([...selectedDashboardWidgets, widget]);
                          }
                        }}
                        style={{
                          background: selectedDashboardWidgets.includes(widget) ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f8fafc',
                          color: selectedDashboardWidgets.includes(widget) ? 'white' : '#1e293b',
                          padding: '16px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          border: selectedDashboardWidgets.includes(widget) ? '2px solid #667eea' : '2px solid #e2e8f0',
                          transition: 'all 0.3s',
                          fontWeight: '600',
                          fontSize: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span>{widget}</span>
                        <span>{selectedDashboardWidgets.includes(widget) ? '✓' : '+'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Valuation Metrics */}
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#667eea', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    💎 Valuation Metrics
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                    {['SDE Valuation', 'EBITDA Valuation', 'DCF Valuation'].map(widget => (
                      <div
                        key={widget}
                        onClick={() => {
                          if (selectedDashboardWidgets.includes(widget)) {
                            setSelectedDashboardWidgets(selectedDashboardWidgets.filter(w => w !== widget));
                          } else {
                            setSelectedDashboardWidgets([...selectedDashboardWidgets, widget]);
                          }
                        }}
                        style={{
                          background: selectedDashboardWidgets.includes(widget) ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f8fafc',
                          color: selectedDashboardWidgets.includes(widget) ? 'white' : '#1e293b',
                          padding: '16px',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          border: selectedDashboardWidgets.includes(widget) ? '2px solid #667eea' : '2px solid #e2e8f0',
                          transition: 'all 0.3s',
                          fontWeight: '600',
                          fontSize: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span>{widget}</span>
                        <span>{selectedDashboardWidgets.includes(widget) ? '✓' : '+'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '24px', textAlign: 'center' }}>
                <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px' }}>
                  {selectedDashboardWidgets.length === 0 ? 'No widgets selected. Click items above to add them.' : `${selectedDashboardWidgets.length} widget${selectedDashboardWidgets.length === 1 ? '' : 's'} selected`}
                </p>
                {selectedDashboardWidgets.length > 0 && (
                  <button
                    onClick={() => setSelectedDashboardWidgets([])}
                    style={{
                      background: 'white',
                      color: '#ef4444',
                      border: '2px solid #ef4444',
                      padding: '10px 20px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.3s'
                    }}
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Display Selected Widgets */}
          {selectedDashboardWidgets.length === 0 && !showDashboardCustomizer ? (
            <div style={{
              background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
              borderRadius: '16px',
              padding: '80px 32px',
              textAlign: 'center',
              border: '2px dashed #cbd5e1'
            }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>📊</div>
              <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>
                Your Dashboard is Empty
              </h3>
              <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '24px', maxWidth: '500px', margin: '0 auto 24px' }}>
                Click the "Customize Dashboard" button above to select metrics and charts you'd like to track.
              </p>
              <button
                onClick={() => setShowDashboardCustomizer(true)}
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '14px 32px',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                }}
              >
                Get Started
              </button>
            </div>
          ) : (
            <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
              {/* Render widgets in user-selected order */}
              {(() => {
                const renderedWCWidgets = new Set();
                const renderedValuationWidgets = new Set();
                const wcWidgetsList = ['Current Working Capital', 'Working Capital Ratio', 'Days Working Capital', 'Cash Conversion Cycle'];
                const valuationWidgetsList = ['SDE Valuation', 'EBITDA Valuation', 'DCF Valuation'];
                
          const renderedWidgets = selectedDashboardWidgets.map((widget, index) => {
                  
                  // Check if this is a Working Capital widget
                  if (wcWidgetsList.includes(widget)) {
                    // If we've already rendered WC widgets, skip
                    if (renderedWCWidgets.size > 0) {
                      return null;
                    }
                    
                    // Mark all WC widgets as rendered
                    wcWidgetsList.forEach(w => renderedWCWidgets.add(w));
                    
                    // Get all selected WC widgets
                    const wcWidgets = selectedDashboardWidgets.filter(w => wcWidgetsList.includes(w));
                    
                  // Calculate working capital data
                  const wcData = monthly.map(m => {
                    const ca = m.tca || ((m.cash || 0) + (m.ar || 0) + (m.inventory || 0) + (m.otherCA || 0));
                    const cl = m.tcl || ((m.ap || 0) + (m.otherCL || 0));
                    return {
                      month: m.month,
                      currentAssets: ca,
                      currentLiabilities: cl,
                      workingCapital: ca - cl,
                      revenue: m.revenue
                    };
                  });
                  
                  const current = wcData[wcData.length - 1];
                  const prior = wcData.length >= 13 ? wcData[wcData.length - 13] : wcData[0];
                  const currentWC = current.workingCapital;
                  const wcRatio = current.currentLiabilities !== 0 ? current.currentAssets / current.currentLiabilities : 0;
                  const wcChange = currentWC - prior.workingCapital;
                  const wcChangePercent = prior.workingCapital !== 0 ? (wcChange / Math.abs(prior.workingCapital)) * 100 : 0;
                  
                  const last12Months = monthly.slice(-12);
                  const annualRevenue = last12Months.reduce((sum, m) => sum + m.revenue, 0);
                  const dailyRevenue = annualRevenue / 365;
                  const daysWC = dailyRevenue !== 0 ? currentWC / dailyRevenue : 0;
                  
                  const daysAR = current.revenue !== 0 ? (current.currentAssets * 0.4 / (current.revenue * 12)) * 365 : 0;
                  const daysAP = current.revenue !== 0 ? (current.currentLiabilities * 0.6 / (current.revenue * 12 * 0.7)) * 365 : 0;
                  const daysInventory = current.revenue !== 0 ? (current.currentAssets * 0.2 / (current.revenue * 12 * 0.7)) * 365 : 0;
                  const cashConversionCycle = daysAR + daysInventory - daysAP;
                  
                  return (
                    <div key="wc-metrics" style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px', justifyContent: 'flex-start' }}>
                      {wcWidgets.includes('Current Working Capital') && (
                        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea', minWidth: '200px' }}>
                          <h3 style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Current Working Capital</h3>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: '#667eea', marginBottom: '4px' }}>
                            ${(currentWC / 1000).toFixed(0)}K
                          </div>
                          <div style={{ fontSize: '11px', color: wcChange >= 0 ? '#10b981' : '#ef4444', fontWeight: '600' }}>
                            {wcChange >= 0 ? '?' : '?'} ${Math.abs(wcChange / 1000).toFixed(0)}K ({wcChangePercent >= 0 ? '+' : ''}{wcChangePercent.toFixed(1)}%)
                          </div>
                        </div>
                      )}
                      
                      {wcWidgets.includes('Working Capital Ratio') && (
                        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea', minWidth: '200px' }}>
                          <h3 style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Working Capital Ratio</h3>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: wcRatio >= 1.5 ? '#10b981' : wcRatio >= 1.0 ? '#f59e0b' : '#ef4444', marginBottom: '4px' }}>
                            {wcRatio.toFixed(2)}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {wcRatio >= 1.5 ? 'Strong' : wcRatio >= 1.0 ? 'Adequate' : 'Needs Attention'}
                          </div>
                        </div>
                      )}
                      
                      {wcWidgets.includes('Days Working Capital') && (
                        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea', minWidth: '200px' }}>
                          <h3 style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Days Working Capital</h3>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                            {daysWC.toFixed(0)}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            Days of revenue covered
                          </div>
                        </div>
                      )}
                      
                      {wcWidgets.includes('Cash Conversion Cycle') && (
                        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea', minWidth: '200px' }}>
                          <h3 style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Cash Conversion Cycle</h3>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                            {cashConversionCycle.toFixed(0)}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            Days (estimated)
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
                  
                  // Check if this is a Valuation widget
                  if (valuationWidgetsList.includes(widget)) {
                    // If we've already rendered valuation widgets, skip
                    if (renderedValuationWidgets.size > 0) {
                return null;
                    }
                    
                    // Mark all valuation widgets as rendered
                    valuationWidgetsList.forEach(w => renderedValuationWidgets.add(w));
                    
                    // Get all selected valuation widgets
                    const selectedValuationWidgets = selectedDashboardWidgets.filter(w => valuationWidgetsList.includes(w));
                    
                    // Calculate all valuations
                    const last12 = monthly.slice(-12);
                    const ttmRevenue = last12.reduce((sum, m) => sum + (m.revenue || 0), 0);
                    const ttmCOGS = last12.reduce((sum, m) => sum + (m.cogsTotal || 0), 0);
                    const ttmExpense = last12.reduce((sum, m) => sum + (m.expense || 0), 0);
                    const ttmDepreciation = last12.reduce((sum, m) => sum + (m.depreciationAmortization || 0), 0);
                    const ttmInterest = last12.reduce((sum, m) => sum + (m.interestExpense || 0), 0);
                    const ttmNetIncome = ttmRevenue - ttmCOGS - ttmExpense;
                    const ttmEBITDA = ttmNetIncome + ttmDepreciation + ttmInterest;
                    const ttmOwnerBasePay = last12.reduce((sum, m) => sum + (m.ownerBasePay || 0), 0);
                    const ttmSDE = ttmEBITDA + ttmOwnerBasePay;
                    const sdeValuation = ttmSDE * sdeMultiplier;
                    const ebitdaValuation = ttmEBITDA * ebitdaMultiplier;
                    
                    // DCF calculation
                    const currentMonth = monthly[monthly.length - 1];
                    const month12Ago = monthly.length >= 13 ? monthly[monthly.length - 13] : monthly[0];
                    const currentWC_val = ((currentMonth.cash || 0) + (currentMonth.ar || 0) + (currentMonth.inventory || 0)) - ((currentMonth.ap || 0) + (currentMonth.otherCL || 0));
                    const priorWC = ((month12Ago.cash || 0) + (month12Ago.ar || 0) + (month12Ago.inventory || 0)) - ((month12Ago.ap || 0) + (month12Ago.otherCL || 0));
                    const changeInWC = currentWC_val - priorWC;
                    const changeInFixedAssets = (currentMonth.fixedAssets || 0) - (month12Ago.fixedAssets || 0);
                    const ttmCapEx = Math.max(0, changeInFixedAssets + ttmDepreciation);
                    const ttmFreeCashFlow = ttmNetIncome + ttmDepreciation - changeInWC - ttmCapEx;
                    const growthRate = growth_24mo / 100;
                    const discountRate = dcfDiscountRate / 100;
                    const terminalGrowthRate = dcfTerminalGrowth / 100;
                    let dcfValue = 0;
                    for (let year = 1; year <= 5; year++) {
                      const projectedFCF = ttmFreeCashFlow * Math.pow(1 + growthRate, year);
                      dcfValue += projectedFCF / Math.pow(1 + discountRate, year);
                    }
                    const terminalValue = (ttmFreeCashFlow * Math.pow(1 + growthRate, 5) * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate);
                    dcfValue += terminalValue / Math.pow(1 + discountRate, 5);
                    
                    // Render container with all selected valuation widgets
                    return (
                      <div key="valuation-container" style={{ 
                        background: 'white', 
                        borderRadius: '12px', 
                        padding: '20px', 
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                        gridColumn: '1 / -1'
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${selectedValuationWidgets.length}, 1fr)`, gap: '16px' }}>
                          {selectedValuationWidgets.includes('SDE Valuation') && (
                            <div style={{ padding: '20px', borderRadius: '8px', border: '2px solid #10b981' }}>
                              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>SDE Valuation</h3>
                              <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981', marginBottom: '8px' }}>
                                ${(sdeValuation / 1000000).toFixed(2)}M
                              </div>
                              <div style={{ fontSize: '12px', color: '#64748b' }}>
                                SDE: ${(ttmSDE / 1000).toFixed(0)}K × {sdeMultiplier.toFixed(1)}x
                              </div>
                            </div>
                          )}
                          
                          {selectedValuationWidgets.includes('EBITDA Valuation') && (
                            <div style={{ padding: '20px', borderRadius: '8px', border: '2px solid #06b6d4' }}>
                              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>EBITDA Valuation</h3>
                              <div style={{ fontSize: '32px', fontWeight: '700', color: '#06b6d4', marginBottom: '8px' }}>
                                ${(ebitdaValuation / 1000000).toFixed(2)}M
                              </div>
                              <div style={{ fontSize: '12px', color: '#64748b' }}>
                                EBITDA: ${(ttmEBITDA / 1000).toFixed(0)}K × {ebitdaMultiplier.toFixed(1)}x
                              </div>
                            </div>
                          )}
                          
                          {selectedValuationWidgets.includes('DCF Valuation') && (
                            <div style={{ padding: '20px', borderRadius: '8px', border: '2px solid #8b5cf6' }}>
                              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>DCF Valuation</h3>
                              <div style={{ fontSize: '32px', fontWeight: '700', color: '#8b5cf6', marginBottom: '8px' }}>
                                ${(dcfValue / 1000000).toFixed(2)}M
                              </div>
                              <div style={{ fontSize: '12px', color: '#64748b' }}>
                                5-year projection at {dcfDiscountRate}% discount
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  
                  // Render all other widgets normally
                  return (() => {
                // Render appropriate chart based on widget name
                if (widget === 'Current Ratio') {
                  return <LineChart key={widget} title="Current Ratio" data={trendData} valueKey="currentRatio" color="#10b981" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Current Ratio')} formatter={(v) => v.toFixed(1)} />;
                }
                if (widget === 'Quick Ratio') {
                  return <LineChart key={widget} title="Quick Ratio" data={trendData} valueKey="quickRatio" color="#14b8a6" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Quick Ratio')} formatter={(v) => v.toFixed(1)} />;
                }
                if (widget === 'Debt/Net Worth') {
                  return <LineChart key={widget} title="Debt/Net Worth" data={trendData} valueKey="debtToNW" color="#ec4899" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Debt/Net Worth')} formatter={(v) => v.toFixed(1)} />;
                }
                if (widget === 'ROA') {
                  return <LineChart key={widget} title="Return on Assets (ROA)" data={trendData} valueKey="roa" color="#93c5fd" compact benchmarkValue={getBenchmarkValue(benchmarks, 'ROA')} formatter={(v) => (v * 100).toFixed(1) + '%'} />;
                }
                if (widget === 'ROE') {
                  return <LineChart key={widget} title="Return on Equity (ROE)" data={trendData} valueKey="roe" color="#60a5fa" compact benchmarkValue={getBenchmarkValue(benchmarks, 'ROE')} formatter={(v) => (v * 100).toFixed(1) + '%'} />;
                }
                if (widget === 'Interest Coverage') {
                  return <LineChart key={widget} title="Interest Coverage" data={trendData} valueKey="interestCov" color="#8b5cf6" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Interest Coverage')} formatter={(v) => v.toFixed(1)} />;
                }
                // Additional Activity Ratios
                if (widget === 'Inventory Turnover') {
                  return <LineChart key={widget} title="Inventory Turnover" data={trendData} valueKey="invTurnover" color="#f59e0b" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Inventory Turnover')} formatter={(v) => v.toFixed(1)} />;
                }
                if (widget === 'Receivables Turnover') {
                  return <LineChart key={widget} title="Receivables Turnover" data={trendData} valueKey="arTurnover" color="#f97316" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Receivables Turnover')} formatter={(v) => v.toFixed(1)} />;
                }
                if (widget === 'Payables Turnover') {
                  return <LineChart key={widget} title="Payables Turnover" data={trendData} valueKey="apTurnover" color="#ef4444" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Payables Turnover')} formatter={(v) => v.toFixed(1)} />;
                }
                if (widget === 'Sales/Working Capital') {
                  return <LineChart key={widget} title="Sales/Working Capital" data={trendData} valueKey="salesWC" color="#06b6d4" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Sales/Working Capital')} formatter={(v) => v.toFixed(1)} />;
                }
                // Additional Coverage Ratios
                if (widget === 'Debt Service Coverage') {
                  return <LineChart key={widget} title="Debt Service Coverage" data={trendData} valueKey="debtSvcCov" color="#a78bfa" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Debt Service Coverage')} formatter={(v) => v.toFixed(1)} />;
                }
                if (widget === 'Cash Flow to Debt') {
                  return <LineChart key={widget} title="Cash Flow to Debt" data={trendData} valueKey="cfToDebt" color="#c4b5fd" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Cash Flow to Debt')} formatter={(v) => v.toFixed(1)} />;
                }
                // Additional Leverage Ratios
                if (widget === 'Fixed Assets/Net Worth') {
                  return <LineChart key={widget} title="Fixed Assets/Net Worth" data={trendData} valueKey="fixedToNW" color="#f472b6" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Fixed Assets/Net Worth')} formatter={(v) => v.toFixed(1)} />;
                }
                if (widget === 'Leverage Ratio') {
                  return <LineChart key={widget} title="Leverage Ratio" data={trendData} valueKey="leverage" color="#f9a8d4" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Leverage Ratio')} formatter={(v) => v.toFixed(1)} />;
                }
                // Additional Operating Ratios
                if (widget === 'Total Asset Turnover') {
                  return <LineChart key={widget} title="Total Asset Turnover" data={trendData} valueKey="totalAssetTO" color="#3b82f6" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Total Asset Turnover')} formatter={(v) => v.toFixed(1)} />;
                }
                if (widget === 'EBITDA Margin') {
                  const ebitdaBM = getBenchmarkValue(benchmarks, 'EBITDA/Revenue');
                  return <LineChart key={widget} title="EBITDA Margin" data={trendData} valueKey="ebitdaMargin" color="#2563eb" compact yMax={0.5} benchmarkValue={ebitdaBM !== null ? ebitdaBM / 100 : null} formatter={(v) => (v * 100).toFixed(1) + '%'} />;
                }
                if (widget === 'EBIT Margin') {
                  const ebitBM = getBenchmarkValue(benchmarks, 'EBIT/Revenue');
                  return <LineChart key={widget} title="EBIT Margin" data={trendData} valueKey="ebitMargin" color="#1e40af" compact yMax={0.5} benchmarkValue={ebitBM !== null ? ebitBM / 100 : null} formatter={(v) => (v * 100).toFixed(1) + '%'} />;
                }
                // Note: Revenue Trend, Expense Trend, Net Profit Trend, and Gross Margin Trend widgets
                // have been replaced with the Trend Analysis dropdown selections
                
                // Handle new Trend Analysis fields (matching TrendAnalysisView)
                if (widget === 'Revenue') {
                  return <LineChart key={widget} title="Revenue" data={monthly.map(m => ({ month: m.month, value: m.revenue || 0 }))} color="#10b981" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'Gross Profit') {
                  return <LineChart key={widget} title="Gross Profit" data={monthly.map(m => ({ month: m.month, value: (m.revenue || 0) - (m.cogsTotal || 0) }))} color="#3b82f6" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'Total Operating Expenses') {
                  return <LineChart key={widget} title="Total Operating Expenses" data={monthly.map(m => ({ month: m.month, value: m.expense || 0 }))} color="#ef4444" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'EBIT') {
                  return <LineChart key={widget} title="EBIT" data={monthly.map(m => {
                    const grossProfit = (m.revenue || 0) - (m.cogsTotal || 0);
                    return { month: m.month, value: grossProfit - (m.expense || 0) };
                  })} color="#8b5cf6" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'EBITDA') {
                  return <LineChart key={widget} title="EBITDA" data={monthly.map(m => {
                    const grossProfit = (m.revenue || 0) - (m.cogsTotal || 0);
                    const ebit = grossProfit - (m.expense || 0);
                    const depreciation = m.depreciationAmortization || 0;
                    return { month: m.month, value: ebit + depreciation };
                  })} color="#f59e0b" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'Net Income') {
                  return <LineChart key={widget} title="Net Income" data={monthly.map(m => ({ month: m.month, value: m.netProfit || ((m.revenue || 0) - (m.cogsTotal || 0) - (m.expense || 0)) }))} color="#06b6d4" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'Cash') {
                  return <LineChart key={widget} title="Cash" data={monthly.map(m => ({ month: m.month, value: m.cash || 0 }))} color="#84cc16" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'Current Assets') {
                  return <LineChart key={widget} title="Current Assets" data={monthly.map(m => ({ month: m.month, value: m.tca || ((m.cash || 0) + (m.ar || 0) + (m.inventory || 0) + (m.otherCA || 0)) }))} color="#5eead4" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'Fixed Assets') {
                  return <LineChart key={widget} title="Fixed Assets" data={monthly.map(m => ({ month: m.month, value: m.fixedAssets || 0 }))} color="#a78bfa" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'Total Assets') {
                  return <LineChart key={widget} title="Total Assets" data={monthly.map(m => ({ month: m.month, value: m.totalAssets || 0 }))} color="#f97316" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'Accounts Payable') {
                  return <LineChart key={widget} title="Accounts Payable" data={monthly.map(m => ({ month: m.month, value: m.ap || 0 }))} color="#ec4899" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'Long Term Debt') {
                  return <LineChart key={widget} title="Long Term Debt" data={monthly.map(m => ({ month: m.month, value: m.ltd || 0 }))} color="#64748b" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'Total Equity') {
                  return <LineChart key={widget} title="Total Equity" data={monthly.map(m => ({ month: m.month, value: m.totalEquity || 0 }))} color="#10b981" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                
                // Handle old Item Trends from dropdown (legacy field names - kept for backwards compatibility)
                const itemTrendFields = ['revenue', 'expense', 'cogsTotal', 'cogsPayroll', 'cogsOwnerPay', 'cogsContractors', 
                  'cogsMaterials', 'cogsCommissions', 'cogsOther', 'salesExpense', 'rent', 'utilities', 'equipment', 
                  'travel', 'professionalFees', 'insurance', 'marketing', 'payroll', 'ownerBasePay', 'ownersRetirement', 
                  'subcontractors', 'interestExpense', 'depreciationAmortization', 'operatingExpenseTotal', 'nonOperatingIncome', 
                  'extraordinaryItems', 'netProfit', 'totalAssets', 'cash', 'ar', 'inventory', 'otherCA', 'tca', 'fixedAssets', 
                  'otherAssets', 'totalLiab', 'ap', 'otherCL', 'tcl', 'ltd', 'totalEquity'];
                
                if (itemTrendFields.includes(widget)) {
                  const title = getTrendItemDisplayName(widget);
                  const isCurrency = !['totalEquity', 'totalLiab', 'totalAssets'].includes(widget) || widget.includes('revenue') || widget.includes('expense') || widget.includes('profit');
                  return (
                    <LineChart 
                      key={widget} 
                      title={title} 
                      data={monthly.map(m => ({ month: m.month, value: m[widget as keyof typeof m] as number || 0 }))} 
                      color="#667eea" 
                      compact 
                      formatter={(v) => isCurrency ? '$' + (v / 1000).toFixed(0) + 'k' : v.toFixed(0)} 
                    />
                  );
                }
                
                // Handle Expense Analysis (% of Revenue) from dropdown
                if (widget.startsWith('Expense % - ')) {
                  const expenseName = widget.replace('Expense % - ', '');
                  
                  // Find the matching expense category from master data
                  const expenseCategory = expenseCategories.find(cat => cat.label === expenseName);
                  
                  if (expenseCategory) {
                    const fieldKey = expenseCategory.key;
                    const expensePercentData = monthly.map(m => ({
                      month: m.month,
                      value: m.revenue > 0 ? ((m[fieldKey as keyof typeof m] as number || 0) / m.revenue * 100) : 0
                    }));
                    
                    // Get goal line data if available
                    const goalLineData = expenseGoals[fieldKey] ? monthly.map(() => expenseGoals[fieldKey]) : undefined;
                    
                    return (
                      <LineChart 
                        key={widget} 
                        title={`${expenseName} (% of Revenue)`}
                        data={expensePercentData} 
                        color="#ef4444" 
                        compact 
                        formatter={(v) => v.toFixed(1) + '%'}
                        goalLineData={goalLineData}
                      />
                    );
                  }
                }
                
                if (widget === 'Days Receivables') {
                  return <LineChart key={widget} title="Days' Receivables" data={trendData} valueKey="daysAR" color="#fb923c" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Days Receivables')} formatter={(v) => v.toFixed(0)} />;
                }
                if (widget === 'Days Inventory') {
                  return <LineChart key={widget} title="Days' Inventory" data={trendData} valueKey="daysInv" color="#fbbf24" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Days Inventory')} formatter={(v) => v.toFixed(0)} />;
                }
                if (widget === 'Days Payables') {
                  return <LineChart key={widget} title="Days' Payables" data={trendData} valueKey="daysAP" color="#f87171" compact benchmarkValue={getBenchmarkValue(benchmarks, 'Days Payables')} formatter={(v) => v.toFixed(0)} />;
                }
                if (widget === 'Operating Cash Flow') {
                  const ocfData = monthly.map(m => ({
                    month: m.month,
                    value: (m.netProfit || ((m.revenue || 0) - (m.cogsTotal || 0) - (m.expense || 0))) + (m.depreciationAmortization || 0)
                  }));
                  return <LineChart key={widget} title="Operating Cash Flow" data={ocfData} color="#10b981" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'Free Cash Flow') {
                  const fcfData = monthly.map((m, idx) => {
                    const netProfit = m.netProfit || ((m.revenue || 0) - (m.cogsTotal || 0) - (m.expense || 0));
                    const depreciation = m.depreciationAmortization || 0;
                    const ocf = netProfit + depreciation;
                    // Estimate capex as change in fixed assets
                    const capex = idx > 0 ? Math.max(0, (m.fixedAssets || 0) - (monthly[idx - 1].fixedAssets || 0)) : 0;
                    return {
                      month: m.month,
                      value: ocf - capex
                    };
                  });
                  return <LineChart key={widget} title="Free Cash Flow" data={fcfData} color="#06b6d4" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'Cash Position') {
                  const cashData = monthly.map(m => ({
                    month: m.month,
                    value: m.cash || 0
                  }));
                  return <LineChart key={widget} title="Cash Position" data={cashData} color="#f59e0b" compact formatter={(v) => '$' + (v / 1000).toFixed(0) + 'K'} />;
                }
                if (widget === 'Working Capital Trend') {
                  // Holt-Winters Exponential Smoothing with Seasonality
                  const holtWintersProjection = (data: number[], seasons: number = 12, periods: number = 12) => {
                    if (data.length < seasons * 2) return [];
                    
                    // Initialize parameters
                    const alpha = 0.3; // Level smoothing
                    const beta = 0.1;  // Trend smoothing
                    const gamma = 0.3; // Seasonal smoothing
                    
                    // Initial values
                    let level = data.slice(0, seasons).reduce((a, b) => a + b) / seasons;
                    let trend = 0;
                    const seasonal: number[] = [];
                    
                    // Initialize seasonal factors
                    for (let i = 0; i < seasons; i++) {
                      seasonal[i] = data[i] / level;
                    }
                    
                    // Fit the model
                    for (let i = seasons; i < data.length; i++) {
                      const oldLevel = level;
                      const seasonalIndex = i % seasons;
                      
                      level = alpha * (data[i] / seasonal[seasonalIndex]) + (1 - alpha) * (oldLevel + trend);
                      trend = beta * (level - oldLevel) + (1 - beta) * trend;
                      seasonal[seasonalIndex] = gamma * (data[i] / level) + (1 - gamma) * seasonal[seasonalIndex];
                    }
                    
                    // Generate forecasts
                    const forecasts: number[] = [];
                    for (let i = 0; i < periods; i++) {
                      const seasonalIndex = (data.length + i) % seasons;
                      forecasts.push((level + (i + 1) * trend) * seasonal[seasonalIndex]);
                    }
                    
                    return forecasts;
                  };
                  
                  // Calculate historical working capital
                  const wcHistorical = monthly.map(m => {
                    const ca = m.tca || ((m.cash || 0) + (m.ar || 0) + (m.inventory || 0) + (m.otherCA || 0));
                    const cl = m.tcl || ((m.ap || 0) + (m.otherCL || 0));
                    return {
                      month: m.month,
                      value: ca - cl,
                      tca: ca,
                      tcl: cl
                    };
                  });
                  
                  // Use last 36 months (3 years) for projection if available
                  const historicalData = wcHistorical.slice(-36);
                  
                  // Extract TCA and TCL arrays
                  const tcaValues = historicalData.map(d => d.tca);
                  const tclValues = historicalData.map(d => d.tcl);
                  
                  // Project TCA and TCL separately
                  const tcaProjections = holtWintersProjection(tcaValues, 12, 12);
                  const tclProjections = holtWintersProjection(tclValues, 12, 12);
                  
                  // Calculate projected working capital
                  const wcProjections = tcaProjections.map((tca, i) => tca - tclProjections[i]);
                  
                  // Generate month labels for projections
                  // Format month helper
                  const formatMonth = (monthValue: any): string => {
                    if (!monthValue) return '';
                    if (typeof monthValue === 'string' && /^\d{2}-\d{4}$/.test(monthValue)) {
                      return monthValue;
                    }
                    const date = monthValue instanceof Date ? monthValue : new Date(monthValue);
                    if (isNaN(date.getTime())) return String(monthValue);
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    return `${month}-${year}`;
                  };
                  
                  // Get last month date
                  const lastMonthValue = historicalData[historicalData.length - 1].month;
                  const lastMonth = lastMonthValue instanceof Date ? lastMonthValue : new Date(lastMonthValue);
                  
                  // Generate projected months in MM-YYYY format
                  const projectedMonths = Array.from({ length: 12 }, (_, i) => {
                    const date = new Date(lastMonth);
                    date.setMonth(date.getMonth() + i + 1);
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const year = date.getFullYear();
                    return `${month}-${year}`;
                  });
                  
                  const projectedData = projectedMonths.map((month, i) => ({
                    month,
                    value: wcProjections[i]
                  }));
                  
                  return (
                    <div key={widget} style={{ gridColumn: '1 / -1' }}>
                      <ProjectionChart 
                        title="Working Capital Trend & 12-Month Projection" 
                        historicalData={wcHistorical}
                        projectedData={{
                          mostLikely: projectedData,
                          bestCase: projectedData.map(d => ({ ...d, value: d.value * 1.1 })),
                          worstCase: projectedData.map(d => ({ ...d, value: d.value * 0.9 }))
                        }}
                        valueKey="value"
                        formatValue={(v) => '$' + (v / 1000).toFixed(0) + 'k'}
                      />
                    </div>
                  );
                }
                
                return null;
                  })();
                });
                
                return renderedWidgets;
              })()}
            </div>
          )}
        </div>
  );
}
