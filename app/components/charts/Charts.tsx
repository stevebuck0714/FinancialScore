'use client';

import React from 'react';
import { sum } from '../../utils/financial';

// LineChart Component
export function LineChart({ title, data, valueKey, color, yMax, showTable, compact, formatter, benchmarkValue, showFormulaButton, onFormulaClick, labelFormat, goalLineData }: { 
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
  labelFormat?: 'monthly' | 'quarterly' | 'semi-annual';
  goalLineData?: number[];
}) {
  const chartData = valueKey ? data.map(d => ({ month: d.month, value: d[valueKey] })) : data;
  const validData = chartData.filter(d => d.value !== null && Number.isFinite(d.value));
  if (validData.length === 0) return null;

  const values = validData.map(d => d.value as number);
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = q1 - 3 * iqr;
  const upperBound = q3 + 3 * iqr;
  
  const filteredValues = values.filter(v => v >= lowerBound && v <= upperBound);
  const minValue = filteredValues.length > 0 ? Math.min(...filteredValues) : Math.min(...values);
  const maxValue = filteredValues.length > 0 ? Math.max(...filteredValues) : Math.max(...values);
  
  const yMaxCalc = yMax || Math.ceil(maxValue * 1.1);
  const yMinCalc = yMax ? 0 : Math.floor(minValue * 0.9);
  const range = yMaxCalc - yMinCalc;
  
  if (range === 0 || !Number.isFinite(range)) {
    return (
      <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', marginBottom: '15px' }}>{title}</h3>
        <p style={{ fontSize: '14px', color: '#64748b', textAlign: 'center', padding: '40px 0' }}>
          Unable to display chart - insufficient data variation
        </p>
      </div>
    );
  }

  const width = compact ? 500 : 1100;
  const height = compact ? 250 : 320;
  const padding = { top: 15, right: 30, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = validData.map((d, i) => {
    const x = padding.left + (i / (validData.length - 1)) * chartWidth;
    const clampedValue = Math.max(yMinCalc, Math.min(yMaxCalc, d.value!));
    const y = padding.top + chartHeight - ((clampedValue - yMinCalc) / range) * chartHeight;
    return { x, y, month: d.month, value: d.value!, isOutOfRange: d.value! < yMinCalc || d.value! > yMaxCalc };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: 0 }}>{title}</h3>
        {showFormulaButton && (
          <button
            onClick={onFormulaClick}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px',
              color: '#667eea',
              fontSize: '14px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.color = '#4f46e5'}
            onMouseOut={(e) => e.currentTarget.style.color = '#667eea'}
            title="View formula"
          >
            <span style={{ fontSize: '16px' }}>ℹ️</span> Formula
          </button>
        )}
      </div>
      <svg width={width} height={height} style={{ maxWidth: '100%', marginBottom: '10px' }} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
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
        <path d={pathD} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {goalLineData && goalLineData.length === validData.length && (() => {
          const goalPoints = validData.map((d, i) => {
            const x = padding.left + (i / (validData.length - 1)) * chartWidth;
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
          <circle key={i} cx={p.x} cy={p.y} r="5" fill={p.isOutOfRange ? '#ef4444' : color} stroke="white" strokeWidth="2">
            <title>{`${p.month}: ${formatter ? formatter(p.value) : p.value.toFixed(1)}${p.isOutOfRange ? ' (out of range)' : ''}`}</title>
          </circle>
        ))}
        {points.map((p, i) => {
          // Determine label format based on prop (default to semi-annual)
          const format = labelFormat || 'semi-annual';
          
          if (format === 'quarterly') {
            // Convert month to quarterly label
            const getQuarterLabel = (monthStr: string) => {
              // Try to parse as Date first (e.g., "10/31/2022")
              let date = new Date(monthStr);
              if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = date.getMonth() + 1; // 0-indexed
                const quarter = Math.ceil(month / 3);
                return `Q${quarter} '${year.toString().slice(-2)}`;
              }
              
              // Try YYYY-MM format (e.g., "2023-03")
              const parts = monthStr.split('-');
              if (parts.length >= 2) {
                const year = parts[0];
                const month = parseInt(parts[1]);
                const quarter = Math.ceil(month / 3);
                return `Q${quarter} '${year.slice(-2)}`;
              }
              return monthStr;
            };
            
            // Only show labels for quarter-end months (March, June, September, December)
            // AND skip every other quarter to reduce crowding
            const isQuarterEnd = (monthStr: string) => {
              let date = new Date(monthStr);
              if (!isNaN(date.getTime())) {
                const month = date.getMonth() + 1;
                return month % 3 === 0; // Months 3, 6, 9, 12
              }
              
              const parts = monthStr.split('-');
              if (parts.length >= 2) {
                const month = parseInt(parts[1]);
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
            // Semi-annual format (default)
            const getSemiAnnualLabel = (monthStr: string) => {
              const parts = monthStr.split('-');
              if (parts.length >= 2) {
                const year = parts[0];
                const month = parseInt(parts[1]);
                const half = month <= 6 ? 1 : 2;
                return `H${half} '${year.slice(-2)}`;
              }
              return monthStr;
            };
            
            const parts = p.month.split('-');
            const month = parts.length >= 2 ? parseInt(parts[1]) : 0;
            const isSemiAnnualEnd = month === 6 || month === 12;
            
            // Fallback: show label every 6 data points if no semi-annual matches
            const showEveryNth = points.length > 12 ? Math.floor(points.length / 4) : 3;
            const showAsBackup = i % showEveryNth === 0 || i === points.length - 1;
            
            if (!isSemiAnnualEnd && !showAsBackup) return null;
            return <text key={i} x={p.x} y={height - padding.bottom + 20} textAnchor="middle" fontSize="11" fill="#64748b">{getSemiAnnualLabel(p.month)}</text>;
          }
        })}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: benchmarkValue != null ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)', gap: '10px', marginTop: '15px', padding: '3px 12px', background: 'white', borderRadius: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>CURRENT:</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: color }}>{formatter ? formatter(validData[validData.length - 1].value!) : validData[validData.length - 1].value!.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
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
                {validData.map((d, i) => {
                  // Only show quarterly data (every 3rd month)
                  let date = new Date(d.month);
                  if (!isNaN(date.getTime())) {
                    const month = date.getMonth() + 1;
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
                {validData.map((d, i) => {
                  let date = new Date(d.month);
                  if (!isNaN(date.getTime())) {
                    const month = date.getMonth() + 1;
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
export function ProjectionChart({ title, historicalData, projectedData, valueKey, formatValue }: {
  title: string;
  historicalData: any[];
  projectedData: { mostLikely: any[]; bestCase: any[]; worstCase: any[] };
  valueKey: string;
  formatValue?: (val: number) => string;
}) {
  if (!historicalData || historicalData.length === 0) return null;
  
  const formatter = formatValue || ((v: number) => v.toFixed(1));
  const hist = historicalData.slice(-12).map(d => ({ month: d.month, value: d[valueKey], type: 'historical' }));
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
  
  const width = 580;
  const height = 300;
  const padding = { top: 20, right: 15, bottom: 50, left: 55 };
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
      
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1', minWidth: '400px', maxWidth: '580px' }}>
          <svg width={width} height={height} style={{ width: '100%', height: 'auto' }}>
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
        
        <div style={{ width: '280px', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
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
      
      <div style={{ marginTop: '20px', overflowX: 'auto', maxWidth: '100%' }}>
        <table style={{ fontSize: '10px', borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
              <td style={{ padding: '6px 8px', fontWeight: '700', color: '#1e293b', position: 'sticky', left: 0, background: '#f1f5f9', zIndex: 1, minWidth: '50px' }}>Month</td>
              {hist.map((d, i) => (
                <td key={`month-hist-${i}`} style={{ padding: '6px 4px', textAnchor: 'center', fontWeight: '600', color: '#64748b', background: 'white', minWidth: '60px' }}>
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
    </div>
  );
}

