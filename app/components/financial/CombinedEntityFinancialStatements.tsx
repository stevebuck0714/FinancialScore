'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { aggregateMappedAmounts, buildPropertyBookSummary } from '@/lib/real-estate/property-income-statement';
import PropertyIncomeStatementTable from './PropertyIncomeStatementTable';

type Props = { companyId: string; companyName: string };
type Period = 'current-month' | 'current-quarter' | 'last-12-months' | 'ytd' | 'last-year' | 'last-3-years';
type Display = 'monthly' | 'quarterly' | 'annual';

const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const selectStyle: React.CSSProperties = { minWidth: 150, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff' };
const labelStyle: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' };

const columnFor = (month: string, display: Display) =>
  display === 'monthly' ? month : display === 'annual' ? month.slice(0, 4) : `${month.slice(0, 4)} Q${Math.ceil(Number(month.slice(5, 7)) / 3)}`;

export default function CombinedEntityFinancialStatements({ companyId, companyName }: Props) {
  const [lines, setLines] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('last-12-months');
  const [display, setDisplay] = useState<Display>('monthly');

  useEffect(() => {
    fetch(`/api/operations/real-estate?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load combined financial statements.');
        setLines(payload.lines || []);
        setMappings(payload.mappings || []);
      })
      .catch((cause) => setError(cause.message));
  }, [companyId]);

  const commonMonths = useMemo(() => {
    const bySource = new Map<string, Set<string>>();
    lines.forEach((line) => {
      const month = String(line.periodEnd).slice(0, 7);
      if (!bySource.has(line.sourceEntity)) bySource.set(line.sourceEntity, new Set());
      bySource.get(line.sourceEntity)!.add(month);
    });
    const sources = [...bySource.values()];
    return sources.length ? [...sources[0]].filter((month) => sources.every((set) => set.has(month))).sort() : [];
  }, [lines]);

  const selectedMonths = useMemo(() => {
    const latest = commonMonths[commonMonths.length - 1] || '';
    if (period === 'current-month') return commonMonths.slice(-1);
    if (period === 'current-quarter') return commonMonths.slice(-3);
    if (period === 'last-12-months') return commonMonths.slice(-12);
    if (period === 'ytd') return commonMonths.filter((month) => month.startsWith(latest.slice(0, 4)));
    if (period === 'last-year') return commonMonths.filter((month) => month.startsWith(String(Number(latest.slice(0, 4)) - 1)));
    return commonMonths.slice(-36);
  }, [commonMonths, period]);

  const columns = useMemo(() => Array.from(new Set(selectedMonths.map((month) => columnFor(month, display)))), [selectedMonths, display]);
  const monthToColumn = useCallback((month: string) => (selectedMonths.includes(month) ? columnFor(month, display) : null), [selectedMonths, display]);

  const kpis = useMemo(() => {
    const mapped = aggregateMappedAmounts(lines, mappings, 'COMBINED', (month) => (selectedMonths.includes(month) ? 'total' : null));
    const rows = buildPropertyBookSummary(['total'], mapped);
    const value = (label: string) => Number(rows.find((row) => row.label === label)?.values.total || 0);
    return { income: value('TOTAL REVENUE'), expenses: value('TOTAL OPERATING EXPENSES'), noi: value('NET OPERATING INCOME'), netIncome: value('NET INCOME BEFORE DEPRECIATION') };
  }, [lines, mappings, selectedMonths]);

  const latestMonth = commonMonths[commonMonths.length - 1];
  const balance = useMemo(() => {
    const grouped = new Map<string, any>();
    lines
      .filter((line) => String(line.reportType).toUpperCase() !== 'ACTIVITY' && String(line.periodEnd).startsWith(latestMonth || '-'))
      .forEach((line) => {
        const key = `${line.accountType}|${line.accountCode}|${line.accountName}`;
        const row = grouped.get(key) || { ...line, amount: 0 };
        row.amount += Number(line.amount || 0);
        grouped.set(key, row);
      });
    return [...grouped.values()];
  }, [lines, latestMonth]);

  if (error) return <div style={{ padding: 32, color: '#b91c1c' }}>{error}</div>;
  if (!lines.length) return <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>No combined BGAH + SLN source data is available yet.</div>;

  const kpiCard = (label: string, value: number, background: string, color: string) => (
    <div style={{ flex: 1, minWidth: 180, padding: 16, borderRadius: 10, background, color }}>
      {label}<br /><strong style={{ fontSize: 18 }}>{money(value)}</strong>
    </div>
  );

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 32, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, color: '#0f172a' }}>Financial Statements</h1>
        <p style={{ color: '#64748b', marginBottom: 0 }}>{companyName} · Combined BGAH + SLN · Only periods reported by both entities are combined.</p>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={labelStyle}>Period
          <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} style={selectStyle}>
            <option value="current-month">Current Month</option>
            <option value="current-quarter">Current Quarter</option>
            <option value="last-12-months">Last 12 months</option>
            <option value="ytd">YTD</option>
            <option value="last-year">Last Year</option>
            <option value="last-3-years">Last 3 Years</option>
          </select>
        </label>
        <label style={labelStyle}>Display As
          <select value={display} onChange={(event) => setDisplay(event.target.value as Display)} style={{ ...selectStyle, minWidth: 120 }}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {kpiCard('Total Revenue', kpis.income, '#eff6ff', '#1e3a8a')}
        {kpiCard('Total Operating Expenses', kpis.expenses, '#f0fdfa', '#0f766e')}
        {kpiCard('Net Operating Income', kpis.noi, '#f8fafc', '#0f172a')}
        {kpiCard('Net Income Before Depreciation', kpis.netIncome, '#f8fafc', '#0f172a')}
      </div>
      <h2 style={{ margin: '8px 0 0', fontSize: 16, color: '#1e3a8a' }}>Combined Income Statement</h2>
      {columns.length
        ? <PropertyIncomeStatementTable lines={lines} mappings={mappings} scope="COMBINED" variant="book" columns={columns} monthToColumn={monthToColumn} />
        : <div style={{ color: '#64748b' }}>No period is reported by both BGAH and SLN.</div>}
      <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <h2 style={{ margin: 0, padding: '14px 16px', fontSize: 16, color: '#1e3a8a', background: '#f8fafc' }}>Combined Balance Sheet · {latestMonth || 'No matched period'}</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ padding: 10, textAlign: 'left', fontSize: 11 }}>ACCOUNT</th><th style={{ padding: 10, textAlign: 'left', fontSize: 11 }}>TYPE</th><th style={{ padding: 10, textAlign: 'right', fontSize: 11 }}>AMOUNT</th></tr></thead>
          <tbody>
            {balance.map((line) => (
              <tr key={`${line.accountType}-${line.accountCode}-${line.accountName}`}>
                <td style={{ padding: 10, borderTop: '1px solid #f1f5f9' }}>{line.accountCode} · {line.accountName}</td>
                <td style={{ padding: 10, borderTop: '1px solid #f1f5f9', color: '#64748b' }}>{line.accountType}</td>
                <td style={{ padding: 10, textAlign: 'right', borderTop: '1px solid #f1f5f9', fontVariantNumeric: 'tabular-nums' }}>{money(Number(line.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p style={{ color: '#64748b', fontSize: 12 }}>Depreciation will come from the depreciation schedule. Detailed line items by entity are in Operations → Entity Financials.</p>
    </div>
  );
}
