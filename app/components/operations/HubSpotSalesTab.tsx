'use client';

import { useEffect, useState } from 'react';
import { formatEstDateLabel, formatEstDateTime } from '@/lib/time/eastern';

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
  const [companySearch, setCompanySearch] = useState('');
  const [companyPage, setCompanyPage] = useState(0);
  const [contactSearch, setContactSearch] = useState('');
  const [contactPage, setContactPage] = useState(0);
  const [selectedEmployer, setSelectedEmployer] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityPage, setActivityPage] = useState(0);
  const [expandedIndustry, setExpandedIndustry] = useState<string | null>(null);
  const [expandedActivityStatus, setExpandedActivityStatus] = useState<string | null>(null);
  const [tableSorts, setTableSorts] = useState<Record<string, { key: string; direction: 'asc' | 'desc' }>>({});
  const sectionEnabled = (key: string) => operationalHubSections[key] !== false;

  useEffect(() => {
    let cancelled = false;
    // This effect resets asynchronous request state when the selected company changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const crmReports = data?.crmReports || {};
  const hasDeals = Number(summary.totalDeals || 0) > 0;
  const reportStyle = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '16px' };
  const cellStyle = { padding: '9px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px', textAlign: 'left' as const };
  const headingStyle = { ...cellStyle, color: '#475569', fontWeight: 700, background: '#f8fafc' };
  const pageSize = 25;
  const formatHubSpotTimestamp = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    const instant = /^\d+$/.test(raw) ? new Date(Number(raw)) : raw;
    return formatEstDateLabel(instant) || '—';
  };
  const rowMatches = (row: any, query: string) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return Object.values(row?.properties || {}).some((value) => String(value || '').toLowerCase().includes(normalized));
  };
  const sortRows = (rows: any[], table: string, getValue: (row: any, key: string) => unknown = (row, key) => row[key]) => {
    const sort = tableSorts[table];
    if (!sort) return rows;
    return [...rows].sort((left, right) => {
      const a = getValue(left, sort.key);
      const b = getValue(right, sort.key);
      const numericA = Number(a);
      const numericB = Number(b);
      const compared = Number.isFinite(numericA) && Number.isFinite(numericB)
        ? numericA - numericB
        : String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      return sort.direction === 'asc' ? compared : -compared;
    });
  };
  const toggleSort = (table: string, key: string) => {
    setTableSorts((current) => {
      const existing = current[table];
      return {
        ...current,
        [table]: { key, direction: existing?.key === key && existing.direction === 'asc' ? 'desc' : 'asc' },
      };
    });
  };
  const sortableHeader = (table: string, key: string, label: string) => {
    const sort = tableSorts[table];
    const indicator = sort?.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : '';
    return <th style={headingStyle} aria-sort={sort?.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => toggleSort(table, key)} style={{ padding: 0, border: 0, background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: 'inherit', cursor: 'pointer' }}>{label}{indicator}</button></th>;
  };
  const companyRows = sortRows((data?.companies?.records || []).filter((row: any) => rowMatches(row, companySearch)), 'companies', (row, key) => row.properties?.[key]);
  const employerNameById = new Map((data?.companies?.records || []).map((row: any) => [String(row.id), String(row.properties?.name || 'Unnamed employer')]));
  const contactEmployer = (row: any) => {
    const employers = (row.associations?.companies?.results || [])
      .map((association: any) => employerNameById.get(String(association.id)))
      .filter(Boolean) as string[];
    return Array.from(new Set(employers)).join(', ') || '—';
  };
  const employerOptions = Array.from(new Set((data?.contacts?.records || []).map((row: any) => contactEmployer(row)).filter((employer: string) => employer !== '—'))).sort();
  const contactRows = sortRows((data?.contacts?.records || []).filter((row: any) => (
    rowMatches(row, contactSearch) && (!selectedEmployer || contactEmployer(row) === selectedEmployer)
  )), 'contacts', (row, key) => key === 'contact' ? [row.properties?.firstname, row.properties?.lastname].filter(Boolean).join(' ') : key === 'employer' ? contactEmployer(row) : row.properties?.[key]);
  const activityRows = sortRows((data?.activityDetails || []).filter((row: any) => Object.values(row).some((value) => String(value || '').toLowerCase().includes(activitySearch.trim().toLowerCase()))), 'activityDetails');
  const employersForIndustry = (industry: string) => (data?.companies?.records || [])
    .filter((row: any) => (String(row.properties?.industry || '').trim() || 'Unspecified') === industry)
    .sort((left: any, right: any) => String(left.properties?.name || '').localeCompare(String(right.properties?.name || '')));
  const companyStart = companyPage * pageSize;
  const contactStart = contactPage * pageSize;
  const activityStart = activityPage * pageSize;
  const visibleCompanies = companyRows.slice(companyStart, companyStart + pageSize);
  const visibleContacts = contactRows.slice(contactStart, contactStart + pageSize);
  const visibleActivities = activityRows.slice(activityStart, activityStart + pageSize);
  const statusActivityRows = expandedActivityStatus == null
    ? []
    : sortRows((data?.activityDetails || []).filter((row: any) => (row.status || '—') === expandedActivityStatus), 'activityStatusDetails');
  const pagination = (page: number, totalRows: number, setPage: (nextPage: number) => void) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', color: '#64748b', fontSize: '12px' }}>
      <span>{totalRows ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, totalRows)} of ${number.format(totalRows)}` : 'No records'}</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={{ padding: '5px 9px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white', cursor: page === 0 ? 'not-allowed' : 'pointer' }}>Previous</button>
        <button type="button" onClick={() => setPage(page + 1)} disabled={(page + 1) * pageSize >= totalRows} style={{ padding: '5px 9px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white', cursor: (page + 1) * pageSize >= totalRows ? 'not-allowed' : 'pointer' }}>Next</button>
      </div>
    </div>
  );

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', padding: '24px' }}>
      <div style={{ marginBottom: '18px' }}>
        <h2 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: '22px' }}>Talent & Employer Intelligence</h2>
        <div style={{ color: '#64748b', fontSize: '13px' }}>
          HubSpot sales CRM activity · As of {summary.asOf ? formatEstDateTime(summary.asOf) : '—'}
        </div>
      </div>
      {sectionEnabled('salesPipelineSummary') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {[
            ['Candidates', number.format(Number(data?.contacts?.records?.length || 0))],
            ['Employer Companies', number.format(Number(data?.companies?.records?.length || 0))],
            ['Candidate–Employer Links', number.format(Number(crmReports.candidateEmployerLinks?.employerLinks || 0))],
            ['Candidates Recently Touched', number.format(Number(crmReports.engagementCoverage?.contactsWithSalesActivity || 0))],
            ['Sales Activities', number.format(Number(summary.activityCount || 0))],
          ].map(([label, value]) => (
            <div key={label} style={{ ...reportStyle, marginBottom: 0 }}>
              <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 700 }}>{label}</div>
              <div style={{ color: '#0f172a', fontSize: '22px', fontWeight: 800, marginTop: '5px' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
      {sectionEnabled('salesDealsByStage') && hasDeals && (
        <div style={reportStyle}>
          <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '16px' }}>Deals by Stage</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{sortableHeader('stages', 'stage', 'Stage')}{sortableHeader('stages', 'dealCount', 'Deals')}{sortableHeader('stages', 'pipelineValue', 'Value')}</tr></thead>
            <tbody>{sortRows(data?.stages || [], 'stages').map((row: any) => <tr key={row.stage}><td style={cellStyle}>{row.stage}</td><td style={cellStyle}>{number.format(row.dealCount)}</td><td style={cellStyle}>{money.format(row.pipelineValue)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
        <div style={reportStyle}>
          <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '16px' }}>Employer Market Profile</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{sortableHeader('companyIndustry', 'industry', 'Industry')}{sortableHeader('companyIndustry', 'count', 'Companies')}</tr></thead>
            <tbody>{sortRows(crmReports.companyIndustry || [], 'companyIndustry').flatMap((row: any) => {
              const isExpanded = expandedIndustry === row.industry;
              const employers = employersForIndustry(row.industry);
              return [
                <tr key={row.industry}>
                  <td style={cellStyle}><button type="button" onClick={() => setExpandedIndustry(isExpanded ? null : row.industry)} aria-expanded={isExpanded} style={{ padding: 0, border: 0, background: 'transparent', color: '#0369a1', font: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>{isExpanded ? '− ' : '+ '}{row.industry}</button></td>
                  <td style={cellStyle}>{number.format(row.count)}</td>
                </tr>,
                ...(isExpanded ? [<tr key={`${row.industry}-employers`}><td colSpan={2} style={{ ...cellStyle, background: '#f8fafc' }}><div style={{ color: '#475569', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Employers in {row.industry}</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{employers.map((employer: any) => <span key={employer.id} style={{ padding: '4px 7px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white', fontSize: '12px' }}>{employer.properties?.name || 'Unnamed employer'}</span>)}</div></td></tr>] : []),
              ];
            })}</tbody>
          </table>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
        <div style={reportStyle}>
          <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '16px' }}>Sales Activity by Owner</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{sortableHeader('activityOwner', 'owner', 'Owner')}{sortableHeader('activityOwner', 'count', 'Activities')}</tr></thead>
            <tbody>{sortRows(crmReports.activityByOwner || [], 'activityOwner').map((row: any) => <tr key={row.owner}><td style={cellStyle}>{row.owner}</td><td style={cellStyle}>{number.format(row.count)}</td></tr>)}</tbody>
          </table>
        </div>
        <div style={reportStyle}>
          <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '16px' }}>Sales Activity Status</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{sortableHeader('activityStatus', 'status', 'Status / Outcome')}{sortableHeader('activityStatus', 'count', 'Activities')}</tr></thead>
            <tbody>{sortRows(crmReports.activityByStatus || [], 'activityStatus').flatMap((row: any) => {
              const status = row.status || '—';
              const isExpanded = expandedActivityStatus === status;
              return [
                <tr key={status}><td style={cellStyle}><button type="button" onClick={() => setExpandedActivityStatus(isExpanded ? null : status)} aria-expanded={isExpanded} style={{ padding: 0, border: 0, background: 'transparent', color: '#0369a1', font: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>{isExpanded ? '− ' : '+ '}{status}</button></td><td style={cellStyle}>{number.format(row.count)}</td></tr>,
                ...(isExpanded ? [<tr key={`${status}-detail`}><td colSpan={2} style={{ ...cellStyle, background: '#f8fafc' }}><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('activityStatusDetails', 'type', 'Activity')}{sortableHeader('activityStatusDetails', 'subject', 'Subject')}{sortableHeader('activityStatusDetails', 'owner', 'Owner')}{sortableHeader('activityStatusDetails', 'timestamp', 'Date')}{sortableHeader('activityStatusDetails', 'durationSeconds', 'Duration')}</tr></thead><tbody>{statusActivityRows.map((activity: any) => <tr key={activity.id}><td style={cellStyle}>{activity.type}</td><td style={cellStyle}>{activity.subject}</td><td style={cellStyle}>{activity.owner}</td><td style={cellStyle}>{formatHubSpotTimestamp(activity.timestamp)}</td><td style={cellStyle}>{activity.durationSeconds == null ? '—' : `${Math.round(activity.durationSeconds / 60)} min`}</td></tr>)}</tbody></table></div></td></tr>] : []),
              ];
            })}</tbody>
          </table>
        </div>
        <div style={reportStyle}>
          <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '16px' }}>Activity Timeline</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{sortableHeader('activityMonth', 'period', 'Month')}{sortableHeader('activityMonth', 'count', 'Activities')}</tr></thead>
            <tbody>{sortRows(crmReports.activityByMonth || [], 'activityMonth').map((row: any) => <tr key={row.period}><td style={cellStyle}>{row.period}</td><td style={cellStyle}>{number.format(row.count)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={reportStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', color: '#0f172a', fontSize: '16px' }}>Employer Directory</h3>
            <div style={{ color: '#64748b', fontSize: '12px' }}>Current employers, industry classification, lifecycle, and sales activity</div>
          </div>
          <input value={companySearch} onChange={(event) => { setCompanySearch(event.target.value); setCompanyPage(0); }} placeholder="Search employers" style={{ width: '220px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '7px 9px', fontSize: '12px' }} />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{sortableHeader('companies', 'name', 'Employer')}{sortableHeader('companies', 'industry', 'Industry')}{sortableHeader('companies', 'lifecyclestage', 'Lifecycle')}{sortableHeader('companies', 'type', 'Type')}{sortableHeader('companies', 'hs_last_sales_activity_timestamp', 'Last Sales Activity')}</tr></thead>
          <tbody>{visibleCompanies.map((row: any) => <tr key={row.id}><td style={cellStyle}>{row.properties?.name || '—'}</td><td style={cellStyle}>{row.properties?.industry || '—'}</td><td style={cellStyle}>{row.properties?.lifecyclestage || '—'}</td><td style={cellStyle}>{row.properties?.type || '—'}</td><td style={cellStyle}>{formatHubSpotTimestamp(row.properties?.hs_last_sales_activity_timestamp)}</td></tr>)}</tbody>
        </table>
        {pagination(companyPage, companyRows.length, setCompanyPage)}
      </div>
      <div style={{ ...reportStyle, order: -1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', color: '#0f172a', fontSize: '16px' }}>Candidate Directory</h3>
            <div style={{ color: '#64748b', fontSize: '12px' }}>Prospective hires, current role, lifecycle, source, and sales activity</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select value={selectedEmployer} onChange={(event) => { setSelectedEmployer(event.target.value); setContactPage(0); }} style={{ width: '220px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '7px 9px', fontSize: '12px', background: 'white' }}>
              <option value="">All current employers</option>
              {employerOptions.map((employer) => <option key={employer} value={employer}>{employer}</option>)}
            </select>
            <input value={contactSearch} onChange={(event) => { setContactSearch(event.target.value); setContactPage(0); }} placeholder="Search candidates" style={{ width: '220px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '7px 9px', fontSize: '12px' }} />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{sortableHeader('contacts', 'contact', 'Candidate')}{sortableHeader('contacts', 'email', 'Email')}{sortableHeader('contacts', 'phone', 'Phone')}{sortableHeader('contacts', 'mobilephone', 'Mobile')}{sortableHeader('contacts', 'employer', 'Current Employer')}{sortableHeader('contacts', 'jobtitle', 'Current Role')}{sortableHeader('contacts', 'city', 'City')}{sortableHeader('contacts', 'state', 'State')}{sortableHeader('contacts', 'country', 'Country')}{sortableHeader('contacts', 'lifecyclestage', 'Lifecycle')}{sortableHeader('contacts', 'hs_analytics_source', 'Source')}{sortableHeader('contacts', 'createdate', 'Created')}{sortableHeader('contacts', 'hs_last_sales_activity_timestamp', 'Last Sales Activity')}</tr></thead>
            <tbody>{visibleContacts.map((row: any) => <tr key={row.id}><td style={cellStyle}>{[row.properties?.firstname, row.properties?.lastname].filter(Boolean).join(' ') || '—'}</td><td style={cellStyle}>{row.properties?.email || '—'}</td><td style={cellStyle}>{row.properties?.phone || '—'}</td><td style={cellStyle}>{row.properties?.mobilephone || '—'}</td><td style={cellStyle}>{contactEmployer(row)}</td><td style={cellStyle}>{row.properties?.jobtitle || '—'}</td><td style={cellStyle}>{row.properties?.city || '—'}</td><td style={cellStyle}>{row.properties?.state || '—'}</td><td style={cellStyle}>{row.properties?.country || '—'}</td><td style={cellStyle}>{row.properties?.lifecyclestage || '—'}</td><td style={cellStyle}>{row.properties?.hs_analytics_source || '—'}</td><td style={cellStyle}>{formatHubSpotTimestamp(row.properties?.createdate)}</td><td style={cellStyle}>{formatHubSpotTimestamp(row.properties?.hs_last_sales_activity_timestamp)}</td></tr>)}</tbody>
          </table>
        </div>
        {pagination(contactPage, contactRows.length, setContactPage)}
      </div>
      </div>
      <div style={reportStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', color: '#0f172a', fontSize: '16px' }}>Sales Activity Detail</h3>
            <div style={{ color: '#64748b', fontSize: '12px' }}>Individual HubSpot calls, meetings, and candidate tasks</div>
          </div>
          <input value={activitySearch} onChange={(event) => { setActivitySearch(event.target.value); setActivityPage(0); }} placeholder="Search activities" style={{ width: '220px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '7px 9px', fontSize: '12px' }} />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{sortableHeader('activityDetails', 'type', 'Activity')}{sortableHeader('activityDetails', 'subject', 'Subject')}{sortableHeader('activityDetails', 'status', 'Status / Outcome')}{sortableHeader('activityDetails', 'owner', 'Owner')}{sortableHeader('activityDetails', 'timestamp', 'Date')}{sortableHeader('activityDetails', 'durationSeconds', 'Duration')}</tr></thead>
          <tbody>{visibleActivities.map((row: any) => <tr key={row.id}><td style={cellStyle}>{row.type}</td><td style={cellStyle}>{row.subject}</td><td style={cellStyle}>{row.status}</td><td style={cellStyle}>{row.owner}</td><td style={cellStyle}>{formatHubSpotTimestamp(row.timestamp)}</td><td style={cellStyle}>{row.durationSeconds == null ? '—' : `${Math.round(row.durationSeconds / 60)} min`}</td></tr>)}</tbody>
        </table>
        {pagination(activityPage, activityRows.length, setActivityPage)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
        {sectionEnabled('salesRepLeaderboard') && (
          <div style={reportStyle}>
            <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '16px' }}>Rep Leaderboard</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{sortableHeader('reps', 'owner', 'Owner')}{sortableHeader('reps', 'openPipeline', 'Open Pipeline')}{sortableHeader('reps', 'wonRevenue', 'Won')}</tr></thead>
              <tbody>{sortRows(data?.reps || [], 'reps').map((row: any) => <tr key={row.owner}><td style={cellStyle}>{row.owner}</td><td style={cellStyle}>{money.format(row.openPipeline)}</td><td style={cellStyle}>{money.format(row.wonRevenue)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {sectionEnabled('salesActivitySummary') && (
          <div style={reportStyle}>
            <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: '16px' }}>Sales Activity</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{sortableHeader('activities', 'type', 'Activity')}{sortableHeader('activities', 'count', 'Count')}</tr></thead>
              <tbody>{sortRows(data?.activities || [], 'activities').map((row: any) => <tr key={row.type}><td style={cellStyle}>{String(row.type).replace(/^./, (value: string) => value.toUpperCase())}</td><td style={cellStyle}>{number.format(row.count)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
