'use client';

import React, { useState } from 'react';
import { formatCurrency, exportToCSV, getCurrentMonthRange } from '@/lib/billing/billingHelpers';

export default function BillingReportsTab() {
  const [consultantReport, setConsultantReport] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedConsultants, setExpandedConsultants] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const generateConsultantReport = async () => {
    try {
      setIsLoading(true);
      const url = (startDate && endDate) 
        ? `/api/billing/reports/consultant?startDate=${startDate}&endDate=${endDate}`
        : '/api/billing/reports/consultant';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to generate report');
      const data = await response.json();
      setConsultantReport(data.report);
    } catch (err) {
      alert('Error generating report');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleConsultant = (consultantId: string) => {
    const newExpanded = new Set(expandedConsultants);
    if (newExpanded.has(consultantId)) {
      newExpanded.delete(consultantId);
    } else {
      newExpanded.add(consultantId);
    }
    setExpandedConsultants(newExpanded);
  };

  const exportReport = () => {
    const data = consultantReport.map(r => ({
      'Consultant': r.consultantName,
      'Total Revenue': r.totalRevenue,
      'Revenue Share %': r.revenueSharePercentage,
      'Consultant Share': r.consultantShare,
      'Platform Share': r.platformShare,
      'Payment Count': r.recordCount
    }));
    exportToCSV(data, `consultant-revenue-report-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const setCurrentMonth = () => {
    const { start, end } = getCurrentMonthRange();
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  return (
    <div>
      {/* Report Configuration */}
      <div style={{ 
        background: 'white', 
        borderRadius: '12px', 
        padding: '20px', 
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
          Revenue by Consultant Report
        </h3>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '4px' }}>
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            />
          </div>
          
          <div>
            <label style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '4px' }}>
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            />
          </div>

          <button
            onClick={setCurrentMonth}
            style={{
              padding: '8px 16px',
              background: '#f3f4f6',
              color: '#1e293b',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              marginTop: '20px'
            }}
          >
            Current Month
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            {consultantReport.length > 0 && (
              <button
                onClick={exportReport}
                style={{
                  padding: '8px 16px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  marginTop: '20px'
                }}
              >
                📥 Export CSV
              </button>
            )}
            <button
              onClick={generateConsultantReport}
              disabled={isLoading}
              style={{
                padding: '8px 16px',
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: isLoading ? 'wait' : 'pointer',
                opacity: isLoading ? 0.6 : 1,
                marginTop: '20px'
              }}
            >
              {isLoading ? 'Generating...' : '📊 Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Report Results */}
      {consultantReport.length > 0 && (
        <div style={{ 
          background: 'white', 
          borderRadius: '12px', 
          padding: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
        }}>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
              Consultant Revenue Report
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b' }}>
              {startDate && endDate ? `Period: ${startDate} to ${endDate}` : 'All time'}
            </p>
          </div>

          {/* Summary */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '16px',
            marginBottom: '24px',
            padding: '16px',
            background: '#f8fafc',
            borderRadius: '8px'
          }}>
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Total Revenue</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>
                {formatCurrency(consultantReport.reduce((sum, r) => sum + r.totalRevenue, 0))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Consultant Share</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#ef4444' }}>
                {formatCurrency(consultantReport.reduce((sum, r) => sum + r.consultantShare, 0))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Platform Share</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#10b981' }}>
                {formatCurrency(consultantReport.reduce((sum, r) => sum + r.platformShare, 0))}
              </div>
            </div>
          </div>

          {/* Consultant Details */}
          {consultantReport.map((consultant) => (
            <div key={consultant.consultantId} style={{ marginBottom: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <div 
                onClick={() => toggleConsultant(consultant.consultantId)}
                style={{ 
                  padding: '16px', 
                  background: '#f8fafc', 
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
                    {consultant.consultantName}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                    {consultant.recordCount} payments • {consultant.revenueSharePercentage}% share
                  </div>
                </div>
                <div style={{ textAlign: 'right', marginRight: '40px' }}>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>Total Revenue</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>
                    {formatCurrency(consultant.totalRevenue)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#ef4444' }}>
                    Consultant: {formatCurrency(consultant.consultantShare)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#10b981' }}>
                    Platform: {formatCurrency(consultant.platformShare)}
                  </div>
                </div>
                <span style={{ fontSize: '20px', color: '#64748b' }}>
                  {expandedConsultants.has(consultant.consultantId) ? '▼' : '▶'}
                </span>
              </div>
              
              {expandedConsultants.has(consultant.consultantId) && (
                <div style={{ padding: '16px', background: 'white' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                    Companies & Payments
                  </h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Company</th>
                        <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Total Revenue</th>
                        <th style={{ padding: '8px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Payment Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consultant.companies.map((company: any) => (
                        <tr key={company.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#1e293b' }}>{company.name}</td>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#1e293b', textAlign: 'right', fontWeight: '500' }}>
                            {formatCurrency(company.totalRevenue)}
                          </td>
                          <td style={{ padding: '8px', fontSize: '13px', color: '#64748b', textAlign: 'right' }}>
                            {company.recordCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {consultantReport.length === 0 && !isLoading && (
        <div style={{ 
          background: 'white', 
          borderRadius: '12px', 
          padding: '40px', 
          textAlign: 'center',
          color: '#64748b'
        }}>
          Click "Generate Report" to view revenue by consultant
        </div>
      )}
    </div>
  );
}
