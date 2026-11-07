'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCompanyMoneyFormatter } from '@/app/hooks/useCompanyMoneyFormatter';
import PropertyIncomeStatementTable from '@/app/components/financial/PropertyIncomeStatementTable';
import PropertyBalanceSheetTable from '@/app/components/financial/PropertyBalanceSheetTable';
import StatementTrendPopup from '@/app/components/financial/StatementTrendPopup';
import RealEstateWaterfallPanel from '@/app/components/operations/RealEstateWaterfallPanel';
import QbdInvestorActivityPanel from '@/app/components/operations/QbdInvestorActivityPanel';
import { useTableSort } from '@/app/components/operations/useTableSort';
import { computeWaterfall, type WaterfallEntry, type WaterfallInvestor, type WaterfallSettings } from '@/lib/real-estate/waterfall';
import { formatEstDate, formatEstDateTime } from '@/lib/time/eastern';
import { aggregateMappedAmounts, buildPropertyIncomeStatement } from '@/lib/real-estate/property-income-statement';
import { accountTypeIs, activityByYear, balanceAt, isAmortizationExpense, isDepreciationExpense, toReportLines, yearEndPeriods } from '@/lib/real-estate/quickbooks-report-lines';
import BooksIntegrityPanel from '@/app/components/operations/BooksIntegrityPanel';
import MemberCapitalReports from '@/app/components/operations/MemberCapitalReports';

type Props = {
  selectedCompanyId: string;
  mode: 'property' | 'investors' | 'entity-financials';
  operationalHubSections?: Record<string, boolean | undefined>;
};

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 };
const th: React.CSSProperties = { padding: '9px 10px', textAlign: 'left', fontSize: 11, color: '#475569', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' };
const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13 };

