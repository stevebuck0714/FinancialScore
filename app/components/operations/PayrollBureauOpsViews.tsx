'use client';

import React, { useMemo, useState } from 'react';
import { formatMoney } from '@/lib/format/currency';

type BureauOpsPayload = {
  meta?: { note?: string; asOfDate?: string };
  summary?: {
    activeClients?: number;
    activeEmployees?: number;
    totalRevenue?: number;
    totalProfit?: number;
    avgMarginPct?: number;
    redClients?: number;
    yellowClients?: number;
    greenClients?: number;
  };
  today?: {
    summary?: Record<string, number>;
    runs?: any[];
    needsAttention?: any[];
    processorWorkload?: any[];
  };
  performance?: Record<string, Record<string, number>>;
  clientQuality?: any[];
  workloadForecast?: {
    startDate?: string;
    endDate?: string;
    summary?: Record<string, number | string>;
    days?: any[];
    processorLoad?: any[];
    absences?: any[];
    prerequisites?: any[];
  };
  processors?: any[];
  accountManagers?: any[];
  clients?: any[];
  billingsByType?: any[];
  billingsBySize?: any[];
};

type Props = {
  moduleKey: string;
  data: BureauOpsPayload | null;
  isSectionEnabled: (sectionKey: string) => boolean;
};

type SortDir = 'asc' | 'desc';
type SortState = { key: string; dir: SortDir };

