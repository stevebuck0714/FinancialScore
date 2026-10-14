'use client';

import { useEffect, useState } from 'react';
import { addEstCalendarMonths, formatEstDate, formatEstDateLabel, formatEstDateTime } from '@/lib/time/eastern';
import type { CrmOpportunity } from '@/lib/crm/sales-data';
import SortableReportCollection, { type SortableReportCollectionItem } from './SortableReportCollection';

type Props = {
  selectedCompanyId: string;
  isSectionEnabled: (sectionKey: string) => boolean;
  canReorderReports?: boolean;
  isSavingReportLayout?: boolean;
  reportOrder?: string[];
  onSaveReportOrder?: (orderedIds: string[]) => void;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('en-US');
const percent = (value: number | null) => (value == null ? '—' : `${Math.round(value)}%`);
const CTR_PAYROLL_SERVICES_COMPANY_ID = 'cmtu0xvr20000l204ooks14kn';
const STALE_OPPORTUNITY_DAYS = 30;

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
}

function buildCtrPayrollMockCrmData() {
  const asOf = new Date().toISOString();
  const today = formatEstDate();
  const companies = [
    { id: 'ctr-company-1', properties: { name: 'Northstar Benefits Group', industry: 'Professional Services', lifecyclestage: 'opportunity', type: 'Prospect', hs_last_sales_activity_timestamp: asOf } },
    { id: 'ctr-company-2', properties: { name: 'Summit Workforce Solutions', industry: 'Staffing', lifecyclestage: 'marketingqualifiedlead', type: 'Prospect', hs_last_sales_activity_timestamp: asOf } },
    { id: 'ctr-company-3', properties: { name: 'Harborview Medical Group', industry: 'Healthcare', lifecyclestage: 'salesqualifiedlead', type: 'Prospect', hs_last_sales_activity_timestamp: asOf } },
    { id: 'ctr-company-4', properties: { name: 'Pinecrest Manufacturing', industry: 'Manufacturing', lifecyclestage: 'opportunity', type: 'Prospect', hs_last_sales_activity_timestamp: asOf } },
    { id: 'ctr-company-5', properties: { name: 'Crescent Logistics', industry: 'Transportation', lifecyclestage: 'salesqualifiedlead', type: 'Prospect', hs_last_sales_activity_timestamp: asOf } },
    { id: 'ctr-company-6', properties: { name: 'Evergreen Home Services', industry: 'Home Services', lifecyclestage: 'marketingqualifiedlead', type: 'Prospect', hs_last_sales_activity_timestamp: asOf } },
    { id: 'ctr-company-7', properties: { name: 'Stonebridge Advisory', industry: 'Professional Services', lifecyclestage: 'subscriber', type: 'Prospect', hs_last_sales_activity_timestamp: asOf } },
    { id: 'ctr-company-8', properties: { name: 'Blue Ridge Hospitality', industry: 'Hospitality', lifecyclestage: 'opportunity', type: 'Prospect', hs_last_sales_activity_timestamp: asOf } },
  ];
  const contacts = [
    { id: 'ctr-contact-1', properties: { firstname: 'Avery', lastname: 'Morgan', email: 'avery.morgan@example.com', phone: '555-0101', jobtitle: 'Chief Financial Officer', city: 'Tampa', state: 'FL', country: 'US', lifecyclestage: 'opportunity', hs_analytics_source: 'Referral', createdate: asOf, hs_last_sales_activity_timestamp: asOf }, associations: { companies: { results: [{ id: 'ctr-company-1' }] } } },
    { id: 'ctr-contact-2', properties: { firstname: 'Jordan', lastname: 'Lee', email: 'jordan.lee@example.com', phone: '555-0102', jobtitle: 'VP of Operations', city: 'Atlanta', state: 'GA', country: 'US', lifecyclestage: 'salesqualifiedlead', hs_analytics_source: 'Organic search', createdate: asOf, hs_last_sales_activity_timestamp: asOf }, associations: { companies: { results: [{ id: 'ctr-company-2' }] } } },
    { id: 'ctr-contact-3', properties: { firstname: 'Casey', lastname: 'Rivera', email: 'casey.rivera@example.com', phone: '555-0103', jobtitle: 'Payroll Director', city: 'Charlotte', state: 'NC', country: 'US', lifecyclestage: 'marketingqualifiedlead', hs_analytics_source: 'Event', createdate: asOf, hs_last_sales_activity_timestamp: asOf }, associations: { companies: { results: [{ id: 'ctr-company-3' }] } } },
    { id: 'ctr-contact-4', properties: { firstname: 'Riley', lastname: 'Chen', email: 'riley.chen@example.com', phone: '555-0104', jobtitle: 'Controller', city: 'Nashville', state: 'TN', country: 'US', lifecyclestage: 'opportunity', hs_analytics_source: 'Referral', createdate: asOf, hs_last_sales_activity_timestamp: asOf }, associations: { companies: { results: [{ id: 'ctr-company-4' }] } } },
    { id: 'ctr-contact-5', properties: { firstname: 'Morgan', lastname: 'Patel', email: 'morgan.patel@example.com', phone: '555-0105', jobtitle: 'Human Resources Director', city: 'Jacksonville', state: 'FL', country: 'US', lifecyclestage: 'salesqualifiedlead', hs_analytics_source: 'Partner', createdate: asOf, hs_last_sales_activity_timestamp: asOf }, associations: { companies: { results: [{ id: 'ctr-company-5' }] } } },
    { id: 'ctr-contact-6', properties: { firstname: 'Quinn', lastname: 'Baker', email: 'quinn.baker@example.com', phone: '555-0106', jobtitle: 'Owner', city: 'Orlando', state: 'FL', country: 'US', lifecyclestage: 'marketingqualifiedlead', hs_analytics_source: 'Paid search', createdate: asOf, hs_last_sales_activity_timestamp: asOf }, associations: { companies: { results: [{ id: 'ctr-company-6' }] } } },
    { id: 'ctr-contact-7', properties: { firstname: 'Parker', lastname: 'Wright', email: 'parker.wright@example.com', phone: '555-0107', jobtitle: 'Managing Partner', city: 'Raleigh', state: 'NC', country: 'US', lifecyclestage: 'subscriber', hs_analytics_source: 'Organic search', createdate: asOf, hs_last_sales_activity_timestamp: asOf }, associations: { companies: { results: [{ id: 'ctr-company-7' }] } } },
    { id: 'ctr-contact-8', properties: { firstname: 'Drew', lastname: 'Santos', email: 'drew.santos@example.com', phone: '555-0108', jobtitle: 'General Manager', city: 'Savannah', state: 'GA', country: 'US', lifecyclestage: 'opportunity', hs_analytics_source: 'Event', createdate: asOf, hs_last_sales_activity_timestamp: asOf }, associations: { companies: { results: [{ id: 'ctr-company-8' }] } } },
  ];
  const activityDetails = [
    { id: 'ctr-activity-1', type: 'Call', subject: 'Discovery call — payroll requirements', status: 'Completed', owner: 'Morgan Smith', timestamp: asOf, durationSeconds: 1800 },
    { id: 'ctr-activity-2', type: 'Meeting', subject: 'Demo — employer onboarding workflow', status: 'Completed', owner: 'Taylor Davis', timestamp: asOf, durationSeconds: 2700 },
    { id: 'ctr-activity-3', type: 'Task', subject: 'Send pricing proposal', status: 'Open', owner: 'Morgan Smith', timestamp: asOf, durationSeconds: null },
    { id: 'ctr-activity-4', type: 'Email', subject: 'Follow up on payroll tax questions', status: 'Completed', owner: 'Taylor Davis', timestamp: asOf, durationSeconds: null },
    { id: 'ctr-activity-5', type: 'Call', subject: 'Review multi-state payroll requirements', status: 'Completed', owner: 'Morgan Smith', timestamp: asOf, durationSeconds: 2100 },
    { id: 'ctr-activity-6', type: 'Meeting', subject: 'Proposal review with finance team', status: 'Scheduled', owner: 'Taylor Davis', timestamp: asOf, durationSeconds: 3600 },
    { id: 'ctr-activity-7', type: 'Task', subject: 'Prepare implementation timeline', status: 'Open', owner: 'Morgan Smith', timestamp: asOf, durationSeconds: null },
    { id: 'ctr-activity-8', type: 'Email', subject: 'Share client reference materials', status: 'Completed', owner: 'Taylor Davis', timestamp: asOf, durationSeconds: null },
    { id: 'ctr-activity-9', type: 'Call', subject: 'Contract and renewal terms review', status: 'Completed', owner: 'Morgan Smith', timestamp: asOf, durationSeconds: 1500 },
    { id: 'ctr-activity-10', type: 'Meeting', subject: 'Executive pricing discussion', status: 'Scheduled', owner: 'Taylor Davis', timestamp: asOf, durationSeconds: 2400 },
  ];
  const stageNames = ['Discovery', 'Qualified', 'Proposal', 'Contract Review'];
  const sources = ['Referral', 'Organic search', 'Event', 'Partner', 'Paid search'];
  const owners = ['Morgan Smith', 'Taylor Davis'];
  const opportunities: CrmOpportunity[] = Array.from({ length: 48 }, (_, index) => {
    const createdDate = addEstCalendarMonths(today, -(index % 12)).slice(0, 8) + String(1 + (index % 27)).padStart(2, '0');
    const status = index % 5 === 0 ? 'won' : index % 7 === 0 ? 'lost' : 'open';
    return {
      id: `ctr-opportunity-${index + 1}`,
      name: `${companies[index % companies.length].properties.name} — Payroll Services`,
      pipeline: 'New Business',
      stage: status === 'won' ? 'Closed Won' : status === 'lost' ? 'Closed Lost' : stageNames[index % stageNames.length],
      owner: owners[index % owners.length],
      value: 8000 + ((index * 3731) % 42000),
      status,
      source: sources[index % sources.length],
      companyName: companies[index % companies.length].properties.name,
      createdDate: createdDate > today ? today : createdDate,
      closedDate: status === 'open' ? null : (createdDate > today ? today : createdDate),
      lastStageChangeDate: addEstCalendarMonths(today, -(index % 4)),
    };
  });
  return {
    isMockData: true,
    providerLabel: 'Sample CRM',
    summary: { asOf, totalDeals: opportunities.length, activityCount: activityDetails.length },
    stages: [],
    reps: [],
    activities: [],
    opportunities,
    companies: { records: companies },
    contacts: { records: contacts },
    activityDetails,
    crmReports: {
      candidateEmployerLinks: { employerLinks: contacts.length },
      engagementCoverage: { contactsWithSalesActivity: contacts.length },
      companyIndustry: [
        { industry: 'Professional Services', count: 2 },
        { industry: 'Staffing', count: 1 },
        { industry: 'Healthcare', count: 1 },
        { industry: 'Manufacturing', count: 1 },
        { industry: 'Transportation', count: 1 },
        { industry: 'Home Services', count: 1 },
        { industry: 'Hospitality', count: 1 },
      ],
      activityByOwner: [
        { owner: 'Morgan Smith', count: 5 },
        { owner: 'Taylor Davis', count: 5 },
      ],
      activityByStatus: [
        { status: 'Completed', count: 6 },
        { status: 'Open', count: 2 },
        { status: 'Scheduled', count: 2 },
      ],
      activityByMonth: [{ period: today.slice(0, 7), count: activityDetails.length }],
    },
  };
}

