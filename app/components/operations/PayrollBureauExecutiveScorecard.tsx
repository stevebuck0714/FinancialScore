'use client';

import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from '@/lib/format/currency';
import { withIsolvedHubReportName } from '@/lib/operations/operational-hub-layout';

type TrendPoint = {
  monthKey: string;
  month: string;
  actual: number;
  budget: number;
  priorYear: number;
};

export type ScorecardKpi = {
  key: string;
  label: string;
  format: 'number' | 'money' | 'percent';
  better: 'higher' | 'lower';
  current: number;
  previous: number;
  budget: number;
  ytd: number;
  ytdBudget: number;
  priorYear: number;
  priorYearYtd: number;
  trend: TrendPoint[];
};

type ScorecardPayload = {
  asOfDate?: string;
  currentMonthLabel?: string;
  previousMonthLabel?: string;
  priorYearMonthLabel?: string;
  note?: string;
  kpis?: ScorecardKpi[];
};

type BureauOpsPayload = {
  monthlyScorecard?: ScorecardPayload;
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '20px',
  minWidth: 0,
};
const cardTitleStyle: React.CSSProperties = {
  margin: '0 0 12px 0',
  fontSize: '13px',
  fontWeight: 700,
  color: '#0f172a',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: '11px',
  fontWeight: 700,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid #e2e8f0',
  background: '#f8fafc',
  whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '13px',
  color: '#0f172a',
  borderBottom: '1px solid #f1f5f9',
};

