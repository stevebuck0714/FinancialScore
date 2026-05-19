'use client';

import React, { useState } from 'react';
import { sum } from '../../utils/financial';

// LineChart Component
export function LineChart({ title, data, valueKey, color, yMax, showTable, compact, formatter, benchmarkValue, showFormulaButton, onFormulaClick, labelFormat, goalLineData, showTrendLine }: { 
  title: string; 
  data: Array<any>;
  valueKey?: string;
  color: string;
  yMax?: number | null;
  showTable?: boolean;
  compact?: boolean;
  formatter?: (val: number) => string;
  benchmarkValue?: number | null;
  showFormulaButton?: boolean;
  onFormulaClick?: () => void;
  labelFormat?: 'monthly' | 'quarterly' | 'semi-annual' | 'm-yy-adaptive';
  goalLineData?: number[];
  showTrendLine?: boolean;
}) {
  const MAX_MONTHS = 36;

  const parseMonthToDate = (monthStr: string): Date | null => {
    if (!monthStr || typeof monthStr !== 'string') return null;
    const trimmed = monthStr.trim();
    if (!trimmed) return null;

    // MM-YYYY
    const mmYYYY = trimmed.match(/^(\d{1,2})-(\d{4})$/);
    if (mmYYYY) {
      const month = Number(mmYYYY[1]);
      const year = Number(mmYYYY[2]);
      if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) return new Date(year, month - 1, 1);
      return null;
    }

    // YYYY-MM
    const yyyyMM = trimmed.match(/^(\d{4})-(\d{1,2})$/);
    if (yyyyMM) {
      const year = Number(yyyyMM[1]);
      const month = Number(yyyyMM[2]);
      if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) return new Date(year, month - 1, 1);
      return null;
    }

    // MM/YYYY
    const mmSlashYYYY = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
    if (mmSlashYYYY) {
      const month = Number(mmSlashYYYY[1]);
      const year = Number(mmSlashYYYY[2]);
      if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) return new Date(year, month - 1, 1);
      return null;
    }

    // ISO-like date (YYYY-MM-DD)
    const isoDate = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoDate) {
      const year = Number(isoDate[1]);
      const month = Number(isoDate[2]);
      if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) return new Date(year, month - 1, 1);
      return null;
    }

    return null;
  };

  const chartData = valueKey
    ? data.map((d, idx) => ({ month: d.month, value: d[valueKey], _idx: idx }))
    : data.map((d, idx) => ({ ...d, _idx: idx }));
  const visibleData = chartData
    .filter((d) => d.month && parseMonthToDate(String(d.month)) !== null && d.value !== null && Number.isFinite(d.value))
    .slice(-MAX_MONTHS)
    .map((d, idx) => ({ ...d, _idx: idx }));
  if (visibleData.length === 0) return null;

  const values = visibleData.map(d => d.value as number);
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = q1 - 3 * iqr;
  const upperBound = q3 + 3 * iqr;
  
  const filteredValues = values.filter(v => v >= lowerBound && v <= upperBound);
  const clippedRatio = values.length > 0 ? 1 - (filteredValues.length / values.length) : 0;
  const useFilteredRange = filteredValues.length > 0 && clippedRatio <= 0.2;
  const rangeValues = useFilteredRange ? filteredValues : values;
  const minValue = Math.min(...rangeValues);
  const maxValue = Math.max(...rangeValues);
  
  let yMaxCalc = yMax || Math.ceil(maxValue * 1.1);
  let yMinCalc = yMax ? 0 : Math.floor(minValue * 0.9);
  let range = yMaxCalc - yMinCalc;

  if (range === 0 || !Number.isFinite(range)) {
    const baseline = Number.isFinite(minValue) ? minValue : 0;
    const pad = Math.max(Math.abs(baseline) * 0.05, 1);
    yMinCalc = baseline - pad;
    yMaxCalc = baseline + pad;
    range = yMaxCalc - yMinCalc;
  }

  const width = compact ? 500 : 1100;
  const height = compact ? 250 : 320;
  const padding = { top: 15, right: 30, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const xDenominator = Math.max(visibleData.length - 1, 1);
  const points = visibleData.map((d) => {
    const x = padding.left + ((d._idx || 0) / xDenominator) * chartWidth;
    const clampedValue = Math.max(yMinCalc, Math.min(yMaxCalc, d.value!));
    const y = padding.top + chartHeight - ((clampedValue - yMinCalc) / range) * chartHeight;
    return { x, y, month: d.month, value: d.value!, isOutOfRange: d.value! < yMinCalc || d.value! > yMaxCalc };
  });
  const dataStartPoint = points.length > 0 ? points[0] : null;

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  const trendPathD = (() => {
    if (!showTrendLine || visibleData.length < 2) return null;
    const n = visibleData.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    for (let i = 0; i < n; i += 1) {
      const y = Number(visibleData[i].value || 0);
      sumX += i;
      sumY += y;
      sumXY += i * y;
      sumX2 += i * i;
    }
    const denom = (n * sumX2) - (sumX * sumX);
    const slope = denom === 0 ? 0 : ((n * sumXY) - (sumX * sumY)) / denom;
    const intercept = (sumY - (slope * sumX)) / n;
    const toY = (value: number) => {
      const clampedValue = Math.max(yMinCalc, Math.min(yMaxCalc, value));
      return padding.top + chartHeight - ((clampedValue - yMinCalc) / range) * chartHeight;
    };
    const startX = padding.left;
    const endX = width - padding.right;
    const startY = toY(intercept);
    const endY = toY((slope * (n - 1)) + intercept);
    return `M ${startX} ${startY} L ${endX} ${endY}`;
  })();

  const formatMonthShort = (monthStr: string): string => {
    const date = parseMonthToDate(monthStr);
    if (!date) return monthStr;
    // UTC bucketing — see lib/date-utils.ts
    const month = date.getUTCMonth() + 1;
    const yy = String(date.getUTCFullYear()).slice(-2);
    return `${month}/${yy}`;
  };

  const getAdaptiveLabelIndices = (): Set<number> => {
    if (points.length === 0) return new Set();

    const maxTicks = compact ? 5 : 7;
    const parsedPoints = points
      .map((pt, idx) => ({ idx, date: parseMonthToDate(pt.month) }))
      .filter((p): p is { idx: number; date: Date } => p.date !== null);

    if (parsedPoints.length === 0) {
      const fallback = new Set<number>([0, points.length - 1]);
      const mid = Math.floor((points.length - 1) / 2);
      fallback.add(mid);
      return fallback;
    }

    const firstDate = parsedPoints[0].date;
    const lastDate = parsedPoints[parsedPoints.length - 1].date;
    const spanMonths =
      (lastDate.getUTCFullYear() - firstDate.getUTCFullYear()) * 12 +
      (lastDate.getUTCMonth() - firstDate.getUTCMonth()) + 1;

    const intervalMonths = spanMonths <= 12 ? 3 : spanMonths <= 24 ? 6 : 12;

    const candidates: number[] = parsedPoints
      .filter(({ date }) => ((date.getUTCMonth() + 1) % intervalMonths) === 0)
      .map(({ idx }) => idx);

    // Always keep the first label for context.
    candidates.push(0);

    // Only keep the final label if it lands on a quarter/half-year boundary.
    const lastParsed = parsedPoints[parsedPoints.length - 1];
    if (lastParsed) {
      const lastMonth = lastParsed.date.getUTCMonth() + 1;
      const isQuarterOrHalfBoundary = lastMonth % 3 === 0;
      if (isQuarterOrHalfBoundary) {
        candidates.push(lastParsed.idx);
      }
    }

    const sorted = [...new Set(candidates)].sort((a, b) => a - b);
    if (sorted.length <= maxTicks) return new Set(sorted);

    const picked = new Set<number>();
    for (let i = 0; i < maxTicks; i++) {
      const pos = Math.round((i * (sorted.length - 1)) / (maxTicks - 1));
      picked.add(sorted[pos]);
    }
    picked.add(0);
    return picked;
  };

  const adaptiveLabelIndices = getAdaptiveLabelIndices();

  return (
    <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: 0 }}>{title}</h3>
        {showFormulaButton && onFormulaClick && (
          <button
            onClick={onFormulaClick}
            style={{
              background: '#ede9fe',
              border: '1px solid #c4b5fd',
              borderRadius: '6px',
              cursor: 'pointer',
              padding: '6px 12px',
              color: '#667eea',
              fontSize: '13px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#ddd6fe';
              e.currentTarget.style.borderColor = '#a78bfa';
              e.currentTarget.style.color = '#4f46e5';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#ede9fe';
              e.currentTarget.style.borderColor = '#c4b5fd';
              e.currentTarget.style.color = '#667eea';
            }}
            title="Click to view formula"
          >
            <span style={{ fontSize: '16px' }}>ℹ️</span> Formula
          </button>
        )}
      </div>
      <svg width={width} height={height} style={{ maxWidth: '100%', marginBottom: '5px' }} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {(() => {
          const gridValues = [];
          const step = range / 4;
          for (let i = 0; i <= 4; i++) {
            gridValues.push(yMinCalc + step * i);
          }
          return gridValues.map((val, idx) => {
            const y = padding.top + chartHeight - ((val - yMinCalc) / range) * chartHeight;
            return (
              <g key={idx}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#94a3b8">
                  {formatter ? formatter(val) : (Math.abs(val) >= 100 ? val.toFixed(0) : val.toFixed(1))}
                </text>
              </g>
            );
          });
        })()}
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />
        {dataStartPoint && dataStartPoint.x > padding.left + 1 && (
          <>
            <line x1={dataStartPoint.x} y1={padding.top} x2={dataStartPoint.x} y2={height - padding.bottom} stroke="#94a3b8" strokeWidth="2" strokeDasharray="4,4" />
            <text x={dataStartPoint.x} y={padding.top - 4} textAnchor="middle" fontSize="10" fill="#64748b" fontWeight="600">Start</text>
          </>
        )}
        <path d={pathD} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {trendPathD && (
          <path d={trendPathD} fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="6,6" />
        )}
        {goalLineData && goalLineData.length === visibleData.length && (() => {
          const goalXDenominator = Math.max(visibleData.length - 1, 1);
          const goalPoints = visibleData.map((d, i) => {
            const x = padding.left + (i / goalXDenominator) * chartWidth;
            const goalValue = goalLineData[i];
            const clampedValue = Math.max(yMinCalc, Math.min(yMaxCalc, goalValue));
            const y = padding.top + chartHeight - ((clampedValue - yMinCalc) / range) * chartHeight;
            return { x, y, value: goalValue };
          });
          const goalPathD = goalPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          return (
            <>
              <path d={goalPathD} fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="5,5" />
              <text 
                x={width - padding.right - 5} 
                y={goalPoints[goalPoints.length - 1].y - 10} 
                fontSize="10" 
                fill="#10b981" 
                fontWeight="600"
                textAnchor="end"
              >
                Goal
              </text>
            </>
          );
        })()}
        {benchmarkValue != null && benchmarkValue >= yMinCalc && benchmarkValue <= yMaxCalc && (
          <>
            <line 
              x1={padding.left} 
              y1={padding.top + chartHeight - ((benchmarkValue - yMinCalc) / range) * chartHeight} 
              x2={width - padding.right} 
              y2={padding.top + chartHeight - ((benchmarkValue - yMinCalc) / range) * chartHeight} 
              stroke="#f59e0b" 
              strokeWidth="2" 
              strokeDasharray="5,5"
            />
            <text 
              x={width - padding.right + 5} 
              y={padding.top + chartHeight - ((benchmarkValue - yMinCalc) / range) * chartHeight + 4} 
              fontSize="10" 
              fill="#f59e0b" 
              fontWeight="600"
            >
              Industry
            </text>
          </>
        )}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="8"
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredPoint(i)}
              onMouseLeave={() => setHoveredPoint(null)}
            />
            <circle cx={p.x} cy={p.y} r="5" fill={p.isOutOfRange ? '#ef4444' : color} stroke="white" strokeWidth="2" pointerEvents="none">
              <title>{`${p.month}: ${formatter ? formatter(p.value) : p.value.toFixed(1)}${p.isOutOfRange ? ' (out of range)' : ''}`}</title>
            </circle>
          </g>
        ))}
        {points.map((p, i) => {
          // Determine label format based on prop (default to semi-annual)
          const format = labelFormat || 'semi-annual';

          if (format === 'm-yy-adaptive') {
            if (!adaptiveLabelIndices.has(i)) return null;
            return (
              <text key={i} x={p.x} y={height - padding.bottom + 20} textAnchor="middle" fontSize="11" fill="#64748b">
                {formatMonthShort(p.month)}
              </text>
            );
          }
          
          if (format === 'quarterly') {
            // Convert month to month/year label (no Q labels) — UTC
            const getQuarterLabel = (monthStr: string) => {
              const parsed = parseMonthToDate(monthStr);
              if (parsed) {
                const year = parsed.getUTCFullYear();
                const month = parsed.getUTCMonth() + 1;
                return `${month}/${year.toString().slice(-2)}`;
              }
              return monthStr;
            };

            // Only show labels for quarter-end months (March, June, September, December)
            // AND skip every other quarter to reduce crowding
            const isQuarterEnd = (monthStr: string) => {
              const parsed = parseMonthToDate(monthStr);
              if (parsed) {
                const month = parsed.getUTCMonth() + 1;
                return month % 3 === 0;
              }
              return false;
            };

            // Show every other quarter (skip one between labels)
            const quarterEndPoints = points.filter((pt, idx) => isQuarterEnd(pt.month));
            const isThisPointShown = isQuarterEnd(p.month) && quarterEndPoints.findIndex(pt => pt.month === p.month) % 2 === 0;

            if (!isThisPointShown) return null;
            return <text key={i} x={p.x} y={height - padding.bottom + 20} textAnchor="middle" fontSize="11" fill="#64748b">{getQuarterLabel(p.month)}</text>;
          } else {
            // Semi-annual format (default) — UTC
            const getSemiAnnualLabel = (monthStr: string) => {
              const parsed = parseMonthToDate(monthStr);
              if (parsed) {
                const year = parsed.getUTCFullYear();
                const month = parsed.getUTCMonth() + 1;
                return `${month}/${year.toString().slice(-2)}`;
              }
              return monthStr;
            };

            const parsed = parseMonthToDate(p.month);
            const month = parsed ? parsed.getUTCMonth() + 1 : 0;
            const isSemiAnnualEnd = month === 6 || month === 12;

            // Only label June/December for clean half-year axis.
            if (!isSemiAnnualEnd) return null;
            return <text key={i} x={p.x} y={height - padding.bottom + 20} textAnchor="middle" fontSize="11" fill="#64748b">{getSemiAnnualLabel(p.month)}</text>;
          }
        })}
      </svg>
      {hoveredPoint !== null && points[hoveredPoint] && (
        <div
          style={{
            position: 'absolute',
            left: points[hoveredPoint].x + 12,
            top: points[hoveredPoint].y - 8,
            background: 'rgba(30, 41, 59, 0.95)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
            zIndex: 10
          }}
        >
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>{points[hoveredPoint].month}</div>
          <div>{formatter ? formatter(points[hoveredPoint].value) : points[hoveredPoint].value.toFixed(1)}</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: benchmarkValue != null ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)', gap: '10px', marginTop: '5px', padding: '3px 12px', background: 'white', borderRadius: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>CURRENT:</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: color }}>{formatter ? formatter(visibleData[visibleData.length - 1].value!) : visibleData[visibleData.length - 1].value!.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>AVG:</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{formatter ? formatter(sum(values) / values.length) : (sum(values) / values.length).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>MIN:</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#64748b' }}>{formatter ? formatter(Math.min(...values)) : Math.min(...values).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>MAX:</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#64748b' }}>{formatter ? formatter(Math.max(...values)) : Math.max(...values).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
        </div>
        {benchmarkValue != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: '600' }}>INDUSTRY:</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#f59e0b' }}>{formatter ? formatter(benchmarkValue) : benchmarkValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          </div>
        )}
      </div>
      
      {showTable && (
        <div style={{ marginTop: '16px', overflowX: 'auto', maxWidth: '580px' }}>
          <table style={{ width: 'max-content', fontSize: '10px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <td style={{ padding: '6px 8px', fontWeight: '700', color: '#1e293b', position: 'sticky', left: 0, background: '#f1f5f9', zIndex: 1, minWidth: '60px' }}>
                  Quarter
                </td>
                {visibleData.map((d, i) => {
                  // Only show quarterly data (every 3rd month) — UTC
                  const date = parseMonthToDate(String(d.month));
                  if (date) {
                    const month = date.getUTCMonth() + 1;
                    if (month % 3 !== 0) return null;
                  }
                  return (
                    <td key={i} style={{ padding: '6px 4px', textAlign: 'center', fontWeight: '600', color: '#64748b', minWidth: '60px' }}>
                      {d.month}
                    </td>
                  );
                })}
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '6px 8px', fontWeight: '700', color: '#1e293b', position: 'sticky', left: 0, background: 'white', zIndex: 1, minWidth: '60px' }}>
                  Value
                </td>
                {visibleData.map((d, i) => {
                  const date = parseMonthToDate(String(d.month));
                  if (date) {
                    const month = date.getUTCMonth() + 1;
                    if (month % 3 !== 0) return null;
                  }
                  return (
                    <td key={i} style={{ padding: '6px 4px', textAlign: 'center', fontWeight: '700', color: '#1e293b', fontSize: '11px' }}>
                      {formatter ? formatter(d.value!) : d.value!.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ProjectionChart Component  
export function ProjectionChart({ title, historicalData, projectedData, valueKey, formatValue, showTable }: {
  title: string;
  historicalData: any[];
  projectedData: { mostLikely: any[]; bestCase: any[]; worstCase: any[] };
  valueKey: string;
  formatValue?: (val: number) => string;
  showTable?: boolean;
}) {
  if (!historicalData || historicalData.length === 0) return null;
  
  // Format month as MM-YYYY
  const formatMonth = (monthValue: any): string => {
    if (!monthValue) return '';
    
    // If already in MM-YYYY format, return as is
    if (typeof monthValue === 'string' && /^\d{2}-\d{4}$/.test(monthValue)) {
      return monthValue;
    }
    
    // If already in MM/YYYY format, convert to MM-YYYY
    if (typeof monthValue === 'string' && /^\d{1,2}\/\d{4}$/.test(monthValue)) {
      const [month, year] = monthValue.split('/');
      return `${month.padStart(2, '0')}-${year}`;
    }
    
    // If it's a projection month like "+1mo", return as is
    if (typeof monthValue === 'string' && monthValue.startsWith('+')) {
      return monthValue;
    }
    
    // Try to parse as date
    const date = monthValue instanceof Date ? monthValue : new Date(monthValue);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      // If it's a string that doesn't match expected formats, return as is
      return String(monthValue);
    }
    
    // UTC bucketing — see lib/date-utils.ts
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();

    return `${month}-${year}`;
  };

  const formatter = formatValue || ((v: number) => v.toFixed(1));
  const hist = historicalData.slice(-12).map(d => ({ month: formatMonth(d.month), value: d[valueKey], type: 'historical' }));
  const mostLikely = projectedData.mostLikely.map(d => ({ month: d.month, value: d[valueKey], type: 'mostLikely' }));
  const bestCase = projectedData.bestCase.map(d => ({ month: d.month, value: d[valueKey], type: 'bestCase' }));
  const worstCase = projectedData.worstCase.map(d => ({ month: d.month, value: d[valueKey], type: 'worstCase' }));
  
  const allData = [...hist, ...mostLikely];
  const allValues = [...hist.map(d => d.value), ...mostLikely.map(d => d.value), ...bestCase.map(d => d.value), ...worstCase.map(d => d.value)];
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const yMin = Math.floor(minValue * 0.9);
  const yMax = Math.ceil(maxValue * 1.1);
  const range = yMax - yMin;
  
  const width = 1100;
  const height = 320;
  const padding = { top: 20, right: 30, bottom: 50, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const toPoint = (d: any, i: number) => {
    const x = padding.left + (i / (allData.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((d.value - yMin) / range) * chartHeight;
    return { x, y, ...d };
  };
  
  const histPoints = hist.map((d, i) => toPoint(d, i));
  const mlPoints = mostLikely.map((d, i) => toPoint(d, hist.length + i));
  const bcPoints = bestCase.map((d, i) => toPoint(d, hist.length + i));
  const wcPoints = worstCase.map((d, i) => toPoint(d, hist.length + i));
  const lastHistPoint = histPoints[histPoints.length - 1];
  
  const histPath = histPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const mlPath = `M ${lastHistPoint.x} ${lastHistPoint.y} ` + mlPoints.map(p => `L ${p.x} ${p.y}`).join(' ');
  const bcPath = `M ${lastHistPoint.x} ${lastHistPoint.y} ` + bcPoints.map(p => `L ${p.x} ${p.y}`).join(' ');
  const wcPath = `M ${lastHistPoint.x} ${lastHistPoint.y} ` + wcPoints.map(p => `L ${p.x} ${p.y}`).join(' ');
  
  const firstHistMonth = hist[0].month;
  const lastHistMonth = hist[hist.length - 1].month;
  const lastProjMonth = mostLikely[mostLikely.length - 1].month;
  
  return (
    <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ marginBottom: '12px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>{title}</h3>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          <span style={{ fontWeight: '600' }}>Historical:</span> {firstHistMonth} to {lastHistMonth} (12 months) 
          <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
          <span style={{ fontWeight: '600' }}>Projected:</span> {hist[hist.length - 1].month} to {lastProjMonth} (12 months)
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <div style={{ flex: '1', minWidth: '600px' }}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', maxWidth: '1100px' }}>
            {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
              const val = yMin + range * pct;
              const y = padding.top + chartHeight - (chartHeight * pct);
              return (
                <g key={idx}>
                  <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                  <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#94a3b8">
                    {formatter(val)}
                  </text>
                </g>
              );
            })}
            <line x1={lastHistPoint.x} y1={padding.top} x2={lastHistPoint.x} y2={height - padding.bottom} stroke="#94a3b8" strokeWidth="2" strokeDasharray="5,5" />
            <text x={lastHistPoint.x} y={padding.top - 5} textAnchor="middle" fontSize="11" fill="#64748b" fontWeight="600">Now</text>
            <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />
            <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />
            <path d={histPath} fill="none" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d={mlPath} fill="none" stroke="#667eea" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d={bcPath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5,5" />
            <path d={wcPath} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5,5" />
            {histPoints.map((p, i) => (
              <circle key={`hist-${i}`} cx={p.x} cy={p.y} r="4" fill="#1e293b" stroke="white" strokeWidth="2">
                <title>Historical {p.month}: {formatter(p.value)}</title>
              </circle>
            ))}
            {mlPoints.map((p, i) => (
              <circle key={`ml-${i}`} cx={p.x} cy={p.y} r="5" fill="#667eea" stroke="white" strokeWidth="2">
                <title>Most Likely {p.month}: {formatter(p.value)}</title>
              </circle>
            ))}
            {allData.map((d, i) => {
              const showLabel = i === 0 || i === hist.length - 1 || i === allData.length - 1 || i % 4 === 0;
              if (!showLabel) return null;
              const p = toPoint(d, i);
              return <text key={i} x={p.x} y={height - padding.bottom + 20} textAnchor="middle" fontSize="10" fill="#64748b">{d.month}</text>;
            })}
          </svg>
        </div>
        
        <div style={{ width: '300px', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{ background: 'white', borderRadius: '8px', padding: '12px', border: '2px solid #1e293b', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', letterSpacing: '0.5px', marginBottom: '2px' }}>CURRENT</div>
            <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '6px' }}>Now</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>
              {formatter(hist[hist.length - 1].value)}
            </div>
          </div>
          <div style={{ background: '#ede9fe', borderRadius: '8px', padding: '12px', border: '2px solid #667eea', boxShadow: '0 2px 4px rgba(102,126,234,0.2)' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#5b21b6', letterSpacing: '0.5px', marginBottom: '2px' }}>MOST LIKELY</div>
            <div style={{ fontSize: '9px', color: '#7c3aed', marginBottom: '6px' }}>{lastProjMonth}</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#667eea' }}>
              {formatter(mostLikely[11].value)}
            </div>
            <div style={{ fontSize: '10px', color: '#5b21b6', marginTop: '2px', fontWeight: '600' }}>
              {((mostLikely[11].value / hist[hist.length - 1].value - 1) * 100) >= 0 ? '+' : ''}
              {((mostLikely[11].value / hist[hist.length - 1].value - 1) * 100).toFixed(2)}%
            </div>
          </div>
          <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '12px', border: '2px solid #10b981', boxShadow: '0 2px 4px rgba(16,185,129,0.2)' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#166534', letterSpacing: '0.5px', marginBottom: '2px' }}>BEST CASE</div>
            <div style={{ fontSize: '9px', color: '#059669', marginBottom: '6px' }}>{lastProjMonth}</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#10b981' }}>
              {formatter(bestCase[11].value)}
            </div>
            <div style={{ fontSize: '10px', color: '#166534', marginTop: '2px', fontWeight: '600' }}>
              {((bestCase[11].value / hist[hist.length - 1].value - 1) * 100) >= 0 ? '+' : ''}
              {((bestCase[11].value / hist[hist.length - 1].value - 1) * 100).toFixed(2)}%
            </div>
          </div>
          <div style={{ background: '#fef2f2', borderRadius: '8px', padding: '12px', border: '2px solid #ef4444', boxShadow: '0 2px 4px rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#991b1b', letterSpacing: '0.5px', marginBottom: '2px' }}>WORST CASE</div>
            <div style={{ fontSize: '9px', color: '#dc2626', marginBottom: '6px' }}>{lastProjMonth}</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#ef4444' }}>
              {formatter(worstCase[11].value)}
            </div>
            <div style={{ fontSize: '10px', color: '#991b1b', marginTop: '2px', fontWeight: '600' }}>
              {((worstCase[11].value / hist[hist.length - 1].value - 1) * 100) >= 0 ? '+' : ''}
              {((worstCase[11].value / hist[hist.length - 1].value - 1) * 100).toFixed(2)}%
            </div>
          </div>
        </div>
      </div>
      
      {showTable !== false && (
        <div style={{ marginTop: '20px', overflowX: 'auto', maxWidth: '100%' }}>
          <table style={{ fontSize: '10px', borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <td style={{ padding: '6px 8px', fontWeight: '700', color: '#1e293b', position: 'sticky', left: 0, background: '#f1f5f9', zIndex: 1, minWidth: '50px' }}>Month</td>
                {hist.map((d, i) => (
                  <td key={`month-hist-${i}`} style={{ padding: '6px 4px', textAlign: 'center', fontWeight: '600', color: '#64748b', background: 'white', minWidth: '60px' }}>
                    {d.month}
                  </td>
                ))}
                {mostLikely.slice(0, 6).map((d, i) => (
                  <td key={`month-proj-${i}`} style={{ padding: '6px 4px', textAlign: 'center', fontWeight: '600', color: '#667eea', background: '#ede9fe', minWidth: '60px' }}>
                    {d.month}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '6px 8px', fontWeight: '700', color: '#1e293b', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1, minWidth: '50px' }}>Value</td>
                {hist.map((d, i) => (
                  <td key={`val-hist-${i}`} style={{ padding: '6px 4px', textAlign: 'center', fontWeight: '700', color: '#1e293b', background: 'white', fontSize: '10px' }}>
                    {formatter(d.value)}
                  </td>
                ))}
                {mostLikely.slice(0, 6).map((d, i) => (
                  <td key={`val-proj-${i}`} style={{ padding: '6px 4px', textAlign: 'center', fontWeight: '700', color: '#667eea', background: '#ede9fe', fontSize: '10px' }}>
                    {formatter(d.value)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