export default function CrmSalesTab({
  selectedCompanyId,
  isSectionEnabled,
  canReorderReports = false,
  isSavingReportLayout = false,
  reportOrder = [],
  onSaveReportOrder,
}: Props) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [notConnected, setNotConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [companySearch, setCompanySearch] = useState('');
  const [companyPage, setCompanyPage] = useState(0);
  const [contactSearch, setContactSearch] = useState('');
  const [contactPage, setContactPage] = useState(0);
  const [selectedEmployer, setSelectedEmployer] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityPage, setActivityPage] = useState(0);
  const [agingPage, setAgingPage] = useState(0);
  const [selectedPipeline, setSelectedPipeline] = useState('');
  const [expandedIndustry, setExpandedIndustry] = useState<string | null>(null);
  const [expandedActivityStatus, setExpandedActivityStatus] = useState<string | null>(null);
  const [tableSorts, setTableSorts] = useState<Record<string, { key: string; direction: 'asc' | 'desc' }>>({});

  useEffect(() => {
    let cancelled = false;
    // This effect resets asynchronous request state when the selected company changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError('');
    setNotConnected(false);
    const salesDataRequest = selectedCompanyId === CTR_PAYROLL_SERVICES_COMPANY_ID
      ? Promise.resolve(buildCtrPayrollMockCrmData())
      : fetch(`/api/operational-system-integrations/crm/sales?companyId=${encodeURIComponent(selectedCompanyId)}`, { cache: 'no-store' })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (payload?.code === 'CRM_NOT_CONNECTED') return { notConnected: true, error: payload.error };
          if (!response.ok) throw new Error(payload?.error || 'Failed to load CRM sales data.');
          return payload;
        });
    salesDataRequest
      .then((payload: any) => {
        if (cancelled) return;
        if (payload?.notConnected) {
          setNotConnected(true);
          setError(String(payload.error || ''));
          return;
        }
        setData(payload);
      })
      .catch((loadError: Error) => { if (!cancelled) setError(loadError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedCompanyId]);

  if (loading) return <div style={{ padding: '32px', color: '#64748b' }}>Loading CRM sales data…</div>;
  if (notConnected) return <div style={{ padding: '32px', color: '#475569' }}>{error}</div>;
  if (error) return <div style={{ padding: '32px', color: '#991b1b' }}>{error}</div>;

  const today = formatEstDate();
  const summary = data?.summary || {};
  const crmReports = data?.crmReports || {};
  const providerLabel = String(data?.providerLabel || 'CRM');
  const hasDeals = Number(summary.totalDeals || 0) > 0;
  const showCogentView = isSectionEnabled('salesPipelineSummary');
  const opportunities: CrmOpportunity[] = Array.isArray(data?.opportunities) ? data.opportunities : [];
  const hasOpportunities = opportunities.length > 0;
  const reportStyle = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '16px' };
  const cellStyle = { padding: '9px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px', textAlign: 'left' as const };
  const headingStyle = { ...cellStyle, color: '#475569', fontWeight: 700, background: '#f8fafc' };
  const titleStyle = { margin: '0 0 12px', color: '#0f172a', fontSize: '16px' };
  const pageSize = 25;
  const formatCrmTimestamp = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    return formatEstDateLabel(/^\d+$/.test(raw) ? new Date(Number(raw)) : raw) || '—';
  };
  const formatCalendarDate = (value: string | null) => {
    if (!value) return '—';
    const [year, month, day] = value.split('-');
    return `${month}/${day}/${year}`;
  };
  const rowMatches = (row: any, query: string) => !query.trim() || Object.values(row?.properties || {}).some((value) => String(value || '').toLowerCase().includes(query.trim().toLowerCase()));
  const sortRows = (rows: any[], table: string, getValue: (row: any, key: string) => unknown = (row, key) => row[key]) => {
    const sort = tableSorts[table];
    if (!sort) return rows;
    return [...rows].sort((left, right) => {
      const a = getValue(left, sort.key);
      const b = getValue(right, sort.key);
      const numericA = Number(a);
      const numericB = Number(b);
      const compared = Number.isFinite(numericA) && Number.isFinite(numericB) ? numericA - numericB : String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      return sort.direction === 'asc' ? compared : -compared;
    });
  };
  const toggleSort = (table: string, key: string) => setTableSorts((current) => {
    const existing = current[table];
    return { ...current, [table]: { key, direction: existing?.key === key && existing.direction === 'asc' ? 'desc' : 'asc' } };
  });
  const sortableHeader = (table: string, key: string, label: string) => {
    const sort = tableSorts[table];
    const indicator = sort?.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : '';
    return <th key={`${table}-${key}`} style={headingStyle} aria-sort={sort?.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => toggleSort(table, key)} style={{ padding: 0, border: 0, background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: 'inherit', cursor: 'pointer' }}>{label}{indicator}</button></th>;
  };
  const pagination = (page: number, totalRows: number, setPage: (nextPage: number) => void) => <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', color: '#64748b', fontSize: '12px' }}><span>{totalRows ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, totalRows)} of ${number.format(totalRows)}` : 'No records'}</span><div style={{ display: 'flex', gap: '8px' }}><button type="button" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>Previous</button><button type="button" onClick={() => setPage(page + 1)} disabled={(page + 1) * pageSize >= totalRows}>Next</button></div></div>;
  const emptyRow = (columns: number, message: string) => <tr><td colSpan={columns} style={{ ...cellStyle, color: '#94a3b8' }}>{message}</td></tr>;

  const companyRows = sortRows((data?.companies?.records || []).filter((row: any) => rowMatches(row, companySearch)), 'companies', (row, key) => row.properties?.[key]);
  const companyNameById = new Map((data?.companies?.records || []).map((row: any) => [String(row.id), String(row.properties?.name || 'Unnamed company')]));
  const contactCompany = (row: any) => Array.from(new Set((row.associations?.companies?.results || []).map((association: any) => companyNameById.get(String(association.id))).filter(Boolean) as string[])).join(', ') || '—';
  const companyOptions = Array.from(
    new Set<string>((data?.contacts?.records || []).map((row: any) => String(contactCompany(row))).filter((name: string) => name !== '—'))
  ).sort();
  const contactRows = sortRows((data?.contacts?.records || []).filter((row: any) => rowMatches(row, contactSearch) && (!selectedEmployer || contactCompany(row) === selectedEmployer)), 'contacts', (row, key) => key === 'contact' ? [row.properties?.firstname, row.properties?.lastname].filter(Boolean).join(' ') : key === 'employer' ? contactCompany(row) : row.properties?.[key]);
  const activityRows = sortRows((data?.activityDetails || []).filter((row: any) => Object.values(row).some((value) => String(value || '').toLowerCase().includes(activitySearch.trim().toLowerCase()))), 'activityDetails');
  const visibleCompanies = companyRows.slice(companyPage * pageSize, (companyPage + 1) * pageSize);
  const visibleContacts = contactRows.slice(contactPage * pageSize, (contactPage + 1) * pageSize);
  const visibleActivities = activityRows.slice(activityPage * pageSize, (activityPage + 1) * pageSize);
  const statusActivityRows = expandedActivityStatus == null ? [] : sortRows((data?.activityDetails || []).filter((row: any) => (row.status || '—') === expandedActivityStatus), 'activityStatusDetails');
  const companiesForIndustry = (industry: string) => (data?.companies?.records || []).filter((row: any) => (String(row.properties?.industry || '').trim() || 'Unspecified') === industry).sort((left: any, right: any) => String(left.properties?.name || '').localeCompare(String(right.properties?.name || '')));

  const yearAgo = addEstCalendarMonths(today, -12);
  const monthAgo = addEstCalendarMonths(today, -1);
  const openOpportunities = opportunities.filter((opportunity) => opportunity.status === 'open');
  const closedLastYear = opportunities.filter((opportunity) => (opportunity.status === 'won' || opportunity.status === 'lost') && opportunity.closedDate && opportunity.closedDate >= yearAgo);
  const wonLastYear = closedLastYear.filter((opportunity) => opportunity.status === 'won');
  const winRate = (won: number, lost: number) => (won + lost ? (won / (won + lost)) * 100 : null);
  const openPipelineValue = openOpportunities.reduce((sum, opportunity) => sum + opportunity.value, 0);
  const wonValueLastYear = wonLastYear.reduce((sum, opportunity) => sum + opportunity.value, 0);
  const pipelineNames = Array.from(new Set(opportunities.map((opportunity) => opportunity.pipeline))).sort();
  const stageRows = Array.from(
    openOpportunities
      .filter((opportunity) => !selectedPipeline || opportunity.pipeline === selectedPipeline)
      .reduce((map, opportunity) => {
        const key = `${opportunity.pipeline}::${opportunity.stage}`;
        const row = map.get(key) || { pipeline: opportunity.pipeline, stage: opportunity.stage, count: 0, value: 0 };
        row.count += 1;
        row.value += opportunity.value;
        return map.set(key, row);
      }, new Map<string, { pipeline: string; stage: string; count: number; value: number }>())
      .values()
  ).sort((a, b) => b.value - a.value);
  const months = Array.from({ length: 12 }, (_, index) => addEstCalendarMonths(today, -index).slice(0, 7));
  const monthlyRows = months.map((period) => {
    const won = opportunities.filter((opportunity) => opportunity.status === 'won' && opportunity.closedDate?.startsWith(period));
    const lost = opportunities.filter((opportunity) => opportunity.status === 'lost' && opportunity.closedDate?.startsWith(period));
    return {
      period,
      wonCount: won.length,
      wonValue: won.reduce((sum, opportunity) => sum + opportunity.value, 0),
      lostCount: lost.length,
      lostValue: lost.reduce((sum, opportunity) => sum + opportunity.value, 0),
      winRate: winRate(won.length, lost.length),
    };
  });
  const groupOpportunities = (keyOf: (opportunity: CrmOpportunity) => string) => Array.from(
    opportunities.reduce((map, opportunity) => {
      const key = keyOf(opportunity) || 'Unspecified';
      const row = map.get(key) || { key, total: 0, openCount: 0, openValue: 0, wonCount: 0, wonValue: 0, lostCount: 0 };
      row.total += 1;
      if (opportunity.status === 'open') { row.openCount += 1; row.openValue += opportunity.value; }
      if (opportunity.status === 'won') { row.wonCount += 1; row.wonValue += opportunity.value; }
      if (opportunity.status === 'lost') row.lostCount += 1;
      return map.set(key, row);
    }, new Map<string, { key: string; total: number; openCount: number; openValue: number; wonCount: number; wonValue: number; lostCount: number }>())
      .values()
  ).map((row) => ({ ...row, winRate: winRate(row.wonCount, row.lostCount) }));
  const repRows = groupOpportunities((opportunity) => opportunity.owner);
  const sourceRows = groupOpportunities((opportunity) => opportunity.source);
  const agingRows = sortRows(
    openOpportunities
      .map((opportunity) => ({ ...opportunity, daysInStage: opportunity.lastStageChangeDate ? daysBetween(opportunity.lastStageChangeDate, today) : null }))
      .filter((opportunity) => opportunity.daysInStage == null || opportunity.daysInStage > STALE_OPPORTUNITY_DAYS)
      .sort((a, b) => (b.daysInStage ?? 0) - (a.daysInStage ?? 0)),
    'aging'
  );
  const visibleAging = agingRows.slice(agingPage * pageSize, (agingPage + 1) * pageSize);

  const report = (id: string, node: React.ReactNode): SortableReportCollectionItem => ({ id, node });
  const standard = (id: string, render: () => React.ReactNode, available = true) => (isSectionEnabled(id) && available ? [report(id, render())] : []);
  const reportItems: SortableReportCollectionItem[] = [
    ...standard('crmPipelineByStage', () => <div style={reportStyle}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}><h3 style={{ ...titleStyle, margin: 0 }}>Pipeline by Stage</h3>{pipelineNames.length > 1 ? <select value={selectedPipeline} onChange={(event) => setSelectedPipeline(event.target.value)}><option value="">All pipelines</option>{pipelineNames.map((name) => <option key={name} value={name}>{name}</option>)}</select> : null}</div><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('crmStages', 'pipeline', 'Pipeline')}{sortableHeader('crmStages', 'stage', 'Stage')}{sortableHeader('crmStages', 'count', 'Open Opportunities')}{sortableHeader('crmStages', 'value', 'Open Value')}</tr></thead><tbody>{stageRows.length ? sortRows(stageRows, 'crmStages').map((row: any) => <tr key={`${row.pipeline}-${row.stage}`}><td style={cellStyle}>{row.pipeline}</td><td style={cellStyle}>{row.stage}</td><td style={cellStyle}>{number.format(row.count)}</td><td style={cellStyle}>{money.format(row.value)}</td></tr>) : emptyRow(4, 'No open opportunities.')}</tbody></table></div>, hasOpportunities),
    ...standard('crmWonLostByMonth', () => <div style={reportStyle}><h3 style={titleStyle}>Won vs. Lost by Month</h3><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('crmMonthly', 'period', 'Month')}{sortableHeader('crmMonthly', 'wonCount', 'Won')}{sortableHeader('crmMonthly', 'wonValue', 'Won Value')}{sortableHeader('crmMonthly', 'lostCount', 'Lost')}{sortableHeader('crmMonthly', 'lostValue', 'Lost Value')}{sortableHeader('crmMonthly', 'winRate', 'Win Rate')}</tr></thead><tbody>{sortRows(monthlyRows, 'crmMonthly').map((row: any) => <tr key={row.period}><td style={cellStyle}>{row.period}</td><td style={cellStyle}>{number.format(row.wonCount)}</td><td style={cellStyle}>{money.format(row.wonValue)}</td><td style={cellStyle}>{number.format(row.lostCount)}</td><td style={cellStyle}>{money.format(row.lostValue)}</td><td style={cellStyle}>{percent(row.winRate)}</td></tr>)}</tbody></table></div>, hasOpportunities),
    ...standard('crmRepLeaderboard', () => <div style={reportStyle}><h3 style={titleStyle}>Sales Rep Leaderboard</h3><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('crmReps', 'key', 'Sales Rep')}{sortableHeader('crmReps', 'openCount', 'Open Opportunities')}{sortableHeader('crmReps', 'openValue', 'Open Pipeline')}{sortableHeader('crmReps', 'wonCount', 'Won')}{sortableHeader('crmReps', 'wonValue', 'Won Value')}{sortableHeader('crmReps', 'winRate', 'Win Rate')}</tr></thead><tbody>{sortRows([...repRows].sort((a, b) => b.wonValue - a.wonValue || b.openValue - a.openValue), 'crmReps').map((row: any) => <tr key={row.key}><td style={cellStyle}>{row.key}</td><td style={cellStyle}>{number.format(row.openCount)}</td><td style={cellStyle}>{money.format(row.openValue)}</td><td style={cellStyle}>{number.format(row.wonCount)}</td><td style={cellStyle}>{money.format(row.wonValue)}</td><td style={cellStyle}>{percent(row.winRate)}</td></tr>)}</tbody></table></div>, hasOpportunities),
    ...standard('crmLeadSourcePerformance', () => <div style={reportStyle}><h3 style={titleStyle}>Lead Source Performance</h3><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('crmSources', 'key', 'Lead Source')}{sortableHeader('crmSources', 'total', 'Opportunities')}{sortableHeader('crmSources', 'openValue', 'Open Pipeline')}{sortableHeader('crmSources', 'wonCount', 'Won')}{sortableHeader('crmSources', 'wonValue', 'Won Value')}{sortableHeader('crmSources', 'winRate', 'Win Rate')}</tr></thead><tbody>{sortRows([...sourceRows].sort((a, b) => b.total - a.total), 'crmSources').map((row: any) => <tr key={row.key}><td style={cellStyle}>{row.key}</td><td style={cellStyle}>{number.format(row.total)}</td><td style={cellStyle}>{money.format(row.openValue)}</td><td style={cellStyle}>{number.format(row.wonCount)}</td><td style={cellStyle}>{money.format(row.wonValue)}</td><td style={cellStyle}>{percent(row.winRate)}</td></tr>)}</tbody></table></div>, hasOpportunities),
    ...standard('crmAgingOpportunities', () => <div style={reportStyle}><h3 style={{ ...titleStyle, margin: '0 0 4px' }}>Aging / Stale Opportunities</h3><div style={{ color: '#64748b', fontSize: '12px', marginBottom: '12px' }}>Open opportunities with no stage change in more than {STALE_OPPORTUNITY_DAYS} days</div><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('aging', 'name', 'Opportunity')}{sortableHeader('aging', 'owner', 'Sales Rep')}{sortableHeader('aging', 'pipeline', 'Pipeline')}{sortableHeader('aging', 'stage', 'Stage')}{sortableHeader('aging', 'value', 'Value')}{sortableHeader('aging', 'daysInStage', 'Days in Stage')}{sortableHeader('aging', 'createdDate', 'Created')}</tr></thead><tbody>{visibleAging.length ? visibleAging.map((row: any) => <tr key={row.id}><td style={cellStyle}>{row.name}</td><td style={cellStyle}>{row.owner}</td><td style={cellStyle}>{row.pipeline}</td><td style={cellStyle}>{row.stage}</td><td style={cellStyle}>{money.format(row.value)}</td><td style={cellStyle}>{row.daysInStage == null ? '—' : number.format(row.daysInStage)}</td><td style={cellStyle}>{formatCalendarDate(row.createdDate)}</td></tr>) : emptyRow(7, 'No stale opportunities.')}</tbody></table>{pagination(agingPage, agingRows.length, setAgingPage)}</div>, hasOpportunities),
    ...(showCogentView && isSectionEnabled('salesDealsByStage') && hasDeals ? [report('salesDealsByStage', <div style={reportStyle}><h3 style={titleStyle}>Deals by Stage</h3><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('stages', 'stage', 'Stage')}{sortableHeader('stages', 'dealCount', 'Deals')}{sortableHeader('stages', 'pipelineValue', 'Value')}</tr></thead><tbody>{sortRows(data?.stages || [], 'stages').map((row: any) => <tr key={row.stage}><td style={cellStyle}>{row.stage}</td><td style={cellStyle}>{number.format(row.dealCount)}</td><td style={cellStyle}>{money.format(row.pipelineValue)}</td></tr>)}</tbody></table></div>)] : []),
    ...standard('hubspotEmployerMarketProfile', () => <div style={reportStyle}><h3 style={titleStyle}>Company Industry Profile</h3><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('companyIndustry', 'industry', 'Industry')}{sortableHeader('companyIndustry', 'count', 'Companies')}</tr></thead><tbody>{sortRows(crmReports.companyIndustry || [], 'companyIndustry').flatMap((row: any) => { const expanded = expandedIndustry === row.industry; return [<tr key={row.industry}><td style={cellStyle}><button type="button" onClick={() => setExpandedIndustry(expanded ? null : row.industry)} aria-expanded={expanded}>{expanded ? '− ' : '+ '}{row.industry}</button></td><td style={cellStyle}>{number.format(row.count)}</td></tr>, ...(expanded ? [<tr key={`${row.industry}-companies`}><td colSpan={2} style={cellStyle}>{companiesForIndustry(row.industry).map((company: any) => <span key={company.id} style={{ marginRight: '8px' }}>{company.properties?.name || 'Unnamed company'}</span>)}</td></tr>] : [])]; })}</tbody></table></div>),
    ...standard('hubspotSalesActivityByOwner', () => <div style={reportStyle}><h3 style={titleStyle}>Sales Activity by Owner</h3><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('activityOwner', 'owner', 'Owner')}{sortableHeader('activityOwner', 'count', 'Activities')}</tr></thead><tbody>{sortRows(crmReports.activityByOwner || [], 'activityOwner').map((row: any) => <tr key={row.owner}><td style={cellStyle}>{row.owner}</td><td style={cellStyle}>{number.format(row.count)}</td></tr>)}</tbody></table></div>),
    ...standard('hubspotSalesActivityStatus', () => <div style={reportStyle}><h3 style={titleStyle}>Sales Activity Status</h3><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('activityStatus', 'status', 'Status / Outcome')}{sortableHeader('activityStatus', 'count', 'Activities')}</tr></thead><tbody>{sortRows(crmReports.activityByStatus || [], 'activityStatus').flatMap((row: any) => { const status = row.status || '—'; const expanded = expandedActivityStatus === status; return [<tr key={status}><td style={cellStyle}><button type="button" onClick={() => setExpandedActivityStatus(expanded ? null : status)} aria-expanded={expanded}>{expanded ? '− ' : '+ '}{status}</button></td><td style={cellStyle}>{number.format(row.count)}</td></tr>, ...(expanded ? [<tr key={`${status}-detail`}><td colSpan={2} style={cellStyle}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('activityStatusDetails', 'type', 'Activity')}{sortableHeader('activityStatusDetails', 'subject', 'Subject')}{sortableHeader('activityStatusDetails', 'owner', 'Owner')}{sortableHeader('activityStatusDetails', 'timestamp', 'Date')}{sortableHeader('activityStatusDetails', 'durationSeconds', 'Duration')}</tr></thead><tbody>{statusActivityRows.map((activity: any) => <tr key={activity.id}><td style={cellStyle}>{activity.type}</td><td style={cellStyle}>{activity.subject}</td><td style={cellStyle}>{activity.owner}</td><td style={cellStyle}>{formatCrmTimestamp(activity.timestamp)}</td><td style={cellStyle}>{activity.durationSeconds == null ? '—' : `${Math.round(activity.durationSeconds / 60)} min`}</td></tr>)}</tbody></table></td></tr>] : [])]; })}</tbody></table></div>),
    ...standard('hubspotActivityTimeline', () => <div style={reportStyle}><h3 style={titleStyle}>Activity Timeline</h3><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('activityMonth', 'period', 'Month')}{sortableHeader('activityMonth', 'count', 'Activities')}</tr></thead><tbody>{sortRows(crmReports.activityByMonth || [], 'activityMonth').map((row: any) => <tr key={row.period}><td style={cellStyle}>{row.period}</td><td style={cellStyle}>{number.format(row.count)}</td></tr>)}</tbody></table></div>),
    ...standard('hubspotEmployerDirectory', () => <div style={reportStyle}><h3 style={{ ...titleStyle, margin: '0 0 4px' }}>Company Directory</h3><div style={{ color: '#64748b', fontSize: '12px', marginBottom: '12px' }}>Current companies, industry classification, lifecycle, and sales activity</div><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('companies', 'name', 'Company')}{sortableHeader('companies', 'industry', 'Industry')}{sortableHeader('companies', 'lifecyclestage', 'Lifecycle')}{sortableHeader('companies', 'type', 'Type')}{sortableHeader('companies', 'hs_last_sales_activity_timestamp', 'Last Sales Activity')}</tr></thead><tbody>{visibleCompanies.map((row: any) => <tr key={row.id}><td style={cellStyle}>{row.properties?.name || '—'}</td><td style={cellStyle}>{row.properties?.industry || '—'}</td><td style={cellStyle}>{row.properties?.lifecyclestage || '—'}</td><td style={cellStyle}>{row.properties?.type || '—'}</td><td style={cellStyle}>{formatCrmTimestamp(row.properties?.hs_last_sales_activity_timestamp)}</td></tr>)}</tbody></table>{pagination(companyPage, companyRows.length, setCompanyPage)}</div>),
    ...standard('hubspotCandidateDirectory', () => <div style={reportStyle}><h3 style={{ ...titleStyle, margin: '0 0 4px' }}>Contact Directory</h3><div style={{ color: '#64748b', fontSize: '12px', marginBottom: '12px' }}>Contacts, company, role, lifecycle, lead source, and sales activity</div><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('contacts', 'contact', 'Contact')}{sortableHeader('contacts', 'email', 'Email')}{sortableHeader('contacts', 'phone', 'Phone')}{sortableHeader('contacts', 'mobilephone', 'Mobile')}{sortableHeader('contacts', 'employer', 'Company')}{sortableHeader('contacts', 'jobtitle', 'Role')}{sortableHeader('contacts', 'city', 'City')}{sortableHeader('contacts', 'state', 'State')}{sortableHeader('contacts', 'country', 'Country')}{sortableHeader('contacts', 'lifecyclestage', 'Lifecycle')}{sortableHeader('contacts', 'hs_analytics_source', 'Source')}{sortableHeader('contacts', 'createdate', 'Created')}{sortableHeader('contacts', 'hs_last_sales_activity_timestamp', 'Last Sales Activity')}</tr></thead><tbody>{visibleContacts.map((row: any) => <tr key={row.id}><td style={cellStyle}>{[row.properties?.firstname, row.properties?.lastname].filter(Boolean).join(' ') || '—'}</td><td style={cellStyle}>{row.properties?.email || '—'}</td><td style={cellStyle}>{row.properties?.phone || '—'}</td><td style={cellStyle}>{row.properties?.mobilephone || '—'}</td><td style={cellStyle}>{contactCompany(row)}</td><td style={cellStyle}>{row.properties?.jobtitle || '—'}</td><td style={cellStyle}>{row.properties?.city || '—'}</td><td style={cellStyle}>{row.properties?.state || '—'}</td><td style={cellStyle}>{row.properties?.country || '—'}</td><td style={cellStyle}>{row.properties?.lifecyclestage || '—'}</td><td style={cellStyle}>{row.properties?.hs_analytics_source || '—'}</td><td style={cellStyle}>{formatCrmTimestamp(row.properties?.createdate)}</td><td style={cellStyle}>{formatCrmTimestamp(row.properties?.hs_last_sales_activity_timestamp)}</td></tr>)}</tbody></table></div>{pagination(contactPage, contactRows.length, setContactPage)}</div>),
    ...standard('hubspotSalesActivityDetail', () => <div style={reportStyle}><h3 style={{ ...titleStyle, margin: '0 0 4px' }}>Sales Activity Detail</h3><div style={{ color: '#64748b', fontSize: '12px', marginBottom: '12px' }}>Individual {providerLabel} calls, meetings, appointments, and tasks</div><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('activityDetails', 'type', 'Activity')}{sortableHeader('activityDetails', 'subject', 'Subject')}{sortableHeader('activityDetails', 'status', 'Status / Outcome')}{sortableHeader('activityDetails', 'owner', 'Owner')}{sortableHeader('activityDetails', 'timestamp', 'Date')}{sortableHeader('activityDetails', 'durationSeconds', 'Duration')}</tr></thead><tbody>{visibleActivities.map((row: any) => <tr key={row.id}><td style={cellStyle}>{row.type}</td><td style={cellStyle}>{row.subject}</td><td style={cellStyle}>{row.status}</td><td style={cellStyle}>{row.owner}</td><td style={cellStyle}>{formatCrmTimestamp(row.timestamp)}</td><td style={cellStyle}>{row.durationSeconds == null ? '—' : `${Math.round(row.durationSeconds / 60)} min`}</td></tr>)}</tbody></table>{pagination(activityPage, activityRows.length, setActivityPage)}</div>),
    ...(showCogentView && isSectionEnabled('salesRepLeaderboard') ? [report('salesRepLeaderboard', <div style={reportStyle}><h3 style={titleStyle}>Rep Leaderboard</h3><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('reps', 'owner', 'Owner')}{sortableHeader('reps', 'openPipeline', 'Open Pipeline')}{sortableHeader('reps', 'wonRevenue', 'Won')}</tr></thead><tbody>{sortRows(data?.reps || [], 'reps').map((row: any) => <tr key={row.owner}><td style={cellStyle}>{row.owner}</td><td style={cellStyle}>{money.format(row.openPipeline)}</td><td style={cellStyle}>{money.format(row.wonRevenue)}</td></tr>)}</tbody></table></div>)] : []),
    ...(showCogentView && isSectionEnabled('salesActivitySummary') ? [report('salesActivitySummary', <div style={reportStyle}><h3 style={titleStyle}>Sales Activity</h3><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('activities', 'type', 'Activity')}{sortableHeader('activities', 'count', 'Count')}</tr></thead><tbody>{sortRows(data?.activities || [], 'activities').map((row: any) => <tr key={row.type}><td style={cellStyle}>{String(row.type).replace(/^./, (value: string) => value.toUpperCase())}</td><td style={cellStyle}>{number.format(row.count)}</td></tr>)}</tbody></table></div>)] : []),
  ];

  const cogentCards: Array<[string, string]> = [
    ['Candidates', number.format(Number(data?.contacts?.records?.length || 0))],
    ['Employer Companies', number.format(Number(data?.companies?.records?.length || 0))],
    ['Candidate–Employer Links', number.format(Number(crmReports.candidateEmployerLinks?.employerLinks || 0))],
    ['Candidates Recently Touched', number.format(Number(crmReports.engagementCoverage?.contactsWithSalesActivity || 0))],
    ['Sales Activities', number.format(Number(summary.activityCount || 0))],
  ];
  const pipelineCards: Array<[string, string]> = [
    ['Open Opportunities', number.format(openOpportunities.length)],
    ['Open Pipeline Value', money.format(openPipelineValue)],
    ['Won (Last 12 Months)', money.format(wonValueLastYear)],
    ['Win Rate (Last 12 Months)', percent(winRate(wonLastYear.length, closedLastYear.length - wonLastYear.length))],
    ['Avg Won Deal Size', wonLastYear.length ? money.format(wonValueLastYear / wonLastYear.length) : '—'],
    ['New Opportunities (30 Days)', number.format(opportunities.filter((opportunity) => opportunity.createdDate && opportunity.createdDate >= monthAgo).length)],
  ];
  const renderCards = (cards: Array<[string, string]>) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards.length}, minmax(140px, 1fr))`, gap: '12px', marginBottom: '16px' }}>{cards.map(([label, value]) => <div key={label} style={{ ...reportStyle, marginBottom: 0 }}><div style={{ color: '#64748b', fontSize: '12px', fontWeight: 700 }}>{label}</div><div style={{ color: '#0f172a', fontSize: '22px', fontWeight: 800, marginTop: '5px' }}>{value}</div></div>)}</div>;
  const asOfLabel = summary.asOf ? formatEstDateTime(summary.asOf) : '—';
  const title = showCogentView ? 'Talent & Employer Intelligence' : 'Sales & Pipeline';
  const subtitle = data?.isMockData
    ? 'Sample CRM sales pipeline data for CTR Payroll Services'
    : showCogentView ? `${providerLabel} sales CRM activity` : `${providerLabel} CRM activity`;

  return <div style={{ width: '100%', boxSizing: 'border-box', padding: '24px' }}>
    <div style={{ marginBottom: '18px' }}><h2 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: '22px' }}>{title}</h2><div style={{ color: '#64748b', fontSize: '13px' }}>{subtitle} · As of {asOfLabel}</div></div>
    {showCogentView ? renderCards(cogentCards) : null}
    {isSectionEnabled('crmPipelineSummary') && hasOpportunities ? renderCards(pipelineCards) : null}
    {Array.isArray(data?.warnings) && data.warnings.length ? <div style={{ marginBottom: '12px', color: '#92400e', fontSize: '12px' }}>Some {providerLabel} data could not be read: {data.warnings.join('; ')}</div> : null}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
      <input value={companySearch} onChange={(event) => { setCompanySearch(event.target.value); setCompanyPage(0); }} placeholder={showCogentView ? 'Search employers' : 'Search companies'} />
      <select value={selectedEmployer} onChange={(event) => { setSelectedEmployer(event.target.value); setContactPage(0); }}><option value="">{showCogentView ? 'All current employers' : 'All companies'}</option>{companyOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select>
      <input value={contactSearch} onChange={(event) => { setContactSearch(event.target.value); setContactPage(0); }} placeholder={showCogentView ? 'Search candidates' : 'Search contacts'} />
      <input value={activitySearch} onChange={(event) => { setActivitySearch(event.target.value); setActivityPage(0); }} placeholder="Search activities" />
    </div>
    <SortableReportCollection items={reportItems} persistedOrder={reportOrder} canReorder={canReorderReports} isSaving={isSavingReportLayout} onReorder={(orderedIds) => onSaveReportOrder?.(orderedIds)} />
  </div>;
}
