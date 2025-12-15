'use client';

import React from 'react';
import { useMasterData } from '@/lib/master-data-store';
import SimpleChart from './charts/SimpleChart';

interface WorkingCapitalTabProps {
  selectedCompanyId: string;
  companyName: string;
}

export default function WorkingCapitalTab({
  selectedCompanyId,
  companyName,
}: WorkingCapitalTabProps) {
  const { monthlyData, loading, error } = useMasterData(selectedCompanyId);
  const monthly = monthlyData || [];

  if (loading) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#64748b' }}>Loading working capital data...</div>
      </div>
    );
  }

  if (error || !monthly || monthly.length === 0) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#ef4444' }}>No financial data available for working capital analysis</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <style>{`
        @media print {
          @page {
            size: portrait;
            margin: 0.3in;
          }

          /* Hide navigation and UI elements */
          .no-print,
          .dashboard-header-print-hide {
            display: none !important;
          }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: '0 0 8px 0' }}>Working Capital Analysis</h1>
          {companyName && <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => window.print()}
            style={{
              padding: '12px 24px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            🖨️ Print Report
          </button>
        </div>
      </div>

      {/* Working Capital Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {(() => {
          const lastMonth = monthly[monthly.length - 1];
          const currentAssets = lastMonth.tca || ((lastMonth.cash || 0) + (lastMonth.ar || 0) + (lastMonth.inventory || 0) + (lastMonth.otherCA || 0));
          const currentLiab = Math.abs(lastMonth.tcl || ((lastMonth.ap || 0) + (lastMonth.otherCL || 0)));
          const workingCapital = currentAssets - currentLiab;
          const wcRatio = currentLiab > 0 ? currentAssets / currentLiab : 0;

          // Calculate trend (compare to previous month)
          const prevMonth = monthly.length > 1 ? monthly[monthly.length - 2] : null;
          const prevWC = prevMonth ? (prevMonth.tca || ((prevMonth.cash || 0) + (prevMonth.ar || 0) + (prevMonth.inventory || 0) + (prevMonth.otherCA || 0))) - Math.abs(prevMonth.tcl || ((prevMonth.ap || 0) + (prevMonth.otherCL || 0))) : workingCapital;
          const wcChange = workingCapital - prevWC;
          const wcChangePercent = prevWC !== 0 ? (wcChange / Math.abs(prevWC)) * 100 : 0;

          return (
            <>
              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#667eea', marginBottom: '16px' }}>💼 Current Working Capital</h3>
                <div style={{ fontSize: '36px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                  ${(workingCapital / 1000).toFixed(0)}K
                </div>
                <div style={{ fontSize: '14px', color: wcChange >= 0 ? '#10b981' : '#ef4444', fontWeight: '600', marginBottom: '16px' }}>
                  {wcChange >= 0 ? '↗️ +' : '↘️ '}${Math.abs(wcChange / 1000).toFixed(0)}K ({wcChangePercent >= 0 ? '+' : ''}{wcChangePercent.toFixed(1)}%)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                  <div>
                    <div style={{ color: '#64748b', marginBottom: '4px' }}>Current Assets</div>
                    <div style={{ fontWeight: '600', color: '#1e293b' }}>${(currentAssets / 1000).toFixed(0)}K</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', marginBottom: '4px' }}>Current Liabilities</div>
                    <div style={{ fontWeight: '600', color: '#1e293b' }}>${(currentLiab / 1000).toFixed(0)}K</div>
                  </div>
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#667eea', marginBottom: '16px' }}>📊 Working Capital Ratio</h3>
                <div style={{ fontSize: '36px', fontWeight: '700', color: wcRatio >= 1.5 ? '#10b981' : wcRatio >= 1.0 ? '#f59e0b' : '#ef4444', marginBottom: '8px' }}>
                  {wcRatio.toFixed(2)}
                </div>
                <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
                  {wcRatio >= 1.5 ? '💪 Strong liquidity position' : wcRatio >= 1.0 ? '⚠️ Adequate liquidity' : '🚨 Needs attention'}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Industry standard: 1.2 - 2.0
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#667eea', marginBottom: '16px' }}>⏱️ Days Working Capital</h3>
                <div style={{ fontSize: '36px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                  {(() => {
                    const avgRevenue = monthly.slice(-12).reduce((sum, m) => sum + (m.revenue || 0), 0) / Math.max(monthly.slice(-12).length, 1);
                    const daysWC = workingCapital > 0 && avgRevenue > 0 ? (workingCapital / avgRevenue) * 365 : 0;
                    return daysWC.toFixed(0);
                  })()}
                </div>
                <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
                  Days of revenue covered by working capital
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Benchmark: 30-90 days
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {/* Working Capital Components Analysis */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '20px' }}>Working Capital Components</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          {(() => {
            const lastMonth = monthly[monthly.length - 1];
            const components = [
              {
                name: 'Cash',
                value: lastMonth.cash || 0,
                category: 'Current Assets',
                color: '#10b981'
              },
              {
                name: 'Accounts Receivable',
                value: lastMonth.ar || 0,
                category: 'Current Assets',
                color: '#3b82f6'
              },
              {
                name: 'Inventory',
                value: lastMonth.inventory || 0,
                category: 'Current Assets',
                color: '#8b5cf6'
              },
              {
                name: 'Other Current Assets',
                value: lastMonth.otherCA || 0,
                category: 'Current Assets',
                color: '#06b6d4'
              },
              {
                name: 'Accounts Payable',
                value: Math.abs(lastMonth.ap || 0),
                category: 'Current Liabilities',
                color: '#ef4444'
              },
              {
                name: 'Other Current Liabilities',
                value: Math.abs(lastMonth.otherCL || 0),
                category: 'Current Liabilities',
                color: '#f59e0b'
              }
            ];

            return components.map((component, index) => (
              <div key={index} style={{
                padding: '16px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.9) 100%)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>{component.name}</span>
                  <span style={{ fontSize: '12px', color: '#6b7280', background: component.color + '20', padding: '2px 8px', borderRadius: '12px' }}>
                    {component.category}
                  </span>
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
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '20px' }}>Working Capital Trend (Last 12 Months)</h3>

        <div style={{ height: '300px', position: 'relative' }}>
          <SimpleChart
            data={monthly.slice(-12).map((month, index) => {
              const currentAssets = month.tca || ((month.cash || 0) + (month.ar || 0) + (month.inventory || 0) + (month.otherCA || 0));
              const currentLiab = Math.abs(month.tcl || ((month.ap || 0) + (month.otherCL || 0)));
              const wc = currentAssets - currentLiab;

              return {
                month: month.month ? new Date(month.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : `M${index + 1}`,
                workingCapital: wc / 1000, // Convert to thousands
                currentAssets: currentAssets / 1000,
                currentLiabilities: currentLiab / 1000
              };
            })}
            valueKey="workingCapital"
            title=""
            formatValue={(v) => `$${v.toFixed(0)}K`}
            showGrid={true}
            showLegend={false}
            color="#667eea"
          />
        </div>

        <div style={{ marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Key Insights</h4>
          <ul style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.6', margin: 0, paddingLeft: '20px' }}>
            <li>Working capital represents the funds available for day-to-day operations</li>
            <li>A ratio above 1.0 indicates positive working capital (assets &gt; liabilities)</li>
            <li>Consistent positive trends suggest improving liquidity position</li>
            <li>Monitor accounts receivable and payable cycles for optimization opportunities</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

