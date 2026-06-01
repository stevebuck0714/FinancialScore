'use client';

import React, { useState } from 'react';
import SimpleChart from './SimpleChart';

interface WorkingCapitalTabProps {
  selectedCompanyId: string;
  companyName: string;
  prefetchedMonthlyData?: any[];
}

export default function WorkingCapitalTab({
  selectedCompanyId,
  companyName,
  prefetchedMonthlyData,
}: WorkingCapitalTabProps) {
  const formatMonthLabel = (rawMonth: unknown, fallbackIndex: number): string => {
    if (!rawMonth) return `M${fallbackIndex + 1}`;
    const asString = String(rawMonth).trim();
    if (!asString) return `M${fallbackIndex + 1}`;

    const parsed = new Date(asString);
    if (!Number.isNaN(parsed.getTime())) {
      // UTC bucketing — see lib/date-utils.ts
      return parsed.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    }

    // Keep the source label if parsing fails to avoid "Invalid Date" in charts/tooltips.
    return asString;
  };

  const monthly = Array.isArray(prefetchedMonthlyData) ? prefetchedMonthlyData : [];
  const currentAssetsFor = (month: any): number =>
    month?.tca || ((month?.cash || 0) + (month?.ar || 0) + (month?.retainageReceivables || 0) +
      (month?.contractAssets || 0) + (month?.inventory || 0) + (month?.otherCA || 0));
  const currentLiabilitiesFor = (month: any): number =>
    Math.abs(month?.tcl || ((month?.ap || 0) + (month?.loc || 0) + (month?.contractLiabilities || 0) + (month?.otherCL || 0)));
  const [showWCRatioFormula, setShowWCRatioFormula] = React.useState(false);
  const [showDaysWCFormula, setShowDaysWCFormula] = React.useState(false);
  const [showCCCFormula, setShowCCCFormula] = React.useState(false);
  const [assetsLiabHover, setAssetsLiabHover] = useState<{ index: number; x: number; y: number; month: string; assets: number; liabilities: number } | null>(null);
  const [printOrientation] = useState<'portrait' | 'landscape'>('portrait');

  if (!monthly || monthly.length === 0) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#ef4444' }}>No financial data available for working capital analysis</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '32px' }}>
      <style>{`
        @media print {
          @page {
            size: ${printOrientation};
            margin: 0.3in;
          }

          /* Hide navigation and UI elements */
          .no-print,
          header,
          nav,
          aside,
          [role="navigation"],
          .dashboard-header-print-hide {
            display: none !important;
          }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: '0 0 8px 0' }}>Working Capital Analysis</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => window.print()}
            className="no-print"
            style={{
              padding: '8px 14px',
              background: 'white',
              color: '#334155',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.2s, border-color 0.2s, color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.borderColor = '#94a3b8';
              e.currentTarget.style.color = '#1e293b';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.color = '#334155';
            }}
          >
            Print Report
          </button>
        </div>
      </div>

      {/* Working Capital Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {(() => {
          const lastMonth = monthly[monthly.length - 1];
          const currentAssets = currentAssetsFor(lastMonth);
          const currentLiab = currentLiabilitiesFor(lastMonth);
          const workingCapital = currentAssets - currentLiab;
          const wcRatio = currentLiab > 0 ? currentAssets / currentLiab : 0;

          // Calculate trend (compare to previous month)
          const prevMonth = monthly.length > 1 ? monthly[monthly.length - 2] : null;
          const prevWC = prevMonth ? currentAssetsFor(prevMonth) - currentLiabilitiesFor(prevMonth) : workingCapital;
          const wcChange = workingCapital - prevWC;
          const wcChangePercent = prevWC !== 0 ? (wcChange / Math.abs(prevWC)) * 100 : 0;

          return (
            <>
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', minHeight: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#667eea', margin: 0 }}>💼 Current Working Capital</h3>
                </div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                  ${(workingCapital / 1000).toFixed(0)}K
                </div>
                <div style={{ fontSize: '13px', color: wcChange >= 0 ? '#10b981' : '#ef4444', fontWeight: '600', marginBottom: '12px' }}>
                  {wcChange >= 0 ? '↗️ +' : '↘️ '}${Math.abs(wcChange / 1000).toFixed(0)}K ({wcChangePercent >= 0 ? '+' : ''}{wcChangePercent.toFixed(1)}%)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                  <div>
                    <div style={{ color: '#64748b', marginBottom: '2px' }}>Current Assets</div>
                    <div style={{ fontWeight: '600', color: '#1e293b' }}>${(currentAssets / 1000).toFixed(0)}K</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', marginBottom: '2px' }}>Current Liabilities</div>
                    <div style={{ fontWeight: '600', color: '#1e293b' }}>${(currentLiab / 1000).toFixed(0)}K</div>
                  </div>
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', minHeight: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#667eea', margin: 0 }}>📊 Working Capital Ratio</h3>
                  <button
                    onClick={() => setShowWCRatioFormula(!showWCRatioFormula)}
                    style={{
                      background: '#ede9fe',
                      border: '1px solid #c4b5fd',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      color: '#667eea',
                      fontSize: '11px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#ddd6fe';
                      e.currentTarget.style.borderColor = '#a78bfa';
                      e.currentTarget.style.color = '#4f46e5';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ede9fe';
                      e.currentTarget.style.borderColor = '#c4b5fd';
                      e.currentTarget.style.color = '#667eea';
                    }}
                    title="Click to view formula"
                  >
                    <span style={{ fontSize: '14px' }}>ℹ️</span> Formula
                  </button>
                </div>
                
                {showWCRatioFormula && (
                  <div style={{ 
                    background: '#f0f9ff', 
                    border: '1px solid #bae6fd', 
                    borderRadius: '6px', 
                    padding: '8px', 
                    marginBottom: '12px',
                    fontSize: '11px',
                    color: '#0c4a6e'
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>Formula:</div>
                    <div style={{ fontFamily: 'monospace', marginBottom: '6px', fontSize: '10px' }}>
                      Working Capital Ratio = Current Assets ÷ Current Liabilities
                    </div>
                    <div style={{ fontSize: '10px', lineHeight: '1.4' }}>
                      <strong>Interpretation:</strong><br />
                      • Ratio &gt; 2.0: Excellent liquidity<br />
                      • Ratio 1.2-2.0: Healthy (industry standard)<br />
                      • Ratio 1.0-1.2: Adequate but tight<br />
                      • Ratio &lt; 1.0: Potential liquidity issues
                    </div>
                  </div>
                )}
                
                <div style={{ fontSize: '28px', fontWeight: '700', color: wcRatio >= 1.5 ? '#10b981' : wcRatio >= 1.0 ? '#f59e0b' : '#ef4444', marginBottom: '6px' }}>
                  {wcRatio.toFixed(2)}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
                  {wcRatio >= 1.5 ? '💪 Strong liquidity position' : wcRatio >= 1.0 ? '⚠️ Adequate liquidity' : '🚨 Needs attention'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  Industry standard: 1.2 - 2.0
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', minHeight: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#667eea', margin: 0 }}>⏱️ Days Working Capital</h3>
                  <button
                    onClick={() => setShowDaysWCFormula(!showDaysWCFormula)}
                    style={{
                      background: '#ede9fe',
                      border: '1px solid #c4b5fd',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      color: '#667eea',
                      fontSize: '11px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#ddd6fe';
                      e.currentTarget.style.borderColor = '#a78bfa';
                      e.currentTarget.style.color = '#4f46e5';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ede9fe';
                      e.currentTarget.style.borderColor = '#c4b5fd';
                      e.currentTarget.style.color = '#667eea';
                    }}
                    title="Click to view formula"
                  >
                    <span style={{ fontSize: '14px' }}>ℹ️</span> Formula
                  </button>
                </div>
                {showDaysWCFormula && (
                  <div style={{
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    borderRadius: '6px',
                    padding: '8px',
                    marginBottom: '12px',
                    fontSize: '11px',
                    color: '#0c4a6e'
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>Formula:</div>
                    <div style={{ fontFamily: 'monospace', marginBottom: '6px', fontSize: '10px' }}>
                      Days Working Capital = (Working Capital / Avg Monthly Revenue) × (365 / 12)
                    </div>
                    <div style={{ fontSize: '10px', lineHeight: '1.4' }}>
                      <strong>Explanation:</strong><br />
                      • Working Capital = Current Assets - Current Liabilities<br />
                      • Avg Monthly Revenue = average of recent monthly revenue values<br />
                      • Converts working capital into estimated days of sales coverage
                    </div>
                  </div>
                )}
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                  {(() => {
                    const avgRevenue = monthly.slice(-12).reduce((sum, m) => sum + (m.revenue || 0), 0) / Math.max(monthly.slice(-12).length, 1);
                    const daysPerMonth = 365 / 12;
                    const daysWC = workingCapital > 0 && avgRevenue > 0 ? (workingCapital / avgRevenue) * daysPerMonth : 0;
                    return daysWC.toFixed(0);
                  })()}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
                  Days of revenue covered by working capital
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  Benchmark: 30-90 days
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', minHeight: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#667eea', margin: 0 }}>🔄 Cash Conversion Cycle</h3>
                  <button
                    onClick={() => setShowCCCFormula(!showCCCFormula)}
                    style={{
                      background: '#ede9fe',
                      border: '1px solid #c4b5fd',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      color: '#667eea',
                      fontSize: '11px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#ddd6fe';
                      e.currentTarget.style.borderColor = '#a78bfa';
                      e.currentTarget.style.color = '#4f46e5';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ede9fe';
                      e.currentTarget.style.borderColor = '#c4b5fd';
                      e.currentTarget.style.color = '#667eea';
                    }}
                    title="Click to view formula"
                  >
                    <span style={{ fontSize: '14px' }}>ℹ️</span> Formula
                  </button>
                </div>
                {showCCCFormula && (
                  <div style={{
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    borderRadius: '6px',
                    padding: '8px',
                    marginBottom: '12px',
                    fontSize: '11px',
                    color: '#0c4a6e'
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>Formulas:</div>
                    <div style={{ fontFamily: 'monospace', marginBottom: '6px', fontSize: '10px' }}>
                      CCC = DIO + DSO - DPO
                    </div>
                    <div style={{ fontFamily: 'monospace', marginBottom: '6px', fontSize: '10px' }}>
                      DIO = (Inventory / Monthly COGS) × Days in Month
                    </div>
                    <div style={{ fontFamily: 'monospace', marginBottom: '6px', fontSize: '10px' }}>
                      DSO = (AR / Monthly Sales) × Days in Month
                    </div>
                    <div style={{ fontFamily: 'monospace', marginBottom: '6px', fontSize: '10px' }}>
                      DPO = (AP / Monthly COGS) × Days in Month
                    </div>
                    <div style={{ fontSize: '10px', lineHeight: '1.4' }}>
                      <strong>Explanation:</strong><br />
                      • DIO = time inventory sits before being sold<br />
                      • DSO = time to collect receivables from customers<br />
                      • DPO = time you take to pay suppliers<br />
                      • Lower CCC usually means faster cash recovery
                    </div>
                  </div>
                )}
                {(() => {
                  // Single-month method:
                  // DSO = (AR / monthly sales) * days in month
                  // DIO = (Inventory / monthly COGS) * days in month
                  // DPO = (AP / monthly COGS) * days in month
                  const curr = lastMonth;
                  const ar = Number(curr.ar || 0);
                  const inventory = Number(curr.inventory || 0);
                  const ap = Math.abs(Number(curr.ap || 0));
                  const monthlyRevenue = Number(curr.revenue || 0);
                  const monthlyCOGS = Math.abs(Number(curr.cogsTotal || 0));

                  const monthDate = curr.month ? new Date(String(curr.month)) : null;
                  const daysInMonth =
                    monthDate && !Number.isNaN(monthDate.getTime())
                      ? new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate()
                      : 30;

                  const DIO = inventory > 0 && monthlyCOGS > 0 ? (inventory / monthlyCOGS) * daysInMonth : 0;
                  const DSO = ar > 0 && monthlyRevenue > 0 ? (ar / monthlyRevenue) * daysInMonth : 0;
                  const DPO = ap > 0 && monthlyCOGS > 0 ? (ap / monthlyCOGS) * daysInMonth : 0;
                  const CCC = DIO + DSO - DPO;

                  return (
                    <>
                      <div style={{ fontSize: '28px', fontWeight: '700', color: CCC < 30 ? '#10b981' : CCC < 60 ? '#f59e0b' : '#ef4444', marginBottom: '12px' }}>
                        {CCC.toFixed(0)} days
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', fontSize: '11px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px', background: '#f8fafc', borderRadius: '4px' }}>
                          <span style={{ color: '#64748b' }}>DIO:</span>
                          <span style={{ fontWeight: '600', color: '#06b6d4' }}>{DIO.toFixed(0)} days</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px', background: '#f8fafc', borderRadius: '4px' }}>
                          <span style={{ color: '#64748b' }}>DSO:</span>
                          <span style={{ fontWeight: '600', color: '#14b8a6' }}>{DSO.toFixed(0)} days</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px', background: '#f8fafc', borderRadius: '4px' }}>
                          <span style={{ color: '#64748b' }}>DPO:</span>
                          <span style={{ fontWeight: '600', color: '#ec4899' }}>{DPO.toFixed(0)} days</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </>
          );
        })()}
      </div>

      {/* Working Capital Components Analysis */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '12px 24px 24px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '20px' }}>Working Capital Components</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '16px' }}>
          {(() => {
            const lastMonth = monthly[monthly.length - 1];
            const components = [
              {
                name: 'Cash',
                value: lastMonth.cash || 0,
                color: '#10b981'
              },
              {
                name: 'Accounts Receivable',
                value: lastMonth.ar || 0,
                color: '#3b82f6'
              },
              {
                name: 'Retainage Receivables',
                value: lastMonth.retainageReceivables || 0,
                color: '#0ea5e9'
              },
              {
                name: 'Contract Assets',
                value: lastMonth.contractAssets || 0,
                color: '#14b8a6'
              },
              {
                name: 'Inventory',
                value: lastMonth.inventory || 0,
                color: '#8b5cf6'
              },
              {
                name: 'Other Current Assets',
                value: lastMonth.otherCA || 0,
                color: '#06b6d4'
              },
              {
                name: 'Accounts Payable',
                value: Math.abs(lastMonth.ap || 0),
                color: '#ef4444'
              },
              {
                name: 'Contract Liabilities',
                value: Math.abs(lastMonth.contractLiabilities || 0),
                color: '#fb7185'
              },
              {
                name: 'Other Current Liabilities',
                value: Math.abs(lastMonth.otherCL || 0),
                color: '#f59e0b'
              }
            ];

            return components.map((component, index) => (
              <div key={index} style={{
                padding: '16px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.9) 100%)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                  {component.name}
                </div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: component.color }}>
                  ${(component.value / 1000).toFixed(1)}K
                </div>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Working Capital Trend Analysis */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', paddingLeft: '12px' }}>Working Capital Trend (Last 36 Months)</h3>

        <div style={{ height: '450px', position: 'relative', width: '100%' }}>
          <SimpleChart
            data={monthly.slice(-36).map((month, index) => {
              const currentAssets = currentAssetsFor(month);
              const currentLiab = currentLiabilitiesFor(month);
              const wc = currentAssets - currentLiab;

              return {
                month: formatMonthLabel(month.month, index),
                workingCapital: wc / 1000, // Convert to thousands
                currentAssets: currentAssets / 1000,
                currentLiabilities: currentLiab / 1000
              };
            })}
            valueKey="workingCapital"
            title=""
            formatter={(v) => `$${v.toFixed(0)}K`}
            showGrid={true}
            showLegend={false}
            color="#667eea"
            compact={false}
          />
        </div>

        <div style={{ marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginLeft: '12px', marginRight: '12px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Key Insights</h4>
          <ul style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.6', margin: 0, paddingLeft: '20px' }}>
            <li>Working capital represents the funds available for day-to-day operations</li>
            <li>A ratio above 1.0 indicates positive working capital (assets &gt; liabilities)</li>
            <li>Consistent positive trends suggest improving liquidity position</li>
            <li>Monitor accounts receivable and payable cycles for optimization opportunities</li>
          </ul>
        </div>
      </div>

      {/* Cash Trend */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: '24px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', paddingLeft: '12px' }}>Cash Trend (Last 36 Months)</h3>
        <div style={{ height: '450px', position: 'relative', width: '100%' }}>
          <SimpleChart
            data={monthly.slice(-36).map((month, index) => ({
              month: formatMonthLabel(month.month, index),
              cash: (month.cash || 0) / 1000
            }))}
            valueKey="cash"
            title=""
            formatter={(v) => `$${v.toFixed(0)}K`}
            showGrid={true}
            showLegend={false}
            color="#10b981"
            compact={false}
          />
        </div>
      </div>

      {/* Current Assets vs Current Liabilities */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: '24px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', paddingLeft: '12px' }}>Current Assets vs Liabilities (Last 36 Months)</h3>
        <div style={{ height: '450px', position: 'relative', width: '100%', paddingLeft: '40px', paddingRight: '20px' }}>
          {(() => {
            const chartData = monthly.slice(-36).map((month, index) => {
              const currentAssets = currentAssetsFor(month);
              const currentLiab = currentLiabilitiesFor(month);
              return {
                month: formatMonthLabel(month.month, index),
                assets: currentAssets / 1000,
                liabilities: currentLiab / 1000
              };
            });

            const maxValue = Math.max(
              ...chartData.flatMap(d => [d.assets, d.liabilities])
            );
            const minValue = 0;
            const range = maxValue - minValue;
            
            const width = 1000;
            const height = 400;
            const padding = { top: 20, right: 20, bottom: 40, left: 60 };
            const chartWidth = width - padding.left - padding.right;
            const chartHeight = height - padding.top - padding.bottom;

            const xStep = chartData.length > 1 ? chartWidth / (chartData.length - 1) : chartWidth;
            
            const getY = (value: number) => {
              return padding.top + chartHeight - ((value - minValue) / range) * chartHeight;
            };

            const assetPoints = chartData.map((d, i) => ({ x: padding.left + i * xStep, y: getY(d.assets), ...d }));
            const liabilityPoints = chartData.map((d, i) => ({ x: padding.left + i * xStep, y: getY(d.liabilities), ...d }));

            // Create paths for both lines
            const assetsPath = chartData.map((d, i) => {
              const x = padding.left + i * xStep;
              const y = getY(d.assets);
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ');

            const liabilitiesPath = chartData.map((d, i) => {
              const x = padding.left + i * xStep;
              const y = getY(d.liabilities);
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ');

            // Grid lines
            const gridLines = [];
            const numGridLines = 5;
            for (let i = 0; i <= numGridLines; i++) {
              const value = minValue + (range / numGridLines) * i;
              const y = getY(value);
              gridLines.push({ y, value });
            }

            return (
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
                {/* Grid lines */}
                {gridLines.map((line, i) => (
                  <g key={i}>
                    <line
                      x1={padding.left}
                      y1={line.y}
                      x2={width - padding.right}
                      y2={line.y}
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />
                    <text
                      x={padding.left - 10}
                      y={line.y + 4}
                      textAnchor="end"
                      fontSize="12"
                      fill="#64748b"
                    >
                      ${Math.round(line.value)}K
                    </text>
                  </g>
                ))}
                
                {/* X-axis labels (show every 6th month) */}
                {chartData.map((d, i) => {
                  if (i % 6 === 0 || i === chartData.length - 1) {
                    const x = padding.left + i * xStep;
                    return (
                      <text
                        key={i}
                        x={x}
                        y={height - padding.bottom + 20}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#64748b"
                      >
                        {d.month}
                      </text>
                    );
                  }
                  return null;
                })}

                {/* Lines */}
                <path d={assetsPath} fill="none" stroke="#3b82f6" strokeWidth="2.5" />
                <path d={liabilitiesPath} fill="none" stroke="#ef4444" strokeWidth="2.5" />
                {/* Hover circles - Assets (blue) */}
                {assetPoints.map((p, i) => (
                  <g key={`asset-${i}`}>
                    <circle cx={p.x} cy={p.y} r="8" fill="transparent" style={{ cursor: 'pointer' }} onMouseEnter={() => setAssetsLiabHover({ index: i, x: p.x, y: p.y, month: p.month, assets: p.assets, liabilities: p.liabilities })} onMouseLeave={() => setAssetsLiabHover(null)} />
                    <circle cx={p.x} cy={p.y} r="4" fill="#3b82f6" stroke="white" strokeWidth="2" pointerEvents="none">
                      <title>{`${p.month}: Assets $${p.assets.toFixed(0)}K`}</title>
                    </circle>
                  </g>
                ))}
                {/* Hover circles - Liabilities (red) */}
                {liabilityPoints.map((p, i) => (
                  <g key={`liab-${i}`}>
                    <circle cx={p.x} cy={p.y} r="8" fill="transparent" style={{ cursor: 'pointer' }} onMouseEnter={() => setAssetsLiabHover({ index: i, x: p.x, y: p.y, month: p.month, assets: p.assets, liabilities: p.liabilities })} onMouseLeave={() => setAssetsLiabHover(null)} />
                    <circle cx={p.x} cy={p.y} r="4" fill="#ef4444" stroke="white" strokeWidth="2" pointerEvents="none">
                      <title>{`${p.month}: Liabilities $${p.liabilities.toFixed(0)}K`}</title>
                    </circle>
                  </g>
                ))}
              </svg>
              {assetsLiabHover && (
                <div style={{ position: 'absolute', left: `${Math.min((assetsLiabHover.x + 15) / width * 100, 85)}%`, top: `${Math.max((assetsLiabHover.y - 50) / height * 100, 0)}%`, background: 'rgba(30, 41, 59, 0.95)', color: 'white', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', pointerEvents: 'none', zIndex: 10 }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>{assetsLiabHover.month}</div>
                  <div style={{ color: '#60a5fa' }}>Assets: ${assetsLiabHover.assets.toFixed(0)}K</div>
                  <div style={{ color: '#f87171' }}>Liabilities: ${assetsLiabHover.liabilities.toFixed(0)}K</div>
                </div>
              )}
              </div>
            );
          })()}
        </div>
        <div style={{ marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginLeft: '12px', marginRight: '12px', display: 'flex', justifyContent: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '24px', height: '3px', background: '#3b82f6' }}></div>
            <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>Current Assets</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '24px', height: '3px', background: '#ef4444' }}></div>
            <span style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>Current Liabilities</span>
          </div>
        </div>
      </div>

      {/* Inventory Trend */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginTop: '24px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '20px', paddingLeft: '12px' }}>Inventory Trend (Last 36 Months)</h3>
        <div style={{ height: '450px', position: 'relative', width: '100%' }}>
          <SimpleChart
            data={monthly.slice(-36).map((month, index) => ({
              month: formatMonthLabel(month.month, index),
              inventory: (month.inventory || 0) / 1000
            }))}
            valueKey="inventory"
            title=""
            formatter={(v) => `$${v.toFixed(0)}K`}
            showGrid={true}
            showLegend={false}
            color="#8b5cf6"
            compact={false}
          />
        </div>
      </div>
    </div>
  );
}