function formatValue(value: number, format: ScorecardKpi['format']) {
  if (format === 'money') return formatMoney(Number(value || 0), { currency: 'USD' });
  if (format === 'percent') return `${Number(value || 0).toFixed(1)}%`;
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function deltaPct(current: number, baseline: number) {
  if (!baseline) return null;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

function favorable(kpi: ScorecardKpi, current: number, baseline: number) {
  if (current === baseline) return null;
  return kpi.better === 'higher' ? current > baseline : current < baseline;
}

function deltaColor(kpi: ScorecardKpi, current: number, baseline: number) {
  const good = favorable(kpi, current, baseline);
  if (good == null) return '#64748b';
  return good ? '#15803d' : '#b91c1c';
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 128;
  const height = 36;
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth="1.75" />
    </svg>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>{title}</div>
      <div style={{ width: '100%', height: 280 }}>{children}</div>
    </div>
  );
}

function axisMoney(value: number) {
  const abs = Math.abs(Number(value || 0));
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return formatMoney(value, { currency: 'USD' });
}

export default function PayrollBureauExecutiveScorecard({ data }: { data: BureauOpsPayload | null }) {
  const scorecard = data?.monthlyScorecard;
  const kpis = Array.isArray(scorecard?.kpis) ? scorecard.kpis : [];
  const kpiByKey = useMemo(() => new Map(kpis.map((kpi) => [kpi.key, kpi])), [kpis]);

  const comparisonRows = kpis.map((kpi) => {
    const vsPrior = deltaPct(kpi.current, kpi.previous);
    const vsBudget = deltaPct(kpi.current, kpi.budget);
    const vsPriorYear = deltaPct(kpi.current, kpi.priorYear);
    return { ...kpi, vsPrior, vsBudget, vsPriorYear };
  });

  const volumeCompare = ['payrollRuns', 'newClients', 'clientsLost', 'openEscalations'].map((key) => {
    const kpi = kpiByKey.get(key);
    return {
      label: kpi?.label.replace(' payroll', '').replace(' clients', '') || key,
      current: kpi?.current || 0,
      previous: kpi?.previous || 0,
      budget: kpi?.budget || 0,
      priorYear: kpi?.priorYear || 0,
    };
  });
  const moneyCompare = ['grossPayroll', 'fundsHandled'].map((key) => {
    const kpi = kpiByKey.get(key);
    return {
      label: kpi?.label || key,
      current: kpi?.current || 0,
      previous: kpi?.previous || 0,
      budget: kpi?.budget || 0,
      priorYear: kpi?.priorYear || 0,
    };
  });
  const qualityLine = (kpiByKey.get('onTimePct')?.trend || []).map((point, index) => ({
    month: point.month,
    onTime: point.actual,
    firstTimeRight: kpiByKey.get('firstTimeRightPct')?.trend[index]?.actual || 0,
    retention: kpiByKey.get('retentionRate')?.trend[index]?.actual || 0,
    onTimeBudget: point.budget,
  }));
  const exceptionLine = (kpiByKey.get('correctionRate')?.trend || []).map((point, index) => ({
    month: point.month,
    correction: point.actual,
    fundingFail: kpiByKey.get('fundingFailRate')?.trend[index]?.actual || 0,
    taxException: kpiByKey.get('taxExceptionRate')?.trend[index]?.actual || 0,
  }));
  const volumeLine = (kpiByKey.get('payrollRuns')?.trend || []).map((point, index) => ({
    month: point.month,
    payrollRuns: point.actual,
    employeesPaid: kpiByKey.get('employeesPaid')?.trend[index]?.actual || 0,
    activeClients: kpiByKey.get('activeClients')?.trend[index]?.actual || 0,
  }));
  const fundsLine = (kpiByKey.get('grossPayroll')?.trend || []).map((point, index) => ({
    month: point.month,
    gross: point.actual,
    funds: kpiByKey.get('fundsHandled')?.trend[index]?.actual || 0,
    grossBudget: point.budget,
    priorYearGross: point.priorYear,
  }));
  const capacityLine = (kpiByKey.get('avgPayrollsPerProcessor')?.trend || []).map((point, index) => ({
    month: point.month,
    payrolls: point.actual,
    weightedUnits: kpiByKey.get('weightedWorkloadPerProcessor')?.trend[index]?.actual || 0,
    payrollsBudget: point.budget,
  }));
  const bookLine = (kpiByKey.get('newClients')?.trend || []).map((point, index) => ({
    month: point.month,
    implemented: point.actual,
    lost: kpiByKey.get('clientsLost')?.trend[index]?.actual || 0,
    escalations: kpiByKey.get('openEscalations')?.trend[index]?.actual || 0,
  }));

  if (!scorecard || kpis.length === 0) {
    return (
      <div style={{ padding: '24px 32px', color: '#64748b', fontSize: '14px' }}>
        Loading executive operational scorecard…
      </div>
    );
  }

  return (
    <div data-print-ready="overviewBureauExecutiveScorecard" style={{ padding: '24px 32px 8px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={cardStyle}>
        <div style={cardTitleStyle}>{withIsolvedHubReportName('Monthly Management — Executive Operational Scorecard')}</div>
        <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}>
          {scorecard.currentMonthLabel} EST
        </div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>{scorecard.note}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
        {kpis.map((kpi) => {
          const vsPrior = deltaPct(kpi.current, kpi.previous);
          const vsBudget = deltaPct(kpi.current, kpi.budget);
          const color = deltaColor(kpi, kpi.current, kpi.budget);
          return (
            <div key={kpi.key} style={{ ...cardStyle, padding: '14px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>{formatValue(kpi.current, kpi.format)}</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '8px 0', fontSize: '11px' }}>
                <span style={{ color: deltaColor(kpi, kpi.current, kpi.previous) }}>
                  Prior {vsPrior == null ? '—' : `${vsPrior >= 0 ? '+' : ''}${vsPrior.toFixed(1)}%`}
                </span>
                <span style={{ color }}>
                  Budget {vsBudget == null ? '—' : `${vsBudget >= 0 ? '+' : ''}${vsBudget.toFixed(1)}%`}
                </span>
                <span style={{ color: deltaColor(kpi, kpi.current, kpi.priorYear) }}>
                  PY {formatValue(kpi.priorYear, kpi.format)}
                </span>
              </div>
              <Sparkline values={kpi.trend.map((point) => point.actual)} color={color} />
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                YTD {formatValue(kpi.ytd, kpi.format)} · Target {formatValue(kpi.ytdBudget, kpi.format)}
              </div>
            </div>
          );
        })}
      </div>

      <div style={cardStyle}>
        <div style={cardTitleStyle}>KPI comparison</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Metric</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>{scorecard.currentMonthLabel}</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>{scorecard.previousMonthLabel}</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Budget / target</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>YTD</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>{scorecard.priorYearMonthLabel}</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Prior-year YTD</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Vs prior</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Vs budget</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.key}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{row.label}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatValue(row.current, row.format)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatValue(row.previous, row.format)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatValue(row.budget, row.format)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatValue(row.ytd, row.format)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatValue(row.priorYear, row.format)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatValue(row.priorYearYtd, row.format)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: deltaColor(row, row.current, row.previous), fontWeight: 600 }}>
                    {row.vsPrior == null ? '—' : `${row.vsPrior >= 0 ? '+' : ''}${row.vsPrior.toFixed(1)}%`}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: deltaColor(row, row.current, row.budget), fontWeight: 600 }}>
                    {row.vsBudget == null ? '—' : `${row.vsBudget >= 0 ? '+' : ''}${row.vsBudget.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
        <ChartCard title="12-month payroll volume">
          <ResponsiveContainer>
            <LineChart data={volumeLine} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '11px' }} />
              <YAxis yAxisId="left" stroke="#64748b" style={{ fontSize: '11px' }} />
              <YAxis yAxisId="right" orientation="right" stroke="#64748b" style={{ fontSize: '11px' }} />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="payrollRuns" name="Payroll runs" stroke="#2751d0" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="employeesPaid" name="Employees paid" stroke="#0f766e" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="activeClients" name="Active clients" stroke="#7c3aed" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="12-month gross payroll vs funds handled">
          <ResponsiveContainer>
            <LineChart data={fundsLine} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '11px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '11px' }} tickFormatter={axisMoney} />
              <Tooltip formatter={(value: number) => formatMoney(Number(value || 0), { currency: 'USD' })} />
              <Legend />
              <Line type="monotone" dataKey="gross" name="Gross payroll" stroke="#2751d0" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="funds" name="Funds handled" stroke="#0f766e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="grossBudget" name="Gross budget" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="priorYearGross" name="Prior-year gross" stroke="#b45309" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Current vs prior vs budget vs prior year">
          <ResponsiveContainer>
            <BarChart data={volumeCompare} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" stroke="#64748b" style={{ fontSize: '10px' }} interval={0} />
              <YAxis stroke="#64748b" style={{ fontSize: '11px' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="current" name="Current month" fill="#2751d0" />
              <Bar dataKey="previous" name="Prior month" fill="#93c5fd" />
              <Bar dataKey="budget" name="Budget / target" fill="#94a3b8" />
              <Bar dataKey="priorYear" name="Prior year" fill="#b45309" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Funds handled — current vs comparables">
          <ResponsiveContainer>
            <BarChart data={moneyCompare} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" stroke="#64748b" style={{ fontSize: '11px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '11px' }} tickFormatter={axisMoney} />
              <Tooltip formatter={(value: number) => formatMoney(Number(value || 0), { currency: 'USD' })} />
              <Legend />
              <Bar dataKey="current" name="Current month" fill="#2751d0" />
              <Bar dataKey="previous" name="Prior month" fill="#93c5fd" />
              <Bar dataKey="budget" name="Budget / target" fill="#94a3b8" />
              <Bar dataKey="priorYear" name="Prior year" fill="#b45309" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="12-month quality — on-time, first-time-right, retention">
          <ResponsiveContainer>
            <LineChart data={qualityLine} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '11px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '11px' }} domain={[88, 100]} tickFormatter={(value) => `${value}%`} />
              <Tooltip formatter={(value: number) => `${Number(value || 0).toFixed(1)}%`} />
              <Legend />
              <Line type="monotone" dataKey="onTime" name="On-time %" stroke="#2751d0" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="firstTimeRight" name="First-time-right %" stroke="#0f766e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="retention" name="Retention %" stroke="#7c3aed" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="onTimeBudget" name="On-time target" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="12-month exception rates">
          <ResponsiveContainer>
            <LineChart data={exceptionLine} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '11px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '11px' }} tickFormatter={(value) => `${value}%`} />
              <Tooltip formatter={(value: number) => `${Number(value || 0).toFixed(1)}%`} />
              <Legend />
              <Line type="monotone" dataKey="correction" name="Correction / reversal %" stroke="#b91c1c" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="fundingFail" name="Funding-failure %" stroke="#b45309" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="taxException" name="Tax-exception %" stroke="#7c3aed" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="12-month processor workload">
          <ResponsiveContainer>
            <LineChart data={capacityLine} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '11px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '11px' }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="payrolls" name="Payrolls / processor" stroke="#2751d0" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="weightedUnits" name="Weighted units / processor" stroke="#0f766e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="payrollsBudget" name="Payrolls target" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="12-month client movement and escalations">
          <ResponsiveContainer>
            <BarChart data={bookLine} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '11px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '11px' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="implemented" name="New clients implemented" fill="#15803d" />
              <Bar dataKey="lost" name="Clients lost" fill="#b91c1c" />
              <Bar dataKey="escalations" name="Open escalations" fill="#b45309" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
