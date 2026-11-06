'use client';

import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCompanyMoneyFormatter } from '@/app/hooks/useCompanyMoneyFormatter';
import ReportPlaceholder from '@/app/components/operations/ReportPlaceholder';
import { useTableSort } from '@/app/components/operations/useTableSort';
import { accumulatedDepreciation, annualRunRate, depreciationForYear, depreciationYears, isDepreciable } from '@/lib/real-estate/depreciation';
import { formatEstDate } from '@/lib/time/eastern';
import { FIXED_ASSET_CLASS_LABEL, accountTypeIs, activityByYear, balanceAt, classifyFixedAssetAccount, isAmortizationExpense, isConstructionLoan, isDepreciationExpense, isInterestExpense, toReportLines, yearEndPeriods, type FixedAssetClass, type ReportLine } from '@/lib/real-estate/quickbooks-report-lines';

type Props = {
  selectedCompanyId: string;
  operationalHubSections?: Record<string, boolean | undefined>;
};

type Draw = { sequence: number; label: string; drawDate: string | null; equityFunded: number; loanFunded: number; retainageHeld: number; liquidatedDamages: number; sourceDocument: string | null; notes: string | null };
type BudgetLine = { lineNumber: number; name: string; revisedBudget: number; remainingAfter: number; asOfSequence: number; costClass: string };
type Invoice = { id: string; drawSequence: number; budgetLine: string; vendor: string; invoiceDate: string | null; invoiceNumber: string | null; debtAmount: number; equityAmount: number; sourceFileName: string | null };
type FundingSource = { stage: string; effectiveSequence: number; sourceName: string; amount: number; sortOrder: number };
type FixedAsset = { id: string; name: string; assetClass: string; cost: number; inServiceDate: string | null; usefulLifeYears: number | null; basis: string | null; sortOrder: number };
type AssetDraft = { name: string; assetClass: string; cost: string; inServiceDate: string; usefulLifeYears: string };
type View = 'draws' | 'sources-uses' | 'fixed-assets' | 'depreciation' | 'loan';

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 };
const th: React.CSSProperties = { padding: '9px 10px', textAlign: 'left', fontSize: 11, color: '#475569', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' };
const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13 };
const num: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const totalRow: React.CSSProperties = { fontWeight: 800, background: '#f8fafc' };
const label: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' };
const input: React.CSSProperties = { minWidth: 150, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontWeight: 400 };
const cellInput: React.CSSProperties = { width: '100%', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit' };
const saveButton = (busy: boolean): React.CSSProperties => ({ padding: '6px 12px', background: busy ? '#9ca3af' : '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer', boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)' });
const secondaryButton: React.CSSProperties = { padding: '6px 12px', background: '#eff6ff', color: '#1e3a8a', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const toggleButton: React.CSSProperties = { margin: '10px', border: 0, borderRadius: 6, background: '#eff6ff', color: '#1e3a8a', padding: '6px 9px', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const CHART_COLORS = ['#1e3a8a', '#0f766e', '#b45309', '#7c3aed', '#64748b', '#be123c'];

const COST_CLASS_LABEL: Record<string, string> = {
  land: 'Land',
  hard: 'Hard construction',
  soft: 'Capitalized soft costs',
  ffe: 'Furniture, fixtures & equipment',
  loan: 'Loan costs (debt issuance)',
  expense: 'Lease-up & organization (expensed)',
};
const COST_CLASS_ORDER = ['land', 'hard', 'soft', 'ffe', 'loan', 'expense'];
const ASSET_CLASS_LABEL: Record<string, string> = {
  land: 'Land',
  building: 'Building',
  land_improvements: 'Land improvements',
  equipment: 'Equipment & furnishings',
  ffe: 'FF&E',
};

const formatDate = (ymd: string | null) => {
  if (!ymd) return '—';
  const [year, month, day] = ymd.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]} ${day}, ${year}`;
};
const budgetUsed = (draw: Draw) => draw.equityFunded + draw.loanFunded + draw.retainageHeld;
const shortDrawLabel = (draw: Draw) => draw.label.replace(/^Draw /, 'D').replace(/ \(Closing\)$/, '').replace(/ \(Interest\)$/, 'i').replace(/ \(Req 26 & 27\)$/, 'r');
const draftFor = (asset: FixedAsset): AssetDraft => ({
  name: asset.name,
  assetClass: asset.assetClass,
  cost: String(asset.cost),
  inServiceDate: asset.inServiceDate || '',
  usefulLifeYears: asset.usefulLifeYears == null ? '' : String(asset.usefulLifeYears),
});

export default function RealEstateConstructionTab({ selectedCompanyId, operationalHubSections }: Props) {
  const money = useCompanyMoneyFormatter(selectedCompanyId);
  const fmt = (value: number) => Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: money.currency, maximumFractionDigits: 0 });
  const fmtCents = (value: number) => Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: money.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const millions = (value: number) => `$${(value / 1_000_000).toFixed(1)}M`;
  const reportEnabled = (key: string) => operationalHubSections?.[key] !== false;
  const views = ([
    ['draws', 'Draw History', 'constructionDrawHistory'],
    ['sources-uses', 'Sources & Uses', 'constructionSourcesUses'],
    ['fixed-assets', 'Fixed Asset Register', 'fixedAssetRegister'],
    ['depreciation', 'Depreciation Schedule', 'fixedAssetRegister'],
    ['loan', 'Loan Schedule', 'constructionDebtSchedule'],
  ] as Array<[View, string, string]>).filter(([, , key]) => reportEnabled(key));
  const { sortRows, sortableHeader } = useTableSort(th);

  const [data, setData] = useState<{ draws: Draw[]; budgetLines: BudgetLine[]; invoices: Invoice[]; fundingSources: FundingSource[]; fixedAssets: FixedAsset[] }>({ draws: [], budgetLines: [], invoices: [], fundingSources: [], fixedAssets: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState<View>('draws');
  const [selectedDraw, setSelectedDraw] = useState<number | 'ALL'>('ALL');
  const [invoiceLine, setInvoiceLine] = useState('ALL');
  const [vendorSearch, setVendorSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, AssetDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [assetMessage, setAssetMessage] = useState('');
  const [assumedInService, setAssumedInService] = useState('');
  const [quickBooksLines, setQuickBooksLines] = useState<ReportLine[]>([]);
  const asOfDate = formatEstDate();
  const activeView = views.some(([key]) => key === view) ? view : views[0]?.[0];

  useEffect(() => {
    let active = true;
    fetch(`/api/operations/real-estate/construction?companyId=${encodeURIComponent(selectedCompanyId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load construction data.');
        if (!active) return;
        setData(payload);
        setDrafts(Object.fromEntries((payload.fixedAssets as FixedAsset[]).map((asset) => [asset.id, draftFor(asset)])));
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [selectedCompanyId, reloadKey]);
  useEffect(() => {
    let active = true;
    fetch(`/api/operations/real-estate?companyId=${encodeURIComponent(selectedCompanyId)}`, { cache: 'no-store' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload) => active && setQuickBooksLines(toReportLines(payload?.quickBooksLines || [])))
      .catch(() => active && setQuickBooksLines([]));
    return () => { active = false; };
  }, [selectedCompanyId]);

  const toggle = (key: string, count: number) => count > 12
    ? <button type="button" onClick={() => setExpanded((current) => ({ ...current, [key]: !current[key] }))} style={toggleButton}>{expanded[key] ? 'Collapse table' : `Show all ${count} rows`}</button>
    : null;

  const totals = useMemo(() => {
    const sum = (pick: (draw: Draw) => number) => data.draws.reduce((total, draw) => total + pick(draw), 0);
    return {
      budgetUsed: sum(budgetUsed),
      equity: sum((draw) => draw.equityFunded),
      loan: sum((draw) => draw.loanFunded),
      retainageHeld: sum((draw) => Math.max(0, draw.retainageHeld)),
      ldWithheld: sum((draw) => Math.max(0, draw.liquidatedDamages)),
      ldReleased: sum((draw) => Math.max(0, -draw.liquidatedDamages)),
    };
  }, [data.draws]);

  const drawRows = useMemo(() => data.draws.map((draw, index) => {
    const through = data.draws.slice(0, index + 1);
    const sum = (pick: (row: Draw) => number) => through.reduce((total, row) => total + pick(row), 0);
    const invoices = data.invoices.filter((invoice) => invoice.drawSequence === draw.sequence);
    const invoiceTotal = invoices.reduce((total, invoice) => total + invoice.debtAmount + invoice.equityAmount, 0);
    return {
      draw,
      cumulative: sum(budgetUsed),
      chart: { name: shortDrawLabel(draw), Equity: sum((row) => row.equityFunded), Loan: sum((row) => row.loanFunded), Retainage: sum((row) => row.retainageHeld) },
      invoiceCount: invoices.length,
      invoiceTotal,
    };
  }), [data.draws, data.invoices]);

  const invoiceLines = useMemo(() => Array.from(new Set(data.invoices.map((invoice) => invoice.budgetLine))).sort(), [data.invoices]);
  const filteredInvoices = useMemo(() => {
    const search = vendorSearch.trim().toLowerCase();
    return data.invoices.filter((invoice) =>
      (selectedDraw === 'ALL' || invoice.drawSequence === selectedDraw) &&
      (invoiceLine === 'ALL' || invoice.budgetLine === invoiceLine) &&
      (!search || invoice.vendor.toLowerCase().includes(search) || String(invoice.invoiceNumber || '').toLowerCase().includes(search)));
  }, [data.invoices, selectedDraw, invoiceLine, vendorSearch]);
  const filteredInvoiceTotal = filteredInvoices.reduce((total, invoice) => total + invoice.debtAmount + invoice.equityAmount, 0);
  const selectedDrawRow = selectedDraw === 'ALL' ? null : drawRows.find((row) => row.draw.sequence === selectedDraw) || null;
  const drawLabel = (sequence: number) => data.draws.find((draw) => draw.sequence === sequence)?.label || `Draw ${sequence}`;

  const usesByClass = useMemo(() => COST_CLASS_ORDER.map((costClass) => ({
    costClass,
    amount: data.budgetLines.filter((line) => line.costClass === costClass).reduce((total, line) => total + line.revisedBudget, 0),
  })).filter((row) => Math.abs(row.amount) >= 0.5), [data.budgetLines]);
  const usesTotal = usesByClass.reduce((total, row) => total + row.amount, 0);
  const budgetAsOf = data.budgetLines[0]?.asOfSequence;

  const stages = useMemo(() => Array.from(new Map(data.fundingSources.map((source) => [source.effectiveSequence, source.stage])).entries()).sort((a, b) => a[0] - b[0]), [data.fundingSources]);
  const sourceNames = useMemo(() => {
    const order = new Map<string, number>();
    data.fundingSources.forEach((source) => { if (!order.has(source.sourceName)) order.set(source.sourceName, order.size); });
    return [...order.keys()];
  }, [data.fundingSources]);
  const stackAmount = (sequence: number, sourceName: string) => data.fundingSources.find((source) => source.effectiveSequence === sequence && source.sourceName === sourceName)?.amount;
  const stackChart = stages.map(([sequence, stage]) => ({ name: stage, ...Object.fromEntries(sourceNames.map((name) => [name, stackAmount(sequence, name) || 0])) }));

  const assets = useMemo(() => data.fixedAssets.map((asset) => ({ id: asset.id, cost: asset.cost, inServiceDate: asset.inServiceDate, usefulLifeYears: asset.assetClass === 'land' ? null : asset.usefulLifeYears })), [data.fixedAssets]);
  const lastDrawDate = [...data.draws].reverse().find((draw) => draw.drawDate)?.drawDate || '';
  const effectiveAssumedDate = assumedInService || lastDrawDate;
  const scheduleAssets = useMemo(() => data.fixedAssets.filter((asset) => asset.assetClass !== 'land').map((asset) => ({
    asset,
    assumed: !asset.inServiceDate,
    depreciable: { id: asset.id, cost: asset.cost, inServiceDate: asset.inServiceDate || effectiveAssumedDate || null, usefulLifeYears: asset.usefulLifeYears },
  })), [data.fixedAssets, effectiveAssumedDate]);
  const years = useMemo(() => depreciationYears(scheduleAssets.map((row) => row.depreciable), asOfDate), [scheduleAssets, asOfDate]);
  const landCost = data.fixedAssets.filter((asset) => asset.assetClass === 'land').reduce((total, asset) => total + asset.cost, 0);
  const assumedCount = scheduleAssets.filter((row) => row.assumed).length;

  const loanSourceNames = new Set(data.fundingSources.filter((source) => !/equity/i.test(source.sourceName)).map((source) => source.sourceName));
  const loanCommitment = stages.length
    ? data.fundingSources.filter((source) => source.effectiveSequence === stages[stages.length - 1][0] && loanSourceNames.has(source.sourceName)).reduce((total, source) => total + source.amount, 0)
    : 0;
  const loanRows = useMemo(() => {
    const funded = data.draws.filter((draw) => Math.abs(draw.loanFunded) >= 0.005);
    return funded.map((draw, index) => {
      const advanced = funded.slice(0, index + 1).reduce((total, row) => total + row.loanFunded, 0);
      const stage = [...stages].reverse().find(([sequence]) => sequence <= draw.sequence)?.[1] || '';
      return { draw, advanced, stage, year: draw.drawDate ? Number(draw.drawDate.slice(0, 4)) : 0 };
    });
  }, [data.draws, stages]);
  const loanAdvanced = loanRows.length ? loanRows[loanRows.length - 1].advanced : 0;
  const loanYears = useMemo(() => {
    const byYear = new Map<number, number>();
    loanRows.forEach((row) => byYear.set(row.year, (byYear.get(row.year) || 0) + row.draw.loanFunded));
    return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, advances], index, all) => ({
      year,
      advances,
      draws: loanRows.filter((row) => row.year === year).length,
      balance: all.slice(0, index + 1).reduce((total, [, amount]) => total + amount, 0),
    }));
  }, [loanRows]);
  const registerCost = data.fixedAssets.reduce((total, asset) => total + asset.cost, 0);
  const excludedCost = data.budgetLines.filter((line) => ['loan', 'expense'].includes(line.costClass)).reduce((total, line) => total + line.revisedBudget, 0);
  const registerVariance = registerCost + excludedCost - usesTotal;
  const missingInService = data.fixedAssets.filter((asset) => asset.assetClass !== 'land' && !asset.inServiceDate).length;

  const quickBooksYearEnds = useMemo(() => yearEndPeriods(quickBooksLines), [quickBooksLines]);
  const quickBooksLatest = [...quickBooksYearEnds.values()].at(-1) || null;
  const quickBooksDepreciation = useMemo(() => activityByYear(quickBooksLines, isDepreciationExpense), [quickBooksLines]);
  const loanComparisonRows = useMemo(() => {
    const interest = activityByYear(quickBooksLines, isInterestExpense);
    const amortization = activityByYear(quickBooksLines, isAmortizationExpense);
    const drawYears = new Map(loanYears.map((row) => [row.year, row]));
    const allYears = [...new Set([...drawYears.keys(), ...quickBooksYearEnds.keys()])].filter(Boolean).sort((a, b) => a - b);
    let drawBalance = 0;
    return allYears.map((year) => {
      const draws = drawYears.get(year);
      if (draws) drawBalance = draws.balance;
      const yearEnd = quickBooksYearEnds.get(year);
      const quickBooksBalance = yearEnd ? balanceAt(quickBooksLines, yearEnd, isConstructionLoan) : null;
      return {
        year,
        draws: draws?.draws || 0,
        advances: draws?.advances || 0,
        balance: drawBalance,
        quickBooksBalance,
        quickBooksAsOf: yearEnd || null,
        interest: interest.has(year) ? interest.get(year)! : null,
        amortization: amortization.has(year) ? amortization.get(year)! : null,
      };
    });
  }, [loanYears, quickBooksLines, quickBooksYearEnds]);
  const fixedAssetComparison = useMemo(() => {
    if (!quickBooksLatest) return null;
    const registerClass = (assetClass: string): FixedAssetClass => (assetClass === 'ffe' ? 'equipment' : assetClass as FixedAssetClass);
    const classes: FixedAssetClass[] = ['land', 'land_improvements', 'building', 'equipment', 'construction_in_progress', 'accumulated_depreciation'];
    const registerAccumulated = assets.reduce((total, asset) => total + accumulatedDepreciation(asset, quickBooksLatest), 0);
    const quickBooksFixed = quickBooksLines.filter((line) => line.reportType === 'BALANCE' && line.periodEnd === quickBooksLatest && accountTypeIs(line, 'fixedasset') && Math.abs(line.amount) >= 0.5);
    const rows = classes.map((assetClass) => ({
      assetClass,
      register: assetClass === 'accumulated_depreciation'
        ? -registerAccumulated
        : data.fixedAssets.filter((asset) => registerClass(asset.assetClass) === assetClass).reduce((total, asset) => total + asset.cost, 0),
      quickBooks: quickBooksFixed.filter((line) => classifyFixedAssetAccount(line.accountName) === assetClass).reduce((total, line) => total + line.amount, 0),
    })).filter((row) => Math.abs(row.register) >= 0.5 || Math.abs(row.quickBooks) >= 0.5);
    const unclassified = quickBooksFixed.filter((line) => !classifyFixedAssetAccount(line.accountName));
    return { asOf: quickBooksLatest, rows, unclassified };
  }, [quickBooksLatest, quickBooksLines, assets, data.fixedAssets]);

  const saveAsset = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    setAssetMessage('');
    try {
      const response = await fetch('/api/operations/real-estate/construction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          kind: 'fixed-asset',
          id: id === 'new' ? undefined : id,
          name: draft.name,
          assetClass: draft.assetClass,
          cost: Number(draft.cost),
          inServiceDate: draft.inServiceDate || null,
          usefulLifeYears: draft.assetClass === 'land' || !draft.usefulLifeYears ? null : Number(draft.usefulLifeYears),
          basis: data.fixedAssets.find((asset) => asset.id === id)?.basis || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save the asset.');
      setAssetMessage('Asset saved.');
      setReloadKey((current) => current + 1);
    } catch (err: any) {
      setAssetMessage(err.message);
    } finally {
      setSavingId(null);
    }
  };
  const deleteAsset = async (id: string) => {
    if (id === 'new') {
      setDrafts((current) => { const next = { ...current }; delete next.new; return next; });
      return;
    }
    if (!window.confirm('Delete this asset from the register?')) return;
    setSavingId(id);
    try {
      const response = await fetch('/api/operations/real-estate/construction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId, kind: 'fixed-asset-delete', id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to delete the asset.');
      setReloadKey((current) => current + 1);
    } catch (err: any) {
      setAssetMessage(err.message);
    } finally {
      setSavingId(null);
    }
  };
  const setDraft = (id: string, patch: Partial<AssetDraft>) => setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  if (loading) return <div style={{ padding: 24, color: '#64748b' }}>Loading construction and fixed assets…</div>;
  if (error) return <div style={{ margin: 24, ...card, color: '#b91c1c' }}>{error}</div>;

  const header = <div><h2 style={{ margin: 0, color: '#0f172a' }}>Construction &amp; Fixed Assets</h2><p style={{ color: '#64748b', marginBottom: 0 }}>Lender draws, project sources and uses, and the fixed asset register with book depreciation.</p></div>;
  if (!views.length) return <div style={{ padding: 24, display: 'grid', gap: 16 }}>{header}</div>;
  if (!data.draws.length && !data.fixedAssets.length) {
    return <div style={{ padding: 24, display: 'grid', gap: 16 }}>{header}<div style={{ ...card, color: '#64748b' }}>No construction draws have been loaded for this company.</div></div>;
  }

  const editableIds = [...data.fixedAssets.map((asset) => asset.id), ...(drafts.new ? ['new'] : [])];

  return <div style={{ padding: 24, display: 'grid', gap: 16 }}>
    {header}
    <div className="ops-print-hide" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '2px solid #e2e8f0' }}>
      {views.map(([key, text]) => <button key={key} type="button" onClick={() => setView(key)} style={{
        padding: '12px 18px',
        background: 'none',
        color: activeView === key ? '#2751d0' : '#64748b',
        border: 'none',
        borderBottom: activeView === key ? '3px solid #2751d0' : '3px solid transparent',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}>{text}</button>)}
    </div>
    {(activeView === 'draws' || activeView === 'fixed-assets' || activeView === 'depreciation') && <div style={{ ...card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
      {activeView === 'draws' && <>
        <label style={label}>Draw<select value={String(selectedDraw)} onChange={(event) => setSelectedDraw(event.target.value === 'ALL' ? 'ALL' : Number(event.target.value))} style={input}><option value="ALL">All</option>{data.draws.map((draw) => <option key={draw.sequence} value={draw.sequence}>{draw.label}</option>)}</select></label>
        <label style={label}>Budget Line<select value={invoiceLine} onChange={(event) => setInvoiceLine(event.target.value)} style={input}><option value="ALL">All</option>{invoiceLines.map((line) => <option key={line} value={line}>{line}</option>)}</select></label>
        <label style={label}>Vendor<input value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} placeholder="Vendor or invoice #" style={input} /></label>
      </>}
      {activeView === 'fixed-assets' && <div style={{ fontSize: 12, color: '#64748b', paddingBottom: 8 }}>Depreciation as of {formatDate(asOfDate)} · straight-line from the month placed in service</div>}
      {activeView === 'depreciation' && <>
        {assumedCount > 0 && <label style={label}>Assumed In-Service Date<input type="date" value={effectiveAssumedDate} onChange={(event) => setAssumedInService(event.target.value)} style={input} /></label>}
        <div style={{ fontSize: 12, color: '#64748b', paddingBottom: 8 }}>Straight-line from the month placed in service · full calendar years</div>
      </>}
    </div>}

    {activeView === 'draws' && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
        {[['Project Cost', fmt(totals.budgetUsed)], ['Member Equity', fmt(totals.equity)], ['Loan Funded', fmt(totals.loan)], ['Retainage Held', fmt(totals.retainageHeld)], ['Liquidated Damages Withheld', fmt(totals.ldWithheld)], ['Liquidated Damages Released', fmt(totals.ldReleased)]].map(([title, value]) => <div key={title} style={card}><div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{title}</div><div style={{ marginTop: 4, fontSize: 22, fontWeight: 800 }}>{value}</div></div>)}
      </div>
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Cumulative funding by draw</h3>
        <div style={{ height: 280 }}><ResponsiveContainer><AreaChart data={drawRows.map((row) => row.chart)}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" interval={1} fontSize={11} /><YAxis tickFormatter={millions} /><Tooltip formatter={(value: number) => fmt(value)} /><Legend /><Area type="monotone" dataKey="Equity" stackId="1" stroke="#0f766e" fill="#99f6e4" /><Area type="monotone" dataKey="Loan" stackId="1" stroke="#1e3a8a" fill="#bfdbfe" /><Area type="monotone" dataKey="Retainage" stackId="1" stroke="#b45309" fill="#fde68a" /></AreaChart></ResponsiveContainer></div>
        <div style={{ fontSize: 12, color: '#64748b' }}>Source: signed Virginia Housing Owner&apos;s Applications for Disbursement. Budget used = equity + loan + retainage held.</div>
      </div>
      <span style={{ fontSize: 12, color: '#64748b' }}>Click a draw to see its invoices.</span>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
          <thead><tr>{sortableHeader('draws', 'draw', 'Draw')}{sortableHeader('draws', 'date', 'Date')}{sortableHeader('draws', 'equity', 'Equity', 'right')}{sortableHeader('draws', 'loan', 'Loan', 'right')}{sortableHeader('draws', 'retainage', 'Retainage', 'right')}{sortableHeader('draws', 'ld', 'Liquidated Damages', 'right')}{sortableHeader('draws', 'used', 'Budget Used', 'right')}{sortableHeader('draws', 'cumulative', 'Cumulative', 'right')}{sortableHeader('draws', 'invoices', 'Invoices', 'right')}{sortableHeader('draws', 'notes', 'Notes')}</tr></thead>
          <tbody>
            {sortRows('draws', drawRows, (row, key) => ({
              draw: row.draw.sequence, date: row.draw.drawDate || '', equity: row.draw.equityFunded, loan: row.draw.loanFunded, retainage: row.draw.retainageHeld,
              ld: row.draw.liquidatedDamages, used: budgetUsed(row.draw), cumulative: row.cumulative, invoices: row.invoiceTotal, notes: row.draw.notes || '',
            } as Record<string, unknown>)[key]).slice(0, expanded.draws ? undefined : 12).map(({ draw, cumulative, invoiceCount, invoiceTotal }) => {
              const isSelected = selectedDraw === draw.sequence;
              return <tr key={draw.sequence} style={{ background: isSelected ? '#dbeafe' : undefined }}>
                <td style={td}><button type="button" title="Show invoices" onClick={() => setSelectedDraw(isSelected ? 'ALL' : draw.sequence)} style={{ border: 0, padding: 0, background: 'transparent', color: '#1e3a8a', font: 'inherit', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>{draw.label}</button></td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDate(draw.drawDate)}</td>
                <td style={num}>{draw.equityFunded ? fmt(draw.equityFunded) : ''}</td>
                <td style={num}>{draw.loanFunded ? fmt(draw.loanFunded) : ''}</td>
                <td style={num}>{draw.retainageHeld ? fmt(draw.retainageHeld) : ''}</td>
                <td style={num}>{draw.liquidatedDamages ? fmt(draw.liquidatedDamages) : ''}</td>
                <td style={{ ...num, fontWeight: 700 }}>{fmt(budgetUsed(draw))}</td>
                <td style={num}>{fmt(cumulative)}</td>
                <td style={num}>{invoiceCount ? `${invoiceCount} · ${fmt(invoiceTotal)}` : ''}</td>
                <td style={{ ...td, color: '#64748b', fontSize: 12, minWidth: 220 }}>{draw.notes || ''}</td>
              </tr>;
            })}
            <tr style={totalRow}><td style={td}>Total</td><td style={td} /><td style={num}>{fmt(totals.equity)}</td><td style={num}>{fmt(totals.loan)}</td><td style={num}>{fmt(totals.retainageHeld)}</td><td style={num}>{fmt(totals.ldWithheld - totals.ldReleased)}</td><td style={num}>{fmt(totals.budgetUsed)}</td><td style={td} /><td style={num}>{fmt(data.invoices.reduce((total, invoice) => total + invoice.debtAmount + invoice.equityAmount, 0))}</td><td style={td} /></tr>
          </tbody>
        </table></div>
        {toggle('draws', drawRows.length)}
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px 0' }}>
          <h3 style={{ margin: 0 }}>Invoices{selectedDrawRow ? ` · ${selectedDrawRow.draw.label}` : ''}</h3>
          <p style={{ color: '#64748b', margin: '6px 0 12px', fontSize: 13 }}>
            {filteredInvoices.length} invoices · {fmtCents(filteredInvoiceTotal)}.
            {selectedDrawRow && ` Signed draw cash funded ${fmtCents(selectedDrawRow.draw.equityFunded + selectedDrawRow.draw.loanFunded)}; difference ${fmtCents(filteredInvoiceTotal - selectedDrawRow.draw.equityFunded - selectedDrawRow.draw.loanFunded)}.`}
            {' '}Invoice detail comes from each draw&apos;s workbook coversheet, which can be a draft of the signed application.
          </p>
        </div>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
          <thead><tr>{sortableHeader('invoices', 'draw', 'Draw')}{sortableHeader('invoices', 'line', 'Budget Line')}{sortableHeader('invoices', 'vendor', 'Vendor')}{sortableHeader('invoices', 'date', 'Invoice Date')}{sortableHeader('invoices', 'number', 'Invoice #')}{sortableHeader('invoices', 'loan', 'Loan', 'right')}{sortableHeader('invoices', 'equity', 'Equity', 'right')}{sortableHeader('invoices', 'total', 'Total', 'right')}</tr></thead>
          <tbody>{sortRows('invoices', filteredInvoices, (invoice, key) => ({
            draw: invoice.drawSequence, line: invoice.budgetLine, vendor: invoice.vendor, date: invoice.invoiceDate || '', number: invoice.invoiceNumber || '',
            loan: invoice.debtAmount, equity: invoice.equityAmount, total: invoice.debtAmount + invoice.equityAmount,
          } as Record<string, unknown>)[key]).slice(0, expanded.invoices ? undefined : 12).map((invoice) => <tr key={invoice.id}>
            <td style={{ ...td, whiteSpace: 'nowrap' }}>{drawLabel(invoice.drawSequence)}</td>
            <td style={td}>{invoice.budgetLine}</td>
            <td style={{ ...td, fontWeight: 700 }}>{invoice.vendor}</td>
            <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDate(invoice.invoiceDate)}</td>
            <td style={td}>{invoice.invoiceNumber || ''}</td>
            <td style={num}>{invoice.debtAmount ? fmtCents(invoice.debtAmount) : ''}</td>
            <td style={num}>{invoice.equityAmount ? fmtCents(invoice.equityAmount) : ''}</td>
            <td style={{ ...num, fontWeight: 700 }}>{fmtCents(invoice.debtAmount + invoice.equityAmount)}</td>
          </tr>)}
          {filteredInvoices.length > 0 && <tr style={totalRow}><td style={td}>Total</td><td style={td} /><td style={td} /><td style={td} /><td style={td} /><td style={num}>{fmtCents(filteredInvoices.reduce((total, invoice) => total + invoice.debtAmount, 0))}</td><td style={num}>{fmtCents(filteredInvoices.reduce((total, invoice) => total + invoice.equityAmount, 0))}</td><td style={num}>{fmtCents(filteredInvoiceTotal)}</td></tr>}
          </tbody>
        </table></div>
        {toggle('invoices', filteredInvoices.length)}
        {!filteredInvoices.length && <div style={{ padding: 18, color: '#64748b' }}>No invoices match these filters.</div>}
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px 0' }}><h3 style={{ margin: 0 }}>Cost by budget line</h3><p style={{ color: '#64748b', margin: '6px 0 12px', fontSize: 13 }}>Lender&apos;s revised budget and amount remaining after Draw {budgetAsOf}. The remainder was funded by the later draws.</p></div>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead><tr>{sortableHeader('budget', 'number', '#')}{sortableHeader('budget', 'name', 'Budget Line')}{sortableHeader('budget', 'class', 'GAAP Class')}{sortableHeader('budget', 'revised', 'Revised Budget', 'right')}{sortableHeader('budget', 'spent', `Spent Through Draw ${budgetAsOf}`, 'right')}{sortableHeader('budget', 'remaining', `Remaining After Draw ${budgetAsOf}`, 'right')}</tr></thead>
          <tbody>
            {sortRows('budget', data.budgetLines, (line, key) => ({
              number: line.lineNumber, name: line.name, class: COST_CLASS_LABEL[line.costClass] || line.costClass, revised: line.revisedBudget,
              spent: line.revisedBudget - line.remainingAfter, remaining: line.remainingAfter,
            } as Record<string, unknown>)[key]).slice(0, expanded.budget ? undefined : 12).map((line) => <tr key={line.lineNumber}>
              <td style={td}>{line.lineNumber}</td>
              <td style={{ ...td, fontWeight: 700 }}>{line.name}</td>
              <td style={td}>{COST_CLASS_LABEL[line.costClass] || line.costClass}</td>
              <td style={num}>{fmt(line.revisedBudget)}</td>
              <td style={num}>{fmt(line.revisedBudget - line.remainingAfter)}</td>
              <td style={num}>{line.remainingAfter ? fmt(line.remainingAfter) : ''}</td>
            </tr>)}
            <tr style={totalRow}><td style={td} /><td style={td}>Total</td><td style={td} /><td style={num}>{fmt(usesTotal)}</td><td style={num}>{fmt(usesTotal - data.budgetLines.reduce((total, line) => total + line.remainingAfter, 0))}</td><td style={num}>{fmt(data.budgetLines.reduce((total, line) => total + line.remainingAfter, 0))}</td></tr>
          </tbody>
        </table></div>
        {toggle('budget', data.budgetLines.length)}
      </div>
    </>}

    {activeView === 'sources-uses' && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(420px,1fr))', gap: 16, alignItems: 'start' }}>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px 0' }}><h3 style={{ margin: '0 0 12px' }}>Uses of funds</h3></div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{sortableHeader('uses', 'use', 'Use')}{sortableHeader('uses', 'amount', 'Amount', 'right')}{sortableHeader('uses', 'share', 'Share', 'right')}</tr></thead>
            <tbody>
              {sortRows('uses', usesByClass, (row, key) => key === 'use' ? COST_CLASS_LABEL[row.costClass] || row.costClass : row.amount).map((row) => <tr key={row.costClass}><td style={{ ...td, fontWeight: 700 }}>{COST_CLASS_LABEL[row.costClass] || row.costClass}</td><td style={num}>{fmt(row.amount)}</td><td style={num}>{usesTotal ? `${((row.amount / usesTotal) * 100).toFixed(1)}%` : ''}</td></tr>)}
              <tr style={totalRow}><td style={td}>Total project cost</td><td style={num}>{fmt(usesTotal)}</td><td style={num}>100.0%</td></tr>
            </tbody>
          </table>
        </div>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px 0' }}><h3 style={{ margin: '0 0 12px' }}>Sources of funds{stages.length ? ` · ${stages[stages.length - 1][1]}` : ''}</h3></div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{sortableHeader('sources', 'source', 'Source')}{sortableHeader('sources', 'amount', 'Amount', 'right')}{sortableHeader('sources', 'share', 'Share', 'right')}</tr></thead>
            <tbody>
              {stages.length ? (() => {
                const [lastSequence] = stages[stages.length - 1];
                const rows = data.fundingSources.filter((source) => source.effectiveSequence === lastSequence);
                const total = rows.reduce((sum, row) => sum + row.amount, 0);
                return <>{sortRows('sources', rows, (row, key) => key === 'source' ? row.sourceName : row.amount).map((row) => <tr key={row.sourceName}><td style={{ ...td, fontWeight: 700 }}>{row.sourceName}</td><td style={num}>{fmt(row.amount)}</td><td style={num}>{total ? `${((row.amount / total) * 100).toFixed(1)}%` : ''}</td></tr>)}<tr style={totalRow}><td style={td}>Total sources</td><td style={num}>{fmt(total)}</td><td style={num}>100.0%</td></tr></>;
              })() : <tr><td style={{ ...td, color: '#64748b' }} colSpan={3}>No funding sources loaded.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {stages.length > 0 && <div style={card}>
        <h3 style={{ marginTop: 0 }}>Capital stack by stage</h3>
        <div style={{ height: 300 }}><ResponsiveContainer><BarChart data={stackChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={11} /><YAxis tickFormatter={millions} /><Tooltip formatter={(value: number) => fmt(value)} /><Legend />{sourceNames.map((name, index) => <Bar key={name} dataKey={name} stackId="stack" fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</BarChart></ResponsiveContainer></div>
        <div style={{ overflowX: 'auto', marginTop: 12 }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead><tr>{sortableHeader('stack', 'source', 'Source')}{stages.map(([sequence, stage]) => sortableHeader('stack', String(sequence), stage, 'right'))}</tr></thead>
          <tbody>
            {sortRows('stack', sourceNames, (name, key) => key === 'source' ? name : stackAmount(Number(key), name) ?? 0).map((name) => <tr key={name}><td style={{ ...td, fontWeight: 700 }}>{name}</td>{stages.map(([sequence]) => { const amount = stackAmount(sequence, name); return <td key={sequence} style={num}>{amount === undefined ? '' : fmt(amount)}</td>; })}</tr>)}
            <tr style={totalRow}><td style={td}>Total</td>{stages.map(([sequence]) => <td key={sequence} style={num}>{fmt(data.fundingSources.filter((source) => source.effectiveSequence === sequence).reduce((sum, source) => sum + source.amount, 0))}</td>)}</tr>
          </tbody>
        </table></div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Source: funding summary on the signed draw applications at each restructuring.</div>
      </div>}

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Retainage and liquidated damages</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', maxWidth: 720 }}>
          <tbody>
            <tr><td style={td}>Retainage held from the contractor</td><td style={num}>{fmt(totals.retainageHeld)}</td></tr>
            <tr><td style={td}>Liquidated damages withheld</td><td style={num}>{fmt(totals.ldWithheld)}</td></tr>
            <tr><td style={td}>Liquidated damages released in the final draw</td><td style={num}>{fmt(-totals.ldReleased)}</td></tr>
            <tr style={totalRow}><td style={td}>Liquidated damages apparently retained by the owner</td><td style={num}>{fmt(totals.ldWithheld - totals.ldReleased)}</td></tr>
          </tbody>
        </table>
        <p style={{ color: '#64748b', marginBottom: 0, fontSize: 13 }}>Retainage is cost incurred and a liability until released. Any liquidated damages the owner keeps reduce the building&apos;s cost basis; confirm the amount against the contractor settlement.</p>
      </div>
    </>}

    {activeView === 'fixed-assets' && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        {[['Register Cost', fmt(registerCost)], ['Annual Depreciation', fmt(data.fixedAssets.reduce((total, asset) => total + (asset.assetClass === 'land' ? 0 : annualRunRate({ id: asset.id, cost: asset.cost, inServiceDate: asset.inServiceDate, usefulLifeYears: asset.usefulLifeYears })), 0))], ['Accumulated Depreciation', fmt(assets.reduce((total, asset) => total + accumulatedDepreciation(asset, asOfDate), 0))], ['Net Book Value', fmt(registerCost - assets.reduce((total, asset) => total + accumulatedDepreciation(asset, asOfDate), 0))]].map(([title, value]) => <div key={title} style={card}><div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{title}</div><div style={{ marginTop: 4, fontSize: 22, fontWeight: 800 }}>{value}</div></div>)}
      </div>
      {missingInService > 0 && <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>{missingInService} asset{missingInService === 1 ? ' needs' : 's need'} an in-service date before depreciation can start. Use the certificate of occupancy date for each building.</div>}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Fixed asset register</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {assetMessage && <span style={{ fontSize: 12, color: assetMessage === 'Asset saved.' ? '#166534' : '#b91c1c' }}>{assetMessage}</span>}
            <button type="button" style={secondaryButton} disabled={Boolean(drafts.new)} onClick={() => setDrafts((current) => ({ ...current, new: { name: '', assetClass: 'building', cost: '0', inServiceDate: '', usefulLifeYears: '40' } }))}>Add Asset</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 12 }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1220 }}>
          <thead><tr>{sortableHeader('register', 'name', 'Asset')}{sortableHeader('register', 'class', 'Class')}{sortableHeader('register', 'cost', 'Cost', 'right')}{sortableHeader('register', 'inService', 'In-Service Date')}{sortableHeader('register', 'life', 'Life (Years)')}{sortableHeader('register', 'annual', 'Annual Depreciation', 'right')}{sortableHeader('register', 'accumulated', 'Accumulated', 'right')}{sortableHeader('register', 'nbv', 'Net Book Value', 'right')}<th style={th} /></tr></thead>
          <tbody>
            {[...sortRows('register', editableIds.filter((id) => id !== 'new'), (id, key) => {
              const asset = data.fixedAssets.find((item) => item.id === id)!;
              const depreciable = { id, cost: asset.cost, inServiceDate: asset.inServiceDate, usefulLifeYears: asset.assetClass === 'land' ? null : asset.usefulLifeYears };
              return ({
                name: asset.name, class: ASSET_CLASS_LABEL[asset.assetClass] || asset.assetClass, cost: asset.cost, inService: asset.inServiceDate || '', life: depreciable.usefulLifeYears ?? 0,
                annual: annualRunRate(depreciable), accumulated: accumulatedDepreciation(depreciable, asOfDate), nbv: asset.cost - accumulatedDepreciation(depreciable, asOfDate),
              } as Record<string, unknown>)[key];
            }), ...editableIds.filter((id) => id === 'new')].map((id) => {
              const draft = drafts[id];
              if (!draft) return null;
              const saved = data.fixedAssets.find((asset) => asset.id === id);
              const depreciable = { id, cost: saved?.cost || 0, inServiceDate: saved?.inServiceDate || null, usefulLifeYears: saved && saved.assetClass !== 'land' ? saved.usefulLifeYears : null };
              const accumulated = accumulatedDepreciation(depreciable, asOfDate);
              const dirty = !saved || JSON.stringify(draftFor(saved)) !== JSON.stringify(draft);
              return <tr key={id} style={{ verticalAlign: 'top' }}>
                <td style={{ ...td, minWidth: 240 }}><input value={draft.name} onChange={(event) => setDraft(id, { name: event.target.value })} style={cellInput} />{saved?.basis && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{saved.basis}</div>}</td>
                <td style={td}><select value={draft.assetClass} onChange={(event) => setDraft(id, { assetClass: event.target.value })} style={cellInput}>{Object.entries(ASSET_CLASS_LABEL).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></td>
                <td style={{ ...td, minWidth: 140 }}><input type="number" step="0.01" value={draft.cost} onChange={(event) => setDraft(id, { cost: event.target.value })} style={{ ...cellInput, textAlign: 'right' }} /></td>
                <td style={td}><input type="date" value={draft.inServiceDate} onChange={(event) => setDraft(id, { inServiceDate: event.target.value })} style={cellInput} /></td>
                <td style={{ ...td, width: 100 }}>{draft.assetClass === 'land' ? <span style={{ color: '#64748b' }}>Not depreciated</span> : <input type="number" step="0.5" min="0.5" value={draft.usefulLifeYears} onChange={(event) => setDraft(id, { usefulLifeYears: event.target.value })} style={{ ...cellInput, textAlign: 'right' }} />}</td>
                <td style={num}>{saved && depreciable.usefulLifeYears ? fmt(annualRunRate(depreciable)) : ''}</td>
                <td style={num}>{saved && isDepreciable(depreciable) ? fmt(accumulated) : ''}</td>
                <td style={num}>{saved ? fmt(saved.cost - accumulated) : ''}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <button type="button" disabled={!dirty || savingId === id} onClick={() => saveAsset(id)} style={{ ...saveButton(!dirty || savingId === id), marginRight: 6 }}>{savingId === id ? 'Saving…' : 'Save'}</button>
                  <button type="button" disabled={savingId === id} onClick={() => deleteAsset(id)} style={{ ...secondaryButton, color: '#b91c1c', borderColor: '#fecaca', background: '#fef2f2' }}>{id === 'new' ? 'Cancel' : 'Delete'}</button>
                </td>
              </tr>;
            })}
            <tr style={totalRow}><td style={td}>Total</td><td style={td} /><td style={num}>{fmt(registerCost)}</td><td style={td} /><td style={td} /><td style={td} /><td style={td} /><td style={td} /><td style={td} /></tr>
          </tbody>
        </table></div>
        {!editableIds.length && <div style={{ padding: 18, color: '#64748b' }}>No assets in the register.</div>}
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Register reconciliation to project cost</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', maxWidth: 720 }}>
          <tbody>
            <tr><td style={td}>Fixed asset register</td><td style={num}>{fmt(registerCost)}</td></tr>
            {usesByClass.filter((row) => ['loan', 'expense'].includes(row.costClass)).map((row) => <tr key={row.costClass}><td style={td}>{COST_CLASS_LABEL[row.costClass]} — not in the register</td><td style={num}>{fmt(row.amount)}</td></tr>)}
            <tr><td style={td}>Total project cost (lender budget)</td><td style={num}>{fmt(usesTotal)}</td></tr>
            <tr style={{ ...totalRow, color: Math.abs(registerVariance) >= 1 ? '#b91c1c' : '#166534' }}><td style={td}>Difference</td><td style={num}>{fmt(registerVariance)}</td></tr>
          </tbody>
        </table>
      </div>

      {fixedAssetComparison && <div style={card}>
        <h3 style={{ marginTop: 0 }}>Register compared with QuickBooks</h3>
        <p style={{ color: '#64748b', margin: '0 0 12px', fontSize: 13 }}>Register cost by class against the QuickBooks Desktop fixed-asset accounts at {formatDate(fixedAssetComparison.asOf)}. Accumulated depreciation is the register&apos;s straight-line amount on the same date.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', maxWidth: 860 }}>
          <thead><tr><th style={th}>Class</th><th style={{ ...th, textAlign: 'right' }}>Register</th><th style={{ ...th, textAlign: 'right' }}>QuickBooks</th><th style={{ ...th, textAlign: 'right' }}>Difference</th></tr></thead>
          <tbody>
            {fixedAssetComparison.rows.map((row) => <tr key={row.assetClass}>
              <td style={{ ...td, fontWeight: 700 }}>{FIXED_ASSET_CLASS_LABEL[row.assetClass]}</td>
              <td style={num}>{fmt(row.register)}</td>
              <td style={num}>{fmt(row.quickBooks)}</td>
              <td style={{ ...num, color: Math.abs(row.register - row.quickBooks) >= 1 ? '#b91c1c' : '#166534' }}>{fmt(row.register - row.quickBooks)}</td>
            </tr>)}
            {fixedAssetComparison.unclassified.map((line) => <tr key={line.accountCode}>
              <td style={td}>{line.accountName} <span style={{ color: '#64748b', fontSize: 11 }}>(QuickBooks fixed-asset account outside these classes)</span></td>
              <td style={num} />
              <td style={num}>{fmt(line.amount)}</td>
              <td style={num} />
            </tr>)}
            {(() => {
              const register = fixedAssetComparison.rows.reduce((total, row) => total + row.register, 0);
              const quickBooks = fixedAssetComparison.rows.reduce((total, row) => total + row.quickBooks, 0);
              return <tr style={totalRow}><td style={td}>Net fixed assets</td><td style={num}>{fmt(register)}</td><td style={num}>{fmt(quickBooks)}</td><td style={{ ...num, color: Math.abs(register - quickBooks) >= 1 ? '#b91c1c' : '#166534' }}>{fmt(register - quickBooks)}</td></tr>;
            })()}
          </tbody>
        </table>
        <p style={{ color: '#64748b', margin: '8px 0 0', fontSize: 12 }}>Accounts are classed by name. The Due to/from SLN balance that QuickBooks types as a fixed asset is excluded.</p>
      </div>}

    </>}

    {activeView === 'depreciation' && <>
      {assumedCount > 0 && <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
        {assumedCount} asset{assumedCount === 1 ? ' has' : 's have'} no in-service date in the Fixed Asset Register, so this schedule assumes {formatDate(effectiveAssumedDate)}. It is an estimate until the certificate of occupancy dates are entered in the register.
      </div>}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px 0' }}><h3 style={{ margin: 0 }}>Depreciation schedule by year</h3><p style={{ color: '#64748b', margin: '6px 0 12px', fontSize: 13 }}>Book depreciation by asset for each calendar year. The {asOfDate.slice(0, 4)} column is the full year. Land ({fmt(landCost)}) is not depreciated.</p></div>
        {years.length ? <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 + years.length * 120 }}>
          <thead><tr>{sortableHeader('depreciation', 'name', 'Asset')}{sortableHeader('depreciation', 'inService', 'In-Service Date')}{sortableHeader('depreciation', 'life', 'Life (Years)', 'right')}{sortableHeader('depreciation', 'cost', 'Cost', 'right')}{years.map((year) => sortableHeader('depreciation', String(year), String(year), 'right'))}</tr></thead>
          <tbody>
            {sortRows('depreciation', scheduleAssets, (row, key) => key === 'name' ? row.asset.name
              : key === 'inService' ? row.depreciable.inServiceDate || ''
              : key === 'life' ? row.asset.usefulLifeYears ?? 0
              : key === 'cost' ? row.asset.cost
              : depreciationForYear(row.depreciable, Number(key))).map(({ asset, assumed, depreciable }) => <tr key={asset.id}>
              <td style={{ ...td, fontWeight: 700 }}>{asset.name}</td>
              <td style={{ ...td, whiteSpace: 'nowrap', color: assumed ? '#92400e' : undefined }}>{formatDate(depreciable.inServiceDate)}{assumed ? ' (assumed)' : ''}</td>
              <td style={num}>{asset.usefulLifeYears ?? ''}</td>
              <td style={num}>{fmt(asset.cost)}</td>
              {years.map((year) => <td key={year} style={num}>{isDepreciable(depreciable) ? fmt(depreciationForYear(depreciable, year)) : ''}</td>)}
            </tr>)}
            <tr style={totalRow}><td style={td}>Total depreciation</td><td style={td} /><td style={td} /><td style={num}>{fmt(scheduleAssets.reduce((total, row) => total + row.asset.cost, 0))}</td>{years.map((year) => <td key={year} style={num}>{fmt(scheduleAssets.reduce((total, row) => total + depreciationForYear(row.depreciable, year), 0))}</td>)}</tr>
            <tr><td style={{ ...td, fontWeight: 700 }}>Accumulated at year-end</td><td style={td} /><td style={td} /><td style={td} />{years.map((year) => <td key={year} style={num}>{fmt(scheduleAssets.reduce((total, row) => total + accumulatedDepreciation(row.depreciable, `${year}-12-31`), 0))}</td>)}</tr>
            <tr><td style={{ ...td, fontWeight: 700 }}>Net book value at year-end (incl. land)</td><td style={td} /><td style={td} /><td style={td} />{years.map((year) => <td key={year} style={num}>{fmt(registerCost - scheduleAssets.reduce((total, row) => total + accumulatedDepreciation(row.depreciable, `${year}-12-31`), 0))}</td>)}</tr>
            {quickBooksDepreciation.size > 0 && <>
              <tr><td style={{ ...td, fontWeight: 700 }}>QuickBooks depreciation booked</td><td style={td} /><td style={td} /><td style={td} />{years.map((year) => <td key={year} style={num}>{quickBooksDepreciation.has(year) ? fmt(quickBooksDepreciation.get(year)!) : '—'}</td>)}</tr>
              <tr><td style={{ ...td, fontWeight: 700 }}>Schedule less QuickBooks</td><td style={td} /><td style={td} /><td style={td} />{years.map((year) => {
                if (!quickBooksDepreciation.has(year)) return <td key={year} style={num}>—</td>;
                const difference = scheduleAssets.reduce((total, row) => total + depreciationForYear(row.depreciable, year), 0) - quickBooksDepreciation.get(year)!;
                return <td key={year} style={{ ...num, color: Math.abs(difference) >= 1 ? '#b91c1c' : '#166534' }}>{fmt(difference)}</td>;
              })}</tr>
            </>}
          </tbody>
        </table></div> : <div style={{ padding: '0 18px 18px', color: '#64748b' }}>Add depreciable assets with useful lives in the Fixed Asset Register to build the schedule.</div>}
      </div>
    </>}

    {activeView === 'loan' && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        {[['Lender Commitment', fmt(loanCommitment)], ['Advanced to Date', fmt(loanAdvanced)], ['Not Advanced', fmt(loanCommitment - loanAdvanced)], ['Loan Advances', String(loanRows.length)]].map(([title, value]) => <div key={title} style={card}><div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{title}</div><div style={{ marginTop: 4, fontSize: 22, fontWeight: 800 }}>{value}</div></div>)}
      </div>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px 0' }}><h3 style={{ margin: 0 }}>Principal by year</h3><p style={{ color: '#64748b', margin: '6px 0 12px', fontSize: 13 }}>Principal advanced through the signed draws against the QuickBooks Desktop loan balance, with interest and loan-fee amortization booked in QuickBooks. Draw balances assume no principal repayments.</p></div>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1020 }}>
          <thead><tr>{sortableHeader('loanYears', 'year', 'Year')}{sortableHeader('loanYears', 'draws', 'Advances', 'right')}{sortableHeader('loanYears', 'advances', 'Principal Advanced', 'right')}{sortableHeader('loanYears', 'balance', 'Balance at Year-End (Draws)', 'right')}{sortableHeader('loanYears', 'quickBooksBalance', 'Balance at Year-End (QuickBooks)', 'right')}{sortableHeader('loanYears', 'difference', 'Difference', 'right')}{sortableHeader('loanYears', 'interest', 'Interest Expense (QuickBooks)', 'right')}{sortableHeader('loanYears', 'amortization', 'Loan Fee Amortization (QuickBooks)', 'right')}</tr></thead>
          <tbody>{sortRows('loanYears', loanComparisonRows, (row, key) => key === 'difference' ? (row.quickBooksBalance == null ? 0 : row.balance - row.quickBooksBalance) : (row as Record<string, unknown>)[key] ?? 0).map((row) => {
            const difference = row.quickBooksBalance == null ? null : row.balance - row.quickBooksBalance;
            return <tr key={row.year}>
              <td style={{ ...td, fontWeight: 700 }}>{row.year}{row.quickBooksAsOf && !row.quickBooksAsOf.endsWith('-12-31') && <div style={{ marginTop: 3, color: '#64748b', fontSize: 11, fontWeight: 400 }}>QuickBooks as of {formatDate(row.quickBooksAsOf)}</div>}</td>
              <td style={num}>{row.draws || ''}</td>
              <td style={num}>{row.advances ? fmt(row.advances) : ''}</td>
              <td style={num}>{fmt(row.balance)}</td>
              <td style={num}>{row.quickBooksBalance == null ? '—' : fmt(row.quickBooksBalance)}</td>
              <td style={{ ...num, color: difference == null ? '#64748b' : Math.abs(difference) >= 1 ? '#b91c1c' : '#166534' }}>{difference == null ? '—' : fmt(difference)}</td>
              <td style={num}>{row.interest == null ? '—' : fmt(row.interest)}</td>
              <td style={num}>{row.amortization == null ? '—' : fmt(row.amortization)}</td>
            </tr>;
          })}</tbody>
        </table></div>
      </div>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px 0' }}><h3 style={{ margin: 0 }}>Loan advances by draw</h3><p style={{ color: '#64748b', margin: '6px 0 12px', fontSize: 13 }}>Tranche amounts at each restructuring are in Sources &amp; Uses.</p></div>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead><tr>{sortableHeader('loanDraws', 'draw', 'Draw')}{sortableHeader('loanDraws', 'date', 'Date')}{sortableHeader('loanDraws', 'stage', 'Loan Structure')}{sortableHeader('loanDraws', 'advance', 'Advance', 'right')}{sortableHeader('loanDraws', 'advanced', 'Principal Advanced', 'right')}{sortableHeader('loanDraws', 'remaining', 'Not Yet Advanced', 'right')}</tr></thead>
          <tbody>
            {sortRows('loanDraws', loanRows, (row, key) => ({
              draw: row.draw.sequence, date: row.draw.drawDate || '', stage: row.stage, advance: row.draw.loanFunded, advanced: row.advanced, remaining: loanCommitment - row.advanced,
            } as Record<string, unknown>)[key]).slice(0, expanded.loanDraws ? undefined : 12).map((row) => <tr key={row.draw.sequence}>
              <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{row.draw.label}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDate(row.draw.drawDate)}</td>
              <td style={td}>{row.stage}</td>
              <td style={num}>{fmt(row.draw.loanFunded)}</td>
              <td style={num}>{fmt(row.advanced)}</td>
              <td style={num}>{fmt(loanCommitment - row.advanced)}</td>
            </tr>)}
            <tr style={totalRow}><td style={td}>Total</td><td style={td} /><td style={td} /><td style={num}>{fmt(loanAdvanced)}</td><td style={td} /><td style={td} /></tr>
          </tbody>
        </table></div>
        {toggle('loanDraws', loanRows.length)}
      </div>
      <ReportPlaceholder
        title="Interest and Amortization"
        description="Interest by month (capitalized during construction, expensed after placed in service), principal payments after conversion to the permanent loan, and the debt-issuance cost amortization."
        needs={quickBooksLines.length
          ? ['Loan terms for each tranche: rate, amortization, and maturity (note or loan agreement)', 'Virginia Housing loan statements or the conversion closing statement to split QuickBooks interest between capitalized and expensed']
          : ['Loan terms for each tranche: rate, amortization, and maturity (note or loan agreement)', 'Virginia Housing loan statements or the conversion closing statement', 'Interest paid outside the draws after Draw 29']}
      />
    </>}
  </div>;
}
