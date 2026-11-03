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
type ReportRange = { startDate: string; endDate: string };
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
const monthEnd = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, '0')}`;
};

export default function RealEstateOperationsTab({ selectedCompanyId, mode, operationalHubSections }: Props) {
  const money = useCompanyMoneyFormatter(selectedCompanyId);
  const [data, setData] = useState<{ lines: any[]; investors: any[]; occupancy: any[]; cashActivities: any[]; operationalMetrics: any[]; mappings?: any[]; waterfallSettings?: WaterfallSettings; aliases?: Array<{ alias: string; investorId: string }> }>({ lines: [], investors: [], occupancy: [], cashActivities: [], operationalMetrics: [], mappings: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const [entityView, setEntityView] = useState<'statement' | 'balance'>('statement');
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<PropertyTypeFilter>('all');
  const [propertyPeriod, setPropertyPeriod] = useState<'current-month' | 'current-quarter' | 'last-12-months' | 'ytd' | 'last-year' | 'last-3-years'>('last-12-months');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [selectedPropertyRowKey, setSelectedPropertyRowKey] = useState<string | null>(null);
  const [propertyEntity, setPropertyEntity] = useState<'ALL' | 'SLN' | 'BGAH'>('SLN');
  const [propertyDisplay, setPropertyDisplay] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [entityScope, setEntityScope] = useState<'SLN' | 'BGAH' | 'COMBINED'>('SLN');
  const [entityStatementPeriod, setEntityStatementPeriod] = useState<'current-month' | 'current-quarter' | 'last-12-months' | 'ytd' | 'last-year' | 'last-3-years'>('last-12-months');
  const [entityStatementDisplay, setEntityStatementDisplay] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [reportRangeDrafts, setReportRangeDrafts] = useState<Record<string, ReportRange>>({});
  const [reportRanges, setReportRanges] = useState<Record<string, ReportRange>>({});
  const [vendorSearch, setVendorSearch] = useState('');
  const fmt = (value: unknown) => Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: money.currency, maximumFractionDigits: 0 });
  const { sortRows, sortableHeader } = useTableSort(th);
  const toggleExpanded = (table: string) => setExpandedTables((current) => ({ ...current, [table]: !current[table] }));
  const tableToggle = (table: string, count: number) => count > 12 ? <button type="button" onClick={() => toggleExpanded(table)} style={{ margin: '10px', border: 0, borderRadius: 6, background: '#eff6ff', color: '#1e3a8a', padding: '6px 9px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{expandedTables[table] ? 'Collapse table' : `Show all ${count} rows`}</button> : null;
  const rangeFor = useCallback((key: string) => reportRanges[key] || { startDate: '', endDate: '' }, [reportRanges]);
  const withinRange = useCallback((key: string, value: unknown) => {
    const date = String(value || '').slice(0, 10);
    const range = rangeFor(key);
    return (!range.startDate || date >= range.startDate) && (!range.endDate || date <= range.endDate);
  }, [rangeFor]);
  const reportRangeControls = (key: string, showFrequency = true) => {
    const draft = reportRangeDrafts[key] || rangeFor(key);
    const update = (change: Partial<ReportRange>) => setReportRangeDrafts((current) => ({ ...current, [key]: { ...draft, ...change } }));
    return <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
      {showFrequency && <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: '#475569' }}>Frequency<select value="monthly" disabled style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, color: '#64748b', background: '#f8fafc' }}><option>Monthly</option></select></label>}
      <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: '#475569' }}>From<input type="date" value={draft.startDate} max={draft.endDate || undefined} onChange={(event) => update({ startDate: event.target.value })} style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6 }} /></label>
      <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: '#475569' }}>To<input type="date" value={draft.endDate} min={draft.startDate || undefined} onChange={(event) => update({ endDate: event.target.value })} style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6 }} /></label>
      <button type="button" onClick={() => setReportRanges((current) => ({ ...current, [key]: draft }))} style={{ padding: '7px 11px', border: '1px solid #1d4ed8', borderRadius: 6, background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save</button>
    </div>;
  };

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
  const incomeExpenseRows = useMemo(
    () => chartRows.filter((row) => withinRange('incomeExpenseTrend', monthEnd(row.month))),
    [chartRows, withinRange],
  );
  const latestMonth = months[months.length - 1];
  const periodLines = data.lines.filter((line) => String(line.periodEnd).startsWith(latestMonth || ''));
  const totalIncome = periodLines.filter((line) => String(line.accountType).toLowerCase() === 'income').reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const totalExpenses = periodLines.filter((line) => String(line.accountType).toLowerCase() === 'expense').reduce((sum, line) => sum + Math.abs(Number(line.amount || 0)), 0);
  const latestOccupancy = data.occupancy[data.occupancy.length - 1];
  const occupancyRows = useMemo(() => data.occupancy.filter((row) => withinRange('occupancy', row.periodEnd)), [data.occupancy, withinRange]);
  const cashMonths = useMemo(() => Array.from(new Set(data.cashActivities.filter((activity) => withinRange('cashActivity', activity.periodEnd)).map((activity) => String(activity.periodEnd).slice(0, 7)))).sort(), [data.cashActivities, withinRange]);
  const cashTrendRows = useMemo(() => cashMonths.map((month) => {
    const activities = data.cashActivities.filter((activity) => String(activity.periodEnd).startsWith(month));
    return {
      month,
      Receipts: activities.filter((activity) => Number(activity.amount) > 0 && activity.activityType !== 'OWNER_FUNDING').reduce((total, activity) => total + Number(activity.amount), 0),
      OwnerFunding: activities.filter((activity) => activity.activityType === 'OWNER_FUNDING').reduce((total, activity) => total + Number(activity.amount), 0),
      Disbursements: activities.filter((activity) => Number(activity.amount) < 0).reduce((total, activity) => total + Math.abs(Number(activity.amount)), 0),
    };
  }), [cashMonths, data.cashActivities]);
  const latestCashMonth = cashMonths[cashMonths.length - 1];
  const latestCashTrend = cashTrendRows.find((row) => row.month === latestCashMonth);
  const latestCashBalance = useMemo(() => data.operationalMetrics
    .filter((metric) => metric.metric === 'cash_tracker_ending_balance')
    .sort((a, b) => String(a.periodEnd).localeCompare(String(b.periodEnd))).at(-1), [data.operationalMetrics]);
  const vendorSpendRows = useMemo(() => Object.values(data.cashActivities
    .filter((activity) => Number(activity.amount) < 0 && activity.counterparty && withinRange('vendorSpend', activity.periodEnd))
    .reduce<Record<string, { vendor: string; spend: number; payments: number; latestDate: string }>>((vendors, activity) => {
      const vendor = String(activity.counterparty);
      const row = vendors[vendor] || { vendor, spend: 0, payments: 0, latestDate: '' };
      row.spend += Math.abs(Number(activity.amount));
      row.payments += 1;
      if (String(activity.activityDate || '') > row.latestDate) row.latestDate = String(activity.activityDate || '');
      vendors[vendor] = row;
      return vendors;
    }, {})).sort((a, b) => b.spend - a.spend), [data.cashActivities, withinRange]);
  const filteredVendorSpendRows = useMemo(
    () => vendorSpendRows.filter((row) => row.vendor.toLowerCase().includes(vendorSearch.trim().toLowerCase())),
    [vendorSpendRows, vendorSearch],
  );
  const latestMetrics = useMemo(() => {
    const byMetric = new Map<string, any>();
    data.operationalMetrics.filter((metric) => withinRange('operatingMetrics', metric.periodEnd)).forEach((metric) => {
      const current = byMetric.get(metric.metric);
      if (!current || String(metric.periodEnd) > String(current.periodEnd)) byMetric.set(metric.metric, metric);
    });
    return byMetric;
  }, [data.operationalMetrics, withinRange]);
  const debtTrendRows = useMemo(() => months.map((month) => ({
    month,
    DebtService: data.lines.filter((line) => String(line.reportType).toUpperCase() === 'ACTIVITY' && String(line.periodEnd).startsWith(month) && line.legalEntity === 'BGAH' && /debt service/i.test(String(line.accountName))).reduce((total, line) => total + Math.abs(Number(line.amount || 0)), 0),
  })).filter((row) => row.DebtService > 0 && withinRange('debtService', monthEnd(row.month))), [months, data.lines, withinRange]);
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
    const ranged = months.filter((month) => withinRange('accountDetail', monthEnd(month)));
    if (propertyPeriod === 'current-month') return ranged.slice(-1);
    if (propertyPeriod === 'current-quarter') return ranged.slice(-3);
    if (propertyPeriod === 'last-12-months') return ranged.slice(-12);
    if (propertyPeriod === 'ytd') return ranged.filter((month) => month.startsWith(latest.slice(0, 4)));
    if (propertyPeriod === 'last-year') return ranged.filter((month) => month.startsWith(String(Number(latest.slice(0, 4)) - 1)));
    return ranged.slice(-36);
  }, [months, propertyPeriod, withinRange]);
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
  const canonicalAccountNames = useMemo(() => {
    const names = new Map<string, string>();
    data.lines.forEach((line) => {
      const code = String(line.accountCode || '');
      if (!code.startsWith('sln_') && code) names.set(code, String(line.accountName || ''));
    });
    return names;
  }, [data.lines]);
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
      const accountCode = line.canonicalAccountCode || line.accountCode;
      const accountName = canonicalAccountNames.get(String(accountCode)) || line.accountName;
      const key = `${line.sourceEntity}|${line.accountType}|${accountCode}|${accountName}`;
      const row = rows.get(key) || { accountCode, accountName, accountType: line.accountType, source: line.sourceEntity, values: {} };
      row.values[column] = (row.values[column] || 0) + Number(line.amount || 0);
      rows.set(key, row);
    });
    return [...rows.values()]
      .filter((row) => propertyColumns.some((column) => Math.abs(row.values[column] || 0) >= 0.5))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true }) || a.source.localeCompare(b.source));
  }, [data.lines, propertyMonths, propertyEntity, propertyTypeFilter, operationalHubSections, propertyColumnFor, propertyColumns, propertyBalanceMonthByColumn, canonicalAccountNames]);
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
    {reportEnabled('propertyIncomeExpenseTrend') && <div style={card}><h3 style={{ marginTop: 0 }}>Income and expenses by month</h3>{reportRangeControls('incomeExpenseTrend')}{incomeExpenseRows.length ? <div style={{ height: 280 }}><ResponsiveContainer><BarChart data={incomeExpenseRows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} /><Tooltip formatter={(value: number) => fmt(value)} /><Legend /><Bar dataKey="Income" fill="#1e3a8a" /><Bar dataKey="Expenses" fill="#0f766e" /></BarChart></ResponsiveContainer></div> : <p style={{ marginBottom: 0, color: '#64748b' }}>No income or expense activity matches this date range.</p>}</div>}
    {(reportEnabled('propertyIncomeDetail') || reportEnabled('propertyExpenseAnalysis')) && <>
      <div style={{ ...card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        {reportRangeControls('accountDetail', false)}
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>Entity<select value={propertyEntity} onChange={(event) => setPropertyEntity(event.target.value as 'ALL' | 'SLN' | 'BGAH')} style={{ minWidth: 150, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6 }}><option value="ALL">All</option><option value="SLN">SLN</option><option value="BGAH">BGAH</option></select></label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>Type<select value={propertyTypeFilter} onChange={(event) => setPropertyTypeFilter(event.target.value as PropertyTypeFilter)} style={{ minWidth: 150, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6 }}><option value="all">All</option>{reportEnabled('propertyIncomeDetail') && <option value="income">Income</option>}{reportEnabled('propertyExpenseAnalysis') && <option value="expenses">Expenses</option>}<option value="assets">Assets</option><option value="liabilities">Liabilities</option></select></label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>Period<select value={propertyPeriod} onChange={(event) => setPropertyPeriod(event.target.value as typeof propertyPeriod)} style={{ minWidth: 150, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6 }}><option value="current-month">Current Month</option><option value="current-quarter">Current Quarter</option><option value="last-12-months">Last 12 months</option><option value="ytd">YTD</option><option value="last-year">Last Year</option><option value="last-3-years">Last 3 Years</option></select></label>
        <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>Display As<select value={propertyDisplay} onChange={(event) => setPropertyDisplay(event.target.value as 'monthly' | 'quarterly' | 'annual')} style={{ minWidth: 120, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6 }}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>
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
    {reportEnabled('propertyOccupancyTrend') && <div style={card}><h3 style={{ marginTop: 0 }}>Occupancy trends</h3>{reportRangeControls('occupancy')}{occupancyRows.length ? <><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('occupancy', 'period', 'Period')}{sortableHeader('occupancy', 'occupied', 'Occupied Units', 'right')}{sortableHeader('occupancy', 'physical', 'Physical', 'right')}{sortableHeader('occupancy', 'economic', 'Economic', 'right')}</tr></thead><tbody>{sortRows('occupancy', occupancyRows, (row, key) => key === 'period' ? String(row.periodEnd) : key === 'occupied' ? Number(row.occupiedUnits) : key === 'physical' ? Number(row.physicalOccupancyPct) : Number(row.economicOccupancyPct || 0)).slice(0, expandedTables.occupancy ? undefined : 12).map((row) => <tr key={row.id}><td style={td}>{String(row.periodEnd).slice(0, 10)}</td><td style={{ ...td, textAlign: 'right' }}>{row.occupiedUnits} / {row.totalUnits}</td><td style={{ ...td, textAlign: 'right' }}>{Number(row.physicalOccupancyPct).toFixed(1)}%</td><td style={{ ...td, textAlign: 'right' }}>{row.economicOccupancyPct == null ? '-' : `${Number(row.economicOccupancyPct).toFixed(1)}%`}</td></tr>)}</tbody></table>{tableToggle('occupancy', occupancyRows.length)}</> : <p style={{ marginBottom: 0, color: '#64748b' }}>No occupancy snapshots match this date range.</p>}</div>}
    {reportEnabled('propertyCashActivity') && <div style={card}>
      <h3 style={{ marginTop: 0 }}>Cash activity</h3>
      {reportRangeControls('cashActivity')}
      {cashTrendRows.length ? <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
        {[['Ending Cash', latestCashBalance ? fmt(latestCashBalance.value) : '-'], ['Receipts', fmt(latestCashTrend?.Receipts)], ['Owner Funding', fmt(latestCashTrend?.OwnerFunding)], ['Disbursements', fmt(latestCashTrend?.Disbursements)]].map(([label, value]) => <div key={label} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{label}</div><div style={{ marginTop: 4, fontSize: 20, fontWeight: 800 }}>{value}</div><div style={{ marginTop: 3, fontSize: 11, color: '#64748b' }}>{formatMonthLabel(latestCashMonth)}</div></div>)}
      </div><div style={{ height: 280 }}><ResponsiveContainer><BarChart data={cashTrendRows.slice(-12)}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} /><Tooltip formatter={(value: number) => fmt(value)} /><Legend /><Bar dataKey="Receipts" fill="#1e3a8a" /><Bar dataKey="OwnerFunding" fill="#7c3aed" /><Bar dataKey="Disbursements" fill="#0f766e" /></BarChart></ResponsiveContainer></div></> : <p style={{ marginBottom: 0, color: '#64748b' }}>No cash-tracker activity has been loaded.</p>}
    </div>}
    {reportEnabled('propertyVendorSpend') && <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
      <div style={{ padding: '14px 18px 0' }}><h3 style={{ margin: 0 }}>Vendor spend</h3><p style={{ margin: '6px 0 12px', color: '#64748b', fontSize: 13 }}>Cash-tracker disbursements by vendor; tenant and employee-level records are excluded.</p></div>
      <div style={{ padding: '0 18px', display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>{reportRangeControls('vendorSpend')}<label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: '#475569' }}>Vendor<input type="search" value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} placeholder="Search vendor" style={{ minWidth: 220, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6 }} /></label></div>
      {filteredVendorSpendRows.length ? <><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('vendorSpend', 'vendor', 'Vendor')}{sortableHeader('vendorSpend', 'payments', 'Payments', 'right')}{sortableHeader('vendorSpend', 'latestDate', 'Latest Payment', 'right')}{sortableHeader('vendorSpend', 'spend', 'Total Spend', 'right')}</tr></thead><tbody>{sortRows('vendorSpend', filteredVendorSpendRows, (row, key) => key === 'vendor' || key === 'latestDate' ? (row as any)[key] : Number((row as any)[key])).slice(0, expandedTables.vendorSpend ? undefined : 12).map((row) => <tr key={row.vendor}><td style={{ ...td, fontWeight: 700 }}>{row.vendor}</td><td style={{ ...td, textAlign: 'right' }}>{row.payments}</td><td style={{ ...td, textAlign: 'right' }}>{row.latestDate ? String(row.latestDate).slice(0, 10) : '-'}</td><td style={{ ...td, textAlign: 'right' }}>{fmt(row.spend)}</td></tr>)}</tbody></table>{tableToggle('vendorSpend', filteredVendorSpendRows.length)}</> : <div style={{ padding: 18, color: '#64748b' }}>{vendorSearch ? 'No vendors match this search and date range.' : 'No vendor disbursements have been loaded.'}</div>}
    </div>}
    {reportEnabled('propertyOperatingMetrics') && <div style={card}>
      <h3 style={{ marginTop: 0 }}>Apartment operating metrics</h3>
      {reportRangeControls('operatingMetrics')}
      {latestMetrics.size ? <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Metric</th><th style={{ ...th, textAlign: 'right' }}>Latest value</th><th style={{ ...th, textAlign: 'right' }}>As of</th></tr></thead><tbody>{[
        ['Rental income potential', 'rental_income_potential'], ['Vacancy loss', 'vacancy_loss'], ['Concessions', 'concessions'], ['Tenant accounts receivable', 'tenant_accounts_receivable'], ['Trade payables', 'trade_payables'], ['Move-outs', 'move_outs'],
      ].map(([label, metric]) => {
        const value = latestMetrics.get(metric);
        return <tr key={metric}><td style={td}>{label}</td><td style={{ ...td, textAlign: 'right' }}>{value ? value.unit === 'units' ? Number(value.value).toLocaleString() : fmt(value.value) : '-'}</td><td style={{ ...td, textAlign: 'right' }}>{value ? String(value.periodEnd).slice(0, 10) : '-'}</td></tr>;
      })}</tbody></table> : <p style={{ marginBottom: 0, color: '#64748b' }}>No lender operating metrics have been loaded.</p>}
    </div>}
    {reportEnabled('propertyDebtService') && <div style={card}><h3 style={{ marginTop: 0 }}>Debt service</h3><p style={{ margin: '6px 0 12px', color: '#64748b', fontSize: 13 }}>BGAH is the legal borrower; amounts are sourced from the SLN operating ledger.</p>{reportRangeControls('debtService')}{debtTrendRows.length ? <div style={{ height: 240 }}><ResponsiveContainer><BarChart data={debtTrendRows.slice(-12)}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} /><Tooltip formatter={(value: number) => fmt(value)} /><Bar dataKey="DebtService" fill="#b45309" /></BarChart></ResponsiveContainer></div> : <p style={{ marginBottom: 0, color: '#64748b' }}>No debt-service activity is available in the imported income statements.</p>}</div>}
    {reportEnabled('propertySourceReconciliation') && <div style={card}><h3 style={{ marginTop: 0 }}>BGAH / SLN source reconciliation</h3><p style={{ marginBottom: 0, color: '#64748b' }}>{Object.entries(data.lines.reduce<Record<string, number>>((counts, line) => { counts[line.sourceEntity] = (counts[line.sourceEntity] || 0) + 1; return counts; }, {})).map(([source, count]) => `${source}: ${count} source-period lines`).join(' · ') || 'No source lines loaded.'}</p></div>}
  </div>;
}
