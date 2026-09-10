'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { getFieldDisplayName } from '@/lib/constants/field-display-names';
import { getTargetFieldOptions } from '@/lib/constants/sector-target-fields';
import { formatEstDateTime } from '@/lib/time/eastern';

type HistoryMode = 'months' | 'quarters' | 'years';

type Props = {
  companyId: string;
  industrySectorCategory?: string | null;
  basisMode?: 'cash' | 'accrual';
};

const customerKey = (row: any) => {
  const id = String(row?.customerId || '').trim();
  return id ? `id:${id}` : `name:${String(row?.customerName || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
};

const currency = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const quarterKey = (monthKey: string) => {
  const year = monthKey.slice(0, 4);
  return `${year} Q${Math.floor((Number(monthKey.slice(5, 7)) - 1) / 3) + 1}`;
};

export default function CustomerSalesForecast({ companyId, industrySectorCategory, basisMode = 'accrual' }: Props) {
  const [actuals, setActuals] = useState<any[]>([]);
  const [forecast, setForecast] = useState<any>({});
  const [historyMode, setHistoryMode] = useState<HistoryMode>('months');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/customer-revenue-forecast?companyId=${encodeURIComponent(companyId)}&basisMode=${basisMode}`, { cache: 'no-store' })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (cancelled || !response.ok) return;
        setActuals(Array.isArray(data?.actuals) ? data.actuals : []);
        setForecast(data?.forecast && typeof data.forecast === 'object' ? data.forecast : {});
        setSavedAt(data?.updatedAt ? String(data.updatedAt) : null);
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId, basisMode]);

  const revenueCategories = useMemo(
    () => (getTargetFieldOptions(industrySectorCategory || undefined).revenue || []).map((item: any) => String(item.value)),
    [industrySectorCategory],
  );
  const { customers, years } = useMemo(() => {
    const byCustomer = new Map<string, any>();
    let latestMonth = '';
    for (const row of actuals) {
      const key = customerKey(row);
      const monthKey = String(row?.monthKey || '');
      if (!monthKey) continue;
      latestMonth = monthKey > latestMonth ? monthKey : latestMonth;
      const current = byCustomer.get(key) || {
        key,
        customerId: String(row?.customerId || ''),
        name: String(row?.customerName || 'Unknown Customer'),
        months: {} as Record<string, number>,
      };
      current.months[monthKey] = Number(current.months[monthKey] || 0) + Number(row?.revenue || 0);
      byCustomer.set(key, current);
    }
    const firstYear = Number(latestMonth.slice(0, 4)) || new Date().getUTCFullYear();
    const annualGrowth = forecast?.annualGrowthByCustomer || {};
    const categoryByCustomer = forecast?.categoryByCustomer || {};
    const output = Array.from(byCustomer.values()).map((row) => {
      const months = Object.keys(row.months).sort();
      const baseline = Number(row.months[months[months.length - 1]] || 0);
      const annualGrowthPcts = Array.from({ length: 5 }, (_, index) => Number(annualGrowth?.[row.key]?.[index] || 0));
      const projectedAnnual = annualGrowthPcts.reduce((values: number[], growthPct, index) => {
        const prior = index === 0 ? baseline * 12 : values[index - 1];
        values.push(prior * (1 + growthPct / 100));
        return values;
      }, []);
      return { ...row, baseline, annualGrowthPcts, projectedAnnual, category: String(categoryByCustomer?.[row.key] || '') };
    }).sort((a, b) => b.baseline - a.baseline);
    return { customers: output, years: Array.from({ length: 5 }, (_, index) => firstYear + index) };
  }, [actuals, forecast]);

  const updateGrowth = (key: string, yearIndex: number, raw: string) => {
    const value = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(value)) return;
    setForecast((current: any) => {
      const annualGrowthByCustomer = { ...(current?.annualGrowthByCustomer || {}) };
      const growths = [...(annualGrowthByCustomer[key] || Array(5).fill(0))];
      growths[yearIndex] = value;
      annualGrowthByCustomer[key] = growths;
      return { ...(current || {}), annualGrowthByCustomer };
    });
  };
  const updateCategory = (key: string, category: string) => setForecast((current: any) => ({
    ...(current || {}),
    categoryByCustomer: { ...(current?.categoryByCustomer || {}), [key]: category },
  }));
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/customer-revenue-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, basisMode, forecast }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Save failed');
      setSavedAt(String(data.updatedAt || new Date().toISOString()));
    } catch (error: any) {
      window.alert(error?.message || 'Failed to save customer forecast');
    } finally {
      setSaving(false);
    }
  };

  const totalBaseline = customers.reduce((sum, row) => sum + row.baseline, 0);
  const totalProjected = years.map((_, index) => customers.reduce((sum, row) => sum + Number(row.projectedAnnual[index] || 0), 0));
  const historyValues = (row: any) => {
    const months = Object.keys(row.months).sort().slice(-36);
    if (historyMode === 'months') return months.map((key) => [key, row.months[key]] as const);
    const grouped = new Map<string, number>();
    for (const key of months) {
      const groupedKey = historyMode === 'quarters' ? quarterKey(key) : key.slice(0, 4);
      grouped.set(groupedKey, Number(grouped.get(groupedKey) || 0) + Number(row.months[key] || 0));
    }
    return Array.from(grouped.entries()).slice(historyMode === 'quarters' ? -12 : -3);
  };

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0, color: '#0f172a' }}>Customer Sales Forecast</h3>
          <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>Annual account growth is compounded into the monthly income-statement forecast.</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select value={historyMode} onChange={(event) => setHistoryMode(event.target.value as HistoryMode)} style={{ padding: '7px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
            <option value="months">Last 36 Months</option>
            <option value="quarters">Last 12 Quarters</option>
            <option value="years">Last 3 Years</option>
          </select>
          <button onClick={save} disabled={saving || loading} style={{ border: '1px solid #1d4ed8', background: '#2563eb', color: 'white', borderRadius: '7px', padding: '7px 12px', fontWeight: 700, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save Forecast'}
          </button>
        </div>
      </div>
      {savedAt && <div style={{ marginBottom: '10px', color: '#64748b', fontSize: '11px' }}>Last saved {formatEstDateTime(savedAt)}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ textAlign: 'left', padding: '8px' }}>Customer</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Revenue Category</th>
              <th style={{ textAlign: 'right', padding: '8px' }}>Monthly Baseline</th>
              {years.map((year) => <th key={`growth-${year}`} style={{ textAlign: 'right', padding: '8px' }}>{year} Growth</th>)}
              {years.map((year) => <th key={`projected-${year}`} style={{ textAlign: 'right', padding: '8px' }}>{year} Sales</th>)}
            </tr>
          </thead>
          <tbody>
            {customers.map((row) => (
              <React.Fragment key={row.key}>
                <tr style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px' }}>
                    <button onClick={() => setExpanded((current) => ({ ...current, [row.key]: !current[row.key] }))} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#1d4ed8', fontWeight: 600 }}>{expanded[row.key] ? '− ' : '+ '}{row.name}</button>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <select value={row.category} onChange={(event) => updateCategory(row.key, event.target.value)} style={{ width: '180px', padding: '5px', border: '1px solid #cbd5e1', borderRadius: '5px' }}>
                      <option value="">Unmapped</option>
                      {revenueCategories.map((key) => <option key={key} value={key}>{getFieldDisplayName(key)}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{currency(row.baseline)}</td>
                  {row.annualGrowthPcts.map((value: number, index: number) => <td key={`${row.key}-growth-${index}`} style={{ padding: '8px', textAlign: 'right' }}><input value={value} onChange={(event) => updateGrowth(row.key, index, event.target.value)} inputMode="decimal" style={{ width: '56px', textAlign: 'right', padding: '4px' }} />%</td>)}
                  {row.projectedAnnual.map((value: number, index: number) => <td key={`${row.key}-projected-${index}`} style={{ padding: '8px', textAlign: 'right' }}>{currency(value)}</td>)}
                </tr>
                {expanded[row.key] && (
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={13} style={{ padding: '10px 16px' }}>
                      <strong>{historyMode === 'months' ? 'Monthly' : historyMode === 'quarters' ? 'Quarterly' : 'Annual'} sales history:</strong>{' '}
                      {historyValues(row).map(([period, revenue]) => `${period} ${currency(Number(revenue))}`).join(' · ')}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            <tr style={{ background: '#eff6ff', borderTop: '2px solid #bfdbfe', fontWeight: 700 }}>
              <td colSpan={2} style={{ padding: '8px' }}>Total</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{currency(totalBaseline)}</td>
              {years.map((_, index) => {
                const prior = index === 0 ? totalBaseline * 12 : totalProjected[index - 1];
                const growth = prior > 0 ? ((totalProjected[index] / prior) - 1) * 100 : 0;
                return <td key={`total-growth-${index}`} style={{ padding: '8px', textAlign: 'right' }}>{growth.toFixed(1)}%</td>;
              })}
              {totalProjected.map((value, index) => <td key={`total-project-${index}`} style={{ padding: '8px', textAlign: 'right' }}>{currency(value)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
