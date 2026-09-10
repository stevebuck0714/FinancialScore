'use client';

import { useEffect, useState } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';

type Props = {
  selectedCompanyId: string;
  operationalHubSections?: Record<string, boolean>;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('en-US');

export default function HubSpotSalesTab({ selectedCompanyId, operationalHubSections = {} }: Props) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const sectionEnabled = (key: string) => operationalHubSections[key] !== false;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/operational-system-integrations/hubspot/sales?companyId=${encodeURIComponent(selectedCompanyId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'Failed to load HubSpot sales data.');
        return payload;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((loadError: Error) => {
        if (!cancelled) setError(loadError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedCompanyId]);

  if (loading) return <div style={{ padding: '32px', color: '#64748b' }}>Loading HubSpot sales data…</div>;
  if (error) return <div style={{ padding: '32px', color: '#991b1b' }}>{error}</div>;

  const summary = data?.summary || {};
  const reportStyle = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '16px' };
  const cellStyle = { padding: '9px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px', textAlign: 'left' as const };
  const headingStyle = { ...cellStyle, color: '#475569', fontWeight: 700, background: '#f8fafc' };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '18px' }}>
        <h2 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: '22px' }}>Sales</h2>
        <div style={{ color: '#64748b', fontSize: '13px' }}>
          HubSpot sales activity · As of {summary.asOf ? formatEstDateTime(summary.asOf) : '—'}
        </div>
      </div>
      {sectionEnabled('salesPipelineSummary') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {[
            ['Open Pipeline', money.format(Number(summary.openPipeline || 0))],
            ['Open Deals', number.format(Number(summary.openDeals || 0))],
            ['Closed-Won Deals', number.format(Number(summary.wonDeals || 0))],
            ['All Deals', number.format(Number(summary.totalDeals || 0))],
            ['Activities', number.format(Number(summary.activityCount || 0))],
          ].map(([label, value]) => (
            <div key={label} style={{ ...reportStyle, marginBottom: 0 }}>
              <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 700 }}>{label}</div>
              <div style={{ color: '#0f172a', fontSize: '22px', fontWeight: 800, marginTop: '5px' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
      {sectionEnabled('salesDealsByStage') && (
        <div style={reportStyle}>
          <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '16px' }}>Deals by Stage</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={headingStyle}>Stage</th><th style={headingStyle}>Deals</th><th style={headingStyle}>Value</th></tr></thead>
            <tbody>{(data?.stages || []).map((row: any) => <tr key={row.stage}><td style={cellStyle}>{row.stage}</td><td style={cellStyle}>{number.format(row.dealCount)}</td><td style={cellStyle}>{money.format(row.pipelineValue)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {(data?.crmRecordCounts || []).length > 0 && (
        <div style={reportStyle}>
          <h3 style={{ margin: '0 0 4px', color: '#0f172a', fontSize: '16px' }}>HubSpot CRM Records</h3>
          <div style={{ marginBottom: '12px', color: '#64748b', fontSize: '12px' }}>Live counts from enabled HubSpot CRM data domains</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={headingStyle}>Data Domain</th><th style={headingStyle}>Records</th><th style={headingStyle}>Status</th></tr></thead>
            <tbody>{(data?.crmRecordCounts || []).map((row: any) => (
              <tr key={row.domain}>
                <td style={cellStyle}>{row.label}</td>
                <td style={cellStyle}>{row.count == null ? '—' : number.format(row.count)}</td>
                <td style={{ ...cellStyle, color: row.error ? '#b45309' : '#166534' }}>
                  {!row.enabled ? 'Disabled' : row.error ? 'Access unavailable' : 'Available'}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
        {sectionEnabled('salesRepLeaderboard') && (
          <div style={reportStyle}>
            <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '16px' }}>Rep Leaderboard</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={headingStyle}>Owner</th><th style={headingStyle}>Open Pipeline</th><th style={headingStyle}>Won</th></tr></thead>
              <tbody>{(data?.reps || []).map((row: any) => <tr key={row.owner}><td style={cellStyle}>{row.owner}</td><td style={cellStyle}>{money.format(row.openPipeline)}</td><td style={cellStyle}>{money.format(row.wonRevenue)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {sectionEnabled('salesActivitySummary') && (
          <div style={reportStyle}>
            <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '16px' }}>Sales Activity</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={headingStyle}>Activity</th><th style={headingStyle}>Count</th></tr></thead>
              <tbody>{(data?.activities || []).map((row: any) => <tr key={row.type}><td style={cellStyle}>{String(row.type).replace(/^./, (value: string) => value.toUpperCase())}</td><td style={cellStyle}>{number.format(row.count)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
