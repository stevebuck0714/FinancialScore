'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildResidentialRevenueForecast,
  buildResidentialRevenueForecastQuarters,
  DEFAULT_RESIDENTIAL_REVENUE_FORECAST_ASSUMPTIONS,
  type ForecastQuarter,
  type ResidentialRevenueForecastMacroInput,
  type ResidentialRevenueForecastAssumptions,
} from '@/lib/operations/real-estate-forecast';

const QUARTERS: ForecastQuarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

const REVENUE_LINES = [
  { key: 'residentialGci', label: 'Residential GCI', color: '#2563eb' },
  { key: 'mortgageRevenue', label: 'Mortgage Revenue', color: '#0f766e' },
  { key: 'titleRevenue', label: 'Title Revenue', color: '#f97316' },
  { key: 'insuranceRevenue', label: 'Insurance Revenue', color: '#7c3aed' },
  { key: 'totalRevenue', label: 'Total Revenue', color: '#0f172a' },
] as const;

type RevenueLineKey = typeof REVENUE_LINES[number]['key'];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatPct(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function parseCurrencyInput(value: string) {
  return Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0;
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '16px',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: '11px',
  fontWeight: 800,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid #e2e8f0',
  background: '#f8fafc',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '12px',
  color: '#0f172a',
  borderBottom: '1px solid #f1f5f9',
  whiteSpace: 'nowrap',
};

export default function ResidentialRevenueForecast() {
  const [assumptions, setAssumptions] = useState<ResidentialRevenueForecastAssumptions>(DEFAULT_RESIDENTIAL_REVENUE_FORECAST_ASSUMPTIONS);
  const [macroInputs, setMacroInputs] = useState<ResidentialRevenueForecastMacroInput[]>([]);
  const [macroStatus, setMacroStatus] = useState<'loading' | 'loaded' | 'unavailable'>('loading');
  const [visibleLines, setVisibleLines] = useState<Record<RevenueLineKey, boolean>>({
    residentialGci: true,
    mortgageRevenue: true,
    titleRevenue: true,
    insuranceRevenue: true,
    totalRevenue: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadMacroInputs() {
      try {
        const response = await fetch('/api/real-estate-forecast/macro-inputs?periods=12');
        if (!response.ok) throw new Error('FRED macro inputs unavailable');
        const data = await response.json();
        if (!cancelled) {
          setMacroInputs(Array.isArray(data?.projectionInputs) ? data.projectionInputs : []);
          setMacroStatus('loaded');
        }
      } catch {
        if (!cancelled) {
          setMacroInputs([]);
          setMacroStatus('unavailable');
        }
      }
    }

    loadMacroInputs();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => buildResidentialRevenueForecast(assumptions, undefined, { macroProjectionInputs: macroInputs }), [assumptions, macroInputs]);
  const quarterRows = useMemo(() => buildResidentialRevenueForecastQuarters(rows), [rows]);
  const forecastRows = rows.filter((row) => row.periodType === 'Forecast');
  const monthlyOutputRows = [
    ...rows.filter((row) => row.periodType === 'Actual').slice(-12),
    ...forecastRows.slice(0, 12),
  ];
  const next12 = forecastRows.reduce((sum, row) => sum + row.totalRevenue, 0);
  const next12Low = forecastRows.reduce((sum, row) => sum + row.lowRevenue, 0);
  const next12High = forecastRows.reduce((sum, row) => sum + row.highRevenue, 0);
  const next12Gci = forecastRows.reduce((sum, row) => sum + row.residentialGci, 0);
  const next12Mortgage = forecastRows.reduce((sum, row) => sum + row.mortgageRevenue, 0);
  const next12Title = forecastRows.reduce((sum, row) => sum + row.titleRevenue, 0);
  const next12Insurance = forecastRows.reduce((sum, row) => sum + row.insuranceRevenue, 0);
  const firstForecastMonthLabel = forecastRows[0]?.monthLabel || '';
  const chartRows = useMemo(() => rows.map((row) => {
    const chartRow: Record<string, unknown> = { ...row };
    for (const line of REVENUE_LINES) {
      chartRow[`${line.key}Actual`] = row.periodType === 'Actual' ? row[line.key] : null;
      chartRow[`${line.key}Forecast`] = row.periodType === 'Forecast' ? row[line.key] : null;
    }
    return chartRow;
  }), [rows]);

  const updateAssumption = (key: keyof Omit<ResidentialRevenueForecastAssumptions, 'attachRates'>, value: string) => {
    setAssumptions((prev) => ({ ...prev, [key]: Number(value || 0) }));
  };

  const updateQuarter = (
    quarter: ForecastQuarter,
    key: keyof ResidentialRevenueForecastAssumptions['attachRates'][ForecastQuarter],
    value: string
  ) => {
    setAssumptions((prev) => ({
      ...prev,
      attachRates: {
        ...prev.attachRates,
        [quarter]: {
          ...prev.attachRates[quarter],
          [key]: Number(value || 0),
        },
      },
    }));
  };

  const visibleLineItems = REVENUE_LINES.filter((line) => visibleLines[line.key]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 65%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', color: '#0f172a' }}>Residential Revenue Forecast</h2>
            <div style={{ marginTop: '4px', color: '#64748b', fontSize: '12px', fontWeight: 700 }}>
              FRED macro inputs: {macroStatus === 'loaded' ? 'loaded into projection drivers' : macroStatus === 'loading' ? 'loading' : 'unavailable, using scenario assumptions'}
            </div>
            <details style={{ marginTop: '8px', maxWidth: '980px' }}>
              <summary style={{ cursor: 'pointer', color: '#2751d0', fontSize: '13px', fontWeight: 800, listStyle: 'none' }}>
                How this forecast works
              </summary>
              <div style={{ marginTop: '10px', border: '1px solid #bfdbfe', borderRadius: '10px', background: '#fff', padding: '12px', color: '#334155', fontSize: '12px', lineHeight: 1.55 }}>
                <p style={{ margin: '0 0 8px' }}>
                  The model forecasts residential transaction volume using a multivariate time-series framework that combines historical existing and new home sales with lagged macroeconomic drivers from FRED. It uses mortgage affordability, labor market, income, inflation, housing supply, home price, consumer sentiment, and monetary policy inputs with economically appropriate lag structures.
                </p>
                <p style={{ margin: '0 0 8px' }}>
                  Core model inputs include 30-year mortgage rates, 10-year Treasury yields, mortgage spread, unemployment, payroll growth, personal income, hourly earnings, CPI, housing starts, building permits, months supply, home price indexes, Michigan consumer sentiment, and the federal funds rate. For the projection window, the model uses forward-looking FRED expectation and market-implied inputs where available, including 1-year expected inflation, 10-year breakeven inflation, and 5-year/5-year forward inflation expectations. Derived features include mortgage payment index, house-price-to-income ratio, real wage growth, yield curve, rolling changes, monthly seasonality, and lagged home sales.
                </p>
                <p style={{ margin: 0 }}>
                  The resulting home-sales forecast is converted into revenue by applying projected sales volume and GCI percentage for Residential Real Estate, then applying quarterly attach rates and revenue-per-unit assumptions for Mortgage, Title, and Insurance. The forecast output produces monthly and quarterly history, projections, high/low ranges, and revenue by component.
                </p>
              </div>
            </details>
          </div>
          <button
            type="button"
            onClick={() => setAssumptions(DEFAULT_RESIDENTIAL_REVENUE_FORECAST_ASSUMPTIONS)}
            style={{ border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', color: '#334155', padding: '8px 12px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
          >
            Reset Assumptions
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
        {[
          { label: 'Next 12M Total Revenue', value: formatCurrency(next12), detail: `${formatCurrency(next12Low)} low / ${formatCurrency(next12High)} high` },
          { label: 'Residential GCI', value: formatCurrency(next12Gci), detail: `${formatPct(assumptions.gciPct)} projected GCI rate` },
          { label: 'Mortgage Revenue', value: formatCurrency(next12Mortgage), detail: `${formatCurrency(assumptions.revenuePerMortgage)} per mortgage` },
          { label: 'Title Revenue', value: formatCurrency(next12Title), detail: `${formatCurrency(assumptions.revenuePerTitle)} per title closing` },
          { label: 'Insurance Revenue', value: formatCurrency(next12Insurance), detail: `${formatCurrency(assumptions.revenuePerInsurance)} per customer` },
        ].map((card) => (
          <div key={card.label} style={cardStyle}>
            <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.label}</div>
            <div style={{ marginTop: '6px', color: '#0f172a', fontSize: '24px', fontWeight: 900 }}>{card.value}</div>
            <div style={{ marginTop: '4px', color: '#64748b', fontSize: '12px' }}>{card.detail}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(320px, 0.8fr)', gap: '16px', alignItems: 'start' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Revenue History & Projection</h3>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {REVENUE_LINES.map((line) => (
                <label key={line.key} style={{ display: 'flex', gap: '5px', alignItems: 'center', color: '#475569', fontSize: '12px', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={visibleLines[line.key]}
                    onChange={(event) => setVisibleLines((prev) => ({ ...prev, [line.key]: event.target.checked }))}
                  />
                  <span style={{ color: line.color }}>{line.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div style={{ height: 390 }}>
            <ResponsiveContainer>
              <LineChart data={chartRows} margin={{ top: 8, right: 18, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monthLabel" interval={2} tick={{ fontSize: 11 }} orientation="top" />
                <YAxis tickFormatter={(value) => `$${(Number(value) / 1000000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                <Legend />
                {firstForecastMonthLabel && (
                  <ReferenceLine
                    x={firstForecastMonthLabel}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    label={{ value: 'Forecast Start', position: 'insideTopRight', fill: '#64748b', fontSize: 11 }}
                  />
                )}
                {visibleLineItems.flatMap((line) => [
                  <Line
                    key={`${line.key}-actual`}
                    type="monotone"
                    dataKey={`${line.key}Actual`}
                    stroke={line.color}
                    strokeWidth={line.key === 'totalRevenue' ? 3 : 2}
                    dot={false}
                    name={line.label}
                  />,
                  <Line
                    key={`${line.key}-forecast`}
                    type="monotone"
                    dataKey={`${line.key}Forecast`}
                    stroke={line.color}
                    strokeWidth={line.key === 'totalRevenue' ? 3 : 2}
                    strokeDasharray="6 4"
                    dot={false}
                    name={`${line.label} Forecast`}
                    legendType="none"
                  />,
                ])}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 10px', fontSize: '16px', color: '#0f172a' }}>Forecast Assumptions</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', marginBottom: '14px' }}>
            {[
              { key: 'averageSalesPrice', label: 'Avg Sale Price', step: 1000, isCurrency: true },
              { key: 'gciPct', label: 'GCI %', step: 0.01, isCurrency: false },
              { key: 'revenuePerMortgage', label: 'Revenue / Mortgage', step: 100, isCurrency: true },
              { key: 'revenuePerTitle', label: 'Revenue / Title', step: 100, isCurrency: true },
              { key: 'revenuePerInsurance', label: 'Revenue / Insurance', step: 25, isCurrency: true },
            ].map((field) => (
              <label key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: '#475569', fontSize: '12px', fontWeight: 800 }}>
                {field.label}
                <input
                  type={field.isCurrency ? 'text' : 'number'}
                  step={field.step}
                  value={field.isCurrency
                    ? formatCurrency(Number(assumptions[field.key as keyof Omit<ResidentialRevenueForecastAssumptions, 'attachRates'>] || 0))
                    : String(assumptions[field.key as keyof Omit<ResidentialRevenueForecastAssumptions, 'attachRates'>])
                  }
                  onChange={(event) => updateAssumption(
                    field.key as keyof Omit<ResidentialRevenueForecastAssumptions, 'attachRates'>,
                    field.isCurrency ? String(parseCurrencyInput(event.target.value)) : event.target.value
                  )}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 9px', fontSize: '13px', color: '#0f172a' }}
                />
              </label>
            ))}
          </div>
          <div style={{ overflowX: 'visible' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: '62px', whiteSpace: 'normal', lineHeight: 1.15 }}>Projection Quarter</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: '74px', whiteSpace: 'normal', lineHeight: 1.15 }}>Mortgage %</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: '58px', whiteSpace: 'normal', lineHeight: 1.15 }}>Title %</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: '74px', whiteSpace: 'normal', lineHeight: 1.15 }}>Insurance %</th>
                </tr>
              </thead>
              <tbody>
                {QUARTERS.map((quarter) => (
                  <tr key={quarter}>
                    <td style={{ ...tdStyle, fontWeight: 800, whiteSpace: 'normal' }}>{quarter}</td>
                    {(['mortgagePct', 'titlePct', 'insurancePct'] as const).map((key) => (
                      <td key={key} style={{ ...tdStyle, textAlign: 'right', padding: '7px 5px' }}>
                        <input
                          type="number"
                          step="0.1"
                          value={String(assumptions.attachRates[quarter][key])}
                          onChange={(event) => updateQuarter(quarter, key, event.target.value)}
                          style={{ width: '54px', border: '1px solid #cbd5e1', borderRadius: '7px', padding: '6px 5px', fontSize: '12px', textAlign: 'right' }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 10px', fontSize: '16px', color: '#0f172a' }}>Monthly Revenue Output</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Month', 'Type', 'Home Sales', 'Sales Volume', 'Residential GCI', 'Mortgage Rev.', 'Title Rev.', 'Insurance Rev.', 'Total Revenue', 'Low', 'High'].map((label) => (
                  <th key={label} style={{ ...thStyle, textAlign: label === 'Month' || label === 'Type' ? 'left' : 'right' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthlyOutputRows.map((row) => (
                <tr key={row.monthKey} style={{ background: row.periodType === 'Actual' ? '#f8fafc' : '#fff7ed' }}>
                  <td style={{ ...tdStyle, fontWeight: 800 }}>{row.monthLabel}</td>
                  <td style={tdStyle}>{row.periodType}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatNumber(row.totalHomeSales)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.salesVolume)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.residentialGci)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.mortgageRevenue)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.titleRevenue)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.insuranceRevenue)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{formatCurrency(row.totalRevenue)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.lowRevenue)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.highRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 10px', fontSize: '16px', color: '#0f172a' }}>Quarterly Summary</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Quarter', 'Type', 'Home Sales', 'Residential GCI', 'Mortgage', 'Title', 'Insurance', 'Total Revenue', 'Low', 'High'].map((label) => (
                  <th key={label} style={{ ...thStyle, textAlign: label === 'Quarter' || label === 'Type' ? 'left' : 'right' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quarterRows.slice(-8).map((row) => (
                <tr key={row.quarterKey}>
                  <td style={{ ...tdStyle, fontWeight: 800 }}>{row.quarterKey}</td>
                  <td style={tdStyle}>{row.periodType}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatNumber(row.totalHomeSales)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.residentialGci)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.mortgageRevenue)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.titleRevenue)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.insuranceRevenue)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{formatCurrency(row.totalRevenue)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.lowRevenue)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.highRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
