'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCompanyMoneyFormatter } from '@/app/hooks/useCompanyMoneyFormatter';
import PropertyIncomeStatementTable from '@/app/components/financial/PropertyIncomeStatementTable';
import PropertyBalanceSheetTable from '@/app/components/financial/PropertyBalanceSheetTable';
import StatementTrendPopup from '@/app/components/financial/StatementTrendPopup';
import RealEstateWaterfallPanel from '@/app/components/operations/RealEstateWaterfallPanel';
import ReportPlaceholder from '@/app/components/operations/ReportPlaceholder';
import { useTableSort } from '@/app/components/operations/useTableSort';
import { computeWaterfall, type WaterfallEntry, type WaterfallInvestor, type WaterfallSettings } from '@/lib/real-estate/waterfall';
import { formatEstDate } from '@/lib/time/eastern';

type Props = {
  selectedCompanyId: string;
  mode: 'property' | 'investors' | 'entity-financials';
  operationalHubSections?: Record<string, boolean | undefined>;
};

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 };
const th: React.CSSProperties = { padding: '9px 10px', textAlign: 'left', fontSize: 11, color: '#475569', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' };
const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13 };

type PropertyTypeFilter = 'all' | 'income' | 'expenses' | 'assets' | 'liabilities';
const normalizeAccountType = (type: unknown) => String(type || '').toLowerCase().replace(/[^a-z]/g, '');
const PROPERTY_TYPE_FILTERS: Record<PropertyTypeFilter, string[] | null> = {
  all: null,
  income: ['income'],
  expenses: ['expense'],
  assets: ['bank', 'accountsreceivable', 'othercurrentasset', 'fixedasset', 'otherasset'],
  liabilities: ['accountspayable', 'creditcard', 'othercurrentliability', 'longtermdebt', 'longtermliability'],
};
const formatMonthLabel = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthNumber - 1]} ${year}`;
};

export default function RealEstateOperationsTab({ selectedCompanyId, mode, operationalHubSections }: Props) {
  const money = useCompanyMoneyFormatter(selectedCompanyId);
  const [data, setData] = useState<{ lines: any[]; investors: any[]; occupancy: any[]; mappings?: any[]; waterfallSettings?: WaterfallSettings; aliases?: Array<{ alias: string; investorId: string }> }>({ lines: [], investors: [], occupancy: [], mappings: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const [entityView, setEntityView] = useState<'statement' | 'balance'>('statement');
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<PropertyTypeFilter>('all');
  const [propertyPeriod, setPropertyPeriod] = useState<'current-month' | 'current-quarter' | 'last-12-months' | 'ytd' | 'last-year' | 'last-3-years'>('last-12-months');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [selectedPropertyRowKey, setSelectedPropertyRowKey] = useState<string | null>(null);
  const [propertyEntity, setPropertyEntity] = useState<'ALL' | 'SLN' | 'BGAH'>('ALL');
  const [propertyDisplay, setPropertyDisplay] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [entityScope, setEntityScope] = useState<'SLN' | 'BGAH' | 'COMBINED'>('SLN');
  const [entityStatementPeriod, setEntityStatementPeriod] = useState<'current-month' | 'current-quarter' | 'last-12-months' | 'ytd' | 'last-year' | 'last-3-years'>('last-12-months');
  const [entityStatementDisplay, setEntityStatementDisplay] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const fmt = (value: unknown) => Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: money.currency, maximumFractionDigits: 0 });
  const { sortRows, sortableHeader } = useTableSort(th);
  const toggleExpanded = (table: string) => setExpandedTables((current) => ({ ...current, [table]: !current[table] }));
  const tableToggle = (table: string, count: number) => count > 12 ? <button type="button" onClick={() => toggleExpanded(table)} style={{ margin: '10px', border: 0, borderRadius: 6, background: '#eff6ff', color: '#1e3a8a', padding: '6px 9px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{expandedTables[table] ? 'Collapse table' : `Show all ${count} rows`}</button> : null;

  useEffect(() => {
    let active = true;
    fetch(`/api/operations/real-estate?companyId=${encodeURIComponent(selectedCompanyId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load real-estate operations.');
        if (active) setData(payload);
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [selectedCompanyId, reloadKey]);

  const waterfallAsOfDate = formatEstDate();
  const waterfallInvestors = useMemo<WaterfallInvestor[]>(() => data.investors.map((investor) => ({
    id: investor.id,
    legalName: investor.legalName,
    memberGroup: investor.memberGroup,
    ownershipPercentage: Number(investor.ownershipPercentage || 0),
  })), [data.investors]);
  const waterfallEntries = useMemo<WaterfallEntry[]>(() => data.investors.flatMap((investor) => (Array.isArray(investor.entries) ? investor.entries : []).map((entry: any) => ({
    investorId: investor.id,
    entryType: String(entry.entryType),
    effectiveDate: String(entry.effectiveDate).slice(0, 10),
    amount: Number(entry.amount || 0),
  }))), [data.investors]);
  const waterfallSettings = useMemo<WaterfallSettings>(() => ({
    stabilizationDate: data.waterfallSettings?.stabilizationDate || null,
    preferredReturnRate: Number(data.waterfallSettings?.preferredReturnRate ?? 6),
  }), [data.waterfallSettings]);
  const waterfall = useMemo(
    () => computeWaterfall(waterfallInvestors, waterfallEntries, waterfallSettings, waterfallAsOfDate),
    [waterfallInvestors, waterfallEntries, waterfallSettings, waterfallAsOfDate],
  );
  const waterfallBalanceById = useMemo(() => new Map(waterfall.balances.map((balance) => [balance.investorId, balance])), [waterfall]);

  const months = useMemo(() => Array.from(new Set(data.lines.map((line) => String(line.periodEnd).slice(0, 7)))).sort(), [data.lines]);
  const expenseLines = useMemo(() => data.lines.filter((line) => String(line.accountType).toLowerCase() === 'expense'), [data.lines]);
  const incomeLines = useMemo(() => data.lines.filter((line) => String(line.accountType).toLowerCase() === 'income'), [data.lines]);
  const chartRows = useMemo(() => months.map((month) => ({
    month,
    Income: incomeLines.filter((line) => String(line.periodEnd).startsWith(month)).reduce((sum, line) => sum + Number(line.amount || 0), 0),
    Expenses: expenseLines.filter((line) => String(line.periodEnd).startsWith(month)).reduce((sum, line) => sum + Math.abs(Number(line.amount || 0)), 0),
  })), [months, incomeLines, expenseLines]);
  const latestMonth = months[months.length - 1];
  const periodLines = data.lines.filter((line) => String(line.periodEnd).startsWith(latestMonth || ''));
  const totalIncome = periodLines.filter((line) => String(line.accountType).toLowerCase() === 'income').reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const totalExpenses = periodLines.filter((line) => String(line.accountType).toLowerCase() === 'expense').reduce((sum, line) => sum + Math.abs(Number(line.amount || 0)), 0);
  const latestOccupancy = data.occupancy[data.occupancy.length - 1];
  const entityActivityLines = data.lines.filter((line) =>
    String(line.reportType).toUpperCase() === 'ACTIVITY' &&
    (entityScope === 'COMBINED' || line.sourceEntity === entityScope) &&
    ['income', 'expense'].includes(String(line.accountType).toLowerCase())
  );
  const entityMonths = useMemo(() => {
    const monthsByFeed = new Map<string, Set<string>>();
    entityActivityLines.forEach((line) => {
      const feedMonths = monthsByFeed.get(line.sourceEntity) || new Set<string>();
      feedMonths.add(String(line.periodEnd).slice(0, 7));
      monthsByFeed.set(line.sourceEntity, feedMonths);
    });
    const feedMonthSets = [...monthsByFeed.values()];
    const allMonths = Array.from(new Set(feedMonthSets.flatMap((set) => [...set]))).sort();
    // Combined only includes periods every feed has reported.
    return entityScope === 'COMBINED' ? allMonths.filter((month) => feedMonthSets.every((set) => set.has(month))) : allMonths;
  }, [entityActivityLines, entityScope]);
  const entitySelectedMonths = useMemo(() => {
    const latest = entityMonths[entityMonths.length - 1] || '';
    if (entityStatementPeriod === 'current-month') return entityMonths.slice(-1);
    if (entityStatementPeriod === 'current-quarter') return entityMonths.slice(-3);
    if (entityStatementPeriod === 'last-12-months') return entityMonths.slice(-12);
    if (entityStatementPeriod === 'ytd') return entityMonths.filter((month) => month.startsWith(latest.slice(0, 4)));
    if (entityStatementPeriod === 'last-year') return entityMonths.filter((month) => month.startsWith(String(Number(latest.slice(0, 4)) - 1)));
    return entityMonths.slice(-36);
  }, [entityMonths, entityStatementPeriod]);
  const entityColumns = useMemo(() => Array.from(new Set(entitySelectedMonths.map((month) => entityStatementDisplay === 'monthly' ? month : entityStatementDisplay === 'annual' ? month.slice(0, 4) : `${month.slice(0, 4)} Q${Math.ceil(Number(month.slice(5, 7)) / 3)}`))), [entitySelectedMonths, entityStatementDisplay]);
  const entityMonthToColumn = useCallback((month: string) => {
    if (!entitySelectedMonths.includes(month)) return null;
    if (entityStatementDisplay === 'monthly') return month;
    if (entityStatementDisplay === 'annual') return month.slice(0, 4);
    return `${month.slice(0, 4)} Q${Math.ceil(Number(month.slice(5, 7)) / 3)}`;
  }, [entitySelectedMonths, entityStatementDisplay]);
  // A balance sheet column shows balances as of the last month in that column.
  const entityBalanceMonthByColumn = useMemo(() => {
    const byColumn: Record<string, string> = {};
    entitySelectedMonths.forEach((month) => {
      const column = entityMonthToColumn(month);
      if (column && (!byColumn[column] || month > byColumn[column])) byColumn[column] = month;
    });
    return byColumn;
  }, [entitySelectedMonths, entityMonthToColumn]);
  const reportEnabled = (key: string) => operationalHubSections?.[key] !== false;

  const propertyMonths = useMemo(() => {
    const latest = months[months.length - 1] || '';
    if (propertyPeriod === 'current-month') return months.slice(-1);
    if (propertyPeriod === 'current-quarter') return months.slice(-3);
    if (propertyPeriod === 'last-12-months') return months.slice(-12);
    if (propertyPeriod === 'ytd') return months.filter((month) => month.startsWith(latest.slice(0, 4)));
    if (propertyPeriod === 'last-year') return months.filter((month) => month.startsWith(String(Number(latest.slice(0, 4)) - 1)));
    return months.slice(-36);
  }, [months, propertyPeriod]);
  const propertyColumnFor = useCallback((month: string) => {
    if (propertyDisplay === 'monthly') return month;
    if (propertyDisplay === 'annual') return month.slice(0, 4);
    return `${month.slice(0, 4)} Q${Math.ceil(Number(month.slice(5, 7)) / 3)}`;
  }, [propertyDisplay]);
  const propertyColumns = useMemo(() => Array.from(new Set(propertyMonths.map(propertyColumnFor))), [propertyMonths, propertyColumnFor]);
  const propertyColumnLabel = (column: string) => (propertyDisplay === 'monthly' ? formatMonthLabel(column) : column);
  // Balance accounts show the balance at the last month of each column; activity accounts sum the column's months.
  const propertyBalanceMonthByColumn = useMemo(() => {
    const byColumn: Record<string, string> = {};
    propertyMonths.forEach((month) => {
      const column = propertyColumnFor(month);
      if (!byColumn[column] || month > byColumn[column]) byColumn[column] = month;
    });
    return byColumn;
  }, [propertyMonths, propertyColumnFor]);
  const propertyAccountRows = useMemo(() => {
    const allowedTypes = PROPERTY_TYPE_FILTERS[propertyTypeFilter];
    const rows = new Map<string, { accountCode: string; accountName: string; accountType: string; source: string; values: Record<string, number> }>();
    data.lines.forEach((line) => {
      const month = String(line.periodEnd).slice(0, 7);
      if (!propertyMonths.includes(month)) return;
      if (propertyEntity !== 'ALL' && line.sourceEntity !== propertyEntity) return;
      const type = normalizeAccountType(line.accountType);
      if (allowedTypes && !allowedTypes.includes(type)) return;
      if (type === 'income' && operationalHubSections?.propertyIncomeDetail === false) return;
      if (type === 'expense' && operationalHubSections?.propertyExpenseAnalysis === false) return;
      const column = propertyColumnFor(month);
      if (String(line.reportType).toUpperCase() === 'BALANCE' && propertyBalanceMonthByColumn[column] !== month) return;
      const key = `${line.sourceEntity}|${line.accountType}|${line.accountCode}|${line.accountName}`;
      const row = rows.get(key) || { accountCode: line.accountCode, accountName: line.accountName, accountType: line.accountType, source: line.sourceEntity, values: {} };
      row.values[column] = (row.values[column] || 0) + Number(line.amount || 0);
      rows.set(key, row);
    });
    return [...rows.values()]
      .filter((row) => propertyColumns.some((column) => Math.abs(row.values[column] || 0) >= 0.5))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true }) || a.source.localeCompare(b.source));
  }, [data.lines, propertyMonths, propertyEntity, propertyTypeFilter, operationalHubSections, propertyColumnFor, propertyColumns, propertyBalanceMonthByColumn]);
  const selectedPropertyRow = selectedPropertyRowKey ? propertyAccountRows.find((row) => `${row.source}|${row.accountType}|${row.accountCode}|${row.accountName}` === selectedPropertyRowKey) || null : null;

  if (loading) return <div style={{ padding: 24, color: '#64748b' }}>Loading real-estate operations…</div>;
  if (error) return <div style={{ margin: 24, ...card, color: '#b91c1c' }}>{error}</div>;

  if (mode === 'entity-financials') {
    return <div style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div><h2 style={{ margin: 0, color: '#0f172a' }}>Entity Financials</h2><p style={{ color: '#64748b', marginBottom: 0 }}>Property income statement and balance sheet for each source ledger. The income statement is built from its Data Mapping.{entityScope === 'COMBINED' ? ' Combined includes only periods reported by every feed.' : ''}</p></div>
      <div style={{ ...card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>Entity<select value={entityScope} onChange={(event) => setEntityScope(event.target.value as 'SLN' | 'BGAH' | 'COMBINED')} style={{ minWidth: 150, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6 }}><option value="SLN">SLN</option><option value="BGAH">BGAH</option><option value="COMBINED">Combined BGAH + SLN</option></select></label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>View<select value={entityView} onChange={(event) => setEntityView(event.target.value as 'statement' | 'balance')} style={{ minWidth: 150, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6 }}><option value="statement">Income Statement</option><option value="balance">Balance Sheet</option></select></label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>Period<select value={entityStatementPeriod} onChange={(event) => setEntityStatementPeriod(event.target.value as any)} style={{ minWidth: 150, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6 }}><option value="current-month">Current Month</option><option value="current-quarter">Current Quarter</option><option value="last-12-months">Last 12 months</option><option value="ytd">YTD</option><option value="last-year">Last Year</option><option value="last-3-years">Last 3 Years</option></select></label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>Display As<select value={entityStatementDisplay} onChange={(event) => setEntityStatementDisplay(event.target.value as any)} style={{ minWidth: 120, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6 }}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>
      </div>
      {entityView === 'statement' && (entityColumns.length
        ? <PropertyIncomeStatementTable lines={data.lines} mappings={data.mappings || []} scope={entityScope} columns={entityColumns} monthToColumn={entityMonthToColumn} />
        : <div style={{ ...card, color: '#64748b' }}>No income-statement activity is available for this entity and period.</div>)}
      {entityView === 'balance' && (entityColumns.length
        ? <PropertyBalanceSheetTable lines={data.lines} scope={entityScope} columns={entityColumns} balanceMonthByColumn={entityBalanceMonthByColumn} />
        : <div style={{ ...card, color: '#64748b' }}>No balance sheet data is available for this entity and period.</div>)}
      {reportEnabled('entityBookToTaxReconciliation') && <ReportPlaceholder
        title="Book-to-Tax Reconciliation"
        description="GAAP book income, depreciation, and member capital compared with the filed partnership returns, with each difference explained."
        needs={['Annual GAAP book income for 2022 to date (QuickBooks general ledger)', 'Tax depreciation schedules from the 2022-2025 returns', 'Fixed asset in-service dates and lives in Construction & Fixed Assets']}
      />}
      {reportEnabled('entityBooksIntegrityExceptions') && <ReportPlaceholder
        title="Books Integrity Exceptions"
        description="Out-of-balance balance sheets by entity and month, unmapped accounts, and BGAH / SLN intercompany differences that need correcting before the books are combined."
        needs={['Intercompany elimination rules between BGAH and SLN', 'Approved correcting-entry ledger for prior periods']}
      />}
    </div>;
  }

  if (mode === 'investors') {
    return <div style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, color: '#0f172a' }}>Investor Ledger</h2>
        <p style={{ color: '#64748b', marginBottom: 0 }}>Capital, distributions, allocations, and waterfall accrual balances by member.</p>
      </div>
      {reportEnabled('investorCapitalRollforward') && <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <div style={{ padding: '14px 18px 0' }}>
          <h3 style={{ margin: 0 }}>Member Capital Rollforward</h3>
          <p style={{ color: '#64748b', margin: '6px 0 12px', fontSize: 13 }}>Each member&apos;s contributions and deemed capital, distributions, allocated profit and loss, and unpaid preferred return or even-up to date.</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead><tr>{sortableHeader('investors', 'name', 'Investor / Member')}{sortableHeader('investors', 'group', 'Group')}{sortableHeader('investors', 'ownership', 'Ownership', 'right')}{sortableHeader('investors', 'contribution', 'Contributions / Deemed Capital', 'right')}{sortableHeader('investors', 'distribution', 'Distributions', 'right')}{sortableHeader('investors', 'allocation', 'Allocations', 'right')}{sortableHeader('investors', 'preferred', 'Unpaid Pref. Return', 'right')}{sortableHeader('investors', 'evenUp', 'Unpaid Even-Up', 'right')}</tr></thead>
          <tbody>{sortRows('investors', data.investors.map((investor) => {
            const entries = Array.isArray(investor.entries) ? investor.entries : [];
            const sum = (type: string) => entries.filter((entry: any) => entry.entryType === type).reduce((total: number, entry: any) => total + Number(entry.amount || 0), 0);
            const balance = waterfallBalanceById.get(investor.id);
            return {
              investor,
              contribution: sum('CONTRIBUTION') + sum('DEEMED_CONTRIBUTION'),
              distribution: sum('DISTRIBUTION'),
              allocation: sum('ALLOCATION'),
              preferred: waterfall.ready && balance?.isLandContributor ? balance.preferredReturnUnpaid : null,
              evenUp: waterfall.ready && balance && !balance.isLandContributor ? balance.evenUpUnpaid : null,
            };
          }), (row, key) => key === 'name' ? row.investor.legalName : key === 'group' ? row.investor.memberGroup : key === 'ownership' ? Number(row.investor.ownershipPercentage || 0) : (row as any)[key]).slice(0, expandedTables.investors ? undefined : 12).map(({ investor, contribution, distribution, allocation, preferred, evenUp }) => <tr key={investor.id}><td style={{ ...td, fontWeight: 700 }}>{investor.legalName}</td><td style={td}>{investor.memberGroup || '-'}</td><td style={{ ...td, textAlign: 'right' }}>{investor.ownershipPercentage == null ? '-' : `${Number(investor.ownershipPercentage).toFixed(2)}%`}</td><td style={{ ...td, textAlign: 'right' }}>{fmt(contribution)}</td><td style={{ ...td, textAlign: 'right' }}>{fmt(distribution)}</td><td style={{ ...td, textAlign: 'right' }}>{fmt(allocation)}</td><td style={{ ...td, textAlign: 'right' }}>{preferred === null ? '-' : fmt(preferred)}</td><td style={{ ...td, textAlign: 'right' }}>{evenUp === null ? '-' : fmt(evenUp)}</td></tr>)}</tbody>
        </table>
        {tableToggle('investors', data.investors.length)}
        {!data.investors.length && <div style={{ padding: 18, color: '#64748b' }}>Import or add the member ledger to populate investor balances.</div>}
      </div>}
      <RealEstateWaterfallPanel
        key={`${selectedCompanyId}-${waterfallSettings.stabilizationDate || ''}-${waterfallSettings.preferredReturnRate}`}
        companyId={selectedCompanyId}
        investors={waterfallInvestors}
        entries={waterfallEntries}
        settings={waterfallSettings}
        aliases={data.aliases || []}
        waterfall={waterfall}
        asOfDate={waterfallAsOfDate}
        currency={money.currency}
        showWaterfall={reportEnabled('investorWaterfallPreview')}
        onSaved={() => setReloadKey((current) => current + 1)}
      />
      {reportEnabled('investorAnnualCapitalRollforward') && <ReportPlaceholder
        title="Annual Capital Account Rollforward"
        description="Each member's capital account by year on the Operating Agreement book basis: opening balance, contributions, allocated profit or loss, distributions, and closing balance, with the tax basis alongside."
        needs={['Annual book income for 2022 to date to allocate under §9.1', 'Member contribution records with actual dates (the ledger shows $8,273,700 dated 1/1/2022)', 'Confirmed ownership transfers, including the June 26, 2024 Vaserfirer / JRSEP transfer']}
      />}
      {reportEnabled('investorMemberStatements') && <ReportPlaceholder
        title="Member Statements"
        description="A one-page statement per member: ownership, capital account, distributions to date, and unpaid preferred return or even-up balance."
        needs={['The Stabilization Date saved in the waterfall settings', 'The annual capital account rollforward above']}
      />}
    </div>;
  }

  return <div style={{ padding: 24, display: 'grid', gap: 16 }}>
    <div><h2 style={{ margin: 0, color: '#0f172a' }}>Property Financials</h2><p style={{ color: '#64748b', marginBottom: 0 }}>Approved BGAH and SLN property performance by reporting period.</p></div>
    {reportEnabled('propertyFinancialOverview') && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
      {[['Income', fmt(totalIncome)], ['Expenses', fmt(totalExpenses)], ['NOI', fmt(totalIncome - totalExpenses)], ['Physical Occupancy', latestOccupancy ? `${Number(latestOccupancy.physicalOccupancyPct).toFixed(1)}%` : '-']].map(([label, value]) => <div key={label} style={card}><div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{label}</div><div style={{ marginTop: 4, fontSize: 22, fontWeight: 800 }}>{value}</div></div>)}
    </div>}
    {reportEnabled('propertyIncomeExpenseTrend') && <div style={card}><h3 style={{ marginTop: 0 }}>Income and expenses by month</h3><div style={{ height: 280 }}><ResponsiveContainer><BarChart data={chartRows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} /><Tooltip formatter={(value: number) => fmt(value)} /><Legend /><Bar dataKey="Income" fill="#1e3a8a" /><Bar dataKey="Expenses" fill="#0f766e" /></BarChart></ResponsiveContainer></div></div>}
    {(reportEnabled('propertyIncomeDetail') || reportEnabled('propertyExpenseAnalysis')) && <>
      <div style={{ ...card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>Entity<select value={propertyEntity} onChange={(event) => setPropertyEntity(event.target.value as 'ALL' | 'SLN' | 'BGAH')} style={{ minWidth: 150, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6 }}><option value="ALL">All</option><option value="SLN">SLN</option><option value="BGAH">BGAH</option></select></label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>Type<select value={propertyTypeFilter} onChange={(event) => setPropertyTypeFilter(event.target.value as PropertyTypeFilter)} style={{ minWidth: 150, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6 }}><option value="all">All</option>{reportEnabled('propertyIncomeDetail') && <option value="income">Income</option>}{reportEnabled('propertyExpenseAnalysis') && <option value="expenses">Expenses</option>}<option value="assets">Assets</option><option value="liabilities">Liabilities</option></select></label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>Period<select value={propertyPeriod} onChange={(event) => setPropertyPeriod(event.target.value as typeof propertyPeriod)} style={{ minWidth: 150, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6 }}><option value="current-month">Current Month</option><option value="current-quarter">Current Quarter</option><option value="last-12-months">Last 12 months</option><option value="ytd">YTD</option><option value="last-year">Last Year</option><option value="last-3-years">Last 3 Years</option></select></label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>Display As<select value={propertyDisplay} onChange={(event) => setPropertyDisplay(event.target.value as 'monthly' | 'quarterly' | 'annual')} style={{ minWidth: 120, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6 }}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>
        <div style={{ fontSize: 12, color: '#64748b', paddingBottom: 8 }}>
          {propertyMonths.length ? `Showing ${formatMonthLabel(propertyMonths[0])} – ${formatMonthLabel(propertyMonths[propertyMonths.length - 1])} (${propertyMonths.length} month${propertyMonths.length === 1 ? '' : 's'}) · ${propertyAccountRows.length} accounts` : 'No months available'}
        </div>
      </div>
      <span style={{ fontSize: 12, color: '#64748b' }}>Click any line to see its trend.</span>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px 0' }}><h3 style={{ margin: '0 0 12px' }}>{propertyTypeFilter === 'income' ? 'Income Detail' : propertyTypeFilter === 'expenses' ? 'Property Expense Analysis' : 'Account Detail'}</h3></div>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 + propertyColumns.length * 110 }}><thead><tr>{sortableHeader('financialLines', 'account', 'Account')}{sortableHeader('financialLines', 'type', 'Type')}{sortableHeader('financialLines', 'source', 'Source')}{propertyColumns.map((column) => <Fragment key={column}>{sortableHeader('financialLines', column, propertyColumnLabel(column), 'right')}</Fragment>)}</tr></thead><tbody>{sortRows('financialLines', propertyAccountRows, (row, key) => key === 'account' ? `${row.accountCode} ${row.accountName}` : key === 'type' ? row.accountType : key === 'source' ? row.source : Number(row.values[key] || 0)).slice(0, expandedTables.financialLines ? undefined : 12).map((row) => {
        const rowKey = `${row.source}|${row.accountType}|${row.accountCode}|${row.accountName}`;
        const isSelected = selectedPropertyRowKey === rowKey;
        return <tr key={rowKey} style={{ background: isSelected ? '#dbeafe' : undefined }}><td style={td}><button type="button" title="Show trend" onClick={() => setSelectedPropertyRowKey(isSelected ? null : rowKey)} style={{ border: 0, padding: 0, background: 'transparent', color: '#1e3a8a', font: 'inherit', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>{row.accountCode} · {row.accountName}</button></td><td style={td}>{row.accountType}</td><td style={td}>{row.source}</td>{propertyColumns.map((column) => <td key={column} style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{row.values[column] === undefined ? '' : fmt(row.values[column])}</td>)}</tr>;
      })}</tbody></table></div>{tableToggle('financialLines', propertyAccountRows.length)}{!propertyAccountRows.length && <div style={{ padding: 18, color: '#64748b' }}>No accounts with activity for this type and period.</div>}</div>
      {selectedPropertyRow && <StatementTrendPopup
        label={`${selectedPropertyRow.accountCode} · ${selectedPropertyRow.accountName}`}
        subtitle={`${selectedPropertyRow.source} · ${selectedPropertyRow.accountType} · ${propertyColumnLabel(propertyColumns[0])}${propertyColumns.length > 1 ? ` – ${propertyColumnLabel(propertyColumns[propertyColumns.length - 1])}` : ''}`}
        columns={propertyColumns}
        values={selectedPropertyRow.values}
        onClose={() => setSelectedPropertyRowKey(null)}
      />}
    </>}
    {reportEnabled('propertyOccupancyTrend') && <div style={card}><h3 style={{ marginTop: 0 }}>Occupancy trends</h3>{data.occupancy.length ? <><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('occupancy', 'period', 'Period')}{sortableHeader('occupancy', 'occupied', 'Occupied Units', 'right')}{sortableHeader('occupancy', 'physical', 'Physical', 'right')}{sortableHeader('occupancy', 'economic', 'Economic', 'right')}</tr></thead><tbody>{sortRows('occupancy', data.occupancy, (row, key) => key === 'period' ? String(row.periodEnd) : key === 'occupied' ? Number(row.occupiedUnits) : key === 'physical' ? Number(row.physicalOccupancyPct) : Number(row.economicOccupancyPct || 0)).slice(0, expandedTables.occupancy ? undefined : 12).map((row) => <tr key={row.id}><td style={td}>{String(row.periodEnd).slice(0, 10)}</td><td style={{ ...td, textAlign: 'right' }}>{row.occupiedUnits} / {row.totalUnits}</td><td style={{ ...td, textAlign: 'right' }}>{Number(row.physicalOccupancyPct).toFixed(1)}%</td><td style={{ ...td, textAlign: 'right' }}>{row.economicOccupancyPct == null ? '-' : `${Number(row.economicOccupancyPct).toFixed(1)}%`}</td></tr>)}</tbody></table>{tableToggle('occupancy', data.occupancy.length)}</> : <p style={{ marginBottom: 0, color: '#64748b' }}>No occupancy snapshots have been loaded. Occupancy is an independent monthly operating input.</p>}</div>}
    {reportEnabled('propertySourceReconciliation') && <div style={card}><h3 style={{ marginTop: 0 }}>BGAH / SLN source reconciliation</h3><p style={{ marginBottom: 0, color: '#64748b' }}>{Object.entries(data.lines.reduce<Record<string, number>>((counts, line) => { counts[line.sourceEntity] = (counts[line.sourceEntity] || 0) + 1; return counts; }, {})).map(([source, count]) => `${source}: ${count} source-period lines`).join(' · ') || 'No source lines loaded.'}</p></div>}
  </div>;
}