type TableHeader<T> = {
  label: string;
  sortKey: string;
  align?: 'left' | 'right';
  sortValue?: (row: T) => string | number | boolean | null | undefined;
};

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', minWidth: 0 };
const cardTitleStyle: React.CSSProperties = { margin: '0 0 12px 0', fontSize: '13px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', position: 'sticky', top: 0, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', fontSize: '13px', color: '#0f172a', borderBottom: '1px solid #f1f5f9' };

const SIZE_RANK: Record<string, number> = { Small: 1, Mid: 2, Large: 3, Enterprise: 4 };
const HEALTH_RANK: Record<string, number> = { Red: 1, Yellow: 2, Green: 3 };

function money(value: number) {
  return formatMoney(Number(value || 0), { currency: 'USD' });
}

function pct(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function num(value: number) {
  return Number(value || 0).toLocaleString('en-US');
}

function healthColor(band: string) {
  if (band === 'Green') return '#15803d';
  if (band === 'Yellow') return '#b45309';
  return '#b91c1c';
}

function sizeRank(value: unknown) {
  return SIZE_RANK[String(value || '')] || 0;
}

function healthRank(value: unknown) {
  return HEALTH_RANK[String(value || '')] || 0;
}

function cutoffMinutes(value: unknown) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function rawSortValue(row: any, key: string, getter?: (row: any) => string | number | boolean | null | undefined) {
  if (getter) return getter(row);
  return row?.[key];
}

function normalizeSortValue(value: unknown): string | number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const asNumber = Number(value);
  if (typeof value !== 'string' && Number.isFinite(asNumber)) return asNumber;
  return String(value);
}

function compareRows(a: any, b: any, key: string, dir: SortDir, getter?: (row: any) => string | number | boolean | null | undefined) {
  const direction = dir === 'asc' ? 1 : -1;
  const left = normalizeSortValue(rawSortValue(a, key, getter));
  const right = normalizeSortValue(rawSortValue(b, key, getter));
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
  return String(left).localeCompare(String(right), undefined, { sensitivity: 'base', numeric: true }) * direction;
}

function sortArrow(current: SortState | null, key: string) {
  if (current?.key !== key) return ' ↕';
  return current.dir === 'asc' ? ' ▲' : ' ▼';
}

function KpiGrid({ items }: { items: Array<{ label: string; value: string; color?: string }> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
      {items.map((item) => (
        <div key={item.label} style={{ padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{item.label}</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: item.color || '#0f172a' }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function SortableTable<T>({
  headers,
  rows,
  renderRow,
  empty,
  maxHeight = '380px',
  defaultSort,
}: {
  headers: Array<TableHeader<T>>;
  rows: T[];
  renderRow: (row: T) => React.ReactNode;
  empty: boolean;
  maxHeight?: string;
  defaultSort?: SortState;
}) {
  const [sort, setSort] = useState<SortState | null>(defaultSort || null);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const header = headers.find((item) => item.sortKey === sort.key);
    return [...rows].sort((a, b) => compareRows(a, b, sort.key, sort.dir, header?.sortValue));
  }, [headers, rows, sort]);

  return (
    <div style={{ overflowX: 'auto', maxHeight, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header.sortKey}
                style={{ ...thStyle, textAlign: header.align || 'left' }}
                onClick={() =>
                  setSort((current) => (
                    current?.key === header.sortKey
                      ? { key: header.sortKey, dir: current.dir === 'asc' ? 'desc' : 'asc' }
                      : { key: header.sortKey, dir: header.align === 'right' ? 'desc' : 'asc' }
                  ))
                }
                title={`Sort by ${header.label}`}
              >
                {header.label}{sortArrow(sort, header.sortKey)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={headers.length} style={{ ...tdStyle, color: '#64748b' }}>No bureau operations data yet.</td>
            </tr>
          ) : sortedRows.map(renderRow)}
        </tbody>
      </table>
    </div>
  );
}

export default function PayrollBureauOpsViews({ moduleKey, data, isSectionEnabled }: Props) {
  if (!data) {
    return <div style={{ padding: '40px', color: '#64748b', fontSize: '14px' }}>Loading payroll bureau operations…</div>;
  }

  const today = data.today || {};
  const summary = today.summary || {};
  const book = data.summary || {};
  const runs = Array.isArray(today.runs) ? today.runs : [];
  const attention = Array.isArray(today.needsAttention) ? today.needsAttention : [];
  const processorToday = Array.isArray(today.processorWorkload) ? today.processorWorkload : [];
  const processors = Array.isArray(data.processors) ? data.processors : [];
  const accountManagers = Array.isArray(data.accountManagers) ? data.accountManagers : [];
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const byType = Array.isArray(data.billingsByType) ? data.billingsByType : [];
  const bySize = Array.isArray(data.billingsBySize) ? data.billingsBySize : [];
  const performance = data.performance || {};
  const clientQuality = Array.isArray(data.clientQuality) ? data.clientQuality : [];
  const forecast = data.workloadForecast || {};
  const forecastDays = Array.isArray(forecast.days) ? forecast.days : [];
  const forecastLoad = Array.isArray(forecast.processorLoad) ? forecast.processorLoad : [];
  const forecastAbsences = Array.isArray(forecast.absences) ? forecast.absences : [];
  const forecastPrereqs = Array.isArray(forecast.prerequisites) ? forecast.prerequisites : [];
  const forecastSummary = forecast.summary || {};
  const note = String(data.meta?.note || '');
  const qualityCauseCounts = clientQuality.reduce((acc, row) => {
    const cause = String(row.cause || 'Mixed');
    acc[cause] = (acc[cause] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const qualityRed = clientQuality.filter((row) => row.band === 'Red').length;
  const scorecardRows = [
    { label: 'Payrolls Scheduled', key: 'payrollsScheduled', kind: 'number' },
    { label: 'Payrolls Completed', key: 'payrollsCompleted', kind: 'number' },
    { label: 'On-Time %', key: 'onTimePct', kind: 'pct' },
    { label: 'First-Time Right %', key: 'firstTimeRightPct', kind: 'pct' },
    { label: 'Corrections', key: 'corrections', kind: 'number' },
    { label: 'Off-Cycle %', key: 'offCyclePct', kind: 'pct' },
    { label: 'Voids / Reversals', key: 'voids', kind: 'number' },
    { label: 'Employees Paid', key: 'employeesPaid', kind: 'number' },
    { label: 'Gross Processed', key: 'grossProcessed', kind: 'money' },
    { label: 'Avg Payroll Size', key: 'avgPayrollSize', kind: 'money' },
  ].map((row) => ({
    ...row,
    currentWeek: Number(performance.currentWeek?.[row.key] || 0),
    previousWeek: Number(performance.previousWeek?.[row.key] || 0),
    rolling13Weeks: Number(performance.rolling13Weeks?.[row.key] || 0),
    ytd: Number(performance.ytd?.[row.key] || 0),
  }));
  const delayRows = [
    { label: 'Client delays', key: 'clientDelays' },
    { label: 'Internal delays', key: 'internalDelays' },
    { label: 'isolved delays', key: 'isolvedDelays' },
  ].map((row) => ({
    ...row,
    currentWeek: Number(performance.currentWeek?.[row.key] || 0),
    previousWeek: Number(performance.previousWeek?.[row.key] || 0),
    rolling13Weeks: Number(performance.rolling13Weeks?.[row.key] || 0),
    ytd: Number(performance.ytd?.[row.key] || 0),
  }));
  const formatPerf = (value: number, kind?: string) => {
    if (kind === 'pct') return pct(value);
    if (kind === 'money') return money(value);
    return num(value);
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {note ? <div style={{ fontSize: '12px', color: '#64748b' }}>{note}</div> : null}

      {moduleKey === 'todays_operations' && (
        <>
          {isSectionEnabled('bureauTodayKpis') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Today’s Operations</div>
              <KpiGrid
                items={[
                  { label: 'Payrolls Due', value: num(summary.payrollsDueToday), color: '#1d4ed8' },
                  { label: 'Completed', value: `${num(summary.payrollsCompleted)} (${pct(summary.completedPct)})`, color: '#15803d' },
                  { label: 'At Risk', value: num(summary.payrollsAtRisk), color: '#b91c1c' },
                  { label: 'Awaiting Client', value: num(summary.payrollsAwaitingClient), color: '#b45309' },
                  { label: 'Exceptions', value: num(summary.payrollsWithExceptions), color: '#7c3aed' },
                  { label: 'Employees Being Paid', value: num(summary.employeesBeingPaid) },
                  { label: 'Gross Processed', value: money(summary.grossPayrollProcessed), color: '#0f766e' },
                  { label: 'Funding Exposure', value: money(summary.fundingExposure), color: '#b91c1c' },
                  { label: 'Off-Cycle', value: `${num(summary.offCycleCount)} (${pct(summary.offCyclePct)})` },
                  { label: 'Corrections', value: `${num(summary.correctionsCount)} / ${money(summary.correctionsAmount)}` },
                ]}
              />
            </div>
          )}

          {isSectionEnabled('bureauNeedsAttention') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Needs Attention Today</div>
              <SortableTable
                defaultSort={{ key: 'priority', dir: 'asc' }}
                headers={[
                  { label: 'Client', sortKey: 'clientName' },
                  { label: 'Account Manager', sortKey: 'accountManager' },
                  { label: 'Processor', sortKey: 'processor' },
                  { label: 'Issue', sortKey: 'issueType' },
                  { label: 'Status', sortKey: 'status' },
                  { label: 'Owner', sortKey: 'responsibleParty' },
                  { label: 'Hours Left', sortKey: 'hoursUntilDeadline', align: 'right' },
                  { label: 'Employees', sortKey: 'employeeImpact', align: 'right' },
                  { label: 'Payroll Value', sortKey: 'financialImpact', align: 'right' },
                  { label: 'Escalation', sortKey: 'escalationStatus' },
                  { label: 'isolved', sortKey: 'isolvedPayrollId' },
                ]}
                empty={attention.length === 0}
                rows={attention}
                renderRow={(row) => (
                  <tr key={row.id}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.clientName}</td>
                    <td style={tdStyle}>{row.accountManager}</td>
                    <td style={tdStyle}>{row.processor}</td>
                    <td style={tdStyle}>{row.issueType}</td>
                    <td style={tdStyle}>{row.status}</td>
                    <td style={tdStyle}>{row.responsibleParty}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.hoursUntilDeadline)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.employeeImpact)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.financialImpact)}</td>
                    <td style={{ ...tdStyle, color: row.escalationStatus === 'Escalated' ? '#b91c1c' : '#0f172a', fontWeight: 600 }}>{row.escalationStatus}</td>
                    <td style={tdStyle}>
                      <span title="Connect isolved to open this payroll run" style={{ color: '#64748b', fontSize: '12px' }}>Open in isolved</span>
                    </td>
                  </tr>
                )}
              />
            </div>
          )}

          {isSectionEnabled('bureauTodayRuns') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Payrolls Due Today</div>
              <SortableTable
                defaultSort={{ key: 'grossPay', dir: 'desc' }}
                headers={[
                  { label: 'Client', sortKey: 'clientName' },
                  { label: 'Account Manager', sortKey: 'accountManager' },
                  { label: 'Processor', sortKey: 'processor' },
                  { label: 'Type', sortKey: 'payrollType' },
                  { label: 'Cutoff', sortKey: 'cutoff', sortValue: (row) => cutoffMinutes(row.cutoff) },
                  { label: 'Status', sortKey: 'status' },
                  { label: 'Funded', sortKey: 'funded' },
                  { label: 'Employees', sortKey: 'employeeCount', align: 'right' },
                  { label: 'Gross', sortKey: 'grossPay', align: 'right' },
                ]}
                empty={runs.length === 0}
                rows={runs}
                renderRow={(row) => (
                  <tr key={row.id}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.clientName}</td>
                    <td style={tdStyle}>{row.accountManager}</td>
                    <td style={tdStyle}>{row.processor}</td>
                    <td style={tdStyle}>{row.payrollType}</td>
                    <td style={tdStyle}>{row.cutoff} EST</td>
                    <td style={tdStyle}>{row.status}</td>
                    <td style={{ ...tdStyle, color: row.funded ? '#15803d' : '#b91c1c' }}>{row.funded ? 'Yes' : 'No'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.employeeCount)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.grossPay)}</td>
                  </tr>
                )}
              />
            </div>
          )}

          {isSectionEnabled('bureauProcessorWorkloadToday') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Processor Workload Today</div>
              <SortableTable
                defaultSort={{ key: 'payrolls', dir: 'desc' }}
                headers={[
                  { label: 'Processor', sortKey: 'processor' },
                  { label: 'Payrolls', sortKey: 'payrolls', align: 'right' },
                  { label: 'Employees', sortKey: 'employees', align: 'right' },
                  { label: 'Open Issues', sortKey: 'openIssues', align: 'right' },
                ]}
                empty={processorToday.length === 0}
                rows={processorToday}
                renderRow={(row) => (
                  <tr key={row.processor}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.processor}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.payrolls)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.employees)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: row.openIssues > 0 ? '#b91c1c' : '#0f172a' }}>{num(row.openIssues)}</td>
                  </tr>
                )}
              />
            </div>
          )}
        </>
      )}

      {moduleKey === 'payroll_performance' && (
        <>
          {isSectionEnabled('bureauPerfScorecard') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Payroll Performance Scorecard</div>
              <SortableTable
                headers={[
                  { label: 'Metric', sortKey: 'label' },
                  { label: 'This Week', sortKey: 'currentWeek', align: 'right' },
                  { label: 'Prior Week', sortKey: 'previousWeek', align: 'right' },
                  { label: '13 Weeks', sortKey: 'rolling13Weeks', align: 'right' },
                  { label: 'YTD', sortKey: 'ytd', align: 'right' },
                ]}
                empty={!performance.currentWeek}
                rows={scorecardRows}
                renderRow={(row) => (
                  <tr key={row.key}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.label}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatPerf(row.currentWeek, row.kind)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatPerf(row.previousWeek, row.kind)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatPerf(row.rolling13Weeks, row.kind)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatPerf(row.ytd, row.kind)}</td>
                  </tr>
                )}
              />
            </div>
          )}
          {isSectionEnabled('bureauPerfDelaySources') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Delay Sources</div>
              <SortableTable
                headers={[
                  { label: 'Source', sortKey: 'label' },
                  { label: 'This Week', sortKey: 'currentWeek', align: 'right' },
                  { label: 'Prior Week', sortKey: 'previousWeek', align: 'right' },
                  { label: '13 Weeks', sortKey: 'rolling13Weeks', align: 'right' },
                  { label: 'YTD', sortKey: 'ytd', align: 'right' },
                ]}
                empty={!performance.currentWeek}
                rows={delayRows}
                renderRow={(row) => (
                  <tr key={row.key}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.label}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.currentWeek)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.previousWeek)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.rolling13Weeks)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.ytd)}</td>
                  </tr>
                )}
              />
            </div>
          )}
          {isSectionEnabled('bureauClientQualityRanking') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Client Service-Quality Ranking</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                Operational ranking of the {num(clientQuality.length)}-client book. Rank 1 is the most difficult to serve. Cause separates client-driven delays from payroll-company processing problems. This is not the PEPM/profit health score on Client Economics.
              </div>
              <KpiGrid
                items={[
                  { label: 'Clients Ranked', value: num(clientQuality.length), color: '#1d4ed8' },
                  { label: 'Red / Difficult', value: num(qualityRed), color: '#b91c1c' },
                  { label: 'Client-driven', value: num(qualityCauseCounts.Client || 0), color: '#b45309' },
                  { label: 'Payroll company', value: num(qualityCauseCounts['Payroll company'] || 0), color: '#7c3aed' },
                  { label: 'Mixed', value: num(qualityCauseCounts.Mixed || 0) },
                ]}
              />
              <div style={{ height: '12px' }} />
              <SortableTable
                maxHeight="480px"
                defaultSort={{ key: 'difficultyRank', dir: 'asc' }}
                headers={[
                  { label: 'Rank', sortKey: 'difficultyRank', align: 'right' },
                  { label: 'Client', sortKey: 'clientName' },
                  { label: 'Account Manager', sortKey: 'accountManager' },
                  { label: 'Processor', sortKey: 'processor' },
                  { label: 'Employees', sortKey: 'employeeCount', align: 'right' },
                  { label: 'On-Time Submit', sortKey: 'onTimeSubmissionPct', align: 'right' },
                  { label: 'On-Time Approve', sortKey: 'onTimeApprovalPct', align: 'right' },
                  { label: 'Corrections', sortKey: 'correctionFrequency', align: 'right' },
                  { label: 'Off-Cycle', sortKey: 'offCycleFrequency', align: 'right' },
                  { label: 'Funding Failures', sortKey: 'fundingFailures', align: 'right' },
                  { label: 'Support', sortKey: 'supportTickets', align: 'right' },
                  { label: 'Manual %', sortKey: 'manualProcessing', align: 'right' },
                  { label: 'Tax Exceptions', sortKey: 'taxExceptions', align: 'right' },
                  { label: 'Volatility', sortKey: 'payrollVolatility', align: 'right' },
                  { label: 'Health Score', sortKey: 'serviceScore', align: 'right' },
                  { label: 'Band', sortKey: 'band', sortValue: (row) => healthRank(row.band) },
                  { label: 'Cause', sortKey: 'cause' },
                ]}
                empty={clientQuality.length === 0}
                rows={clientQuality}
                renderRow={(row) => (
                  <tr key={row.ein || row.clientName}>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{num(row.difficultyRank)}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.clientName}</td>
                    <td style={tdStyle}>{row.accountManager}</td>
                    <td style={tdStyle}>{row.processor}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.employeeCount)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{pct(row.onTimeSubmissionPct)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{pct(row.onTimeApprovalPct)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{Number(row.correctionFrequency || 0).toFixed(1)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{Number(row.offCycleFrequency || 0).toFixed(1)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: Number(row.fundingFailures) > 2 ? '#b91c1c' : '#0f172a' }}>{num(row.fundingFailures)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.supportTickets)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{pct(row.manualProcessing)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.taxExceptions)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{pct(row.payrollVolatility)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{Number(row.serviceScore || 0).toFixed(1)}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: healthColor(row.band) }}>{row.band}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: row.cause === 'Client' ? '#b45309' : row.cause === 'Payroll company' ? '#7c3aed' : '#0f172a' }}>{row.cause}</td>
                  </tr>
                )}
              />
            </div>
          )}
        </>
      )}

      {moduleKey === 'processor_capacity' && (
        <>
          {isSectionEnabled('bureauProcessorCapacity') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Processor Capacity</div>
              <SortableTable
                defaultSort={{ key: 'weightedUnits', dir: 'desc' }}
                headers={[
                  { label: 'Processor', sortKey: 'processor' },
                  { label: 'Clients', sortKey: 'activeClients', align: 'right' },
                  { label: 'Employees', sortKey: 'employees', align: 'right' },
                  { label: 'Weighted Units', sortKey: 'weightedUnits', align: 'right' },
                  { label: 'Today Payrolls', sortKey: 'payrollsProcessedToday', align: 'right' },
                  { label: 'On-Time %', sortKey: 'onTimeRate', align: 'right' },
                  { label: 'Correction %', sortKey: 'correctionRate', align: 'right' },
                  { label: 'Exceptions', sortKey: 'exceptionVolume', align: 'right' },
                  { label: 'Escalations', sortKey: 'openEscalations', align: 'right' },
                ]}
                empty={processors.length === 0}
                rows={processors}
                renderRow={(row) => (
                  <tr key={row.processor}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.processor}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.activeClients)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.employees)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{Number(row.weightedUnits || 0).toFixed(2)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.payrollsProcessedToday)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{pct(row.onTimeRate)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{pct(row.correctionRate)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.exceptionVolume)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.openEscalations)}</td>
                  </tr>
                )}
              />
            </div>
          )}
          {isSectionEnabled('bureauWorkloadForecast') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Next Two Weeks Workload Forecast</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                {String(forecast.startDate || '')} through {String(forecast.endDate || '')} EST. Payroll calendars, employee counts, and estimated gross/net come from isolved. Processor capacity and known absences come from the payroll company’s staffing system. Mock until live feeds are connected.
              </div>
              <KpiGrid
                items={[
                  { label: 'Processing Days', value: num(Number(forecastSummary.processingDays || 0)), color: '#1d4ed8' },
                  { label: 'Payrolls', value: num(Number(forecastSummary.payrolls || 0)) },
                  { label: 'Employees Expected', value: num(Number(forecastSummary.employees || 0)) },
                  { label: 'Est. Gross', value: money(Number(forecastSummary.estimatedGross || 0)), color: '#0f766e' },
                  { label: 'Est. Net', value: money(Number(forecastSummary.estimatedNet || 0)) },
                  { label: 'Weighted Units', value: Number(forecastSummary.weightedUnits || 0).toFixed(1) },
                  { label: 'Peak Day', value: String(forecastSummary.peakDate || '—'), color: '#b45309' },
                  { label: 'Holiday Compression', value: num(Number(forecastSummary.holidayCompressionDays || 0)), color: '#b91c1c' },
                  { label: 'Staff Absences', value: num(Number(forecastSummary.knownAbsences || 0)) },
                  { label: 'Open Prerequisites', value: num(Number(forecastSummary.unresolvedPrerequisites || 0)), color: '#7c3aed' },
                ]}
              />
              <div style={{ height: '12px' }} />
              <SortableTable
                maxHeight="420px"
                defaultSort={{ key: 'date', dir: 'asc' }}
                headers={[
                  { label: 'Date', sortKey: 'date' },
                  { label: 'Day', sortKey: 'dayOfWeek' },
                  { label: 'Holiday', sortKey: 'holidayName' },
                  { label: 'Payrolls', sortKey: 'payrolls', align: 'right' },
                  { label: 'Employees', sortKey: 'employees', align: 'right' },
                  { label: 'Est. Gross', sortKey: 'estimatedGross', align: 'right' },
                  { label: 'Est. Net', sortKey: 'estimatedNet', align: 'right' },
                  { label: 'Weighted Units', sortKey: 'weightedUnits', align: 'right' },
                  { label: 'Capacity Used', sortKey: 'capacityUsedPct', align: 'right' },
                  { label: 'High Volume', sortKey: 'highVolume' },
                  { label: 'Cutoff Compression', sortKey: 'cutoffCompression' },
                  { label: 'Absences', sortKey: 'staffAbsences' },
                  { label: 'Open Prereqs', sortKey: 'unresolvedPrerequisites', align: 'right' },
                ]}
                empty={forecastDays.length === 0}
                rows={forecastDays}
                renderRow={(row) => {
                  const muted = row.isWeekend || Boolean(row.holidayName);
                  const stress = Boolean(row.highVolume || row.cutoffCompression);
                  const cell = { ...tdStyle, color: muted ? '#94a3b8' : stress ? '#9a3412' : '#0f172a', background: row.highVolume ? '#fff7ed' : row.cutoffCompression ? '#fefce8' : row.holidayName ? '#f8fafc' : undefined };
                  return (
                    <tr key={row.date}>
                      <td style={{ ...cell, fontWeight: 600 }}>{row.date}</td>
                      <td style={cell}>{row.dayOfWeek}</td>
                      <td style={cell}>{row.holidayName || (row.isWeekend ? 'Weekend' : '—')}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{num(row.payrolls)}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{num(row.employees)}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{money(row.estimatedGross)}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{money(row.estimatedNet)}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{Number(row.weightedUnits || 0).toFixed(2)}</td>
                      <td style={{ ...cell, textAlign: 'right', fontWeight: Number(row.capacityUsedPct) >= 85 ? 700 : 400, color: Number(row.capacityUsedPct) >= 100 ? '#b91c1c' : cell.color }}>{row.isProcessingDay ? pct(row.capacityUsedPct) : '—'}</td>
                      <td style={{ ...cell, fontWeight: row.highVolume ? 700 : 400 }}>{row.highVolume ? 'Yes' : '—'}</td>
                      <td style={{ ...cell, fontWeight: row.cutoffCompression ? 700 : 400 }}>{row.cutoffCompression ? 'Yes' : '—'}</td>
                      <td style={cell}>{row.staffAbsences}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>{row.isProcessingDay ? num(row.unresolvedPrerequisites) : '—'}</td>
                    </tr>
                  );
                }}
              />
              {forecastAbsences.length > 0 ? (
                <>
                  <div style={{ ...cardTitleStyle, marginTop: '20px' }}>Known Staff Absences</div>
                  <SortableTable
                    defaultSort={{ key: 'startDate', dir: 'asc' }}
                    headers={[
                      { label: 'Processor', sortKey: 'processor' },
                      { label: 'Start', sortKey: 'startDate' },
                      { label: 'End', sortKey: 'endDate' },
                      { label: 'Reason', sortKey: 'reason' },
                    ]}
                    empty={false}
                    rows={forecastAbsences}
                    renderRow={(row) => (
                      <tr key={`${row.processor}-${row.startDate}`}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{row.processor}</td>
                        <td style={tdStyle}>{row.startDate}</td>
                        <td style={tdStyle}>{row.endDate}</td>
                        <td style={tdStyle}>{row.reason}</td>
                      </tr>
                    )}
                  />
                </>
              ) : null}
              {forecastPrereqs.length > 0 ? (
                <>
                  <div style={{ ...cardTitleStyle, marginTop: '20px' }}>Clients with Unresolved Prerequisites</div>
                  <SortableTable
                    defaultSort={{ key: 'dueDate', dir: 'asc' }}
                    headers={[
                      { label: 'Client', sortKey: 'clientName' },
                      { label: 'Account Manager', sortKey: 'accountManager' },
                      { label: 'Processor', sortKey: 'processor' },
                      { label: 'Missing Item', sortKey: 'missingItem' },
                      { label: 'Due', sortKey: 'dueDate' },
                      { label: 'Impact', sortKey: 'impact' },
                    ]}
                    empty={false}
                    rows={forecastPrereqs}
                    renderRow={(row) => (
                      <tr key={`${row.clientName}-${row.missingItem}`}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{row.clientName}</td>
                        <td style={tdStyle}>{row.accountManager}</td>
                        <td style={tdStyle}>{row.processor}</td>
                        <td style={tdStyle}>{row.missingItem}</td>
                        <td style={tdStyle}>{row.dueDate}</td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: row.impact === 'High' ? '#b91c1c' : row.impact === 'Medium' ? '#b45309' : '#0f172a' }}>{row.impact}</td>
                      </tr>
                    )}
                  />
                </>
              ) : null}
            </div>
          )}
          {isSectionEnabled('bureauProcessorNextWeek') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Processor Load — Next Two Weeks</div>
              <SortableTable
                defaultSort={{ key: 'twoWeekUnits', dir: 'desc' }}
                headers={[
                  { label: 'Processor', sortKey: 'processor' },
                  { label: 'Payrolls', sortKey: 'twoWeekPayrolls', align: 'right' },
                  { label: 'Employees', sortKey: 'twoWeekEmployees', align: 'right' },
                  { label: 'Weighted Units', sortKey: 'twoWeekUnits', align: 'right' },
                  { label: 'Capacity Used', sortKey: 'capacityUsedPct', align: 'right' },
                  { label: 'Absence', sortKey: 'absence' },
                ]}
                empty={forecastLoad.length === 0}
                rows={forecastLoad}
                renderRow={(row) => (
                  <tr key={`${row.processor}-next`}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.processor}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.twoWeekPayrolls)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.twoWeekEmployees)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{Number(row.twoWeekUnits || 0).toFixed(2)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: Number(row.capacityUsedPct) >= 100 ? '#b91c1c' : '#0f172a' }}>{pct(row.capacityUsedPct)}</td>
                    <td style={tdStyle}>{row.absence}</td>
                  </tr>
                )}
              />
            </div>
          )}
        </>
      )}

      {moduleKey === 'client_economics' && (
        <>
          {isSectionEnabled('bureauBillingsByCustomer') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Billings by Customer</div>
              <KpiGrid
                items={[
                  { label: 'Active Clients', value: num(book.activeClients), color: '#1d4ed8' },
                  { label: 'Client Employees', value: num(book.activeEmployees) },
                  { label: 'Annual Fee Revenue', value: money(book.totalRevenue), color: '#0f766e' },
                  { label: 'Profit', value: money(book.totalProfit) },
                  { label: 'Avg Margin', value: pct(book.avgMarginPct) },
                  { label: 'Health', value: `${num(book.greenClients)} / ${num(book.yellowClients)} / ${num(book.redClients)}` },
                ]}
              />
              <div style={{ height: '12px' }} />
              <SortableTable
                maxHeight="420px"
                defaultSort={{ key: 'revenue', dir: 'desc' }}
                headers={[
                  { label: 'Client', sortKey: 'clientName' },
                  { label: 'Account Manager', sortKey: 'accountManager' },
                  { label: 'Processor', sortKey: 'processor' },
                  { label: 'Type', sortKey: 'clientType' },
                  { label: 'Size', sortKey: 'sizeBand', sortValue: (row) => sizeRank(row.sizeBand) },
                  { label: 'Employees', sortKey: 'employeeCount', align: 'right' },
                  { label: 'PEPM', sortKey: 'pepm', align: 'right' },
                  { label: 'Annual Billing', sortKey: 'revenue', align: 'right' },
                  { label: 'Cost to Serve', sortKey: 'costToServe', align: 'right' },
                  { label: 'Profit', sortKey: 'profit', align: 'right' },
                  { label: 'Margin', sortKey: 'marginPct', align: 'right' },
                ]}
                empty={clients.length === 0}
                rows={clients}
                renderRow={(row) => (
                  <tr key={row.ein || row.clientName}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.clientName}</td>
                    <td style={tdStyle}>{row.accountManager}</td>
                    <td style={tdStyle}>{row.processor}</td>
                    <td style={tdStyle}>{row.clientType}</td>
                    <td style={tdStyle}>{row.sizeBand}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.employeeCount)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.pepm)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.revenue)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.costToServe)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.profit)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{pct(row.marginPct)}</td>
                  </tr>
                )}
              />
            </div>
          )}
          {isSectionEnabled('bureauBillingsByType') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Billings by Customer Type</div>
              <SortableTable
                defaultSort={{ key: 'revenue', dir: 'desc' }}
                headers={[
                  { label: 'Type', sortKey: 'label' },
                  { label: 'Clients', sortKey: 'clients', align: 'right' },
                  { label: 'Employees', sortKey: 'employees', align: 'right' },
                  { label: 'Revenue', sortKey: 'revenue', align: 'right' },
                  { label: 'Profit', sortKey: 'profit', align: 'right' },
                  { label: 'Margin', sortKey: 'marginPct', align: 'right' },
                  { label: 'Share', sortKey: 'sharePct', align: 'right' },
                ]}
                empty={byType.length === 0}
                rows={byType}
                renderRow={(row) => (
                  <tr key={row.label}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.label}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.clients)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.employees)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.revenue)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.profit)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{pct(row.marginPct)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{pct(row.sharePct)}</td>
                  </tr>
                )}
              />
            </div>
          )}
          {isSectionEnabled('bureauBillingsBySize') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Billings by Customer Size</div>
              <SortableTable
                defaultSort={{ key: 'revenue', dir: 'desc' }}
                headers={[
                  { label: 'Size', sortKey: 'label', sortValue: (row) => sizeRank(row.label) },
                  { label: 'Clients', sortKey: 'clients', align: 'right' },
                  { label: 'Employees', sortKey: 'employees', align: 'right' },
                  { label: 'Revenue', sortKey: 'revenue', align: 'right' },
                  { label: 'Profit', sortKey: 'profit', align: 'right' },
                  { label: 'Margin', sortKey: 'marginPct', align: 'right' },
                  { label: 'Share', sortKey: 'sharePct', align: 'right' },
                ]}
                empty={bySize.length === 0}
                rows={bySize}
                renderRow={(row) => (
                  <tr key={row.label}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.label}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.clients)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.employees)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.revenue)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.profit)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{pct(row.marginPct)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{pct(row.sharePct)}</td>
                  </tr>
                )}
              />
            </div>
          )}
          {isSectionEnabled('bureauProfitByCustomer') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Profitability by Customer</div>
              <SortableTable
                maxHeight="360px"
                defaultSort={{ key: 'marginPct', dir: 'asc' }}
                headers={[
                  { label: 'Client', sortKey: 'clientName' },
                  { label: 'Account Manager', sortKey: 'accountManager' },
                  { label: 'Segment', sortKey: 'segment' },
                  { label: 'Revenue / Payroll', sortKey: 'revenuePerPayroll', align: 'right' },
                  { label: 'Revenue / Employee', sortKey: 'revenuePerEmployee', align: 'right' },
                  { label: 'Profit', sortKey: 'profit', align: 'right' },
                  { label: 'Margin', sortKey: 'marginPct', align: 'right' },
                  { label: 'Action', sortKey: 'recommendedAction' },
                ]}
                empty={clients.length === 0}
                rows={clients}
                renderRow={(row) => (
                  <tr key={`profit-${row.ein || row.clientName}`}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.clientName}</td>
                    <td style={tdStyle}>{row.accountManager}</td>
                    <td style={tdStyle}>{row.segment}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.revenuePerPayroll)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.revenuePerEmployee)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.profit)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: Number(row.marginPct) < 18 ? '#b91c1c' : '#0f172a' }}>{pct(row.marginPct)}</td>
                    <td style={tdStyle}>{row.recommendedAction}</td>
                  </tr>
                )}
              />
            </div>
          )}
          {isSectionEnabled('bureauClientHealth') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Client Health</div>
              <SortableTable
                maxHeight="360px"
                defaultSort={{ key: 'healthScore', dir: 'asc' }}
                headers={[
                  { label: 'Client', sortKey: 'clientName' },
                  { label: 'Account Manager', sortKey: 'accountManager' },
                  { label: 'Processor', sortKey: 'processor' },
                  { label: 'Score', sortKey: 'healthScore', align: 'right' },
                  { label: 'Band', sortKey: 'healthBand', sortValue: (row) => healthRank(row.healthBand) },
                  { label: 'Weighted Units', sortKey: 'weightedUnits', align: 'right' },
                ]}
                empty={clients.length === 0}
                rows={clients}
                renderRow={(row) => (
                  <tr key={`health-${row.ein || row.clientName}`}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.clientName}</td>
                    <td style={tdStyle}>{row.accountManager}</td>
                    <td style={tdStyle}>{row.processor}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{Number(row.healthScore || 0).toFixed(1)}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: healthColor(row.healthBand) }}>{row.healthBand}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{Number(row.weightedUnits || 0).toFixed(2)}</td>
                  </tr>
                )}
              />
            </div>
          )}
          {isSectionEnabled('bureauAccountManagers') && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Account Managers</div>
              <SortableTable
                defaultSort={{ key: 'revenue', dir: 'desc' }}
                headers={[
                  { label: 'Account Manager', sortKey: 'accountManager' },
                  { label: 'Clients', sortKey: 'clients', align: 'right' },
                  { label: 'Employees', sortKey: 'employees', align: 'right' },
                  { label: 'Revenue', sortKey: 'revenue', align: 'right' },
                  { label: 'Profit', sortKey: 'profit', align: 'right' },
                  { label: 'Margin', sortKey: 'marginPct', align: 'right' },
                  { label: 'Red Clients', sortKey: 'redClients', align: 'right' },
                ]}
                empty={accountManagers.length === 0}
                rows={accountManagers}
                renderRow={(row) => (
                  <tr key={row.accountManager}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.accountManager}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.clients)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(row.employees)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.revenue)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(row.profit)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{pct(row.marginPct)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: row.redClients > 0 ? '#b91c1c' : '#0f172a' }}>{num(row.redClients)}</td>
                  </tr>
                )}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