const basisBadge: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#1e3a8a', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 999, padding: '3px 9px', textTransform: 'uppercase', whiteSpace: 'nowrap' };
const CAPITAL_ENTRY_TYPES = ['CONTRIBUTION', 'DEEMED_CONTRIBUTION', 'OWNERSHIP_TRANSFER_IN', 'OWNERSHIP_TRANSFER_OUT'];

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
  const [data, setData] = useState<{ lines: any[]; quickBooksLines?: any[]; quickBooksMappings?: any[]; bgahSource?: 'QUICKBOOKS' | 'WORKBOOK'; investors: any[]; occupancy: any[]; cashActivities: any[]; operationalMetrics: any[]; mappings?: any[]; waterfallSettings?: WaterfallSettings; aliases?: Array<{ alias: string; investorId: string }>; taxReturns?: any[]; taxDepreciationRecords?: any[]; consolidatedReporting?: { publishedAt: string | null; firstMonth: string | null; lastMonth: string | null; partialMonths: string[]; latestCombinedMonth: string | null; latestUnreconciled: number | null; unmappedSlnAccounts: number } | null }>({ lines: [], investors: [], occupancy: [], cashActivities: [], operationalMetrics: [], mappings: [], taxReturns: [], taxDepreciationRecords: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const [publishingConsolidated, setPublishingConsolidated] = useState(false);
  const [consolidatedPublishError, setConsolidatedPublishError] = useState('');
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
  const reportRangesRef = useRef<Record<string, ReportRange>>({});
  const [vendorSearch, setVendorSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const fmt = (value: unknown) => Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: money.currency, maximumFractionDigits: 0 });
  const { sortRows, sortableHeader } = useTableSort(th);
  const toggleExpanded = (table: string) => setExpandedTables((current) => ({ ...current, [table]: !current[table] }));
  const tableToggle = (table: string, count: number) => count > 12 ? <button type="button" onClick={() => toggleExpanded(table)} style={{ margin: '10px', border: 0, borderRadius: 6, background: '#eff6ff', color: '#1e3a8a', padding: '6px 9px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{expandedTables[table] ? 'Collapse table' : `Show all ${count} rows`}</button> : null;
  const rangeFor = useCallback((key: string) => reportRanges[key] || { startDate: '', endDate: '' }, [reportRanges]);
  const saveReportRange = useCallback((key: string, range: ReportRange) => {
    const normalizedRange = {
      startDate: String(range.startDate || ''),
      endDate: String(range.endDate || ''),
    };
    const next = { ...reportRangesRef.current, [key]: normalizedRange };
    reportRangesRef.current = next;
    setReportRanges(next);
    try {
      window.localStorage.setItem(`real-estate:report-ranges:${selectedCompanyId}`, JSON.stringify(next));
    } catch {
      // Server persistence below remains available when local storage is unavailable.
    }
    void fetch('/api/ops-dashboard-prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: selectedCompanyId, preferences: { realEstateReportRanges: next } }),
    });
  }, [selectedCompanyId]);
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
      <button type="button" onClick={() => saveReportRange(key, draft)} style={{ padding: '7px 11px', border: '1px solid #1d4ed8', borderRadius: 6, background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save</button>
    </div>;
  };

  useEffect(() => {
    let active = true;
    reportRangesRef.current = {};
    setReportRanges({});
    setReportRangeDrafts({});
    const loadReportRanges = async () => {
      let ranges: Record<string, ReportRange> = {};
      try {
        const response = await fetch(`/api/ops-dashboard-prefs?companyId=${encodeURIComponent(selectedCompanyId)}`, { cache: 'no-store' });
        const payload = response.ok ? await response.json() : null;
        const saved = payload?.preferences?.realEstateReportRanges;
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) ranges = saved;
      } catch {
        // Fall through to this browser's last saved values.
      }
      if (!Object.keys(ranges).length) {
        try {
          const saved = window.localStorage.getItem(`real-estate:report-ranges:${selectedCompanyId}`);
          const parsed = saved ? JSON.parse(saved) : null;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ranges = parsed;
        } catch {
          ranges = {};
        }
      }
      if (active) {
        reportRangesRef.current = ranges;
        setReportRanges(ranges);
        setReportRangeDrafts(ranges);
      }
    };
    void loadReportRanges();
    return () => { active = false; };
  }, [selectedCompanyId]);

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
  // Property operations are SL Nusbaum's books; figures come from its mapped income statement.
  const slnOverview = useMemo(() => {
    const slnMonths = Array.from(new Set(data.lines
      .filter((line) => line.sourceEntity === 'SLN' && String(line.reportType).toUpperCase() === 'ACTIVITY')
      .map((line) => String(line.periodEnd).slice(0, 7)))).sort();
    if (!slnMonths.length) return null;
    const mapped = aggregateMappedAmounts(data.lines, data.mappings || [], 'SLN', (month) => (slnMonths.includes(month) ? month : null));
    const statement = buildPropertyIncomeStatement(slnMonths, mapped.amounts);
    const rowValues = (label: string) => statement.find((row) => row.label === label)?.values || {};
    const income = rowValues('TOTAL INCOME');
    const expenses = rowValues('TOTAL OPERATING EXPENSES');
    const noi = rowValues('NET OPERATING INCOME');
    const netCash = rowValues('NET CASH AVAILABLE');
    const month = slnMonths[slnMonths.length - 1];
    const shift = (base: string, by: number) => {
      const [year, monthNumber] = base.split('-').map(Number);
      const date = new Date(Date.UTC(year, monthNumber - 1 + by, 1));
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    };
    const priorMonth = shift(month, -1);
    const priorYear = shift(month, -12);
    const sumRange = (values: Record<string, number | null>, end: string) => {
      const window = Array.from({ length: 12 }, (_, index) => shift(end, -index));
      return window.every((key) => slnMonths.includes(key)) ? window.reduce((total, key) => total + Number(values[key] || 0), 0) : null;
    };
    const occupancyFor = (key: string) => data.occupancy.find((row) => String(row.periodEnd).startsWith(key)) || null;
    return {
      month, priorMonth, priorYear, income, expenses, noi, netCash,
      trailingStart: shift(month, -11),
      trailingNoi: sumRange(noi, month),
      priorTrailingNoi: sumRange(noi, priorYear),
      occupancy: occupancyFor(month),
      priorMonthOccupancy: occupancyFor(priorMonth),
      priorYearOccupancy: occupancyFor(priorYear),
    };
  }, [data.lines, data.mappings, data.occupancy]);
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
  const selectedVendorPayments = useMemo(() => selectedVendor
    ? data.cashActivities
      .filter((activity) => Number(activity.amount) < 0 && activity.counterparty === selectedVendor && withinRange('vendorSpend', activity.periodEnd))
      .sort((a, b) => String(b.activityDate || b.periodEnd).localeCompare(String(a.activityDate || a.periodEnd)))
    : [], [data.cashActivities, selectedVendor, withinRange]);
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
  const entityColumns = useMemo(() => Array.from(new Set(entitySelectedMonths.map((month) => entityStatementDisplay === 'monthly' ? month : entityStatementDisplay === 'annual' ? month.slice(0, 4) : `${month.slice(0, 4)} Q${Math.ceil(Number(month.slice(5, 7)) / 3)}`))).reverse(), [entitySelectedMonths, entityStatementDisplay]);
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
  const quickBooksReportLines = useMemo(() => toReportLines(data.quickBooksLines || []), [data.quickBooksLines]);
  const taxReconciliationRows = useMemo(() => {
    const quickBooksYearEnds = yearEndPeriods(quickBooksReportLines);
    const quickBooksDepreciation = activityByYear(quickBooksReportLines, (line) => isDepreciationExpense(line) || isAmortizationExpense(line));
    const taxReturnByYear = new Map((data.taxReturns || []).map((taxReturn) => [Number(taxReturn.taxYear), taxReturn]));
    const years = [...new Set([...taxReturnByYear.keys(), ...quickBooksDepreciation.keys()])].sort((a, b) => a - b);
    return years.map((year) => {
      const taxReturn = taxReturnByYear.get(year);
      const yearPrefix = `${year}-`;
      const importedLines = data.lines.filter((line) => String(line.periodEnd).startsWith(yearPrefix));
      const hasQuickBooks = quickBooksDepreciation.has(year) || quickBooksYearEnds.has(year);
      const bookDepreciation = hasQuickBooks
        ? quickBooksDepreciation.get(year) || 0
        : importedLines
          .filter((line) => String(line.reportType).toUpperCase() === 'ACTIVITY' && /depreciation|amortization/i.test(String(line.accountName)))
          .reduce((total, line) => total + Math.abs(Number(line.amount || 0)), 0);
      const yearEnd = quickBooksYearEnds.get(year);
      const bookFixedAssets = hasQuickBooks && yearEnd
        ? balanceAt(quickBooksReportLines, yearEnd, (line) => accountTypeIs(line, 'fixedasset') && !/due to|due from/i.test(line.accountName))
        : null;
      const taxRecords = (data.taxDepreciationRecords || []).filter((record) => Number(record.taxYear) === year);
      const taxDeduction = taxRecords.reduce((total, record) => total + Number(record.deduction || 0), 0);
      return {
        year,
        sourceDocument: String(taxReturn?.sourceDocument || ''),
        taxCoverage: taxReturn ? String(taxReturn.coverageStatus || 'PARTIAL') : 'NOT_IMPORTED',
        taxNotes: String(taxReturn?.notes || ''),
        taxDeduction,
        taxRecordCount: taxRecords.length,
        bookDepreciation,
        bookFixedAssets,
        bookSource: hasQuickBooks ? 'QuickBooks Desktop' : importedLines.length ? 'Imported book financials' : 'Not loaded',
        variance: bookDepreciation > 0 && taxDeduction > 0 ? bookDepreciation - taxDeduction : null,
      };
    });
  }, [data.lines, data.taxDepreciationRecords, data.taxReturns, quickBooksReportLines]);

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
  const propertyTableColumns = useMemo(() => [...propertyColumns].reverse(), [propertyColumns]);
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

  const publishConsolidated = async () => {
    setPublishingConsolidated(true);
    setConsolidatedPublishError('');
    try {
      const response = await fetch('/api/operations/real-estate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId, kind: 'publish-consolidated' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to publish consolidated financials.');
      setReloadKey((key) => key + 1);
    } catch (err) {
      setConsolidatedPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishingConsolidated(false);
    }
  };

  if (loading) return <div style={{ padding: 24, color: '#64748b' }}>Loading real-estate operations…</div>;
  if (error) return <div style={{ margin: 24, ...card, color: '#b91c1c' }}>{error}</div>;

  if (mode === 'entity-financials') {
    return <div style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div><h2 style={{ margin: 0, color: '#0f172a' }}>Entity Financials</h2><p style={{ color: '#64748b', marginBottom: 0 }}>Property income statement and balance sheet for each source ledger. The income statement is built from its Data Mapping.{entityScope === 'COMBINED' ? ' Combined includes only periods reported by every feed.' : ''}</p></div>
      {data.consolidatedReporting !== undefined && data.consolidatedReporting !== null && (() => {
        const status = data.consolidatedReporting;
        return <div style={{ ...card, display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <h3 style={{ margin: 0 }}>Financial Reporting source</h3>
            <p style={{ color: '#475569', margin: 0, fontSize: 13 }}>Financial Reporting pages and reports use the consolidated SLN + BGAH financials. SLN supplies property operations and working capital; BGAH (QuickBooks Desktop) supplies owner-level assets, the loan, depreciation and non-property items. The Due to/from SLN balance is eliminated. Republished automatically after a QuickBooks Desktop sync or a mapping change.</p>
            <div style={{ color: '#64748b', fontSize: 12 }}>
              {status.publishedAt
                ? <>Last published {formatEstDateTime(status.publishedAt)} EST · {status.firstMonth ? formatMonthLabel(status.firstMonth) : '—'} to {status.lastMonth ? formatMonthLabel(status.lastMonth) : '—'}</>
                : 'Not published yet.'}
              {status.partialMonths.length > 0 && <> · Partial months (one entity missing): {status.partialMonths.map(formatMonthLabel).join(', ')}</>}
              {status.latestCombinedMonth && status.latestUnreconciled !== null && <> · Intercompany difference not yet explained at {formatMonthLabel(status.latestCombinedMonth)}: {fmt(status.latestUnreconciled)}</>}
              {status.unmappedSlnAccounts > 0 && <> · {status.unmappedSlnAccounts} SLN accounts unmapped</>}
            </div>
            {consolidatedPublishError && <div style={{ color: '#b91c1c', fontSize: 12 }}>{consolidatedPublishError}</div>}
          </div>
          <button type="button" onClick={publishConsolidated} disabled={publishingConsolidated} style={{ padding: '7px 11px', border: '1px solid #1d4ed8', borderRadius: 6, background: '#2563eb', color: '#fff', fontWeight: 700, cursor: publishingConsolidated ? 'wait' : 'pointer', opacity: publishingConsolidated ? 0.7 : 1 }}>{publishingConsolidated ? 'Publishing…' : 'Publish to Financial Reporting'}</button>
        </div>;
      })()}
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
      {reportEnabled('entityBookToTaxReconciliation') && <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>Book-to-Tax Reconciliation</h3>
            <p style={{ color: '#475569', margin: '6px 0 0', fontSize: 13 }}>Preliminary comparison of book depreciation with reviewed Form 4562 records. Tax methods are not inferred from book depreciation.</p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 999, padding: '3px 9px', textTransform: 'uppercase' }}>Preliminary</span>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
            <thead><tr><th style={th}>Tax year</th><th style={th}>Tax coverage</th><th style={{ ...th, textAlign: 'right' }}>Verified tax deduction</th><th style={{ ...th, textAlign: 'right' }}>Book depreciation</th><th style={{ ...th, textAlign: 'right' }}>Difference</th><th style={{ ...th, textAlign: 'right' }}>Book fixed assets (net, year-end)</th><th style={th}>Book source</th></tr></thead>
            <tbody>{taxReconciliationRows.map((row) => <tr key={row.year}>
              <td style={{ ...td, fontWeight: 700 }}>{row.year}</td>
              <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: row.taxCoverage === 'PRE_SERVICE' || row.taxCoverage === 'NOT_IMPORTED' ? '#475569' : '#166534', background: row.taxCoverage === 'PRE_SERVICE' || row.taxCoverage === 'NOT_IMPORTED' ? '#f1f5f9' : '#ecfdf5', borderRadius: 999, padding: '3px 7px' }}>{row.taxCoverage.replace(/_/g, ' ')}</span></td>
              <td style={{ ...td, textAlign: 'right' }}>{row.taxRecordCount ? fmt(row.taxDeduction) : '—'}</td>
              <td style={{ ...td, textAlign: 'right' }}>{row.bookDepreciation ? fmt(row.bookDepreciation) : '—'}</td>
              <td style={{ ...td, textAlign: 'right', color: row.variance === null ? '#64748b' : Math.abs(row.variance) < 1 ? '#166534' : '#92400e' }}>{row.variance === null ? 'Needs both sources' : fmt(row.variance)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{row.bookFixedAssets === null ? '—' : fmt(row.bookFixedAssets)}</td>
              <td style={td}>{row.bookSource}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {!taxReconciliationRows.length && <p style={{ color: '#64748b', marginBottom: 0 }}>Tax-return facts have not been imported for this company.</p>}
        <div style={{ display: 'grid', gap: 6, marginTop: 14, fontSize: 12, color: '#64748b' }}>
          {taxReconciliationRows.filter((row) => row.sourceDocument || row.taxNotes).map((row) => <div key={`${row.year}-source`}><strong style={{ color: '#475569' }}>{row.year}:</strong> {[row.sourceDocument, row.taxNotes].filter(Boolean).join(' · ')}</div>)}
          {quickBooksReportLines.length > 0 && <div><strong style={{ color: '#475569' }}>Book source:</strong> Book depreciation and amortization are the QuickBooks Desktop expense accounts for each year; fixed assets are the year-end QuickBooks fixed-asset accounts net of accumulated depreciation, excluding the Due to/from SLN balance QuickBooks types as a fixed asset. Where QuickBooks depreciation equals the return, the books are recording tax depreciation rather than a separate book method.</div>}
          <div><strong style={{ color: '#475569' }}>Open items:</strong> the CPA fixed-asset/cost-segregation schedule and confirmation that the 2025 return is final.</div>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>Verified tax depreciation and amortization records</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1020 }}>
            <thead><tr><th style={th}>Year</th><th style={th}>Tax asset / treatment</th><th style={{ ...th, textAlign: 'right' }}>Tax basis</th><th style={th}>Recovery</th><th style={th}>Convention</th><th style={th}>Method</th><th style={{ ...th, textAlign: 'right' }}>Deduction</th><th style={th}>Match status</th></tr></thead>
            <tbody>{(data.taxDepreciationRecords || []).map((record) => <tr key={`${record.taxYear}-${record.assetReference}-${record.taxTreatment}`}>
              <td style={td}>{record.taxYear}</td>
              <td style={{ ...td, fontWeight: 700 }}>{record.assetReference}<div style={{ marginTop: 3, color: '#64748b', fontSize: 11 }}>{String(record.taxTreatment || '').toLowerCase()}</div></td>
              <td style={{ ...td, textAlign: 'right' }}>{fmt(record.taxBasis)}</td>
              <td style={td}>{record.recoveryPeriodYears ? `${record.recoveryPeriodYears} years` : '—'}</td>
              <td style={td}>{record.convention || '—'}</td>
              <td style={td}>{record.method || '—'}</td>
              <td style={{ ...td, textAlign: 'right' }}>{fmt(record.deduction)}</td>
              <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>{String(record.matchStatus || 'UNMATCHED').replace(/_/g, ' ')}</span></td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>}
      {reportEnabled('entityBooksIntegrityExceptions') && <BooksIntegrityPanel
        lines={data.lines}
        quickBooksLines={data.quickBooksLines || []}
        mappings={data.mappings || []}
        quickBooksMappings={data.quickBooksMappings || []}
        bgahSource={data.bgahSource || 'WORKBOOK'}
        fmt={fmt}
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
        <div style={{ padding: '14px 18px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>Member Capital Rollforward</h3>
            <p style={{ color: '#64748b', margin: '6px 0 12px', fontSize: 13 }}>Each member&apos;s contributions and deemed capital (including capital transferred between members), distributions, allocated profit and loss, and unpaid preferred return or even-up to date. Capital follows the Operating Agreement, so it includes deemed capital that QuickBooks does not record.</p>
          </div>
          <span style={basisBadge}>Operating Agreement basis</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead><tr>{sortableHeader('investors', 'name', 'Investor / Member')}{sortableHeader('investors', 'group', 'Group')}{sortableHeader('investors', 'ownership', 'Ownership', 'right')}{sortableHeader('investors', 'contribution', 'Contributions / Deemed Capital', 'right')}{sortableHeader('investors', 'distribution', 'Distributions', 'right')}{sortableHeader('investors', 'allocation', 'Allocations', 'right')}{sortableHeader('investors', 'preferred', 'Unpaid Pref. Return', 'right')}{sortableHeader('investors', 'evenUp', 'Unpaid Even-Up', 'right')}</tr></thead>
          <tbody>{sortRows('investors', data.investors.map((investor) => {
            const entries = Array.isArray(investor.entries) ? investor.entries : [];
            const sum = (type: string) => entries.filter((entry: any) => entry.entryType === type).reduce((total: number, entry: any) => total + Number(entry.amount || 0), 0);
            const balance = waterfallBalanceById.get(investor.id);
            return {
              investor,
              contribution: CAPITAL_ENTRY_TYPES.reduce((total, type) => total + sum(type), 0),
              distribution: sum('DISTRIBUTION'),
              allocation: sum('ALLOCATION'),
              preferred: waterfall.ready && balance?.isLandContributor ? balance.preferredReturnUnpaid : null,
              evenUp: waterfall.ready && balance && !balance.isLandContributor ? balance.evenUpUnpaid : null,
            };
          }), (row, key) => key === 'name' ? row.investor.legalName : key === 'group' ? row.investor.memberGroup : key === 'ownership' ? Number(row.investor.ownershipPercentage || 0) : (row as any)[key]).slice(0, expandedTables.investors ? undefined : 12).map(({ investor, contribution, distribution, allocation, preferred, evenUp }) => <tr key={investor.id}><td style={{ ...td, fontWeight: 700 }}>{investor.legalName}</td><td style={td}>{investor.memberGroup || '-'}</td><td style={{ ...td, textAlign: 'right' }}>{investor.ownershipPercentage == null ? '-' : `${Number(investor.ownershipPercentage).toFixed(2)}%`}</td><td style={{ ...td, textAlign: 'right' }}>{fmt(contribution)}</td><td style={{ ...td, textAlign: 'right' }}>{fmt(distribution)}</td><td style={{ ...td, textAlign: 'right' }}>{fmt(allocation)}</td><td style={{ ...td, textAlign: 'right' }}>{preferred === null ? '-' : fmt(preferred)}</td><td style={{ ...td, textAlign: 'right' }}>{evenUp === null ? '-' : fmt(evenUp)}</td></tr>)}</tbody>
          {data.investors.length > 0 && (() => {
            const totals = data.investors.reduce((acc: { ownership: number; contribution: number; distribution: number; allocation: number; preferred: number; evenUp: number }, investor: any) => {
              const entries = Array.isArray(investor.entries) ? investor.entries : [];
              const sum = (type: string) => entries.filter((entry: any) => entry.entryType === type).reduce((total: number, entry: any) => total + Number(entry.amount || 0), 0);
              const balance = waterfallBalanceById.get(investor.id);
              return {
                ownership: acc.ownership + Number(investor.ownershipPercentage || 0),
                contribution: acc.contribution + CAPITAL_ENTRY_TYPES.reduce((total, type) => total + sum(type), 0),
                distribution: acc.distribution + sum('DISTRIBUTION'),
                allocation: acc.allocation + sum('ALLOCATION'),
                preferred: acc.preferred + (waterfall.ready && balance?.isLandContributor ? balance.preferredReturnUnpaid : 0),
                evenUp: acc.evenUp + (waterfall.ready && balance && !balance.isLandContributor ? balance.evenUpUnpaid : 0),
              };
            }, { ownership: 0, contribution: 0, distribution: 0, allocation: 0, preferred: 0, evenUp: 0 });
            const totalCell = { ...td, textAlign: 'right' as const, fontWeight: 800 };
            return <tfoot><tr style={{ background: '#f8fafc' }}><td style={{ ...td, fontWeight: 800 }}>Total</td><td style={td} /><td style={totalCell}>{`${totals.ownership.toFixed(2)}%`}</td><td style={totalCell}>{fmt(totals.contribution)}</td><td style={totalCell}>{fmt(totals.distribution)}</td><td style={totalCell}>{fmt(totals.allocation)}</td><td style={totalCell}>{waterfall.ready ? fmt(totals.preferred) : '-'}</td><td style={totalCell}>{waterfall.ready ? fmt(totals.evenUp) : '-'}</td></tr></tfoot>;
          })()}
        </table>
        {tableToggle('investors', data.investors.length)}
        {!data.investors.length && <div style={{ padding: 18, color: '#64748b' }}>Import or add the member ledger to populate investor balances.</div>}
      </div>}
      {reportEnabled('investorCapitalRollforward') && <QbdInvestorActivityPanel companyId={selectedCompanyId} investors={data.investors} fmt={fmt} />}
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
      {(reportEnabled('investorAnnualCapitalRollforward') || reportEnabled('investorMemberStatements')) && <MemberCapitalReports
        quickBooksLines={data.quickBooksLines || []}
        investors={data.investors}
        aliases={data.aliases || []}
        unpaidFor={(investorId) => {
          const balance = waterfallBalanceById.get(investorId);
          return {
            preferred: balance?.isLandContributor ? balance.preferredReturnUnpaid : null,
            evenUp: balance && !balance.isLandContributor ? balance.evenUpUnpaid : null,
          };
        }}
        waterfallReady={waterfall.ready}
        showRollforward={reportEnabled('investorAnnualCapitalRollforward')}
        showStatements={reportEnabled('investorMemberStatements')}
        fmt={fmt}
      />}
    </div>;
  }

  return <div style={{ padding: 24, display: 'grid', gap: 16 }}>
    <div><h2 style={{ margin: 0, color: '#0f172a' }}>Property Financials</h2><p style={{ color: '#64748b', marginBottom: 0 }}>Approved BGAH and SLN property performance by reporting period.</p></div>
    {reportEnabled('propertyFinancialOverview') && (slnOverview ? (() => {
      const { month, priorMonth, priorYear } = slnOverview;
      const pct = (current: number | null | undefined, prior: number | null | undefined) => {
        if (current == null || prior == null || !Number(prior)) return null;
        return ((Number(current) - Number(prior)) / Math.abs(Number(prior))) * 100;
      };
      const points = (current: any, prior: any) => (current && prior ? Number(current.physicalOccupancyPct) - Number(prior.physicalOccupancyPct) : null);
      const change = (value: number | null, unit: '%' | ' pts', label: string, goodWhenUp = true) => {
        if (value === null || !Number.isFinite(value)) return <div style={{ color: '#94a3b8' }}>{label}: not available</div>;
        const up = value >= 0;
        return <div style={{ color: Math.abs(value) < 0.05 ? '#64748b' : up === goodWhenUp ? '#166534' : '#b91c1c' }}>{label}: {up ? '+' : ''}{value.toFixed(1)}{unit}</div>;
      };
      const monthCard = (label: string, values: Record<string, number | null>, goodWhenUp = true, extra?: React.ReactNode) => <div key={label} style={card}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800 }}>{fmt(values[month])}</div>
        <div style={{ marginTop: 6, display: 'grid', gap: 2, fontSize: 12 }}>
          {change(pct(values[month], values[priorMonth]), '%', `vs ${formatMonthLabel(priorMonth)}`, goodWhenUp)}
          {change(pct(values[month], values[priorYear]), '%', `vs ${formatMonthLabel(priorYear)}`, goodWhenUp)}
          {extra}
        </div>
      </div>;
      const occupancy = slnOverview.occupancy;
      const noiMargin = slnOverview.income[month] ? (Number(slnOverview.noi[month] || 0) / Number(slnOverview.income[month])) * 100 : null;
      return <div style={card}>
        <h3 style={{ margin: 0 }}>Property operations · {formatMonthLabel(month)}</h3>
        <p style={{ color: '#64748b', margin: '6px 0 14px', fontSize: 13 }}>SL Nusbaum (SLN) manages the property, so these figures come from SLN&apos;s monthly operating statement as mapped in Data Mapping. {formatMonthLabel(month)} is the latest month SLN has reported. Each change compares with the prior month and the same month a year earlier.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          {monthCard('Total income', slnOverview.income)}
          {monthCard('Operating expenses', slnOverview.expenses, false)}
          {monthCard('Net operating income', slnOverview.noi, true, noiMargin === null ? null : <div style={{ color: '#475569' }}>NOI margin: {noiMargin.toFixed(1)}%</div>)}
          {monthCard('Net cash after debt service & capital', slnOverview.netCash)}
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Physical occupancy</div>
            <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800 }}>{occupancy ? `${Number(occupancy.physicalOccupancyPct).toFixed(1)}%` : '—'}</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 2, fontSize: 12 }}>
              {occupancy && <div style={{ color: '#475569' }}>{Number(occupancy.occupiedUnits)} of {Number(occupancy.totalUnits)} units occupied · {Number(occupancy.totalUnits) - Number(occupancy.occupiedUnits)} vacant</div>}
              {change(points(occupancy, slnOverview.priorMonthOccupancy), ' pts', `vs ${formatMonthLabel(priorMonth)}`)}
              {change(points(occupancy, slnOverview.priorYearOccupancy), ' pts', `vs ${formatMonthLabel(priorYear)}`)}
              {occupancy?.economicOccupancyPct != null && <div style={{ color: '#475569' }}>Economic occupancy: {Number(occupancy.economicOccupancyPct).toFixed(1)}%</div>}
            </div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Trailing 12-month NOI</div>
            <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800 }}>{slnOverview.trailingNoi === null ? '—' : fmt(slnOverview.trailingNoi)}</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 2, fontSize: 12 }}>
              <div style={{ color: '#475569' }}>{formatMonthLabel(slnOverview.trailingStart)} – {formatMonthLabel(month)}</div>
              {change(pct(slnOverview.trailingNoi, slnOverview.priorTrailingNoi), '%', `vs 12 months ending ${formatMonthLabel(priorYear)}`)}
            </div>
          </div>
        </div>
      </div>;
    })() : <div style={{ ...card, color: '#64748b' }}>No SLN operating statements have been loaded.</div>)}
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
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 + propertyColumns.length * 110 }}><thead><tr>{sortableHeader('financialLines', 'account', 'Account')}{sortableHeader('financialLines', 'type', 'Type')}{sortableHeader('financialLines', 'source', 'Source')}{propertyTableColumns.map((column) => <Fragment key={column}>{sortableHeader('financialLines', column, propertyColumnLabel(column), 'right')}</Fragment>)}</tr></thead><tbody>{sortRows('financialLines', propertyAccountRows, (row, key) => key === 'account' ? `${row.accountCode} ${row.accountName}` : key === 'type' ? row.accountType : key === 'source' ? row.source : Number(row.values[key] || 0)).slice(0, expandedTables.financialLines ? undefined : 12).map((row) => {
        const rowKey = `${row.source}|${row.accountType}|${row.accountCode}|${row.accountName}`;
        const isSelected = selectedPropertyRowKey === rowKey;
        return <tr key={rowKey} style={{ background: isSelected ? '#dbeafe' : undefined }}><td style={td}><button type="button" title="Show trend" onClick={() => setSelectedPropertyRowKey(isSelected ? null : rowKey)} style={{ border: 0, padding: 0, background: 'transparent', color: '#1e3a8a', font: 'inherit', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>{row.accountCode} · {row.accountName}</button></td><td style={td}>{row.accountType}</td><td style={td}>{row.source}</td>{propertyTableColumns.map((column) => <td key={column} style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{row.values[column] === undefined ? '' : fmt(row.values[column])}</td>)}</tr>;
      })}</tbody></table></div>{tableToggle('financialLines', propertyAccountRows.length)}{!propertyAccountRows.length && <div style={{ padding: 18, color: '#64748b' }}>No accounts with activity for this type and period.</div>}</div>
      {selectedPropertyRow && <StatementTrendPopup
        label={`${selectedPropertyRow.accountCode} · ${selectedPropertyRow.accountName}`}
        subtitle={`${selectedPropertyRow.source} · ${selectedPropertyRow.accountType} · ${propertyColumnLabel(propertyColumns[0])}${propertyColumns.length > 1 ? ` – ${propertyColumnLabel(propertyColumns[propertyColumns.length - 1])}` : ''}`}
        columns={propertyColumns}
        values={selectedPropertyRow.values}
        onClose={() => setSelectedPropertyRowKey(null)}
      />}
    </>}
    {reportEnabled('propertyOccupancyTrend') && <div style={card}><h3 style={{ marginTop: 0 }}>Occupancy trends</h3>{reportRangeControls('occupancy')}{occupancyRows.length ? <div style={{ height: 320 }}><ResponsiveContainer><ComposedChart data={occupancyRows.map((row) => ({ month: String(row.periodEnd).slice(0, 7), occupiedUnits: Number(row.occupiedUnits), totalUnits: Number(row.totalUnits), physical: Number(row.physicalOccupancyPct), economic: row.economicOccupancyPct == null ? null : Number(row.economicOccupancyPct) }))}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="month" tickFormatter={formatMonthLabel} stroke="#64748b" style={{ fontSize: '11px' }} /><YAxis yAxisId="units" stroke="#64748b" style={{ fontSize: '12px' }} /><YAxis yAxisId="occupancy" orientation="right" domain={[0, 100]} tickFormatter={(value) => `${value}%`} stroke="#64748b" style={{ fontSize: '12px' }} /><Tooltip labelFormatter={(month) => formatMonthLabel(String(month))} formatter={(value: number, name: string, item: any) => name === 'Occupied units' ? [`${Number(value).toLocaleString()} / ${item.payload.totalUnits.toLocaleString()}`, name] : [`${Number(value).toFixed(1)}%`, name]} /><Legend /><Bar yAxisId="units" dataKey="occupiedUnits" name="Occupied units" fill="#1e3a8a" radius={[3, 3, 0, 0]} /><Line yAxisId="occupancy" type="monotone" dataKey="physical" name="Physical occupancy" stroke="#0f766e" strokeWidth={3} dot={{ r: 3 }} /><Line yAxisId="occupancy" type="monotone" dataKey="economic" name="Economic occupancy" stroke="#b45309" strokeWidth={3} dot={{ r: 3 }} connectNulls={false} /></ComposedChart></ResponsiveContainer></div> : <p style={{ marginBottom: 0, color: '#64748b' }}>No occupancy snapshots match this date range.</p>}</div>}
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
      {filteredVendorSpendRows.length ? <><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{sortableHeader('vendorSpend', 'vendor', 'Vendor')}{sortableHeader('vendorSpend', 'payments', 'Payments', 'right')}{sortableHeader('vendorSpend', 'latestDate', 'Latest Payment', 'right')}{sortableHeader('vendorSpend', 'spend', 'Total Spend', 'right')}</tr></thead><tbody>{sortRows('vendorSpend', filteredVendorSpendRows, (row, key) => key === 'vendor' || key === 'latestDate' ? (row as any)[key] : Number((row as any)[key])).slice(0, expandedTables.vendorSpend ? undefined : 12).map((row) => {
        const isSelected = selectedVendor === row.vendor;
        return <tr key={row.vendor} style={{ background: isSelected ? '#dbeafe' : undefined }}><td style={{ ...td, fontWeight: 700 }}><button type="button" onClick={() => setSelectedVendor(isSelected ? null : row.vendor)} style={{ border: 0, padding: 0, background: 'transparent', color: '#1e3a8a', font: 'inherit', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>{row.vendor}</button></td><td style={{ ...td, textAlign: 'right' }}>{row.payments}</td><td style={{ ...td, textAlign: 'right' }}>{row.latestDate ? String(row.latestDate).slice(0, 10) : '-'}</td><td style={{ ...td, textAlign: 'right' }}>{fmt(row.spend)}</td></tr>;
      })}</tbody></table>{tableToggle('vendorSpend', filteredVendorSpendRows.length)}
      {selectedVendor && <div style={{ margin: '0 18px 18px', border: '1px solid #bfdbfe', borderRadius: 8, overflowX: 'auto' }}><div style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#1e3a8a' }}>{selectedVendor} payments</div><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}><thead><tr><th style={th}>Date</th><th style={th}>Description</th><th style={{ ...th, textAlign: 'right' }}>Payment</th></tr></thead><tbody>{selectedVendorPayments.map((activity) => <tr key={activity.id}><td style={td}>{String(activity.activityDate || activity.periodEnd).slice(0, 10)}</td><td style={td}>{activity.description || '-'}</td><td style={{ ...td, textAlign: 'right' }}>{fmt(Math.abs(Number(activity.amount)))}</td></tr>)}</tbody></table>{!selectedVendorPayments.length && <div style={{ padding: 12, color: '#64748b' }}>No payments match the current date range.</div>}</div>}</> : <div style={{ padding: 18, color: '#64748b' }}>{vendorSearch ? 'No vendors match this search and date range.' : 'No vendor disbursements have been loaded.'}</div>}
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
