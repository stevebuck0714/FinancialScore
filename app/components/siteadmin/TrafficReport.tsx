'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { addEstCalendarDays, formatEstDate } from '@/lib/time/eastern';
import { TRAFFIC_SECTIONS } from '@/lib/traffic/sections';

type Metrics = { views: number; users: number; durationMs: number };
type Metric = keyof Metrics;
type TrafficReportData = {
  start: string;
  end: string;
  companies: Array<{ companyId: string; companyName: string; total: Metrics; sections: Record<string, Metrics> }>;
  sectionTotals: Record<string, Metrics>;
  total: Metrics;
};

const METRIC_OPTIONS: Array<{ id: Metric; label: string }> = [
  { id: 'views', label: 'Views' },
  { id: 'users', label: 'Unique Users' },
  { id: 'durationMs', label: 'Time Spent' },
];

const inputStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' };
const labelStyle: React.CSSProperties = { fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '4px' };
const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#f3f4f6',
  color: '#1e293b',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: '600',
  cursor: 'pointer',
  marginTop: '20px',
};
const headerCellStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'right',
  fontSize: '12px',
  fontWeight: '600',
  color: '#475569',
  borderBottom: '2px solid #e2e8f0',
  whiteSpace: 'nowrap',
};
const cellStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'right',
  fontSize: '13px',
  color: '#1e293b',
  borderBottom: '1px solid #f1f5f9',
  whiteSpace: 'nowrap',
};

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (ms > 0 && minutes === 0) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

function formatMetric(metrics: Metrics | undefined, metric: Metric): string {
  const value = metrics?.[metric] ?? 0;
  if (!value) return '—';
  return metric === 'durationMs' ? formatDuration(value) : value.toLocaleString('en-US');
}

export default function TrafficReport() {
  const today = formatEstDate();
  const [startDate, setStartDate] = useState(addEstCalendarDays(today, -29));
  const [endDate, setEndDate] = useState(today);
  const [metric, setMetric] = useState<Metric>('views');
  const [report, setReport] = useState<TrafficReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async (start: string, end: string) => {
    try {
      const response = await fetch(`/api/siteadmin/traffic?start=${start}&end=${end}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to load traffic report');
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load traffic report');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadReport = useCallback(
    (start: string, end: string) => {
      setIsLoading(true);
      setError(null);
      return fetchReport(start, end);
    },
    [fetchReport]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchReport(addEstCalendarDays(formatEstDate(), -29), formatEstDate());
  }, [fetchReport]);

  const applyRange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    void loadReport(start, end);
  };

  const sections = TRAFFIC_SECTIONS.filter((section) => (report?.sectionTotals[section.key]?.views ?? 0) > 0);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: '0 0 4px' }}>Client Traffic by Section</h3>
        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>
          Left-sidebar sections opened by client users. Site Admins, consultants, and Site Admin previews are excluded.
          Dates are EST. Time spent counts only while the tab is visible, up to 30 minutes per visit.
        </p>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label style={labelStyle}>Start Date</label>
            <input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>End Date</label>
            <input type="date" value={endDate} min={startDate} max={today} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </div>
          <button onClick={() => applyRange(addEstCalendarDays(today, -6), today)} style={secondaryButtonStyle}>Last 7 Days</button>
          <button onClick={() => applyRange(addEstCalendarDays(today, -29), today)} style={secondaryButtonStyle}>Last 30 Days</button>
          <button onClick={() => applyRange(`${today.slice(0, 7)}-01`, today)} style={secondaryButtonStyle}>Current Month</button>
          <div>
            <label style={labelStyle}>Show</label>
            <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} style={inputStyle}>
              {METRIC_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={() => void loadReport(startDate, endDate)}
              disabled={isLoading || !startDate || !endDate}
              style={{
                padding: '8px 16px',
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: isLoading ? 'wait' : 'pointer',
                marginTop: '20px',
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading ? 'Loading...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', marginBottom: '20px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {report && !error && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {report.companies.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>No client traffic recorded between {report.start} and {report.end}.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...headerCellStyle, textAlign: 'left' }}>Client</th>
                    {sections.map((section) => (
                      <th key={section.key} style={headerCellStyle}>{section.label}</th>
                    ))}
                    <th style={headerCellStyle}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.companies.map((company) => (
                    <tr key={company.companyId}>
                      <td style={{ ...cellStyle, textAlign: 'left', fontWeight: '600' }}>{company.companyName}</td>
                      {sections.map((section) => (
                        <td key={section.key} style={cellStyle}>{formatMetric(company.sections[section.key], metric)}</td>
                      ))}
                      <td style={{ ...cellStyle, fontWeight: '700' }}>{formatMetric(company.total, metric)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8fafc' }}>
                    <td style={{ ...cellStyle, textAlign: 'left', fontWeight: '700', borderTop: '2px solid #e2e8f0' }}>All Clients</td>
                    {sections.map((section) => (
                      <td key={section.key} style={{ ...cellStyle, fontWeight: '700', borderTop: '2px solid #e2e8f0' }}>
                        {formatMetric(report.sectionTotals[section.key], metric)}
                      </td>
                    ))}
                    <td style={{ ...cellStyle, fontWeight: '700', borderTop: '2px solid #e2e8f0' }}>{formatMetric(report.total, metric)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
