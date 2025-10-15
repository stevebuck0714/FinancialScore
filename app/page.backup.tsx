'use client';

import { useState, useMemo, useEffect, ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { Upload, AlertCircle, TrendingUp, DollarSign, FileSpreadsheet } from 'lucide-react';
import { INDUSTRY_SECTORS, SECTOR_CATEGORIES } from '../data/industrySectors';
import { assessmentData } from '../data/assessmentData';

// Types
type Mappings = {
  date: string;
  // Income Statement
  revenue?: string;
  cogsPayroll?: string;
  cogsOwnerPay?: string;
  cogsContractors?: string;
  cogsMaterials?: string;
  cogsCommissions?: string;
  cogsOther?: string;
  cogsTotal?: string;
  opexSalesMarketing?: string;
  rentLease?: string;
  utilities?: string;
  equipment?: string;
  travel?: string;
  professionalServices?: string;
  insurance?: string;
  opexOther?: string;
  opexPayroll?: string;
  ownersBasePay?: string;
  ownersRetirement?: string;
  contractorsDistribution?: string;
  interestExpense?: string;
  depreciationExpense?: string;
  operatingExpenseTotal?: string;
  nonOperatingIncome?: string;
  extraordinaryItems?: string;
  expense?: string;
  netProfit?: string;
  // Balance Sheet - Assets
  cash?: string;
  ar?: string;
  inventory?: string;
  otherCA?: string;
  tca?: string;
  fixedAssets?: string;
  otherAssets?: string;
  totalAssets?: string;
  // Balance Sheet - Liabilities & Equity
  ap?: string;
  otherCL?: string;
  tcl?: string;
  ltd?: string;
  totalLiab?: string;
  totalEquity?: string;
  totalLAndE?: string;
};

type NormalRow = {
  date: Date;
  month: string;
  revenue: number;
  expense: number;
  cash: number;
  ar: number;
  inventory: number;
  otherCA: number;
  tca: number;
  fixedAssets: number;
  otherAssets: number;
  totalAssets: number;
  ap: number;
  otherCL: number;
  tcl: number;
  ltd: number;
  totalLiab: number;
  totalEquity: number;
  totalLAndE: number;
};

interface Company {
  id: string;
  name: string;
  consultantEmail: string;
  consultantId?: string;
  createdDate: string;
  location?: string;
  industrySector?: number;
}

interface CompanyProfile {
  companyId: string;
  legalStructure: string;
  businessStatus: string;
  ownership: string;
  workforce: string;
  keyAdvisors: string;
  specialNotes: string;
  qoeNotes: string;
  disclosures: {
    bankruptcies: string;
    liens: string;
    contracts: string;
    lawsuits: string;
    mostFavoredNation: string;
    equityControl: string;
    rightOfFirstRefusal: string;
    shareholderProtections: string;
    changeInControl: string;
    regulatoryApprovals: string;
    auditedFinancials: string;
  };
}

interface AssessmentResponses {
  [questionId: string]: number;
}

interface AssessmentNotes {
  [categoryId: number]: string;
}

interface AssessmentRecord {
  id: string;
  userEmail: string;
  userName: string;
  companyId: string;
  companyName: string;
  responses: AssessmentResponses;
  notes: AssessmentNotes;
  completedDate: string;
  overallScore: number;
}

interface Consultant {
  id: string;
  type: string;
  fullName: string;
  address: string;
  email: string;
  phone: string;
  password: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  companyId: string;
  consultantId?: string;
  role: 'consultant' | 'user' | 'siteadmin';
  userType?: 'company' | 'assessment'; // company = management team, assessment = fills questionnaire
}

interface FinancialDataRecord {
  id: string;
  companyId: string;
  uploadedBy: string;
  uploadDate: string;
  rawRows: any[];
  mapping: Mappings;
  fileName: string;
}

// Helper functions
function parseDateLike(v: any): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d || 1));
  }
  if (typeof v === 'string') {
    const s = v.trim();
    const iso = new Date(s);
    if (!isNaN(iso.getTime())) return iso;
    const m = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (m) {
      const mm = Number(m[1]);
      const yyyy = Number(m[2]);
      return new Date(Date.UTC(yyyy, mm - 1, 1));
    }
  }
  return null;
}

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function sum(arr: number[]) {
  return arr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

function pctChange(curr: number, prior: number) {
  if (!Number.isFinite(curr) || !Number.isFinite(prior) || prior === 0) return null;
  return (curr / prior - 1) * 100;
}

function revenueGrowthScore_24mo(growthPct: number | null) {
  if (growthPct === null) return null;
  const g = growthPct;
  if (g >= 25) return 100;
  if (g >= 15) return 80;
  if (g >= 5) return 60;
  if (g >= 0) return 50;
  if (g >= -5) return 40;
  if (g >= -15) return 20;
  return 10;
}

function rgsAdjustmentFrom6mo(rgs: number | null, growth6moPct: number | null) {
  if (rgs === null || growth6moPct === null) return null;
  const g = growth6moPct;
  if (g >= 25) return rgs + 50;
  if (g >= 15) return ((100 - rgs) * 0.8) + rgs;
  if (g >= 5) return ((100 - rgs) * 0.6) + rgs;
  if (g >= 0) return ((100 - rgs) * 0.4) + rgs;
  if (g >= -5) return rgs * 0.9;
  if (g >= -15) return rgs * 0.7;
  if (g >= -25) return rgs * 0.5;
  return rgs * 0.3;
}

function clamp(x: number, min = 10, max = 100) {
  return Math.min(max, Math.max(min, x));
}

function sixMonthGrowthFromMonthly(series: Array<{ month: string; value: number }>) {
  if (series.length < 12) return null;
  const keys = [...series.map(r => r.month)].sort();
  const uniq = Array.from(new Set(keys));
  if (uniq.length < 12) return null;
  const map = new Map(series.map(r => [r.month, r.value]));
  const last6 = uniq.slice(-6);
  const prev6 = uniq.slice(-12, -6);
  const qsum = (months: string[]) => sum(months.map(m => map.get(m) || 0));
  const curr = qsum(last6);
  const prior = qsum(prev6);
  return pctChange(curr, prior);
}

function normalizeRows(raw: any[], mapping: Mappings): NormalRow[] {
  const rows: NormalRow[] = [];
  for (const r of raw) {
    const d = parseDateLike(r[mapping.date]);
    if (!d) continue;
    function N(col?: string) {
      const v = col ? r[col] : null;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    const row: NormalRow = {
      date: d,
      month: monthKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))),
      revenue: N(mapping.revenue),
      expense: N(mapping.expense),
      cash: N(mapping.cash),
      ar: N(mapping.ar),
      inventory: N(mapping.inventory),
      otherCA: N(mapping.otherCA),
      tca: N(mapping.tca),
      fixedAssets: N(mapping.fixedAssets),
      otherAssets: N(mapping.otherAssets),
      totalAssets: N(mapping.totalAssets),
      ap: N(mapping.ap),
      otherCL: N(mapping.otherCL),
      tcl: N(mapping.tcl),
      ltd: N(mapping.ltd),
      totalLiab: N(mapping.totalLiab),
      totalEquity: N(mapping.totalEquity),
      totalLAndE: N(mapping.totalLAndE),
    };
    rows.push(row);
  }
  
  const acc = new Map<string, NormalRow>();
  for (const r of rows) {
    const k = r.month;
    const v = acc.get(k) || { ...r };
    if (acc.has(k)) {
      for (const key of Object.keys(r) as (keyof NormalRow)[]) {
        if (key === 'date' || key === 'month') continue;
        (v as any)[key] = ((v as any)[key] || 0) + ((r as any)[key] || 0);
      }
    }
    acc.set(k, v);
  }
  const months = Array.from(acc.keys()).sort();
  return months.map(m => acc.get(m)!);
}

function ltmVsPrior(series: Array<{ month: string; value: number }>) {
  if (series.length < 24) return { curr: null, prior: null, pct: null };
  const values = [...series].sort((a, b) => a.month.localeCompare(b.month));
  const last12 = values.slice(-12);
  const prev12 = values.slice(-24, -12);
  const curr = sum(last12.map(r => r.value));
  const prior = sum(prev12.map(r => r.value));
  return { curr, prior, pct: pctChange(curr, prior) };
}

// LineChart Component
function LineChart({ title, data, valueKey, color, yMax, showTable, compact, formatter }: { 
  title: string; 
  data: Array<any>;
  valueKey?: string;
  color: string;
  yMax?: number | null;
  showTable?: boolean;
  compact?: boolean;
  formatter?: (val: number) => string;
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
  const height = compact ? 250 : 300;
  const padding = { top: 15, right: 30, bottom: 50, left: 50 };
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
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', marginBottom: '15px' }}>{title}</h3>
      <svg width={width} height={height} style={{ maxWidth: '100%', height: 'auto' }}>
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
                  {Math.abs(val) >= 100 ? val.toFixed(0) : val.toFixed(1)}
                </text>
              </g>
            );
          });
        })()}
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />
        <path d={pathD} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="5" fill={p.isOutOfRange ? '#ef4444' : color} stroke="white" strokeWidth="2">
            <title>{`${p.month}: ${p.value.toFixed(1)}${p.isOutOfRange ? ' (out of range)' : ''}`}</title>
          </circle>
        ))}
        {points.map((p, i) => {
          const showLabel = i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 8) === 0;
          if (!showLabel) return null;
          return <text key={i} x={p.x} y={height - padding.bottom + 20} textAnchor="middle" fontSize="11" fill="#64748b">{p.month}</text>;
        })}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '15px', padding: '12px', background: 'white', borderRadius: '8px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px', fontWeight: '600' }}>CURRENT</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: color }}>{formatter ? formatter(validData[validData.length - 1].value!) : validData[validData.length - 1].value?.toFixed(2)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px', fontWeight: '600' }}>AVG</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{formatter ? formatter(sum(values) / values.length) : (sum(values) / values.length).toFixed(2)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px', fontWeight: '600' }}>MIN</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#64748b' }}>{formatter ? formatter(Math.min(...values)) : Math.min(...values).toFixed(2)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px', fontWeight: '600' }}>MAX</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#64748b' }}>{formatter ? formatter(Math.max(...values)) : Math.max(...values).toFixed(2)}</div>
        </div>
      </div>
      
      {showTable && (
        <div style={{ marginTop: '16px', overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <td style={{ padding: '6px 8px', fontWeight: '700', color: '#1e293b', position: 'sticky', left: 0, background: '#f1f5f9', zIndex: 1, minWidth: '60px' }}>
                  Month
                </td>
                {validData.map((d, i) => (
                  <td key={`month-${i}`} style={{ padding: '6px', textAlign: 'center', fontWeight: '600', color: '#64748b', minWidth: '70px' }}>
                    {d.month}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '6px 8px', fontWeight: '700', color: '#1e293b', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1 }}>
                  Value
                </td>
                {validData.map((d, i) => (
                  <td key={`val-${i}`} style={{ padding: '6px', textAlign: 'center', fontWeight: '700', color: color }}>
                    {formatter ? formatter(d.value!) : d.value?.toFixed(2)}
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

// ProjectionChart Component
function ProjectionChart({ title, historicalData, projectedData, valueKey, formatValue }: {
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
              {((mostLikely[11].value / hist[hist.length - 1].value - 1) * 100).toFixed(1)}%
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
              {((bestCase[11].value / hist[hist.length - 1].value - 1) * 100).toFixed(1)}%
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
              {((worstCase[11].value / hist[hist.length - 1].value - 1) * 100).toFixed(1)}%
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
    </div>
  );
}

export default function FinancialScorePage() {
  // State - Authentication
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginName, setLoginName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginError, setLoginError] = useState('');
  
  // State - Consultants
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [newConsultantType, setNewConsultantType] = useState('');
  const [newConsultantFullName, setNewConsultantFullName] = useState('');
  const [newConsultantAddress, setNewConsultantAddress] = useState('');
  const [newConsultantEmail, setNewConsultantEmail] = useState('');
  const [newConsultantPhone, setNewConsultantPhone] = useState('');
  const [newConsultantPassword, setNewConsultantPassword] = useState('');
  const [selectedConsultantId, setSelectedConsultantId] = useState('');
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<string[]>([]);
  
  // State - Companies & Users
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  
  // State - Company Details
  const [showCompanyDetailsModal, setShowCompanyDetailsModal] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState('');
  const [companyLocation, setCompanyLocation] = useState('');
  const [companyIndustrySector, setCompanyIndustrySector] = useState<number | ''>('');
  const [expandedCompanyInfoId, setExpandedCompanyInfoId] = useState('');
  const [isManagementAssessmentExpanded, setIsManagementAssessmentExpanded] = useState(false);
  const [isFinancialScoreExpanded, setIsFinancialScoreExpanded] = useState(false);
  
  // State - Projections
  const [defaultBestCaseRevMult, setDefaultBestCaseRevMult] = useState(1.5);
  const [defaultBestCaseExpMult, setDefaultBestCaseExpMult] = useState(0.7);
  const [defaultWorstCaseRevMult, setDefaultWorstCaseRevMult] = useState(0.5);
  const [defaultWorstCaseExpMult, setDefaultWorstCaseExpMult] = useState(1.3);
  const [bestCaseRevMultiplier, setBestCaseRevMultiplier] = useState(1.5);
  const [bestCaseExpMultiplier, setBestCaseExpMultiplier] = useState(0.7);
  const [worstCaseRevMultiplier, setWorstCaseRevMultiplier] = useState(0.5);
  const [worstCaseExpMultiplier, setWorstCaseExpMultiplier] = useState(1.3);
  const [showDefaultSettings, setShowDefaultSettings] = useState(false);
  
  // State - Financial Data
  const [financialDataRecords, setFinancialDataRecords] = useState<FinancialDataRecord[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mappings>({ date: '' });
  const [error, setError] = useState<string | null>(null);
  const [isFreshUpload, setIsFreshUpload] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<'login' | 'admin' | 'siteadmin' | 'upload' | 'results' | 'kpis' | 'mda' | 'projections' | 'working-capital' | 'valuation' | 'cash-flow' | 'trend-analysis' | 'profile' | 'fs-intro' | 'fs-score' | 'ma-welcome' | 'ma-questionnaire' | 'ma-your-results' | 'ma-scores-summary' | 'ma-scoring-guide' | 'ma-charts'>('login');
  
  // State - Management Assessment
  const [assessmentResponses, setAssessmentResponses] = useState<AssessmentResponses>({});
  const [assessmentNotes, setAssessmentNotes] = useState<AssessmentNotes>({});
  const [assessmentRecords, setAssessmentRecords] = useState<AssessmentRecord[]>([]);
  const [unansweredQuestions, setUnansweredQuestions] = useState<string[]>([]);
  
  // State - Trend Analysis
  const [selectedTrendItem, setSelectedTrendItem] = useState<string>('revenue');
  
  // State - Valuation
  const [sdeMultiplier, setSdeMultiplier] = useState(2.5);
  const [ebitdaMultiplier, setEbitdaMultiplier] = useState(5.0);

  // State - Company Profiles
  const [companyProfiles, setCompanyProfiles] = useState<CompanyProfile[]>([]);

  // Load from localStorage
  useEffect(() => {
    const saved = {
      consultants: localStorage.getItem('fs_consultants'),
      companies: localStorage.getItem('fs_companies'),
      users: localStorage.getItem('fs_users'),
      currentUser: localStorage.getItem('fs_currentUser'),
      records: localStorage.getItem('fs_financialDataRecords'),
      selectedCompany: localStorage.getItem('fs_selectedCompanyId'),
      defaults: localStorage.getItem('fs_projectionDefaults'),
      assessmentResponses: localStorage.getItem('fs_assessmentResponses'),
      assessmentNotes: localStorage.getItem('fs_assessmentNotes'),
      assessmentRecords: localStorage.getItem('fs_assessmentRecords'),
      companyProfiles: localStorage.getItem('fs_companyProfiles')
    };
    
    if (saved.consultants) setConsultants(JSON.parse(saved.consultants));
    if (saved.companies) setCompanies(JSON.parse(saved.companies));
    if (saved.users) setUsers(JSON.parse(saved.users));
    if (saved.records) setFinancialDataRecords(JSON.parse(saved.records));
    if (saved.selectedCompany) setSelectedCompanyId(saved.selectedCompany);
    if (saved.assessmentResponses) setAssessmentResponses(JSON.parse(saved.assessmentResponses));
    if (saved.assessmentNotes) setAssessmentNotes(JSON.parse(saved.assessmentNotes));
    if (saved.assessmentRecords) setAssessmentRecords(JSON.parse(saved.assessmentRecords));
    if (saved.companyProfiles) setCompanyProfiles(JSON.parse(saved.companyProfiles));
    
    if (saved.defaults) {
      const d = JSON.parse(saved.defaults);
      setDefaultBestCaseRevMult(d.bestCaseRev || 1.5);
      setDefaultBestCaseExpMult(d.bestCaseExp || 0.7);
      setDefaultWorstCaseRevMult(d.worstCaseRev || 0.5);
      setDefaultWorstCaseExpMult(d.worstCaseExp || 1.3);
      setBestCaseRevMultiplier(d.bestCaseRev || 1.5);
      setBestCaseExpMultiplier(d.bestCaseExp || 0.7);
      setWorstCaseRevMultiplier(d.worstCaseRev || 0.5);
      setWorstCaseExpMultiplier(d.worstCaseExp || 1.3);
    }
    
    if (saved.currentUser) {
      const user = JSON.parse(saved.currentUser);
      setCurrentUser(user);
      setIsLoggedIn(true);
      if (user.role === 'siteadmin') {
        setCurrentView('siteadmin');
      } else {
        setCurrentView('upload');
      }
    }
  }, []);

  useEffect(() => { if (consultants.length > 0) localStorage.setItem('fs_consultants', JSON.stringify(consultants)); }, [consultants]);
  useEffect(() => { if (companies.length > 0) localStorage.setItem('fs_companies', JSON.stringify(companies)); }, [companies]);
  useEffect(() => { if (users.length > 0) localStorage.setItem('fs_users', JSON.stringify(users)); }, [users]);
  useEffect(() => { if (currentUser) localStorage.setItem('fs_currentUser', JSON.stringify(currentUser)); }, [currentUser]);
  useEffect(() => { if (financialDataRecords.length > 0) localStorage.setItem('fs_financialDataRecords', JSON.stringify(financialDataRecords)); }, [financialDataRecords]);
  
  useEffect(() => { if (Object.keys(assessmentResponses).length > 0) localStorage.setItem('fs_assessmentResponses', JSON.stringify(assessmentResponses)); }, [assessmentResponses]);
  useEffect(() => { if (Object.keys(assessmentNotes).length > 0) localStorage.setItem('fs_assessmentNotes', JSON.stringify(assessmentNotes)); }, [assessmentNotes]);
  useEffect(() => { if (assessmentRecords.length > 0) localStorage.setItem('fs_assessmentRecords', JSON.stringify(assessmentRecords)); }, [assessmentRecords]);
  useEffect(() => { if (companyProfiles.length > 0) localStorage.setItem('fs_companyProfiles', JSON.stringify(companyProfiles)); }, [companyProfiles]);

  useEffect(() => {
    if (selectedCompanyId) {
      localStorage.setItem('fs_selectedCompanyId', selectedCompanyId);
      const record = financialDataRecords.find(r => r.companyId === selectedCompanyId);
      if (record) {
        setIsFreshUpload(false);
        setRawRows(record.rawRows);
        setMapping(record.mapping);
        setFile({ name: record.fileName } as File);
        setColumns(record.rawRows.length > 0 ? Object.keys(record.rawRows[0]) : []);
      } else {
        setRawRows([]);
        setMapping({ date: '' });
        setFile(null);
        setColumns([]);
        setIsFreshUpload(false);
      }
    }
  }, [selectedCompanyId, financialDataRecords]);

  useEffect(() => {
    if (!file || rawRows.length === 0 || !mapping.date || !selectedCompanyId || !currentUser || !isFreshUpload) return;
    const newRecord: FinancialDataRecord = {
      id: Date.now().toString(),
      companyId: selectedCompanyId,
      uploadedBy: currentUser.email,
      uploadDate: new Date().toISOString(),
      rawRows: rawRows,
      mapping: mapping,
      fileName: file.name
    };
    setFinancialDataRecords(prev => {
      const filtered = prev.filter(r => r.companyId !== selectedCompanyId);
      return [...filtered, newRecord];
    });
    setIsFreshUpload(false);
  }, [mapping, rawRows, file, selectedCompanyId, currentUser, isFreshUpload]);

  // Auto-map columns
  const autoMapColumns = (columnNames: string[]): Mappings => {
    const mapping: Mappings = { date: '' };
    const normalize = (str: string) => str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    
    columnNames.forEach(col => {
      const n = normalize(col);
      // Core fields
      if (!mapping.date && (n.includes('date') || n.includes('month') || n.includes('period'))) mapping.date = col;
      if (!mapping.revenue && (n.includes('grossrevenue') || n.includes('totalgrossrevenue') || n.includes('revenue') || n.includes('sales'))) mapping.revenue = col;
      if (!mapping.expense && (n.includes('totalexpense') || (n.includes('expense') && n.includes('total')))) mapping.expense = col;
      
      // COGS
      if (!mapping.cogsPayroll && n.includes('cogs') && n.includes('payroll')) mapping.cogsPayroll = col;
      if (!mapping.cogsOwnerPay && n.includes('cogs') && n.includes('owner')) mapping.cogsOwnerPay = col;
      if (!mapping.cogsContractors && n.includes('cogs') && n.includes('contractor')) mapping.cogsContractors = col;
      if (!mapping.cogsMaterials && n.includes('cogs') && n.includes('material')) mapping.cogsMaterials = col;
      if (!mapping.cogsCommissions && n.includes('cogs') && (n.includes('comsn') || n.includes('commission'))) mapping.cogsCommissions = col;
      if (!mapping.cogsOther && n.includes('cogs') && n.includes('other')) mapping.cogsOther = col;
      if (!mapping.cogsTotal && n.includes('cogs') && n.includes('total')) mapping.cogsTotal = col;
      
      // OPEX
      if (!mapping.opexSalesMarketing && ((n.includes('opex') && (n.includes('sales') || n.includes('marketing'))) || (n === 'salesandmarketing' || n === 'salesmarketing'))) mapping.opexSalesMarketing = col;
      if (!mapping.rentLease && (n.includes('rent') || n.includes('lease'))) mapping.rentLease = col;
      if (!mapping.utilities && n.includes('utilit')) mapping.utilities = col;
      if (!mapping.equipment && n.includes('equipment')) mapping.equipment = col;
      if (!mapping.travel && n.includes('travel')) mapping.travel = col;
      if (!mapping.professionalServices && n.includes('professional')) mapping.professionalServices = col;
      if (!mapping.insurance && n.includes('insurance')) mapping.insurance = col;
      if (!mapping.opexOther && ((n.includes('opex') && n.includes('other')) || n === 'otheropex')) mapping.opexOther = col;
      if (!mapping.opexPayroll && ((n.includes('opex') && n.includes('payroll')) || (n === 'payroll' && !n.includes('cogs')))) mapping.opexPayroll = col;
      
      // Owners & Other Expenses
      if (!mapping.ownersBasePay && n.includes('owners') && n.includes('base')) mapping.ownersBasePay = col;
      if (!mapping.ownersRetirement && n.includes('owners') && n.includes('retirement')) mapping.ownersRetirement = col;
      if (!mapping.contractorsDistribution && n.includes('contractors') && n.includes('distribution')) mapping.contractorsDistribution = col;
      if (!mapping.interestExpense && n.includes('interest')) mapping.interestExpense = col;
      if (!mapping.depreciationExpense && n.includes('depreciation')) mapping.depreciationExpense = col;
      if (!mapping.operatingExpenseTotal && n.includes('operating') && n.includes('expense') && n.includes('total')) mapping.operatingExpenseTotal = col;
      if (!mapping.nonOperatingIncome && (n.includes('nonoperating') || n.includes('nonoperatng')) && n.includes('income')) mapping.nonOperatingIncome = col;
      if (!mapping.extraordinaryItems && (n.includes('extraordinary') || n.includes('extraordinaryitems'))) mapping.extraordinaryItems = col;
      if (!mapping.netProfit && (n.includes('netprofit') || n.includes('netincome'))) mapping.netProfit = col;
      
      // Assets
      if (!mapping.totalAssets && (n.includes('totalasset') || n === 'totalassets' || n === 'assets')) mapping.totalAssets = col;
      if (!mapping.cash && n === 'cash') mapping.cash = col;
      if (!mapping.ar && (n.includes('accountsreceivable') || n.includes('receivable') || n === 'ar')) mapping.ar = col;
      if (!mapping.inventory && n.includes('inventory')) mapping.inventory = col;
      if (!mapping.otherCA && (n.includes('othercurrentasset') || n === 'othercurrentassets')) mapping.otherCA = col;
      if (!mapping.tca && (n.includes('totalcurrentasset') || n === 'totalcurrentassets' || n === 'currentassets')) mapping.tca = col;
      if (!mapping.fixedAssets && (n.includes('fixedasset') || n === 'fixedassets')) mapping.fixedAssets = col;
      if (!mapping.otherAssets && (n.includes('otherasset') && !n.includes('current'))) mapping.otherAssets = col;
      
      // Liabilities & Equity
      if (!mapping.totalLiab && (n.includes('totalliab') || n === 'totalliabilities' || n === 'liabilities')) mapping.totalLiab = col;
      if (!mapping.ap && (n.includes('accountspayable') || n.includes('payable') || n === 'ap')) mapping.ap = col;
      if (!mapping.otherCL && (n.includes('othercurrentliab') || n === 'othercurrentliabilities')) mapping.otherCL = col;
      if (!mapping.tcl && (n.includes('totalcurrentliab') || n === 'totalcurrentliabilities' || n === 'currentliabilities')) mapping.tcl = col;
      if (!mapping.ltd && (n.includes('longtermdebt') || n.includes('ltd') || n === 'longtermdebt')) mapping.ltd = col;
      if (!mapping.totalEquity && (n.includes('totalequity') || n.includes('equity') || n.includes('networth'))) mapping.totalEquity = col;
      if (!mapping.totalLAndE && (n.includes('liabequity') || n.includes('liabilitiesequity'))) mapping.totalLAndE = col;
    });
    return mapping;
  };

  // Handlers
  const handleLogin = () => {
    setLoginError('');
    if (!loginEmail || !loginPassword) {
      setLoginError('Please enter both email and password');
      return;
    }
    
    // Check for site administrator first
    if (loginEmail === 'siteadministrator' && loginPassword === 'Venturis0801$') {
      const siteAdmin: User = { 
        id: 'siteadmin', 
        name: 'Site Administrator', 
        email: 'siteadministrator', 
        password: 'Venturis0801$', 
        companyId: '', 
        role: 'siteadmin' 
      };
      setCurrentUser(siteAdmin);
      setIsLoggedIn(true);
      setCurrentView('siteadmin');
      setLoginEmail('');
      setLoginPassword('');
      setLoginError('');
      return;
    }
    
    const user = users.find(u => u.email === loginEmail && u.password === loginPassword);
    if (user) {
      setCurrentUser(user);
      setIsLoggedIn(true);
      setCurrentView(user.role === 'consultant' ? 'admin' : 'upload');
      if (user.role !== 'consultant') setSelectedCompanyId(user.companyId);
      setLoginEmail('');
      setLoginPassword('');
      setLoginError('');
    } else {
      if (users.length === 0) {
        setLoginError('No users found. Please register as a consultant first.');
      } else {
        setLoginError('Invalid email or password. Please try again or register.');
      }
    }
  };

  const handleRegisterConsultant = () => {
    setLoginError('');
    if (!loginName || !loginEmail || !loginPassword) { 
      setLoginError('Please fill in all fields');
      return; 
    }
    if (users.find(u => u.email === loginEmail)) { 
      setLoginError('This email is already registered. Please login instead.');
      return; 
    }
    const newUser: User = { id: Date.now().toString(), name: loginName, email: loginEmail, password: loginPassword, companyId: '', role: 'consultant' };
    setUsers([...users, newUser]);
    setCurrentUser(newUser);
    setIsLoggedIn(true);
    setCurrentView('admin');
    setLoginName('');
    setLoginEmail('');
    setLoginPassword('');
    setIsRegistering(false);
    setLoginError('');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsLoggedIn(false);
    setCurrentView('login');
    setSelectedCompanyId('');
    setRawRows([]);
    setMapping({ date: '' });
    setFile(null);
    setColumns([]);
    localStorage.removeItem('fs_currentUser');
    localStorage.removeItem('fs_selectedCompanyId');
  };

  const addCompany = () => {
    if (!newCompanyName || !currentUser) return;
    setCompanies([...companies, { id: Date.now().toString(), name: newCompanyName, consultantEmail: currentUser.email, consultantId: currentUser.consultantId || currentUser.id, createdDate: new Date().toISOString() }]);
    setNewCompanyName('');
  };

  const deleteCompany = (companyId: string) => {
    if (!confirm('Delete this company and all its users?')) return;
    setCompanies(companies.filter(c => c.id !== companyId));
    setUsers(users.filter(u => u.companyId !== companyId));
    setFinancialDataRecords(financialDataRecords.filter(r => r.companyId !== companyId));
    if (selectedCompanyId === companyId) setSelectedCompanyId('');
  };

  const getCompanyUsers = (companyId: string, userType?: 'company' | 'assessment') => {
    if (userType) {
      return users.filter(u => u.companyId === companyId && u.role === 'user' && u.userType === userType);
    }
    return users.filter(u => u.companyId === companyId && u.role === 'user');
  };
  const getCurrentCompany = () => companies.find(c => c.id === selectedCompanyId);

  const handleSelectCompany = (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    if (!company) return;
    if (!company.location || !company.industrySector) {
      setEditingCompanyId(companyId);
      setCompanyLocation(company.location || '');
      setCompanyIndustrySector(company.industrySector || '');
      setShowCompanyDetailsModal(true);
    } else {
      setSelectedCompanyId(companyId);
    }
  };

  const saveCompanyDetails = () => {
    if (!companyLocation || !companyIndustrySector) { alert('Please enter both location and industry sector'); return; }
    setCompanies(companies.map(c => c.id === editingCompanyId ? { ...c, location: companyLocation, industrySector: companyIndustrySector as number } : c));
    setSelectedCompanyId(editingCompanyId);
    setShowCompanyDetailsModal(false);
    setEditingCompanyId('');
    setCompanyLocation('');
    setCompanyIndustrySector('');
  };

  const addUser = (companyId: string, userType: 'company' | 'assessment' = 'company') => {
    if (!newUserName || !newUserEmail || !newUserPassword) { alert('Please fill all user fields'); return; }
    if (users.find(u => u.email === newUserEmail)) { alert('Email already exists'); return; }
    
    // Only enforce 5-user limit for assessment users
    if (userType === 'assessment') {
      const assessmentUserCount = users.filter(u => u.companyId === companyId && u.userType === 'assessment').length;
      if (assessmentUserCount >= 5) { 
        alert('Maximum of 5 assessment users per company reached. Please delete an assessment user before adding a new one.'); 
        return; 
      }
    }
    
    setUsers([...users, { 
      id: Date.now().toString(), 
      name: newUserName, 
      email: newUserEmail, 
      password: newUserPassword, 
      companyId: companyId, 
      role: 'user',
      userType: userType 
    }]);
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPassword('');
  };

  const deleteUser = (userId: string) => {
    if (!confirm('Delete this user?')) return;
    setUsers(users.filter(u => u.id !== userId));
  };

  // Consultant CRUD functions
  const addConsultant = () => {
    if (!newConsultantType || !newConsultantFullName || !newConsultantAddress || !newConsultantEmail || !newConsultantPhone || !newConsultantPassword) {
      alert('Please fill all consultant fields');
      return;
    }
    if (consultants.find(c => c.email === newConsultantEmail)) {
      alert('Consultant email already exists');
      return;
    }
    const newConsultant: Consultant = {
      id: Date.now().toString(),
      type: newConsultantType,
      fullName: newConsultantFullName,
      address: newConsultantAddress,
      email: newConsultantEmail,
      phone: newConsultantPhone,
      password: newConsultantPassword
    };
    setConsultants([...consultants, newConsultant]);
    
    // Also add as user with consultant role
    const consultantUser: User = {
      id: newConsultant.id,
      name: newConsultantFullName,
      email: newConsultantEmail,
      password: newConsultantPassword,
      companyId: '',
      consultantId: newConsultant.id,
      role: 'consultant'
    };
    setUsers([...users, consultantUser]);
    
    // Clear form
    setNewConsultantType('');
    setNewConsultantFullName('');
    setNewConsultantAddress('');
    setNewConsultantEmail('');
    setNewConsultantPhone('');
    setNewConsultantPassword('');
  };

  const deleteConsultant = (consultantId: string) => {
    if (!confirm('Delete this consultant? This will also delete all their companies and users.')) return;
    
    // Delete consultant
    setConsultants(consultants.filter(c => c.id !== consultantId));
    
    // Delete consultant's companies
    const consultantCompanies = companies.filter(c => c.consultantId === consultantId);
    const companyIds = consultantCompanies.map(c => c.id);
    setCompanies(companies.filter(c => c.consultantId !== consultantId));
    
    // Delete users associated with those companies
    setUsers(users.filter(u => !companyIds.includes(u.companyId) && u.id !== consultantId));
    
    // Delete financial records
    setFinancialDataRecords(financialDataRecords.filter(r => !companyIds.includes(r.companyId)));
    
    // Delete assessment records
    setAssessmentRecords(assessmentRecords.filter(r => !companyIds.includes(r.companyId)));
  };

  const getConsultantCompanies = (consultantId: string) => {
    return companies.filter(c => c.consultantId === consultantId).sort((a, b) => a.name.localeCompare(b.name));
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!selectedCompanyId) { alert('Please select a company first'); return; }

    setFile(f);
    setError(null);
    setIsFreshUpload(true);
    const ab = await f.arrayBuffer();
    const wb = XLSX.read(ab, { cellDates: false });
    
    // Use Sheet1 if available (transposed format), otherwise use first sheet
    const sheetName = wb.SheetNames.includes('Sheet1') ? 'Sheet1' : wb.SheetNames[0];
    
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
    if (json.length < 2) { setError('File appears empty or invalid'); return; }
    
    // Check if this is a transposed format (field names in column A, dates in row 0)
    const firstCell = json[0] && json[0][0];
    const isTransposed = firstCell === null || firstCell === '' || (typeof firstCell === 'number' && firstCell > 40000); // Excel date serial numbers
    
    if (isTransposed) {
      // Transposed format: Row 0 has dates, Column A has field names
      console.log('Detected transposed format, converting...');
      const dateRow = json[0] as any[];
      const dates = dateRow.slice(1).filter(d => d !== null && d !== ''); // Skip first column
      
      // Convert Excel serial numbers to dates
      const parsedDates = dates.map(d => {
        if (typeof d === 'number') {
          const excelEpoch = new Date(1899, 11, 30);
          const date = new Date(excelEpoch.getTime() + d * 24 * 60 * 60 * 1000);
          return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
        }
        return d;
      });
      
      // Build normal format: each row is a month
      const rows: any[] = [];
      for (let monthIdx = 0; monthIdx < parsedDates.length; monthIdx++) {
        const monthRow: any = { 'Date': parsedDates[monthIdx] };
        
        // For each field (row in original)
        for (let fieldIdx = 1; fieldIdx < json.length; fieldIdx++) {
          const fieldRow = json[fieldIdx] as any[];
          const fieldName = fieldRow[0];
          const fieldValue = fieldRow[monthIdx + 1]; // +1 because column 0 is field name
          if (fieldName) {
            monthRow[fieldName] = fieldValue;
          }
        }
        rows.push(monthRow);
      }
      
      const header = ['Date', ...json.slice(1).map(r => r[0]).filter(n => n)];
      setRawRows(rows);
      setColumns(header);
      setMapping(autoMapColumns(header));
    } else {
      // Normal format: Row 0 has headers, each row is a month
      const header = json[0] as any[];
      const dataRows = json.slice(1);
      const rows = dataRows.map(row => {
        const obj: any = {};
        header.forEach((h, i) => { obj[h] = (row as any[])[i] == null || (row as any[])[i] === '' ? null : (row as any[])[i]; });
        return obj;
      });
      setRawRows(rows);
      setColumns(header);
      setMapping(autoMapColumns(header));
    }
  };

  // Calculate monthly data
  const monthly = useMemo(() => {
    if (!rawRows || rawRows.length === 0 || !mapping.date) return [];
    return rawRows.map((row, i) => ({
      month: row[mapping.date] || `Month ${i + 1}`,
      // Income Statement
      revenue: parseFloat(row[mapping.revenue!]) || 0,
      expense: parseFloat(row[mapping.expense!]) || 0,
      cogsPayroll: parseFloat(row[mapping.cogsPayroll!]) || 0,
      cogsOwnerPay: parseFloat(row[mapping.cogsOwnerPay!]) || 0,
      cogsContractors: parseFloat(row[mapping.cogsContractors!]) || 0,
      cogsMaterials: parseFloat(row[mapping.cogsMaterials!]) || 0,
      cogsCommissions: parseFloat(row[mapping.cogsCommissions!]) || 0,
      cogsOther: parseFloat(row[mapping.cogsOther!]) || 0,
      cogsTotal: parseFloat(row[mapping.cogsTotal!]) || 0,
      opexSalesMarketing: parseFloat(row[mapping.opexSalesMarketing!]) || 0,
      rentLease: parseFloat(row[mapping.rentLease!]) || 0,
      utilities: parseFloat(row[mapping.utilities!]) || 0,
      equipment: parseFloat(row[mapping.equipment!]) || 0,
      travel: parseFloat(row[mapping.travel!]) || 0,
      professionalServices: parseFloat(row[mapping.professionalServices!]) || 0,
      insurance: parseFloat(row[mapping.insurance!]) || 0,
      opexOther: parseFloat(row[mapping.opexOther!]) || 0,
      opexPayroll: parseFloat(row[mapping.opexPayroll!]) || 0,
      ownersBasePay: parseFloat(row[mapping.ownersBasePay!]) || 0,
      ownersRetirement: parseFloat(row[mapping.ownersRetirement!]) || 0,
      contractorsDistribution: parseFloat(row[mapping.contractorsDistribution!]) || 0,
      interestExpense: parseFloat(row[mapping.interestExpense!]) || 0,
      depreciationExpense: parseFloat(row[mapping.depreciationExpense!]) || 0,
      operatingExpenseTotal: parseFloat(row[mapping.operatingExpenseTotal!]) || 0,
      nonOperatingIncome: parseFloat(row[mapping.nonOperatingIncome!]) || 0,
      extraordinaryItems: parseFloat(row[mapping.extraordinaryItems!]) || 0,
      netProfit: parseFloat(row[mapping.netProfit!]) || 0,
      // Balance Sheet - Assets (reusing from above if already defined)
      totalAssets: parseFloat(row[mapping.totalAssets!]) || 0,
      totalLiab: parseFloat(row[mapping.totalLiab!]) || 0,
      cash: parseFloat(row[mapping.cash!]) || 0,
      ar: parseFloat(row[mapping.ar!]) || 0,
      inventory: parseFloat(row[mapping.inventory!]) || 0,
      otherCA: parseFloat(row[mapping.otherCA!]) || 0,
      tca: parseFloat(row[mapping.tca!]) || 0,
      fixedAssets: parseFloat(row[mapping.fixedAssets!]) || 0,
      otherAssets: parseFloat(row[mapping.otherAssets!]) || 0,
      ap: parseFloat(row[mapping.ap!]) || 0,
      otherCL: parseFloat(row[mapping.otherCL!]) || 0,
      tcl: parseFloat(row[mapping.tcl!]) || 0,
      ltd: parseFloat(row[mapping.ltd!]) || 0,
      totalEquity: parseFloat(row[mapping.totalEquity!]) || 0,
      totalLAndE: parseFloat(row[mapping.totalLAndE!]) || 0
    }));
  }, [rawRows, mapping]);

  const ltmRev = monthly.length >= 12 ? monthly.slice(-12).reduce((sum, m) => sum + m.revenue, 0) : 0;
  const ltmExp = monthly.length >= 12 ? monthly.slice(-12).reduce((sum, m) => sum + m.expense, 0) : 0;
  
  const growth_24mo = monthly.length >= 24 ? ((ltmRev - monthly.slice(-24, -12).reduce((sum, m) => sum + m.revenue, 0)) / monthly.slice(-24, -12).reduce((sum, m) => sum + m.revenue, 0)) * 100 : 0;
  const growth_6mo = monthly.length >= 12 ? ((monthly.slice(-6).reduce((sum, m) => sum + m.revenue, 0) - monthly.slice(-12, -6).reduce((sum, m) => sum + m.revenue, 0)) / monthly.slice(-12, -6).reduce((sum, m) => sum + m.revenue, 0)) * 100 : 0;
  const expGrowth_24mo = monthly.length >= 24 ? ((ltmExp - monthly.slice(-24, -12).reduce((sum, m) => sum + m.expense, 0)) / monthly.slice(-24, -12).reduce((sum, m) => sum + m.expense, 0)) * 100 : 0;
  
  let baseRGS = 10;
  if (growth_24mo >= 25) baseRGS = 100;
  else if (growth_24mo >= 15) baseRGS = 80;
  else if (growth_24mo >= 5) baseRGS = 60;
  else if (growth_24mo >= 0) baseRGS = 50;
  else if (growth_24mo >= -5) baseRGS = 40;
  else if (growth_24mo >= -15) baseRGS = 20;
  else baseRGS = 10;
  
  let adjustedRGS = baseRGS;
  if (growth_6mo >= 25) adjustedRGS = clamp(adjustedRGS + 50, 10, 100);
  else if (growth_6mo >= 15) adjustedRGS = clamp(((100 - adjustedRGS) * 0.8) + adjustedRGS, 10, 100);
  else if (growth_6mo >= 5) adjustedRGS = clamp(((100 - adjustedRGS) * 0.6) + adjustedRGS, 10, 100);
  else if (growth_6mo >= 0) adjustedRGS = clamp(((100 - adjustedRGS) * 0.4) + adjustedRGS, 10, 100);
  else if (growth_6mo >= -5) adjustedRGS = clamp(adjustedRGS * 0.9, 10, 100);
  else if (growth_6mo >= -15) adjustedRGS = clamp(adjustedRGS * 0.7, 10, 100);
  else if (growth_6mo >= -25) adjustedRGS = clamp(adjustedRGS * 0.5, 10, 100);
  else adjustedRGS = clamp(adjustedRGS * 0.3, 10, 100);
  
  const revExpSpread = growth_24mo - expGrowth_24mo;
  let expenseAdjustment = 0;
  if (revExpSpread > 10) expenseAdjustment = 30;
  else if (revExpSpread >= 0 && revExpSpread <= 10) expenseAdjustment = 10;
  else if (revExpSpread >= -5 && revExpSpread < 0) expenseAdjustment = -10;
  else if (revExpSpread < -5) expenseAdjustment = -30;
  
  const profitabilityScore = clamp(adjustedRGS + expenseAdjustment, 10, 100);
  
  const alr1 = monthly.length > 0 ? monthly[monthly.length - 1].totalAssets / monthly[monthly.length - 1].totalLiab : 0;
  const alr13 = monthly.length >= 13 ? monthly[monthly.length - 13].totalAssets / monthly[monthly.length - 13].totalLiab : 0;
  const alrGrowth = alr13 !== 0 ? ((alr1 - alr13) / alr13) * 100 : 0;
  
  let adsBase = 10;
  if (alr1 >= 1.5) adsBase = 100;
  else if (alr1 >= 1.2) adsBase = 90;
  else if (alr1 >= 0.8) adsBase = 70;
  else if (alr1 >= 0.6) adsBase = 50;
  else if (alr1 >= 0.4) adsBase = 30;
  else adsBase = 10;
  
  let adsAdj = 0;
  if (alrGrowth >= 50) adsAdj = 20;
  else if (alrGrowth >= 30) adsAdj = 15;
  else if (alrGrowth >= 15) adsAdj = 10;
  else if (alrGrowth >= 5) adsAdj = 5;
  else if (alrGrowth >= -5) adsAdj = 0;
  else if (alrGrowth >= -15) adsAdj = -5;
  else if (alrGrowth >= -30) adsAdj = -10;
  else if (alrGrowth >= -50) adsAdj = -15;
  else adsAdj = -20;
  
  const assetDevScore = clamp(adsBase + adsAdj, 10, 100);
  const finalScore = (profitabilityScore + assetDevScore) / 2;

  // Trend data
  const trendData = useMemo(() => {
    if (monthly.length < 13) return [];
    const trends: any[] = [];
    
    for (let i = 12; i < monthly.length; i++) {
      const window = monthly.slice(i - 11, i + 1);
      const ltmR = window.reduce((s, m) => s + m.revenue, 0);
      const ltmE = window.reduce((s, m) => s + m.expense, 0);
      const prev12R = i >= 23 ? monthly.slice(i - 23, i - 11).reduce((s, m) => s + m.revenue, 0) : 0;
      const prev12E = i >= 23 ? monthly.slice(i - 23, i - 11).reduce((s, m) => s + m.revenue, 0) : 0;
      const g24 = prev12R > 0 ? ((ltmR - prev12R) / prev12R) * 100 : 0;
      const gE24 = prev12E > 0 ? ((ltmE - prev12E) / prev12E) * 100 : 0;
      const recent6R = window.slice(-6).reduce((s, m) => s + m.revenue, 0);
      const prior6R = window.slice(0, 6).reduce((s, m) => s + m.revenue, 0);
      const g6 = prior6R > 0 ? ((recent6R - prior6R) / prior6R) * 100 : 0;
      
      let bRGS = 10;
      if (g24 >= 25) bRGS = 100;
      else if (g24 >= 15) bRGS = 80;
      else if (g24 >= 5) bRGS = 60;
      else if (g24 >= 0) bRGS = 50;
      else if (g24 >= -5) bRGS = 40;
      else if (g24 >= -15) bRGS = 20;
      else bRGS = 10;
      
      let aRGS = bRGS;
      if (g6 >= 25) aRGS = clamp(aRGS + 50, 10, 100);
      else if (g6 >= 15) aRGS = clamp(((100 - aRGS) * 0.8) + aRGS, 10, 100);
      else if (g6 >= 5) aRGS = clamp(((100 - aRGS) * 0.6) + aRGS, 10, 100);
      else if (g6 >= 0) aRGS = clamp(((100 - aRGS) * 0.4) + aRGS, 10, 100);
      else if (g6 >= -5) aRGS = clamp(aRGS * 0.9, 10, 100);
      else if (g6 >= -15) aRGS = clamp(aRGS * 0.7, 10, 100);
      else if (g6 >= -25) aRGS = clamp(aRGS * 0.5, 10, 100);
      else aRGS = clamp(aRGS * 0.3, 10, 100);
      
      const spread = g24 - gE24;
      let eAdj = 0;
      if (spread > 10) eAdj = 30;
      else if (spread >= 0 && spread <= 10) eAdj = 10;
      else if (spread >= -5 && spread < 0) eAdj = -10;
      else if (spread < -5) eAdj = -30;
      
      const pScore = clamp(aRGS + eAdj, 10, 100);
      
      const alr1Val = monthly[i].totalAssets / monthly[i].totalLiab;
      const alr13Val = i >= 12 ? monthly[i - 12].totalAssets / monthly[i - 12].totalLiab : 0;
      const alrGrowthVal = alr13Val !== 0 ? ((alr1Val - alr13Val) / alr13Val) * 100 : 0;
      
      let adsB = 10;
      if (alr1Val >= 1.5) adsB = 100;
      else if (alr1Val >= 1.2) adsB = 90;
      else if (alr1Val >= 0.8) adsB = 70;
      else if (alr1Val >= 0.6) adsB = 50;
      else if (alr1Val >= 0.4) adsB = 30;
      else adsB = 10;
      
      let adsA = 0;
      if (alrGrowthVal >= 50) adsA = 20;
      else if (alrGrowthVal >= 30) adsA = 15;
      else if (alrGrowthVal >= 15) adsA = 10;
      else if (alrGrowthVal >= 5) adsA = 5;
      else if (alrGrowthVal >= -5) adsA = 0;
      else if (alrGrowthVal >= -15) adsA = -5;
      else if (alrGrowthVal >= -30) adsA = -10;
      else if (alrGrowthVal >= -50) adsA = -15;
      else adsA = -20;
      
      const aScore = clamp(adsB + adsA, 10, 100);
      const fScore = (pScore + aScore) / 2;
      
      const cur = monthly[i];
      const currentAssets = cur.cash + cur.ar + cur.inventory + cur.otherCA || cur.tca;
      const currentLiab = cur.ap + cur.otherCL || cur.tcl;
      const quickAssets = cur.cash + cur.ar;
      
      const currentRatio = currentLiab > 0 ? currentAssets / currentLiab : 0;
      const quickRatio = currentLiab > 0 ? quickAssets / currentLiab : 0;
      
      const ltmCOGS = window.reduce((s, m) => s + m.expense * 0.6, 0);
      const ltmSales = ltmR;
      const avgInv = (cur.inventory + (i > 0 ? monthly[i-1].inventory : cur.inventory)) / 2;
      const invTurnover = avgInv > 0 ? ltmCOGS / avgInv : 0;
      
      const avgAR = (cur.ar + (i > 0 ? monthly[i-1].ar : cur.ar)) / 2;
      const arTurnover = avgAR > 0 ? ltmSales / avgAR : 0;
      
      const avgAP = (cur.ap + (i > 0 ? monthly[i-1].ap : cur.ap)) / 2;
      const apTurnover = avgAP > 0 ? ltmCOGS / avgAP : 0;
      
      const daysInv = invTurnover > 0 ? 365 / invTurnover : 0;
      const daysAR = arTurnover > 0 ? 365 / arTurnover : 0;
      const daysAP = apTurnover > 0 ? 365 / apTurnover : 0;
      
      const workingCap = currentAssets - currentLiab;
      const salesWC = workingCap !== 0 ? ltmSales / workingCap : 0;
      
      const ltmInterest = ltmE * 0.05;
      const ltmEBIT = ltmR - ltmE;
      const interestCov = ltmInterest > 0 ? ltmEBIT / ltmInterest : 0;
      
      const ltmDebtSvc = cur.ltd * 0.1 + ltmInterest;
      const debtSvcCov = ltmDebtSvc > 0 ? ltmEBIT / ltmDebtSvc : 0;
      
      const cfToDebt = cur.ltd > 0 ? ltmEBIT / cur.ltd : 0;
      
      const debtToNW = cur.totalEquity > 0 ? cur.totalLiab / cur.totalEquity : 0;
      const fixedToNW = cur.totalEquity > 0 ? cur.fixedAssets / cur.totalEquity : 0;
      const leverage = cur.totalEquity > 0 ? cur.totalAssets / cur.totalEquity : 0;
      
      const totalAssetTO = cur.totalAssets > 0 ? ltmSales / cur.totalAssets : 0;
      const roe = cur.totalEquity > 0 ? (ltmR - ltmE) / cur.totalEquity : 0;
      const roa = cur.totalAssets > 0 ? (ltmR - ltmE) / cur.totalAssets : 0;
      const ebitdaMargin = ltmR > 0 ? (ltmEBIT + ltmE * 0.05) / ltmR : 0;
      const ebitMargin = ltmR > 0 ? ltmEBIT / ltmR : 0;
      
      trends.push({
        month: cur.month,
        rgs: bRGS,
        rgsAdj: aRGS,
        expenseAdj: eAdj,
        profitabilityScore: pScore,
        alr1: alr1Val,
        alr13: alr13Val,
        alrGrowth: alrGrowthVal,
        adsScore: aScore,
        financialScore: fScore,
        currentRatio,
        quickRatio,
        invTurnover,
        arTurnover,
        apTurnover,
        daysInv,
        daysAR,
        daysAP,
        salesWC,
        interestCov,
        debtSvcCov,
        cfToDebt,
        debtToNW,
        fixedToNW,
        leverage,
        totalAssetTO,
        roe,
        roa,
        ebitdaMargin,
        ebitMargin
      });
    }
    
    return trends;
  }, [monthly]);

  // MD&A Analysis
  const mdaAnalysis = useMemo(() => {
    if (!trendData || trendData.length === 0) return { strengths: [], weaknesses: [], insights: [] };
    
    const last = trendData[trendData.length - 1];
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const insights: string[] = [];
    
    if (finalScore >= 70) strengths.push(`Strong overall financial score of ${finalScore.toFixed(1)}, indicating robust financial health.`);
    else if (finalScore < 50) weaknesses.push(`Financial score of ${finalScore.toFixed(1)} suggests significant areas for improvement.`);
    
    if (profitabilityScore >= 70) strengths.push(`Profitability score of ${profitabilityScore.toFixed(1)} demonstrates solid revenue growth and expense management.`);
    else if (profitabilityScore < 50) weaknesses.push(`Profitability score of ${profitabilityScore.toFixed(1)} indicates challenges in revenue growth or expense control.`);
    
    if (growth_24mo > 10) strengths.push(`24-month revenue growth of ${growth_24mo.toFixed(1)}% shows strong market expansion.`);
    else if (growth_24mo < 0) weaknesses.push(`Negative 24-month revenue growth of ${growth_24mo.toFixed(1)}% requires immediate strategic attention.`);
    
    if (expenseAdjustment > 0) strengths.push(`Expense management is outperforming revenue growth by ${revExpSpread.toFixed(1)}%, adding ${expenseAdjustment} points to profitability.`);
    else if (expenseAdjustment < 0) weaknesses.push(`Expenses are growing faster than revenue by ${Math.abs(revExpSpread).toFixed(1)}%, reducing profitability by ${Math.abs(expenseAdjustment)} points.`);
    
    if (assetDevScore >= 70) strengths.push(`Asset Development Score of ${assetDevScore.toFixed(1)} reflects a healthy asset-to-liability ratio and positive asset growth.`);
    else if (assetDevScore < 50) weaknesses.push(`Asset Development Score of ${assetDevScore.toFixed(1)} suggests concerning leverage and asset composition.`);
    
    if (last.currentRatio >= 1.5) strengths.push(`Current ratio of ${last.currentRatio.toFixed(2)} indicates strong short-term liquidity.`);
    else if (last.currentRatio < 1.0) weaknesses.push(`Current ratio of ${last.currentRatio.toFixed(2)} may indicate potential liquidity challenges.`);
    
    if (last.roe > 0.15) strengths.push(`Return on Equity of ${(last.roe * 100).toFixed(1)}% demonstrates efficient use of shareholder capital.`);
    else if (last.roe < 0) weaknesses.push(`Negative Return on Equity of ${(last.roe * 100).toFixed(1)}% indicates losses relative to equity.`);
    
    // KPI Analysis
    if (last.quickRatio >= 1.0) strengths.push(`Quick ratio of ${last.quickRatio.toFixed(2)} shows strong ability to meet short-term obligations without relying on inventory.`);
    else if (last.quickRatio < 0.5) weaknesses.push(`Quick ratio of ${last.quickRatio.toFixed(2)} suggests potential cash flow challenges.`);
    
    if (last.debtToNW < 1.0) strengths.push(`Debt-to-Net Worth ratio of ${last.debtToNW.toFixed(2)} indicates conservative leverage and strong equity position.`);
    else if (last.debtToNW > 2.0) weaknesses.push(`Debt-to-Net Worth ratio of ${last.debtToNW.toFixed(2)} suggests high leverage that may limit financial flexibility.`);
    
    if (last.interestCov > 3.0) strengths.push(`Interest coverage ratio of ${last.interestCov.toFixed(2)} demonstrates strong ability to service debt obligations.`);
    else if (last.interestCov < 1.5) weaknesses.push(`Interest coverage of ${last.interestCov.toFixed(2)} indicates potential difficulty meeting interest payments.`);
    
    // Projection Analysis - Calculate inline to avoid circular dependency
    if (monthly.length >= 24) {
      // Calculate simple revenue projection
      const last12Months = monthly.slice(-12);
      const prior12Months = monthly.slice(-24, -12);
      const recentRevGrowth = ((last12Months.reduce((s, m) => s + m.revenue, 0) - prior12Months.reduce((s, m) => s + m.revenue, 0)) / prior12Months.reduce((s, m) => s + m.revenue, 0)) * 100;
      
      if (recentRevGrowth > 10) insights.push(`Based on 12-month trends, revenue shows ${recentRevGrowth.toFixed(1)}% growth trajectory with strong expansion potential.`);
      else if (recentRevGrowth < -5) insights.push(`Revenue trends indicate ${Math.abs(recentRevGrowth).toFixed(1)}% decline trajectory - proactive measures recommended.`);
      
      // Equity trend analysis
      const currentEquity = monthly[monthly.length - 1].totalEquity;
      const priorEquity = monthly[monthly.length - 13] ? monthly[monthly.length - 13].totalEquity : currentEquity;
      const equityChange = ((currentEquity - priorEquity) / Math.abs(priorEquity)) * 100;
      
      if (equityChange > 10) insights.push(`Equity has strengthened by ${equityChange.toFixed(1)}% over the past year, improving financial stability.`);
      else if (equityChange < -10) weaknesses.push(`Equity has declined by ${Math.abs(equityChange).toFixed(1)}% - monitor profitability and cash management closely.`);
    }
    
    // Trend Analysis Insights
    if (monthly.length >= 24) {
      const recentRevTrend = trendData.slice(-6).map(t => t.rgs).reduce((a, b) => a + b, 0) / 6;
      const priorRevTrend = trendData.slice(-12, -6).map(t => t.rgs).reduce((a, b) => a + b, 0) / 6;
      
      if (recentRevTrend > priorRevTrend + 10) strengths.push(`Revenue growth momentum is accelerating in recent months, indicating improving market position.`);
      else if (recentRevTrend < priorRevTrend - 10) weaknesses.push(`Revenue growth momentum is decelerating - review sales strategies and market positioning.`);
    }
    
    insights.push(`Monitor the trend in Financial Score over time to identify patterns and early warning signs.`);
    insights.push(`Focus on the components with the lowest scores for targeted improvement initiatives.`);
    if (growth_6mo < growth_24mo) insights.push(`Recent 6-month growth (${growth_6mo.toFixed(1)}%) is slower than 24-month trend, suggesting momentum is slowing.`);
    else if (growth_6mo > growth_24mo) insights.push(`Recent 6-month growth (${growth_6mo.toFixed(1)}%) exceeds 24-month trend, indicating accelerating momentum.`);
    
    return { strengths, weaknesses, insights };
  }, [trendData, finalScore, profitabilityScore, assetDevScore, growth_24mo, growth_6mo, expenseAdjustment, revExpSpread, ltmRev, ltmExp, monthly]);

  // Projections
  const projections = useMemo(() => {
    if (monthly.length < 24) return { mostLikely: [], bestCase: [], worstCase: [] };
    
    const last12 = monthly.slice(-12);
    const prev12 = monthly.slice(-24, -12);
    const avgRevGrowth = ((last12.reduce((s, m) => s + m.revenue, 0) - prev12.reduce((s, m) => s + m.revenue, 0)) / prev12.reduce((s, m) => s + m.revenue, 0)) / 12;
    const avgExpGrowth = ((last12.reduce((s, m) => s + m.expense, 0) - prev12.reduce((s, m) => s + m.expense, 0)) / prev12.reduce((s, m) => s + m.expense, 0)) / 12;
    const avgAssetGrowth = ((last12[last12.length - 1].totalAssets - prev12[prev12.length - 1].totalAssets) / prev12[prev12.length - 1].totalAssets) / 12;
    const avgLiabGrowth = ((last12[last12.length - 1].totalLiab - prev12[prev12.length - 1].totalLiab) / prev12[prev12.length - 1].totalLiab) / 12;
    
    const lastMonth = monthly[monthly.length - 1];
    const mostLikely: any[] = [];
    const bestCase: any[] = [];
    const worstCase: any[] = [];
    
    for (let i = 1; i <= 12; i++) {
      const monthName = `+${i}mo`;
      
      const mlRev = lastMonth.revenue * Math.pow(1 + avgRevGrowth, i);
      const mlExp = lastMonth.expense * Math.pow(1 + avgExpGrowth, i);
      const mlAssets = lastMonth.totalAssets * Math.pow(1 + avgAssetGrowth, i);
      const mlLiab = lastMonth.totalLiab * Math.pow(1 + avgLiabGrowth, i);
      const mlEquity = mlAssets - mlLiab;
      
      mostLikely.push({
        month: monthName,
        revenue: mlRev,
        expense: mlExp,
        netIncome: mlRev - mlExp,
        totalAssets: mlAssets,
        totalLiab: mlLiab,
        equity: mlEquity
      });
      
      const bcRev = lastMonth.revenue * Math.pow(1 + avgRevGrowth * bestCaseRevMultiplier, i);
      const bcExp = lastMonth.expense * Math.pow(1 + avgExpGrowth * bestCaseExpMultiplier, i);
      const bcAssets = lastMonth.totalAssets * Math.pow(1 + avgAssetGrowth * 1.2, i);
      const bcLiab = lastMonth.totalLiab * Math.pow(1 + avgLiabGrowth * 0.8, i);
      const bcEquity = bcAssets - bcLiab;
      
      bestCase.push({
        month: monthName,
        revenue: bcRev,
        expense: bcExp,
        netIncome: bcRev - bcExp,
        totalAssets: bcAssets,
        totalLiab: bcLiab,
        equity: bcEquity
      });
      
      const wcRev = lastMonth.revenue * Math.pow(1 + avgRevGrowth * worstCaseRevMultiplier, i);
      const wcExp = lastMonth.expense * Math.pow(1 + avgExpGrowth * worstCaseExpMultiplier, i);
      const wcAssets = lastMonth.totalAssets * Math.pow(1 + avgAssetGrowth * 0.8, i);
      const wcLiab = lastMonth.totalLiab * Math.pow(1 + avgLiabGrowth * 1.2, i);
      const wcEquity = wcAssets - wcLiab;
      
      worstCase.push({
        month: monthName,
        revenue: wcRev,
        expense: wcExp,
        netIncome: wcRev - wcExp,
        totalAssets: wcAssets,
        totalLiab: wcLiab,
        equity: wcEquity
      });
    }
    
    return { mostLikely, bestCase, worstCase };
  }, [monthly, bestCaseRevMultiplier, bestCaseExpMultiplier, worstCaseRevMultiplier, worstCaseExpMultiplier]);

  const renderColumnSelector = (label: string, mappingKey: keyof Mappings) => (
    <div style={{ marginBottom: '15px' }}>
      <label style={{ display: 'block', fontWeight: '500', marginBottom: '5px', color: '#475569' }}>{label}:</label>
      <select value={mapping[mappingKey] || ''} onChange={(e) => setMapping({ ...mapping, [mappingKey]: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}>
        <option value="">-- Select --</option>
        {columns.map(col => <option key={col} value={col}>{col}</option>)}
      </select>
    </div>
  );

  const saveProjectionDefaults = () => {
    const defaults = {
      bestCaseRev: bestCaseRevMultiplier,
      bestCaseExp: bestCaseExpMultiplier,
      worstCaseRev: worstCaseRevMultiplier,
      worstCaseExp: worstCaseExpMultiplier
    };
    localStorage.setItem('fs_projectionDefaults', JSON.stringify(defaults));
    setDefaultBestCaseRevMult(bestCaseRevMultiplier);
    setDefaultBestCaseExpMult(bestCaseExpMultiplier);
    setDefaultWorstCaseRevMult(worstCaseRevMultiplier);
    setDefaultWorstCaseExpMult(worstCaseExpMultiplier);
    alert('Defaults saved successfully!');
    setShowDefaultSettings(false);
  };

  // LOGIN VIEW
  if (!isLoggedIn) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '40px 20px' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', background: 'white', borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', padding: '40px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '48px', fontWeight: '700', color: '#667eea', marginBottom: '16px', letterSpacing: '-1px' }}>
              Venturis<sup style={{ fontSize: '18px', fontWeight: '400' }}>TM</sup>
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>Business Evaluation Tool</h1>
            <p style={{ color: '#64748b', fontSize: '14px' }}>Professional financial analysis for consultants and businesses</p>
          </div>

          {loginError && (
            <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', border: '1px solid #fecaca' }}>
              {loginError}
            </div>
          )}

          {isRegistering ? (
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '24px' }}>Register as Consultant</h2>
              <input type="text" placeholder="Full Name" value={loginName} onChange={(e) => setLoginName(e.target.value)} style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              <input type="email" placeholder="Email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              <input type="password" placeholder="Password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} style={{ width: '100%', padding: '12px 16px', marginBottom: '24px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              <button onClick={handleRegisterConsultant} style={{ width: '100%', padding: '14px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginBottom: '12px' }}>Register</button>
              <button onClick={() => { setIsRegistering(false); setLoginError(''); }} style={{ width: '100%', padding: '14px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Back to Login</button>
            </div>
          ) : (
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '24px' }}>Sign In</h2>
              <input type="email" placeholder="Email" value={loginEmail} onChange={(e) => { setLoginEmail(e.target.value); setLoginError(''); }} style={{ width: '100%', padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              <input type="password" placeholder="Password" value={loginPassword} onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} style={{ width: '100%', padding: '12px 16px', marginBottom: '24px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              <button onClick={handleLogin} style={{ width: '100%', padding: '14px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginBottom: '16px' }}>Sign In</button>
              <button onClick={() => { setIsRegistering(true); setLoginError(''); }} style={{ width: '100%', padding: '14px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Register as Consultant</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main Logged-In View with Header
  const company = getCurrentCompany();
  const companyName = company ? company.name : '';

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      {/* Header - Different for Site Admin */}
      {currentUser?.role === 'siteadmin' ? (
        <header style={{ background: 'white', borderBottom: '2px solid #e2e8f0', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '80px' }}>
            <div 
              style={{ fontSize: '28px', fontWeight: '700', color: '#4338ca', cursor: 'pointer', letterSpacing: '-0.5px' }} 
              onClick={() => setCurrentView('siteadmin')}
            >
              Venturis<sup style={{ fontSize: '12px', fontWeight: '400' }}>TM</sup>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b' }}>Site Administration</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '14px', color: '#64748b' }}>{currentUser?.name}</span>
            <button onClick={handleLogout} style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Logout</button>
          </div>
        </header>
      ) : (
        <header style={{ background: 'white', borderBottom: '2px solid #e2e8f0', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '80px' }}>
            <div 
              style={{ fontSize: '28px', fontWeight: '700', color: '#4338ca', cursor: 'pointer', letterSpacing: '-0.5px' }} 
              onClick={() => currentUser?.role === 'consultant' ? setCurrentView('admin') : setCurrentView('upload')}
            >
              Venturis<sup style={{ fontSize: '12px', fontWeight: '400' }}>TM</sup>
            </div>
            <nav style={{ display: 'flex', gap: '24px' }}>
              <button onClick={() => setCurrentView('upload')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'upload' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'upload' ? '3px solid #667eea' : '3px solid transparent' }}>Import Financials</button>
              <button onClick={() => setCurrentView('trend-analysis')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'trend-analysis' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'trend-analysis' ? '3px solid #667eea' : '3px solid transparent' }}>Trend Analysis</button>
              <button onClick={() => setCurrentView('kpis')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'kpis' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'kpis' ? '3px solid #667eea' : '3px solid transparent' }}>KPI Dashboard</button>
              <button onClick={() => setCurrentView('projections')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'projections' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'projections' ? '3px solid #667eea' : '3px solid transparent' }}>Projections</button>
              <button onClick={() => setCurrentView('working-capital')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'working-capital' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'working-capital' ? '3px solid #667eea' : '3px solid transparent' }}>Working Capital</button>
              <button onClick={() => setCurrentView('valuation')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'valuation' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'valuation' ? '3px solid #667eea' : '3px solid transparent' }}>Valuation</button>
              <button onClick={() => setCurrentView('cash-flow')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'cash-flow' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'cash-flow' ? '3px solid #667eea' : '3px solid transparent' }}>Cash Flow</button>
              <button onClick={() => setCurrentView('mda')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'mda' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'mda' ? '3px solid #667eea' : '3px solid transparent' }}>MD&A</button>
              {currentUser?.role === 'consultant' && (
                <button onClick={() => setCurrentView('profile')} style={{ background: 'none', border: 'none', fontSize: '16px', fontWeight: '600', color: currentView === 'profile' ? '#667eea' : '#64748b', cursor: 'pointer', padding: '8px 12px', borderBottom: currentView === 'profile' ? '3px solid #667eea' : '3px solid transparent' }}>Profile</button>
              )}
            </nav>
          </div>
        </header>
      )}

      {/* Main Content Area with Sidebar */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Navigation Sidebar - Not for Site Admin */}
        {currentUser?.role !== 'siteadmin' && (
        <aside style={{ 
          width: '280px', 
          background: 'white', 
          borderRight: '2px solid #e2e8f0', 
          padding: '24px 0',
          overflowY: 'auto',
          flexShrink: 0,
          boxShadow: '2px 0 8px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* User Info and Logout at Top */}
          <div style={{ padding: '0 24px 24px', borderBottom: '2px solid #e2e8f0' }}>
            {companyName && (
              <div style={{ marginBottom: '12px', padding: '12px', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#0c4a6e', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Company</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e40af' }}>{companyName}</div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Logged In As</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#475569' }}>{currentUser?.name}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{currentUser?.email}</div>
              </div>
              <button 
                onClick={handleLogout} 
                style={{ 
                  padding: '8px 16px', 
                  background: '#ef4444', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '6px', 
                  fontSize: '13px', 
                  fontWeight: '600', 
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#ef4444'}
              >
                Logout
              </button>
            </div>
          </div>
          
          <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: '24px' }}>
            {/* Financial Score Section */}
            <div style={{ marginBottom: '24px' }}>
              <h3 
                onClick={() => setIsFinancialScoreExpanded(!isFinancialScoreExpanded)}
                style={{ 
                  fontSize: '14px', 
                  fontWeight: '700', 
                  color: '#1e293b',
                  textTransform: 'uppercase', 
                  letterSpacing: '0.5px',
                  padding: '8px 24px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#667eea'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#1e293b'}
              >
                <span>Financial Score</span>
                <span style={{ fontSize: '12px', color: '#667eea' }}>{isFinancialScoreExpanded ? '-' : '+'}</span>
              </h3>
              {isFinancialScoreExpanded && (
                <div style={{ paddingLeft: '28px' }}>
                  <div
                    onClick={() => setCurrentView('fs-intro')}
                    style={{
                      fontSize: '14px',
                      color: currentView === 'fs-intro' ? '#667eea' : '#475569',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      marginBottom: '4px',
                      background: currentView === 'fs-intro' ? '#ede9fe' : 'transparent',
                      fontWeight: currentView === 'fs-intro' ? '600' : '400',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (currentView !== 'fs-intro') {
                        e.currentTarget.style.background = '#f8fafc';
                        e.currentTarget.style.color = '#667eea';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentView !== 'fs-intro') {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#475569';
                      }
                    }}
                  >
                    {currentView === 'fs-intro' && '• '}Introduction
                  </div>
                  <div
                    onClick={() => setCurrentView('fs-score')}
                    style={{
                      fontSize: '14px',
                      color: currentView === 'fs-score' ? '#667eea' : '#475569',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      marginBottom: '4px',
                      background: currentView === 'fs-score' ? '#ede9fe' : 'transparent',
                      fontWeight: currentView === 'fs-score' ? '600' : '400',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (currentView !== 'fs-score') {
                        e.currentTarget.style.background = '#f8fafc';
                        e.currentTarget.style.color = '#667eea';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentView !== 'fs-score') {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#475569';
                      }
                    }}
                  >
                    {currentView === 'fs-score' && '• '}Financial Score
                  </div>
                </div>
              )}
            </div>

            {/* Management Assessment Section - For Assessment Users and Consultants */}
            {((currentUser?.role === 'user' && currentUser?.userType === 'assessment') || currentUser?.role === 'consultant') && (
            <div style={{ marginBottom: '24px' }}>
              <h3 
                onClick={() => setIsManagementAssessmentExpanded(!isManagementAssessmentExpanded)}
                style={{ 
                  fontSize: '14px', 
                  fontWeight: '700', 
                  color: '#1e293b',
                  textTransform: 'uppercase', 
                  letterSpacing: '0.5px',
                  padding: '8px 24px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#667eea'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#1e293b'}
              >
                <span>Management Assessment</span>
                <span style={{ fontSize: '12px', color: '#667eea' }}>{isManagementAssessmentExpanded ? '-' : '+'}</span>
              </h3>
              {isManagementAssessmentExpanded && (
                <div style={{ paddingLeft: '28px' }}>
                <div
                  onClick={() => setCurrentView('ma-welcome')}
                  style={{
                    fontSize: '14px',
                    color: currentView === 'ma-welcome' ? '#667eea' : '#475569',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    marginBottom: '4px',
                    background: currentView === 'ma-welcome' ? '#ede9fe' : 'transparent',
                    fontWeight: currentView === 'ma-welcome' ? '600' : '400',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (currentView !== 'ma-welcome') {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.color = '#667eea';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentView !== 'ma-welcome') {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#475569';
                    }
                  }}
                >
                  {currentView === 'ma-welcome' && '• '}Welcome
                </div>
                <div
                  onClick={() => setCurrentView('ma-questionnaire')}
                  style={{
                    fontSize: '14px',
                    color: currentView === 'ma-questionnaire' ? '#667eea' : '#475569',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    marginBottom: '4px',
                    background: currentView === 'ma-questionnaire' ? '#ede9fe' : 'transparent',
                    fontWeight: currentView === 'ma-questionnaire' ? '600' : '400',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (currentView !== 'ma-questionnaire') {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.color = '#667eea';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentView !== 'ma-questionnaire') {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#475569';
                    }
                  }}
                >
                  {currentView === 'ma-questionnaire' && '• '}Questionnaire
                </div>
                <div
                  onClick={() => setCurrentView('ma-your-results')}
                  style={{
                    fontSize: '14px',
                    color: currentView === 'ma-your-results' ? '#667eea' : '#475569',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    marginBottom: '4px',
                    background: currentView === 'ma-your-results' ? '#ede9fe' : 'transparent',
                    fontWeight: currentView === 'ma-your-results' ? '600' : '400',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (currentView !== 'ma-your-results') {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.color = '#667eea';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentView !== 'ma-your-results') {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#475569';
                    }
                  }}
                >
                  {currentView === 'ma-your-results' && '• '}{currentUser?.role === 'consultant' ? 'Results' : 'Your Results'}
                </div>
                <div
                  onClick={() => setCurrentView('ma-scores-summary')}
                  style={{
                    fontSize: '14px',
                    color: currentView === 'ma-scores-summary' ? '#667eea' : '#475569',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    marginBottom: '4px',
                    background: currentView === 'ma-scores-summary' ? '#ede9fe' : 'transparent',
                    fontWeight: currentView === 'ma-scores-summary' ? '600' : '400',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (currentView !== 'ma-scores-summary') {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.color = '#667eea';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentView !== 'ma-scores-summary') {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#475569';
                    }
                  }}
                >
                  {currentView === 'ma-scores-summary' && '• '}Scores Summary
                </div>
                <div
                  onClick={() => setCurrentView('ma-scoring-guide')}
                  style={{
                    fontSize: '14px',
                    color: currentView === 'ma-scoring-guide' ? '#667eea' : '#475569',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    marginBottom: '4px',
                    background: currentView === 'ma-scoring-guide' ? '#ede9fe' : 'transparent',
                    fontWeight: currentView === 'ma-scoring-guide' ? '600' : '400',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (currentView !== 'ma-scoring-guide') {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.color = '#667eea';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentView !== 'ma-scoring-guide') {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#475569';
                    }
                  }}
                >
                  {currentView === 'ma-scoring-guide' && '• '}Scoring Guide
                </div>
                <div
                  onClick={() => setCurrentView('ma-charts')}
                  style={{
                    fontSize: '14px',
                    color: currentView === 'ma-charts' ? '#667eea' : '#475569',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    marginBottom: '4px',
                    background: currentView === 'ma-charts' ? '#ede9fe' : 'transparent',
                    fontWeight: currentView === 'ma-charts' ? '600' : '400',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (currentView !== 'ma-charts') {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.color = '#667eea';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentView !== 'ma-charts') {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#475569';
                    }
                  }}
                >
                  {currentView === 'ma-charts' && '• '}Charts
                </div>
              </div>
              )}
            </div>
            )}

            {/* Consultant Dashboard Section */}
            {currentUser?.role === 'consultant' && (
              <div style={{ marginBottom: '24px' }}>
                <h3 
                  onClick={() => setCurrentView('admin')}
                  style={{ 
                    fontSize: '14px', 
                    fontWeight: '700', 
                    color: currentView === 'admin' ? '#667eea' : '#1e293b',
                    textTransform: 'uppercase', 
                    letterSpacing: '0.5px',
                    padding: '8px 24px',
                    marginBottom: '8px',
                    cursor: 'pointer',
                    transition: 'color 0.2s',
                    borderLeft: currentView === 'admin' ? '4px solid #667eea' : '4px solid transparent'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#667eea'}
                  onMouseLeave={(e) => e.currentTarget.style.color = currentView === 'admin' ? '#667eea' : '#1e293b'}
                >
                  Consultant Dashboard
                </h3>
                <div style={{ paddingLeft: '28px' }}>
                  {/* List of Companies */}
                  {companies.filter(c => c.consultantEmail === currentUser.email).length > 0 ? (
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', padding: '4px 0' }}>
                        My Companies
                      </div>
                      {companies.filter(c => c.consultantEmail === currentUser.email).map(comp => (
                        <div
                          key={comp.id}
                          onClick={() => handleSelectCompany(comp.id)}
                          style={{
                            fontSize: '14px',
                            color: selectedCompanyId === comp.id ? '#667eea' : '#475569',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderRadius: '6px',
                            marginBottom: '4px',
                            background: selectedCompanyId === comp.id ? '#ede9fe' : 'transparent',
                            fontWeight: selectedCompanyId === comp.id ? '600' : '400',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (selectedCompanyId !== comp.id) {
                              e.currentTarget.style.background = '#f8fafc';
                              e.currentTarget.style.color = '#667eea';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (selectedCompanyId !== comp.id) {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.color = '#475569';
                            }
                          }}
                        >
                          {selectedCompanyId === comp.id && '• '}{comp.name}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: '#94a3b8', padding: '8px 0', fontStyle: 'italic' }}>
                      No companies yet
                    </div>
                  )}
                </div>
              </div>
            )}
          </nav>
        </aside>
        )}

        {/* Main Content Area */}
        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {/* Site Administration */}
          {currentView === 'siteadmin' && currentUser?.role === 'siteadmin' && (
            <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '32px' }}>
              <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Site Administration</h1>
              
              {/* Add Consultant Form */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>Add New Consultant</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                  <input
                    type="text"
                    placeholder="Consultant Type"
                    value={newConsultantType}
                    onChange={(e) => setNewConsultantType(e.target.value)}
                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                  />
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={newConsultantFullName}
                    onChange={(e) => setNewConsultantFullName(e.target.value)}
                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                  />
                  <input
                    type="text"
                    placeholder="Address"
                    value={newConsultantAddress}
                    onChange={(e) => setNewConsultantAddress(e.target.value)}
                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                  />
                  <input
                    type="email"
                    placeholder="Email Address"
                    value={newConsultantEmail}
                    onChange={(e) => setNewConsultantEmail(e.target.value)}
                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                  />
                  <input
                    type="tel"
                    placeholder="Phone Number"
                    value={newConsultantPhone}
                    onChange={(e) => setNewConsultantPhone(e.target.value)}
                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={newConsultantPassword}
                    onChange={(e) => setNewConsultantPassword(e.target.value)}
                    style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                  />
                </div>
                <button
                  onClick={addConsultant}
                  style={{ padding: '12px 32px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Add Consultant
                </button>
              </div>

              {/* Consultants List */}
              <div style={{ fontSize: '20px', fontWeight: '600', color: '#64748b', marginBottom: '16px' }}>
                Total Consultants: {consultants.length}
              </div>

              {consultants.length === 0 ? (
                <div style={{ background: 'white', borderRadius: '12px', padding: '60px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>No Consultants</h3>
                  <p style={{ fontSize: '14px', color: '#94a3b8' }}>Add your first consultant to get started</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '24px' }}>
                  {consultants.map((consultant) => {
                    const consultantCompanies = getConsultantCompanies(consultant.id);
                    const expanded = selectedConsultantId === consultant.id;

                    return (
                      <div key={consultant.id} style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #e2e8f0' }}>
                        {/* Consultant Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                          <div style={{ flex: 1 }}>
                            <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>{consultant.fullName}</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                              <div><span style={{ fontWeight: '600' }}>Type:</span> {consultant.type}</div>
                              <div><span style={{ fontWeight: '600' }}>Email:</span> {consultant.email}</div>
                              <div><span style={{ fontWeight: '600' }}>Address:</span> {consultant.address}</div>
                              <div><span style={{ fontWeight: '600' }}>Phone:</span> {consultant.phone}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                              onClick={() => setSelectedConsultantId(expanded ? '' : consultant.id)}
                              style={{ padding: '8px 16px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                            >
                              {expanded ? 'Collapse' : 'Expand'}
                            </button>
                            <button
                              onClick={() => deleteConsultant(consultant.id)}
                              style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {/* Companies and Users */}
                        {expanded && (
                          <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '16px' }}>
                            <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
                              Companies ({consultantCompanies.length})
                            </h4>
                            
                            {consultantCompanies.length === 0 ? (
                              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '32px', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
                                <p style={{ fontSize: '14px', color: '#64748b' }}>No companies yet</p>
                              </div>
                            ) : (
                              <div style={{ display: 'grid', gap: '16px' }}>
                                {consultantCompanies.map((company) => {
                                  const companyUsers = getCompanyUsers(company.id);
                                  const isCompanyExpanded = expandedCompanyIds.includes(company.id);
                                  
                                  return (
                                    <div key={company.id} style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isCompanyExpanded ? '12px' : '0' }}>
                                        <div style={{ flex: 1 }}>
                                          <h5 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>{company.name}</h5>
                                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                                            <span style={{ fontWeight: '600' }}>Location:</span> {company.location || 'Not set'} | 
                                            <span style={{ fontWeight: '600', marginLeft: '8px' }}>Industry:</span> {company.industrySector || 'Not set'}
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#667eea' }}>
                                            {companyUsers.length} user{companyUsers.length !== 1 ? 's' : ''}
                                          </div>
                                          {companyUsers.length > 0 && (
                                            <button
                                              onClick={() => {
                                                setExpandedCompanyIds(prev => 
                                                  prev.includes(company.id) 
                                                    ? prev.filter(id => id !== company.id)
                                                    : [...prev, company.id]
                                                );
                                              }}
                                              style={{ 
                                                padding: '6px 12px', 
                                                background: isCompanyExpanded ? '#f1f5f9' : '#667eea', 
                                                color: isCompanyExpanded ? '#475569' : 'white', 
                                                border: 'none', 
                                                borderRadius: '6px', 
                                                fontSize: '12px', 
                                                fontWeight: '600', 
                                                cursor: 'pointer' 
                                              }}
                                            >
                                              {isCompanyExpanded ? '▲ Hide' : '▼ Show'} Users
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {/* Users */}
                                      {companyUsers.length > 0 && isCompanyExpanded && (
                                        <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '12px', marginTop: '12px' }}>
                                          <h6 style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>Users:</h6>
                                          <div style={{ display: 'grid', gap: '6px' }}>
                                            {companyUsers.map((user) => (
                                              <div key={user.id} style={{ background: 'white', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{user.name}</div>
                                                  <div style={{ fontSize: '11px', color: '#64748b' }}>{user.email}</div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Admin Dashboard */}
          {currentView === 'admin' && currentUser?.role === 'consultant' && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Consultant Dashboard</h1>
          
          {/* Company Management */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Company Management</h2>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              <input type="text" placeholder="Company Name" value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
              <button onClick={addCompany} style={{ padding: '12px 24px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Add Company</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {companies.filter(c => c.consultantEmail === currentUser.email).map(comp => (
                <div key={comp.id} style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '2px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>{comp.name}</h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setExpandedCompanyInfoId(expandedCompanyInfoId === comp.id ? '' : comp.id)} style={{ padding: '4px 12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
                        {expandedCompanyInfoId === comp.id ? '▲ Collapse' : '▼ Expand'}
                      </button>
                      <button onClick={() => deleteCompany(comp.id)} style={{ padding: '4px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>Delete</button>
                    </div>
                  </div>
                  
                  {expandedCompanyInfoId === comp.id && (
                    <>
                      {/* Company Information */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ background: 'white', borderRadius: '6px', padding: '12px', marginBottom: '8px', border: '1px solid #cbd5e1' }}>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Location: <span style={{ fontWeight: '600', color: '#1e293b' }}>{comp.location || 'Not set'}</span></div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>Industry: <span style={{ fontWeight: '600', color: '#1e293b' }}>{comp.industrySector || 'Not set'}</span></div>
                        </div>
                      </div>
                      
                      <button onClick={() => handleSelectCompany(comp.id)} style={{ width: '100%', padding: '10px', background: selectedCompanyId === comp.id ? '#10b981' : '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '12px' }}>
                        {selectedCompanyId === comp.id ? '✓ Active' : 'Select Company'}
                      </button>
                      
                      {/* Company Users (Management Team) */}
                      <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '12px', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Company Users ({users.filter(u => u.companyId === comp.id && u.userType === 'company').length})</h4>
                    <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>Management team - can view all company pages</p>
                    {users.filter(u => u.companyId === comp.id && u.userType === 'company').map(u => (
                      <div key={u.id} style={{ background: 'white', borderRadius: '6px', padding: '8px 12px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{u.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{u.email}</div>
                        </div>
                        <button onClick={() => deleteUser(u.id)} style={{ padding: '4px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>✕</button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                      <input type="text" placeholder="Name" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                      <input type="email" placeholder="Email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                      <input type="password" placeholder="Password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                      <button onClick={() => addUser(comp.id, 'company')} style={{ padding: '8px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Add Company User</button>
                    </div>
                  </div>
                  
                  {/* Assessment Users */}
                  <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '12px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Assessment Users ({users.filter(u => u.companyId === comp.id && u.userType === 'assessment').length}/5)</h4>
                    <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>Fill out Management Assessment (max 5)</p>
                    {users.filter(u => u.companyId === comp.id && u.userType === 'assessment').map(u => {
                      const hasCompleted = assessmentRecords.some(r => r.userEmail === u.email && r.companyId === comp.id);
                      return (
                        <div key={u.id} style={{ background: 'white', borderRadius: '6px', padding: '8px 12px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{u.name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{u.email}</div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <div style={{ 
                              fontSize: '10px', 
                              fontWeight: '600', 
                              color: hasCompleted ? '#065f46' : '#991b1b',
                              background: hasCompleted ? '#d1fae5' : '#fee2e2',
                              padding: '3px 8px', 
                              borderRadius: '4px' 
                            }}>
                              {hasCompleted ? '✓ Done' : '⚠ Not Started'}
                            </div>
                            <button onClick={() => deleteUser(u.id)} style={{ padding: '4px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                    {users.filter(u => u.companyId === comp.id && u.userType === 'assessment').length < 5 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                        <input type="text" placeholder="Name" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                        <input type="email" placeholder="Email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                        <input type="password" placeholder="Password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                        <button onClick={() => addUser(comp.id, 'assessment')} style={{ padding: '8px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Add Assessment User</button>
                      </div>
                    )}
                    {users.filter(u => u.companyId === comp.id && u.userType === 'assessment').length >= 5 && (
                      <div style={{ padding: '8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px', fontSize: '11px', color: '#92400e', marginTop: '8px' }}>
                        ⚠ Maximum 5 assessment users reached
                      </div>
                    )}
                  </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Company Details Modal */}
      {showCompanyDetailsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '32px', maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px' }}>Company Details</h2>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#475569' }}>Location:</label>
              <input type="text" value={companyLocation} onChange={(e) => setCompanyLocation(e.target.value)} style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} placeholder="e.g. New York, NY" />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#475569' }}>Industry Sector:</label>
              <select 
                value={companyIndustrySector} 
                onChange={(e) => setCompanyIndustrySector(parseInt(e.target.value))} 
                style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', cursor: 'pointer' }}
              >
                <option value="">-- Select Industry --</option>
                {SECTOR_CATEGORIES.map(sector => (
                  <optgroup key={sector.code} label={`${sector.code} - ${sector.name}`}>
                    {INDUSTRY_SECTORS
                      .filter(ind => ind.sectorCode === sector.code)
                      .map(industry => (
                        <option key={industry.id} value={industry.id}>
                          {industry.id} - {industry.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              {companyIndustrySector && INDUSTRY_SECTORS.find(i => i.id === companyIndustrySector) && (
                <div style={{ marginTop: '8px', padding: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px' }}>
                  <p style={{ fontSize: '12px', color: '#0c4a6e', margin: 0 }}>
                    <strong>{INDUSTRY_SECTORS.find(i => i.id === companyIndustrySector)?.name}</strong>
                    <br />
                    <span style={{ fontSize: '11px' }}>{INDUSTRY_SECTORS.find(i => i.id === companyIndustrySector)?.description}</span>
                  </p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={saveCompanyDetails} style={{ flex: 1, padding: '12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Save</button>
              <button onClick={() => setShowCompanyDetailsModal(false)} style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Content Area - Requires Company Selection */}
      {!selectedCompanyId && currentView !== 'admin' && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '64px 32px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>No Company Selected</h2>
          <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '24px' }}>Please select a company from the Admin Dashboard to continue.</p>
          {currentUser?.role === 'consultant' && (
            <button onClick={() => setCurrentView('admin')} style={{ padding: '12px 24px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Go to Admin Dashboard</button>
          )}
        </div>
      )}

      {/* Import Financials View */}
      {currentView === 'upload' && selectedCompanyId && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Import Financials</h1>
          
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Upload Financial Data</h2>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ marginBottom: '16px', padding: '12px', border: '2px dashed #cbd5e1', borderRadius: '8px', width: '100%', cursor: 'pointer' }} />
            {error && <div style={{ padding: '12px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}
            {file && <div style={{ fontSize: '14px', color: '#10b981', fontWeight: '600' }}>✓ Loaded: {file.name}</div>}
          </div>

          {file && columns.length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Column Mapping</h2>
              <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>Verify or adjust the column mappings below. Columns have been auto-detected.</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Required Fields</h3>
                  {renderColumnSelector('Date/Period', 'date')}
                  {renderColumnSelector('Total Revenue', 'revenue')}
                  {renderColumnSelector('Total Expenses', 'expense')}
                  {renderColumnSelector('Total Assets', 'totalAssets')}
                  {renderColumnSelector('Total Liabilities', 'totalLiab')}
                  {renderColumnSelector('Total Equity', 'totalEquity')}
                </div>
                
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Cost of Goods Sold</h3>
                  {renderColumnSelector('COGS Payroll', 'cogsPayroll')}
                  {renderColumnSelector('COGS Owner Pay', 'cogsOwnerPay')}
                  {renderColumnSelector('COGS Contractors', 'cogsContractors')}
                  {renderColumnSelector('COGS Materials', 'cogsMaterials')}
                  {renderColumnSelector('COGS Commissions', 'cogsCommissions')}
                  {renderColumnSelector('COGS Other', 'cogsOther')}
                  {renderColumnSelector('COGS Total', 'cogsTotal')}
                </div>
                
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Operating Expenses</h3>
                  {renderColumnSelector('Sales & Marketing', 'opexSalesMarketing')}
                  {renderColumnSelector('Rent/Lease', 'rentLease')}
                  {renderColumnSelector('Utilities', 'utilities')}
                  {renderColumnSelector('Equipment', 'equipment')}
                  {renderColumnSelector('Travel', 'travel')}
                  {renderColumnSelector('Professional Services', 'professionalServices')}
                  {renderColumnSelector('Insurance', 'insurance')}
                  {renderColumnSelector('OPEX Other', 'opexOther')}
                </div>
                
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Payroll & Owners</h3>
                  {renderColumnSelector('OPEX Payroll', 'opexPayroll')}
                  {renderColumnSelector('Owners Base Pay', 'ownersBasePay')}
                  {renderColumnSelector('Owners Retirement', 'ownersRetirement')}
                  {renderColumnSelector('Contractors/Distribution', 'contractorsDistribution')}
                  {renderColumnSelector('Interest Expense', 'interestExpense')}
                  {renderColumnSelector('Depreciation Expense', 'depreciationExpense')}
                  {renderColumnSelector('Operating Expense Total', 'operatingExpenseTotal')}
                  {renderColumnSelector('Non-Operating Income', 'nonOperatingIncome')}
                  {renderColumnSelector('Extraordinary Items', 'extraordinaryItems')}
                  {renderColumnSelector('Net Profit', 'netProfit')}
                </div>
                
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Assets</h3>
                  {renderColumnSelector('Cash', 'cash')}
                  {renderColumnSelector('Accounts Receivable', 'ar')}
                  {renderColumnSelector('Inventory', 'inventory')}
                  {renderColumnSelector('Other Current Assets', 'otherCA')}
                  {renderColumnSelector('Total Current Assets', 'tca')}
                  {renderColumnSelector('Fixed Assets', 'fixedAssets')}
                  {renderColumnSelector('Other Assets', 'otherAssets')}
                </div>
                
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Liabilities & Other</h3>
                  {renderColumnSelector('Accounts Payable', 'ap')}
                  {renderColumnSelector('Other Current Liabilities', 'otherCL')}
                  {renderColumnSelector('Total Current Liabilities', 'tcl')}
                  {renderColumnSelector('Long Term Debt', 'ltd')}
                  {renderColumnSelector('Total Liabilities & Equity', 'totalLAndE')}
                </div>
              </div>
              
              <div style={{ marginTop: '20px', padding: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px' }}>
                <p style={{ fontSize: '13px', color: '#0c4a6e', margin: 0 }}>
                  <strong>Tip:</strong> At minimum, map Date, Total Revenue, Total Expenses, Total Assets, and Total Liabilities for basic analysis. 
                  Map detailed P&L and balance sheet items for comprehensive analysis and reporting.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trend Analysis View */}
      {currentView === 'trend-analysis' && selectedCompanyId && monthly.length > 0 && (
        <div style={{ maxWidth: '100%', padding: '32px 32px 32px 16px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Trend Analysis</h1>
          
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
                Select Item to Analyze:
              </label>
              <select 
                value={selectedTrendItem} 
                onChange={(e) => setSelectedTrendItem(e.target.value)}
                style={{ width: '100%', maxWidth: '400px', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}
              >
                <optgroup label="Income Statement">
                  <option value="revenue">Total Revenue</option>
                  <option value="expense">Total Expenses</option>
                  {mapping.cogsTotal && <option value="cogsTotal">COGS Total</option>}
                  {mapping.cogsPayroll && <option value="cogsPayroll">COGS Payroll</option>}
                  {mapping.cogsOwnerPay && <option value="cogsOwnerPay">COGS Owner Pay</option>}
                  {mapping.cogsContractors && <option value="cogsContractors">COGS Contractors</option>}
                  {mapping.cogsMaterials && <option value="cogsMaterials">COGS Materials</option>}
                  {mapping.cogsCommissions && <option value="cogsCommissions">COGS Commissions</option>}
                  {mapping.cogsOther && <option value="cogsOther">COGS Other</option>}
                  {mapping.opexSalesMarketing && <option value="opexSalesMarketing">Sales & Marketing</option>}
                  {mapping.rentLease && <option value="rentLease">Rent/Lease</option>}
                  {mapping.utilities && <option value="utilities">Utilities</option>}
                  {mapping.equipment && <option value="equipment">Equipment</option>}
                  {mapping.travel && <option value="travel">Travel</option>}
                  {mapping.professionalServices && <option value="professionalServices">Professional Services</option>}
                  {mapping.insurance && <option value="insurance">Insurance</option>}
                  {mapping.opexOther && <option value="opexOther">OPEX Other</option>}
                  {mapping.opexPayroll && <option value="opexPayroll">OPEX Payroll</option>}
                  {mapping.ownersBasePay && <option value="ownersBasePay">Owners Base Pay</option>}
                  {mapping.ownersRetirement && <option value="ownersRetirement">Owners Retirement</option>}
                  {mapping.contractorsDistribution && <option value="contractorsDistribution">Contractors/Distribution</option>}
                  {mapping.interestExpense && <option value="interestExpense">Interest Expense</option>}
                  {mapping.depreciationExpense && <option value="depreciationExpense">Depreciation Expense</option>}
                  {mapping.operatingExpenseTotal && <option value="operatingExpenseTotal">Operating Expense Total</option>}
                  {mapping.nonOperatingIncome && <option value="nonOperatingIncome">Non-Operating Income</option>}
                  {mapping.extraordinaryItems && <option value="extraordinaryItems">Extraordinary Items</option>}
                  {mapping.netProfit && <option value="netProfit">Net Profit</option>}
                </optgroup>
                <optgroup label="Balance Sheet - Assets">
                  <option value="totalAssets">Total Assets</option>
                  <option value="cash">Cash</option>
                  <option value="ar">Accounts Receivable</option>
                  <option value="inventory">Inventory</option>
                  {mapping.otherCA && <option value="otherCA">Other Current Assets</option>}
                  {mapping.tca && <option value="tca">Total Current Assets</option>}
                  {mapping.fixedAssets && <option value="fixedAssets">Fixed Assets</option>}
                  {mapping.otherAssets && <option value="otherAssets">Other Assets</option>}
                </optgroup>
                <optgroup label="Balance Sheet - Liabilities">
                  <option value="totalLiab">Total Liabilities</option>
                  <option value="ap">Accounts Payable</option>
                  {mapping.otherCL && <option value="otherCL">Other Current Liabilities</option>}
                  {mapping.tcl && <option value="tcl">Total Current Liabilities</option>}
                  {mapping.ltd && <option value="ltd">Long Term Debt</option>}
                </optgroup>
                <optgroup label="Balance Sheet - Equity">
                  <option value="totalEquity">Total Equity</option>
                </optgroup>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <LineChart 
                  title={`${selectedTrendItem.charAt(0).toUpperCase() + selectedTrendItem.slice(1).replace(/([A-Z])/g, ' $1')} Trend`}
                  data={monthly.map(m => ({ month: m.month, value: m[selectedTrendItem as keyof typeof m] as number }))}
                  color="#667eea"
                  showTable={true}
                />
              </div>
              
              <div style={{ width: '280px', flexShrink: 0 }}>
                <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', position: 'sticky', top: '100px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', marginBottom: '16px', textAlign: 'center' }}>Growth Analysis</h3>
                  
                  <div style={{ marginBottom: '16px', padding: '16px', background: 'white', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '8px', textAlign: 'center' }}>GROWTH RATE</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', textAlign: 'center' }}>Last Year</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', textAlign: 'center', color: monthly.length >= 24 ? 
                      (() => {
                        const last12 = monthly.slice(-12).reduce((sum, m) => sum + (m[selectedTrendItem as keyof typeof m] as number || 0), 0);
                        const prev12 = monthly.slice(-24, -12).reduce((sum, m) => sum + (m[selectedTrendItem as keyof typeof m] as number || 0), 0);
                        const growthRate = prev12 !== 0 ? ((last12 - prev12) / prev12) * 100 : 0;
                        return growthRate >= 0 ? '#10b981' : '#ef4444';
                      })()
                      : '#64748b'
                    }}>
                      {monthly.length >= 24 ? (() => {
                        const last12 = monthly.slice(-12).reduce((sum, m) => sum + (m[selectedTrendItem as keyof typeof m] as number || 0), 0);
                        const prev12 = monthly.slice(-24, -12).reduce((sum, m) => sum + (m[selectedTrendItem as keyof typeof m] as number || 0), 0);
                        const growthRate = prev12 !== 0 ? ((last12 - prev12) / prev12) * 100 : 0;
                        return `${growthRate >= 0 ? '+' : ''}${growthRate.toFixed(1)}%`;
                      })() : 'N/A'}
                    </div>
                  </div>

                  <div style={{ padding: '16px', background: 'white', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '8px', textAlign: 'center' }}>GROWTH RATE</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', textAlign: 'center' }}>Previous Year</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', textAlign: 'center', color: monthly.length >= 36 ? 
                      (() => {
                        const prev12 = monthly.slice(-24, -12).reduce((sum, m) => sum + (m[selectedTrendItem as keyof typeof m] as number || 0), 0);
                        const prev24 = monthly.slice(-36, -24).reduce((sum, m) => sum + (m[selectedTrendItem as keyof typeof m] as number || 0), 0);
                        const growthRate = prev24 !== 0 ? ((prev12 - prev24) / prev24) * 100 : 0;
                        return growthRate >= 0 ? '#10b981' : '#ef4444';
                      })()
                      : '#64748b'
                    }}>
                      {monthly.length >= 36 ? (() => {
                        const prev12 = monthly.slice(-24, -12).reduce((sum, m) => sum + (m[selectedTrendItem as keyof typeof m] as number || 0), 0);
                        const prev24 = monthly.slice(-36, -24).reduce((sum, m) => sum + (m[selectedTrendItem as keyof typeof m] as number || 0), 0);
                        const growthRate = prev24 !== 0 ? ((prev12 - prev24) / prev24) * 100 : 0;
                        return `${growthRate >= 0 ? '+' : ''}${growthRate.toFixed(1)}%`;
                      })() : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Financial Score - Introduction View */}
      {currentView === 'fs-intro' && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '40px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h1 style={{ fontSize: '36px', fontWeight: '700', color: '#1e293b', marginBottom: '32px', textAlign: 'center' }}>Introduction to the Venturis Financial Score</h1>
            
            <div style={{ fontSize: '16px', color: '#475569', lineHeight: '1.8', maxWidth: '900px', margin: '0 auto' }}>
              <p style={{ marginBottom: '20px' }}>
                We would like to introduce to you the emerging standard score for small and medium businesses. It is called the <strong>Venturis Financial Score (VFS)</strong>. On a scale of 1 to 100, 100 indicates a company that is firing on all cylinders and building value at a steady clip; a score of zero indicates no operations. The scores in between have a lot to say about the general health of any company being measured.
              </p>
              
              <p style={{ marginBottom: '32px' }}>
                The score tells a lot about a company's financial stability and their potential value in the market regardless of specific industry.
              </p>
              
              <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '32px', marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px' }}>Approximate Interpretation of Venturis Financial Scores:</h2>
                
                <div style={{ display: 'grid', gap: '20px' }}>
                  <div style={{ background: '#d1fae5', borderRadius: '8px', padding: '20px', border: '2px solid #10b981' }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#065f46', marginBottom: '12px' }}>70 – 100: Strong Financial Performance</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#064e3b', fontSize: '15px', lineHeight: '1.6' }}>
                      <li>Good growth and good balance</li>
                      <li>In a good position for considering an M&A transaction</li>
                      <li>Excellent time to expand offerings and invest in R&D</li>
                    </ul>
                  </div>
                  
                  <div style={{ background: '#dbeafe', borderRadius: '8px', padding: '20px', border: '2px solid #3b82f6' }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e40af', marginBottom: '12px' }}>50 – 70: Good Fundamentals</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#1e3a8a', fontSize: '15px', lineHeight: '1.6' }}>
                      <li>In a good position for revenue growth</li>
                      <li>Needs to focus on bringing costs down as volume grows</li>
                    </ul>
                  </div>
                  
                  <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '20px', border: '2px solid #f59e0b' }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#92400e', marginBottom: '12px' }}>30 – 50: Basic Problems</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#78350f', fontSize: '15px', lineHeight: '1.6' }}>
                      <li>Cost structure issues; not in a position to grow</li>
                      <li>Improvements needed in operations and process controls</li>
                      <li>Growth without operating improvements could do significant harm</li>
                    </ul>
                  </div>
                  
                  <div style={{ background: '#fee2e2', borderRadius: '8px', padding: '20px', border: '2px solid #ef4444' }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#991b1b', marginBottom: '12px' }}>0 – 30: Serious Performance Problems</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#7f1d1d', fontSize: '15px', lineHeight: '1.6' }}>
                      <li>Problems exist which may not be correctable</li>
                      <li>Some form of major restructuring or liquidation may be best</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <p style={{ marginBottom: '20px' }}>
                These scores are both <strong>diagnostic</strong> and <strong>prescriptive</strong>. They are diagnostic in that they identify a fundamental level of performance and related potential problems; prescriptive in that they point to specific actions that should be taken to remedy identified problems or take advantage of opportunities.
              </p>
              
              <div style={{ background: '#ede9fe', borderRadius: '12px', padding: '24px', marginTop: '32px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#5b21b6', marginBottom: '16px' }}>The Overall Score is Based On:</h3>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#6b21a8', fontSize: '15px', lineHeight: '1.8' }}>
                  <li>Long-term and short-term trends in revenue growth and expense growth</li>
                  <li>Trends in asset and liability growth</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Financial Score Trends View */}
      {currentView === 'fs-score' && selectedCompanyId && trendData.length > 0 && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Financial Score Trends</h1>
          
          {monthly.length >= 24 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '24px' }}>Financial Score Analysis</h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '12px', padding: '20px', color: 'white', boxShadow: '0 4px 12px rgba(102,126,234,0.3)' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', opacity: 0.9 }}>Venturis Financial Score</div>
                  <div style={{ fontSize: '42px', fontWeight: '700' }}>{finalScore.toFixed(1)}</div>
                </div>
                <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '20px', border: '2px solid #86efac' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#166534', marginBottom: '8px' }}>Profitability Score</div>
                  <div style={{ fontSize: '42px', fontWeight: '700', color: '#10b981' }}>{profitabilityScore.toFixed(1)}</div>
                </div>
                <div style={{ background: '#ede9fe', borderRadius: '12px', padding: '20px', border: '2px solid #c4b5fd' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#5b21b6', marginBottom: '8px' }}>Asset Development Score</div>
                  <div style={{ fontSize: '42px', fontWeight: '700', color: '#8b5cf6' }}>{assetDevScore.toFixed(1)}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Base RGS (24mo)</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>{baseRGS.toFixed(0)}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Growth: {growth_24mo.toFixed(1)}%</div>
                </div>
                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Adjusted RGS (6mo)</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>{adjustedRGS.toFixed(1)}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Growth: {growth_6mo.toFixed(1)}%</div>
                </div>
                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Expense Adjustment</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: expenseAdjustment >= 0 ? '#10b981' : '#ef4444' }}>
                    {expenseAdjustment >= 0 ? '+' : ''}{expenseAdjustment}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    {expenseAdjustment > 0 ? '✓ BONUS' : expenseAdjustment < 0 ? '✗ PENALTY' : 'NEUTRAL'}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>ALR-1 (Current)</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>{alr1.toFixed(2)}</div>
                </div>
                <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>ALR Growth %</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: alrGrowth >= 0 ? '#10b981' : '#ef4444' }}>
                    {alrGrowth >= 0 ? '+' : ''}{alrGrowth.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
            <LineChart title="Financial Score Trend" data={trendData} valueKey="financialScore" color="#667eea" compact />
            <LineChart title="Profitability Score Trend" data={trendData} valueKey="profitabilityScore" color="#10b981" compact />
            <LineChart title="Revenue Growth Score (RGS)" data={trendData} valueKey="rgs" color="#f59e0b" compact />
            <LineChart title="RGS with 6-Month Adjustment" data={trendData} valueKey="rgsAdj" color="#3b82f6" compact />
            <LineChart title="Expense Adjustment" data={trendData} valueKey="expenseAdj" color="#8b5cf6" compact />
            <LineChart title="Asset Development Score (ADS)" data={trendData} valueKey="adsScore" color="#ec4899" compact />
            <LineChart title="ALR-1 (Asset-Liability Ratio)" data={trendData} valueKey="alr1" color="#14b8a6" compact />
            <LineChart title="ALR Growth %" data={trendData} valueKey="alrGrowth" color="#f97316" compact />
          </div>
        </div>
      )}

      {/* KPI Dashboard View */}
      {currentView === 'kpis' && selectedCompanyId && trendData.length > 0 && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>KPI Dashboard</h1>
          
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Liquidity Ratios</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
              <LineChart title="Current Ratio" data={trendData} valueKey="currentRatio" color="#10b981" compact />
              <LineChart title="Quick Ratio" data={trendData} valueKey="quickRatio" color="#14b8a6" compact />
            </div>
          </div>

          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Activity Ratios</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
              <LineChart title="Inventory Turnover" data={trendData} valueKey="invTurnover" color="#f59e0b" compact />
              <LineChart title="Receivables Turnover" data={trendData} valueKey="arTurnover" color="#f97316" compact />
              <LineChart title="Payables Turnover" data={trendData} valueKey="apTurnover" color="#ef4444" compact />
              <LineChart title="Days' Inventory" data={trendData} valueKey="daysInv" color="#fbbf24" compact />
              <LineChart title="Days' Receivables" data={trendData} valueKey="daysAR" color="#fb923c" compact />
              <LineChart title="Days' Payables" data={trendData} valueKey="daysAP" color="#f87171" compact />
              <LineChart title="Sales/Working Capital" data={trendData} valueKey="salesWC" color="#06b6d4" compact />
            </div>
          </div>

          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Coverage Ratios</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
              <LineChart title="Interest Coverage" data={trendData} valueKey="interestCov" color="#8b5cf6" compact />
              <LineChart title="Debt Service Coverage" data={trendData} valueKey="debtSvcCov" color="#a78bfa" compact />
              <LineChart title="Cash Flow to Debt" data={trendData} valueKey="cfToDebt" color="#c4b5fd" compact />
            </div>
          </div>

          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Leverage Ratios</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
              <LineChart title="Debt/Net Worth" data={trendData} valueKey="debtToNW" color="#ec4899" compact />
              <LineChart title="Fixed Assets/Net Worth" data={trendData} valueKey="fixedToNW" color="#f472b6" compact />
              <LineChart title="Leverage Ratio" data={trendData} valueKey="leverage" color="#f9a8d4" compact />
            </div>
          </div>

          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>Operating Ratios</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
              <LineChart title="Total Asset Turnover" data={trendData} valueKey="totalAssetTO" color="#3b82f6" compact />
              <LineChart title="Return on Equity (ROE)" data={trendData} valueKey="roe" color="#60a5fa" compact />
              <LineChart title="Return on Assets (ROA)" data={trendData} valueKey="roa" color="#93c5fd" compact />
              <LineChart title="EBITDA Margin" data={trendData} valueKey="ebitdaMargin" color="#2563eb" compact />
              <LineChart title="EBIT Margin" data={trendData} valueKey="ebitMargin" color="#1e40af" compact />
            </div>
          </div>
        </div>
      )}

      {/* MD&A View */}
      {currentView === 'mda' && selectedCompanyId && trendData.length > 0 && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Management Discussion & Analysis</h1>
          
          <div style={{ background: 'white', borderRadius: '12px', padding: '32px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px' }}>Executive Summary</h2>
            
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#10b981', marginBottom: '12px' }}>Financial Strengths</h3>
              <p style={{ fontSize: '15px', lineHeight: '1.7', color: '#1e293b', margin: 0 }}>
                {mdaAnalysis.strengths.length > 0 
                  ? mdaAnalysis.strengths.join(' ') 
                  : 'The company is showing stable financial performance across key metrics.'}
              </p>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#ef4444', marginBottom: '12px' }}>Areas Requiring Attention</h3>
              <p style={{ fontSize: '15px', lineHeight: '1.7', color: '#1e293b', margin: 0 }}>
                {mdaAnalysis.weaknesses.length > 0 
                  ? mdaAnalysis.weaknesses.join(' ') 
                  : 'Continue monitoring key financial indicators to maintain current performance levels.'}
              </p>
            </div>

            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#667eea', marginBottom: '12px' }}>Strategic Recommendations</h3>
              <p style={{ fontSize: '15px', lineHeight: '1.7', color: '#1e293b', margin: 0 }}>
                {mdaAnalysis.insights.length > 0 
                  ? mdaAnalysis.insights.join(' ') 
                  : 'Regular review of financial metrics and strategic planning will support continued growth and financial stability.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '24px' }}>
            {mdaAnalysis.strengths.length > 0 && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#10b981', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '24px' }}>✓</span> Strengths
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {mdaAnalysis.strengths.map((str, idx) => (
                    <li key={idx} style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: '8px', marginBottom: '8px', borderLeft: '4px solid #10b981', fontSize: '14px', color: '#166534' }}>{str}</li>
                  ))}
                </ul>
              </div>
            )}

            {mdaAnalysis.weaknesses.length > 0 && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#ef4444', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '24px' }}>⚠</span> Areas for Improvement
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {mdaAnalysis.weaknesses.map((weak, idx) => (
                    <li key={idx} style={{ padding: '12px 16px', background: '#fef2f2', borderRadius: '8px', marginBottom: '8px', borderLeft: '4px solid #ef4444', fontSize: '14px', color: '#991b1b' }}>{weak}</li>
                  ))}
                </ul>
              </div>
            )}

            {mdaAnalysis.insights.length > 0 && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#667eea', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '24px' }}>💡</span> Strategic Insights
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {mdaAnalysis.insights.map((ins, idx) => (
                    <li key={idx} style={{ padding: '12px 16px', background: '#ede9fe', borderRadius: '8px', marginBottom: '8px', borderLeft: '4px solid #667eea', fontSize: '14px', color: '#5b21b6' }}>{ins}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Projections View */}
      {currentView === 'projections' && selectedCompanyId && projections.mostLikely.length > 0 && (
        <div style={{ maxWidth: '100%', padding: '32px 32px 32px 16px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Financial Projections</h1>
          
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b' }}>Scenario Assumptions</h2>
              <button onClick={() => setShowDefaultSettings(!showDefaultSettings)} style={{ padding: '8px 16px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                {showDefaultSettings ? 'Hide Settings' : 'Adjust Scenarios'}
              </button>
            </div>
            
            {showDefaultSettings && (
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '20px', marginTop: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px', marginBottom: '20px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#10b981', marginBottom: '12px' }}>Best Case Scenario</h3>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#475569', marginBottom: '4px' }}>Revenue Multiplier: {bestCaseRevMultiplier.toFixed(2)}x</label>
                      <input type="range" min="1" max="3" step="0.1" value={bestCaseRevMultiplier} onChange={(e) => setBestCaseRevMultiplier(parseFloat(e.target.value))} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#475569', marginBottom: '4px' }}>Expense Multiplier: {bestCaseExpMultiplier.toFixed(2)}x</label>
                      <input type="range" min="0.3" max="1" step="0.05" value={bestCaseExpMultiplier} onChange={(e) => setBestCaseExpMultiplier(parseFloat(e.target.value))} style={{ width: '100%' }} />
                    </div>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#ef4444', marginBottom: '12px' }}>Worst Case Scenario</h3>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#475569', marginBottom: '4px' }}>Revenue Multiplier: {worstCaseRevMultiplier.toFixed(2)}x</label>
                      <input type="range" min="0" max="1" step="0.05" value={worstCaseRevMultiplier} onChange={(e) => setWorstCaseRevMultiplier(parseFloat(e.target.value))} style={{ width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#475569', marginBottom: '4px' }}>Expense Multiplier: {worstCaseExpMultiplier.toFixed(2)}x</label>
                      <input type="range" min="1" max="2" step="0.05" value={worstCaseExpMultiplier} onChange={(e) => setWorstCaseExpMultiplier(parseFloat(e.target.value))} style={{ width: '100%' }} />
                    </div>
                  </div>
                </div>
                <button onClick={saveProjectionDefaults} style={{ padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Save as Defaults</button>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: '32px' }}>
            <ProjectionChart title="Revenue Projection" historicalData={monthly} projectedData={projections} valueKey="revenue" formatValue={(v) => `$${(v / 1000).toFixed(0)}K`} />
            <ProjectionChart title="Expense Projection" historicalData={monthly} projectedData={projections} valueKey="expense" formatValue={(v) => `$${(v / 1000).toFixed(0)}K`} />
            <ProjectionChart title="Net Income Projection" historicalData={monthly} projectedData={projections} valueKey="netIncome" formatValue={(v) => `$${(v / 1000).toFixed(0)}K`} />
            <ProjectionChart title="Total Assets Projection" historicalData={monthly} projectedData={projections} valueKey="totalAssets" formatValue={(v) => `$${(v / 1000).toFixed(0)}K`} />
            <ProjectionChart title="Total Liabilities Projection" historicalData={monthly} projectedData={projections} valueKey="totalLiab" formatValue={(v) => `$${(v / 1000).toFixed(0)}K`} />
            <ProjectionChart title="Equity Projection" historicalData={monthly} projectedData={projections} valueKey="equity" formatValue={(v) => `$${(v / 1000).toFixed(0)}K`} />
          </div>
        </div>
      )}

      {/* Working Capital View */}
      {currentView === 'working-capital' && selectedCompanyId && monthly.length > 0 && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Working Capital Analysis</h1>
          
          {(() => {
            // Calculate working capital for each month
            const wcData = monthly.map(m => ({
              month: m.month,
              currentAssets: m.cash + m.ar + m.inventory + m.otherCA,
              currentLiabilities: m.ap + m.otherCL,
              workingCapital: (m.cash + m.ar + m.inventory + m.otherCA) - (m.ap + m.otherCL),
              revenue: m.revenue
            }));
            
            // Current period metrics
            const current = wcData[wcData.length - 1];
            const prior = wcData.length >= 13 ? wcData[wcData.length - 13] : wcData[0];
            
            const currentWC = current.workingCapital;
            const currentRatio = current.currentLiabilities !== 0 ? current.currentAssets / current.currentLiabilities : 0;
            const wcChange = currentWC - prior.workingCapital;
            const wcChangePercent = prior.workingCapital !== 0 ? (wcChange / Math.abs(prior.workingCapital)) * 100 : 0;
            
            // Calculate days working capital (WC / daily revenue)
            const last12Months = monthly.slice(-12);
            const annualRevenue = last12Months.reduce((sum, m) => sum + m.revenue, 0);
            const dailyRevenue = annualRevenue / 365;
            const daysWC = dailyRevenue !== 0 ? currentWC / dailyRevenue : 0;
            
            // Working Capital Cycle components
            const daysAR = current.revenue !== 0 ? (current.currentAssets * 0.4 / (current.revenue * 12)) * 365 : 0; // Estimate AR as 40% of current assets
            const daysAP = current.revenue !== 0 ? (current.currentLiabilities * 0.6 / (current.revenue * 12 * 0.7)) * 365 : 0; // Estimate AP
            const daysInventory = current.revenue !== 0 ? (current.currentAssets * 0.2 / (current.revenue * 12 * 0.7)) * 365 : 0; // Estimate inventory
            const cashConversionCycle = daysAR + daysInventory - daysAP;
            
            // Historical averages
            const avgWC = wcData.reduce((sum, d) => sum + d.workingCapital, 0) / wcData.length;
            const minWC = Math.min(...wcData.map(d => d.workingCapital));
            const maxWC = Math.max(...wcData.map(d => d.workingCapital));
            
            return (
              <>
                {/* Key Metrics Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
                  <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>Current Working Capital</h3>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#667eea', marginBottom: '4px' }}>
                      ${(currentWC / 1000).toFixed(0)}K
                    </div>
                    <div style={{ fontSize: '12px', color: wcChange >= 0 ? '#10b981' : '#ef4444', fontWeight: '600' }}>
                      {wcChange >= 0 ? '↑' : '↓'} ${Math.abs(wcChange / 1000).toFixed(0)}K ({wcChangePercent >= 0 ? '+' : ''}{wcChangePercent.toFixed(1)}%) vs. 1Y ago
                    </div>
                  </div>
                  
                  <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>Current Ratio</h3>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: currentRatio >= 1.5 ? '#10b981' : currentRatio >= 1.0 ? '#f59e0b' : '#ef4444', marginBottom: '4px' }}>
                      {currentRatio.toFixed(2)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {currentRatio >= 1.5 ? 'Strong' : currentRatio >= 1.0 ? 'Adequate' : 'Needs Attention'}
                    </div>
                  </div>
                  
                  <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>Days Working Capital</h3>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                      {daysWC.toFixed(0)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Days of revenue covered
                    </div>
                  </div>
                  
                  <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>Cash Conversion Cycle</h3>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
                      {cashConversionCycle.toFixed(0)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Days (estimated)
                    </div>
                  </div>
                </div>
                
                {/* Working Capital Trend Chart */}
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>Working Capital Trend</h2>
                  <LineChart 
                    title="" 
                    data={wcData.map(d => ({ month: d.month, value: d.workingCapital }))} 
                    color="#667eea"
                    showTable={true}
                    formatter={(val) => `$${Math.round(val).toLocaleString()}`}
                  />
                </div>
                
                {/* Components Breakdown */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px', marginBottom: '24px' }}>
                  <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>Current Assets</h2>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                        <span style={{ fontSize: '14px', color: '#64748b' }}>Cash</span>
                        <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>${(current.currentAssets * 0.3 / 1000).toFixed(0)}K</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                        <span style={{ fontSize: '14px', color: '#64748b' }}>Accounts Receivable</span>
                        <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>${(current.currentAssets * 0.4 / 1000).toFixed(0)}K</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                        <span style={{ fontSize: '14px', color: '#64748b' }}>Inventory</span>
                        <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>${(current.currentAssets * 0.2 / 1000).toFixed(0)}K</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                        <span style={{ fontSize: '14px', color: '#64748b' }}>Other Current Assets</span>
                        <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>${(current.currentAssets * 0.1 / 1000).toFixed(0)}K</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#667eea', borderRadius: '8px', marginTop: '8px' }}>
                        <span style={{ fontSize: '16px', fontWeight: '600', color: 'white' }}>Total Current Assets</span>
                        <span style={{ fontSize: '20px', fontWeight: '700', color: 'white' }}>${(current.currentAssets / 1000).toFixed(0)}K</span>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>Current Liabilities</h2>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                        <span style={{ fontSize: '14px', color: '#64748b' }}>Accounts Payable</span>
                        <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>${(current.currentLiabilities * 0.6 / 1000).toFixed(0)}K</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                        <span style={{ fontSize: '14px', color: '#64748b' }}>Accrued Expenses</span>
                        <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>${(current.currentLiabilities * 0.25 / 1000).toFixed(0)}K</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                        <span style={{ fontSize: '14px', color: '#64748b' }}>Other Current Liabilities</span>
                        <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>${(current.currentLiabilities * 0.15 / 1000).toFixed(0)}K</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#ef4444', borderRadius: '8px', marginTop: '60px' }}>
                        <span style={{ fontSize: '16px', fontWeight: '600', color: 'white' }}>Total Current Liabilities</span>
                        <span style={{ fontSize: '20px', fontWeight: '700', color: 'white' }}>${(current.currentLiabilities / 1000).toFixed(0)}K</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Working Capital Analysis */}
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>Working Capital Insights</h2>
                  
                  <div style={{ display: 'grid', gap: '16px' }}>
                    {currentWC > 0 && currentRatio >= 1.5 && (
                      <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#166534', marginBottom: '4px' }}>✓ Strong Liquidity Position</div>
                        <div style={{ fontSize: '13px', color: '#166534', lineHeight: '1.6' }}>
                          Your current ratio of {currentRatio.toFixed(2)} indicates strong short-term financial health with ${(currentWC / 1000).toFixed(0)}K in working capital available to cover operational needs.
                        </div>
                      </div>
                    )}
                    
                    {currentWC > 0 && currentRatio < 1.5 && currentRatio >= 1.0 && (
                      <div style={{ padding: '16px', background: '#fffbeb', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', marginBottom: '4px' }}>⚠ Adequate but Monitor Closely</div>
                        <div style={{ fontSize: '13px', color: '#92400e', lineHeight: '1.6' }}>
                          Your current ratio of {currentRatio.toFixed(2)} is adequate but below ideal levels. Consider improving cash flow or reducing short-term liabilities to strengthen your position.
                        </div>
                      </div>
                    )}
                    
                    {currentRatio < 1.0 && (
                      <div style={{ padding: '16px', background: '#fef2f2', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#991b1b', marginBottom: '4px' }}>⚠ Liquidity Concern</div>
                        <div style={{ fontSize: '13px', color: '#991b1b', lineHeight: '1.6' }}>
                          Your current ratio of {currentRatio.toFixed(2)} indicates current liabilities exceed current assets. Immediate attention to cash flow management and working capital optimization is recommended.
                        </div>
                      </div>
                    )}
                    
                    {wcChange > 0 && (
                      <div style={{ padding: '16px', background: '#f0f9ff', borderRadius: '8px', borderLeft: '4px solid #0284c7' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#0c4a6e', marginBottom: '4px' }}>↑ Positive Trend</div>
                        <div style={{ fontSize: '13px', color: '#0c4a6e', lineHeight: '1.6' }}>
                          Working capital has increased by ${(wcChange / 1000).toFixed(0)}K ({wcChangePercent.toFixed(1)}%) over the past year, indicating improved operational efficiency and financial stability.
                        </div>
                      </div>
                    )}
                    
                    <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Historical Metrics</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '13px', color: '#64748b' }}>
                        <div>
                          <span style={{ fontWeight: '600' }}>Average WC:</span> ${(avgWC / 1000).toFixed(0)}K
                        </div>
                        <div>
                          <span style={{ fontWeight: '600' }}>Minimum WC:</span> ${(minWC / 1000).toFixed(0)}K
                        </div>
                        <div>
                          <span style={{ fontWeight: '600' }}>Maximum WC:</span> ${(maxWC / 1000).toFixed(0)}K
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Valuation View */}
      {currentView === 'valuation' && selectedCompanyId && monthly.length > 0 && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Business Valuation</h1>
          
          {(() => {
            // Calculate trailing 12 months values
            const last12 = monthly.slice(-12);
            const ttmRevenue = last12.reduce((sum, m) => sum + m.revenue, 0);
            const ttmExpense = last12.reduce((sum, m) => sum + m.expense, 0);
            const ttmNetIncome = ttmRevenue - ttmExpense;
            
            // Estimate EBITDA (simplified - assumes depreciation is ~5% of revenue and interest is minimal)
            const estimatedDepreciation = ttmRevenue * 0.05;
            const estimatedInterest = ttmRevenue * 0.02;
            const ttmEBITDA = ttmNetIncome + estimatedDepreciation + estimatedInterest;
            
            // Estimate SDE (add back owner's compensation - estimate at 15% of revenue)
            const estimatedOwnerComp = ttmRevenue * 0.15;
            const ttmSDE = ttmEBITDA + estimatedOwnerComp;
            
            // Calculate valuations
            const sdeValuation = ttmSDE * sdeMultiplier;
            const ebitdaValuation = ttmEBITDA * ebitdaMultiplier;
            
            // DCF simplified - using 10% discount rate and 5 year projection
            const growthRate = growth_24mo / 100;
            const discountRate = 0.10;
            let dcfValue = 0;
            for (let year = 1; year <= 5; year++) {
              const projectedCashFlow = ttmNetIncome * Math.pow(1 + growthRate, year);
              dcfValue += projectedCashFlow / Math.pow(1 + discountRate, year);
            }
            const terminalValue = (ttmNetIncome * Math.pow(1 + growthRate, 5) * 1.02) / (discountRate - 0.02);
            dcfValue += terminalValue / Math.pow(1 + discountRate, 5);
            
            return (
              <>
                {/* Overview Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '32px' }}>
                  <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #10b981' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>SDE Valuation</h3>
                    <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981', marginBottom: '8px' }}>
                      ${(sdeValuation / 1000000).toFixed(2)}M
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>
                      TTM SDE: ${(ttmSDE / 1000).toFixed(0)}K × {sdeMultiplier}x
                    </div>
                  </div>
                  
                  <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>EBITDA Valuation</h3>
                    <div style={{ fontSize: '32px', fontWeight: '700', color: '#667eea', marginBottom: '8px' }}>
                      ${(ebitdaValuation / 1000000).toFixed(2)}M
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>
                      TTM EBITDA: ${(ttmEBITDA / 1000).toFixed(0)}K × {ebitdaMultiplier}x
                    </div>
                  </div>
                  
                  <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #f59e0b' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>DCF Valuation</h3>
                    <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b', marginBottom: '8px' }}>
                      ${(dcfValue / 1000000).toFixed(2)}M
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>
                      5-year projection @ 10% discount
                    </div>
                  </div>
                </div>
                
                {/* SDE Method */}
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
                    Seller's Discretionary Earnings (SDE) Method
                  </h2>
                  
                  <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>Trailing 12 Months SDE</div>
                      <div style={{ fontSize: '28px', fontWeight: '700', color: '#10b981' }}>${(ttmSDE / 1000).toFixed(0)}K</div>
                    </div>
                    
                    <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                      <strong>Calculation:</strong> Net Income + Owner Compensation + Interest + Depreciation + Discretionary Expenses
                      <br/>
                      = ${(ttmNetIncome / 1000).toFixed(0)}K + ${(estimatedOwnerComp / 1000).toFixed(0)}K + ${(estimatedInterest / 1000).toFixed(0)}K + ${(estimatedDepreciation / 1000).toFixed(0)}K
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                      SDE Multiple: {sdeMultiplier.toFixed(1)}x
                    </label>
                    <input 
                      type="range" 
                      min="1" 
                      max="5" 
                      step="0.1" 
                      value={sdeMultiplier} 
                      onChange={(e) => setSdeMultiplier(parseFloat(e.target.value))} 
                      style={{ width: '100%', marginBottom: '8px' }} 
                    />
                    <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Typical Range: 1.5x - 4.0x</span>
                      <span>Industry Average: 2.5x</span>
                    </div>
                  </div>
                  
                  <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                      Estimated Business Value (SDE)
                    </div>
                    <div style={{ fontSize: '36px', fontWeight: '700', color: '#10b981' }}>
                      ${(sdeValuation / 1000000).toFixed(2)}M
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                      Range: ${((ttmSDE * 1.5) / 1000000).toFixed(2)}M - ${((ttmSDE * 4.0) / 1000000).toFixed(2)}M
                    </div>
                  </div>
                </div>
                
                {/* EBITDA Method */}
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
                    EBITDA Multiple Method
                  </h2>
                  
                  <div style={{ background: '#ede9fe', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>Trailing 12 Months EBITDA</div>
                      <div style={{ fontSize: '28px', fontWeight: '700', color: '#667eea' }}>${(ttmEBITDA / 1000).toFixed(0)}K</div>
                    </div>
                    
                    <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                      <strong>Calculation:</strong> Net Income + Interest + Taxes + Depreciation + Amortization
                      <br/>
                      = ${(ttmNetIncome / 1000).toFixed(0)}K + ${(estimatedInterest / 1000).toFixed(0)}K + ${(estimatedDepreciation / 1000).toFixed(0)}K
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                      EBITDA Multiple: {ebitdaMultiplier.toFixed(1)}x
                    </label>
                    <input 
                      type="range" 
                      min="2" 
                      max="10" 
                      step="0.1" 
                      value={ebitdaMultiplier} 
                      onChange={(e) => setEbitdaMultiplier(parseFloat(e.target.value))} 
                      style={{ width: '100%', marginBottom: '8px' }} 
                    />
                    <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Typical Range: 3.0x - 8.0x</span>
                      <span>Industry Average: 5.0x</span>
                    </div>
                  </div>
                  
                  <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                      Estimated Business Value (EBITDA)
                    </div>
                    <div style={{ fontSize: '36px', fontWeight: '700', color: '#667eea' }}>
                      ${(ebitdaValuation / 1000000).toFixed(2)}M
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                      Range: ${((ttmEBITDA * 3.0) / 1000000).toFixed(2)}M - ${((ttmEBITDA * 8.0) / 1000000).toFixed(2)}M
                    </div>
                  </div>
                </div>
                
                {/* DCF Method */}
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
                    Discounted Cash Flow (DCF) Method
                  </h2>
                  
                  <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '16px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>Historical Growth Rate</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#f59e0b' }}>{growth_24mo.toFixed(1)}%</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>Discount Rate</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#f59e0b' }}>10.0%</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>Terminal Growth</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#f59e0b' }}>2.0%</div>
                      </div>
                    </div>
                    
                    <div style={{ fontSize: '13px', color: '#78350f', lineHeight: '1.6' }}>
                      5-year cash flow projection based on historical growth rate, discounted to present value. Includes terminal value calculation for perpetuity beyond forecast period.
                    </div>
                  </div>
                  
                  <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                      Estimated Business Value (DCF)
                    </div>
                    <div style={{ fontSize: '36px', fontWeight: '700', color: '#f59e0b' }}>
                      ${(dcfValue / 1000000).toFixed(2)}M
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>
                      <strong>Note:</strong> DCF valuations are highly sensitive to assumptions about growth rates and discount rates. This is a simplified calculation for illustrative purposes.
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Cash Flow View */}
      {currentView === 'cash-flow' && selectedCompanyId && monthly.length > 0 && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Cash Flow Analysis</h1>

          {(() => {
            // Calculate cash flow for last 12 months
            const last12 = monthly.slice(-12);
            
            const cashFlowData = last12.map((curr, idx) => {
              const prev = idx === 0 && monthly.length > 12 ? monthly[monthly.length - 13] : (idx > 0 ? last12[idx - 1] : curr);
              
              // Operating Activities
              const netIncome = curr.revenue - curr.expense;
              const depreciation = curr.depreciationAmortization || 0; // Estimated as ~2% of revenue if not available
              const changeInAR = curr.ar - prev.ar;
              const changeInInventory = curr.inventory - prev.inventory;
              const changeInAP = curr.ap - prev.ap;
              const changeInWorkingCapital = -(changeInAR + changeInInventory - changeInAP);
              const operatingCashFlow = netIncome + depreciation + changeInWorkingCapital;
              
              // Investing Activities
              const changeInFixedAssets = curr.fixedAssets - prev.fixedAssets;
              const capitalExpenditures = changeInFixedAssets + depreciation; // Add back depreciation to estimate CapEx
              const investingCashFlow = -capitalExpenditures;
              
              // Financing Activities
              const changeInDebt = curr.ltd - prev.ltd;
              const changeInEquity = curr.totalEquity - prev.totalEquity - netIncome; // Equity change excluding net income
              const financingCashFlow = changeInDebt + changeInEquity;
              
              // Net Change and Free Cash Flow
              const netCashChange = operatingCashFlow + investingCashFlow + financingCashFlow;
              const freeCashFlow = operatingCashFlow - Math.max(0, capitalExpenditures);
              
              // Metrics
              const cashFlowMargin = curr.revenue > 0 ? (operatingCashFlow / curr.revenue) * 100 : 0;
              const daysCashOnHand = operatingCashFlow > 0 ? (curr.cash / (operatingCashFlow / 30)) : 0;
              
              return {
                month: curr.month,
                netIncome,
                depreciation,
                changeInWorkingCapital,
                operatingCashFlow,
                capitalExpenditures,
                investingCashFlow,
                changeInDebt,
                changeInEquity,
                financingCashFlow,
                netCashChange,
                freeCashFlow,
                cashFlowMargin,
                daysCashOnHand,
                endingCash: curr.cash
              };
            });

            // Summary metrics
            const totalOperatingCF = cashFlowData.reduce((sum, d) => sum + d.operatingCashFlow, 0);
            const totalInvestingCF = cashFlowData.reduce((sum, d) => sum + d.investingCashFlow, 0);
            const totalFinancingCF = cashFlowData.reduce((sum, d) => sum + d.financingCashFlow, 0);
            const totalFreeCF = cashFlowData.reduce((sum, d) => sum + d.freeCashFlow, 0);
            const avgCashFlowMargin = cashFlowData.reduce((sum, d) => sum + d.cashFlowMargin, 0) / cashFlowData.length;

            return (
              <>
                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                  <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #10b981' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Operating Cash Flow (12mo)</div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#10b981' }}>
                      ${(totalOperatingCF / 1000).toFixed(0)}K
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Cash from operations</div>
                  </div>
                  
                  <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #ef4444' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Investing Cash Flow (12mo)</div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#ef4444' }}>
                      ${(totalInvestingCF / 1000).toFixed(0)}K
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>CapEx & investments</div>
                  </div>
                  
                  <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #3b82f6' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Financing Cash Flow (12mo)</div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#3b82f6' }}>
                      ${(totalFinancingCF / 1000).toFixed(0)}K
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Debt & equity changes</div>
                  </div>
                  
                  <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #667eea' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Free Cash Flow (12mo)</div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: totalFreeCF >= 0 ? '#10b981' : '#ef4444' }}>
                      ${(totalFreeCF / 1000).toFixed(0)}K
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>OCF - CapEx</div>
                  </div>
                  
                  <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #f59e0b' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Avg Cash Flow Margin</div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>
                      {avgCashFlowMargin.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>OCF / Revenue</div>
                  </div>
                </div>

                {/* Cash Flow Statement Table */}
                <div style={{ background: 'white', borderRadius: '12px', padding: '32px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px' }}>Statement of Cash Flows</h2>
                  
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '10px', fontSize: '13px', fontWeight: '600', color: '#64748b', position: 'sticky', left: 0, background: 'white', minWidth: '200px' }}>Cash Flow Item</th>
                          {cashFlowData.map((cf, i) => (
                            <th key={i} style={{ textAlign: 'right', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '90px' }}>
                              {cf.month}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Operating Activities */}
                        <tr style={{ background: '#f0fdf4' }}>
                          <td colSpan={13} style={{ padding: '12px 10px', fontSize: '14px', fontWeight: '700', color: '#065f46' }}>
                            OPERATING ACTIVITIES
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569', paddingLeft: '24px' }}>Net Income</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              ${cf.netIncome.toLocaleString()}
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569', paddingLeft: '24px' }}>+ Depreciation</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              ${cf.depreciation.toLocaleString()}
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569', paddingLeft: '24px' }}>+ Change in Working Capital</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: cf.changeInWorkingCapital >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>
                              ${cf.changeInWorkingCapital.toLocaleString()}
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '2px solid #10b981', background: '#f0fdf4' }}>
                          <td style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#065f46' }}>Operating Cash Flow</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#065f46', textAlign: 'right' }}>
                              ${cf.operatingCashFlow.toLocaleString()}
                            </td>
                          ))}
                        </tr>
                        
                        {/* Investing Activities */}
                        <tr style={{ background: '#fef2f2' }}>
                          <td colSpan={13} style={{ padding: '12px 10px', fontSize: '14px', fontWeight: '700', color: '#991b1b' }}>
                            INVESTING ACTIVITIES
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569', paddingLeft: '24px' }}>Capital Expenditures</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#ef4444', textAlign: 'right' }}>
                              (${cf.capitalExpenditures.toLocaleString()})
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '2px solid #ef4444', background: '#fef2f2' }}>
                          <td style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#991b1b' }}>Investing Cash Flow</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#991b1b', textAlign: 'right' }}>
                              ${cf.investingCashFlow.toLocaleString()}
                            </td>
                          ))}
                        </tr>
                        
                        {/* Financing Activities */}
                        <tr style={{ background: '#eff6ff' }}>
                          <td colSpan={13} style={{ padding: '12px 10px', fontSize: '14px', fontWeight: '700', color: '#1e40af' }}>
                            FINANCING ACTIVITIES
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569', paddingLeft: '24px' }}>Change in Long-Term Debt</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: cf.changeInDebt >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>
                              ${cf.changeInDebt.toLocaleString()}
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569', paddingLeft: '24px' }}>Change in Equity</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: cf.changeInEquity >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>
                              ${cf.changeInEquity.toLocaleString()}
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '2px solid #3b82f6', background: '#eff6ff' }}>
                          <td style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#1e40af' }}>Financing Cash Flow</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#1e40af', textAlign: 'right' }}>
                              ${cf.financingCashFlow.toLocaleString()}
                            </td>
                          ))}
                        </tr>
                        
                        {/* Net Change */}
                        <tr style={{ borderBottom: '3px double #1e293b', background: '#f8fafc' }}>
                          <td style={{ padding: '12px 10px', fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>Net Change in Cash</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '12px 10px', fontSize: '14px', fontWeight: '700', color: cf.netCashChange >= 0 ? '#10b981' : '#ef4444', textAlign: 'right' }}>
                              ${cf.netCashChange.toLocaleString()}
                            </td>
                          ))}
                        </tr>
                        <tr style={{ background: '#fef3c7' }}>
                          <td style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: '#92400e' }}>Free Cash Flow</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '10px', fontSize: '13px', fontWeight: '700', color: cf.freeCashFlow >= 0 ? '#065f46' : '#991b1b', textAlign: 'right' }}>
                              ${cf.freeCashFlow.toLocaleString()}
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                          <td style={{ padding: '10px', fontSize: '13px', fontWeight: '600', color: '#475569' }}>Ending Cash Balance</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '10px', fontSize: '13px', fontWeight: '600', color: '#1e293b', textAlign: 'right' }}>
                              ${cf.endingCash.toLocaleString()}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Cash Flow Metrics */}
                <div style={{ background: 'white', borderRadius: '12px', padding: '32px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px' }}>Cash Flow Metrics</h2>
                  
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '10px', fontSize: '13px', fontWeight: '600', color: '#64748b', position: 'sticky', left: 0, background: 'white', minWidth: '180px' }}>Metric</th>
                          {cashFlowData.map((cf, i) => (
                            <th key={i} style={{ textAlign: 'right', padding: '10px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '90px' }}>
                              {cf.month}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569' }}>Cash Flow Margin (%)</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {cf.cashFlowMargin.toFixed(1)}%
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569' }}>Days Cash on Hand</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {cf.daysCashOnHand.toFixed(0)} days
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontSize: '12px', color: '#475569' }}>Cash Conversion Rate</td>
                          {cashFlowData.map((cf, i) => (
                            <td key={i} style={{ padding: '8px 10px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {cf.netIncome > 0 ? ((cf.operatingCashFlow / cf.netIncome) * 100).toFixed(0) : 'N/A'}%
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Key Insights */}
                <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px' }}>Cash Flow Insights</h2>
                  
                  <div style={{ display: 'grid', gap: '16px' }}>
                    {totalOperatingCF > 0 ? (
                      <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#065f46', marginBottom: '4px' }}>✓ Positive Operating Cash Flow</div>
                        <div style={{ fontSize: '13px', color: '#047857' }}>
                          The company generated ${(totalOperatingCF / 1000).toFixed(0)}K in cash from operations over the last 12 months, indicating healthy operational performance.
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#991b1b', marginBottom: '4px' }}>⚠ Negative Operating Cash Flow</div>
                        <div style={{ fontSize: '13px', color: '#dc2626' }}>
                          The company consumed ${Math.abs(totalOperatingCF / 1000).toFixed(0)}K in cash from operations, which may indicate operational challenges.
                        </div>
                      </div>
                    )}
                    
                    {totalFreeCF > 0 ? (
                      <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#065f46', marginBottom: '4px' }}>✓ Positive Free Cash Flow</div>
                        <div style={{ fontSize: '13px', color: '#047857' }}>
                          After capital expenditures, the company has ${(totalFreeCF / 1000).toFixed(0)}K in free cash flow available for growth, debt reduction, or distributions.
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '16px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', marginBottom: '4px' }}>⚠ Negative Free Cash Flow</div>
                        <div style={{ fontSize: '13px', color: '#b45309' }}>
                          Capital expenditures exceed operating cash flow by ${Math.abs(totalFreeCF / 1000).toFixed(0)}K, requiring external financing.
                        </div>
                      </div>
                    )}
                    
                    {avgCashFlowMargin > 15 ? (
                      <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#065f46', marginBottom: '4px' }}>✓ Strong Cash Flow Margin</div>
                        <div style={{ fontSize: '13px', color: '#047857' }}>
                          Average cash flow margin of {avgCashFlowMargin.toFixed(1)}% indicates the company efficiently converts revenue into cash.
                        </div>
                      </div>
                    ) : avgCashFlowMargin < 5 ? (
                      <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#991b1b', marginBottom: '4px' }}>⚠ Low Cash Flow Margin</div>
                        <div style={{ fontSize: '13px', color: '#dc2626' }}>
                          Cash flow margin of {avgCashFlowMargin.toFixed(1)}% suggests challenges in converting revenue to cash. Review receivables collection and expense timing.
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Profile View */}
      {currentView === 'profile' && selectedCompanyId && currentUser?.role === 'consultant' && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
          <style>{`
            @media print {
              @page {
                margin: 0.75in;
              }
              
              .page-break {
                page-break-after: always;
                break-after: page;
              }
              
              .print-page-header {
                display: flex !important;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 12px;
                border-bottom: 2px solid #1e293b;
              }
              
              aside, header, .no-print {
                display: none !important;
              }
              
              body {
                background: white !important;
              }
              
              * {
                box-shadow: none !important;
                border-radius: 0 !important;
              }
            }
            
            .print-page-header {
              display: none;
            }
          `}</style>
          
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>Company Profile</h1>
              <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                This summary was constructed from the company's past three years of financial statements.
              </p>
            </div>
            <button
              onClick={() => window.print()}
              style={{ 
                padding: '12px 24px', 
                background: '#667eea', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                fontSize: '14px', 
                fontWeight: '600', 
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(102, 126, 234, 0.3)'
              }}
            >
              🖨️ Print Profile
            </button>
          </div>

          {(() => {
            // Get or create profile for this company
            let profile = companyProfiles.find(p => p.companyId === selectedCompanyId);
            
            if (!profile) {
              profile = {
                companyId: selectedCompanyId,
                legalStructure: '',
                businessStatus: '',
                ownership: '',
                workforce: '',
                keyAdvisors: '',
                specialNotes: '',
                qoeNotes: '',
                disclosures: {
                  bankruptcies: 'None',
                  liens: 'None',
                  contracts: 'None',
                  lawsuits: 'None',
                  mostFavoredNation: 'None',
                  equityControl: 'None',
                  rightOfFirstRefusal: 'None',
                  shareholderProtections: 'None',
                  changeInControl: 'None',
                  regulatoryApprovals: 'None',
                  auditedFinancials: 'No'
                }
              };
            }

            const updateProfile = (updates: Partial<CompanyProfile>) => {
              const updatedProfiles = companyProfiles.filter(p => p.companyId !== selectedCompanyId);
              updatedProfiles.push({ ...profile!, ...updates });
              setCompanyProfiles(updatedProfiles);
            };

            // Get company data
            const ltmData = monthly.length >= 12 ? monthly.slice(-12) : monthly;
            const ltmRev = ltmData.reduce((sum, m) => sum + m.revenue, 0);
            const ltmAssets = ltmData.length > 0 ? ltmData[ltmData.length - 1].totalAssets : 0;
            
            // Get latest 3 years of data for financial statement overview
            const latest = monthly[monthly.length - 1];
            const oneYearAgo = monthly.length >= 13 ? monthly[monthly.length - 13] : null;
            const twoYearsAgo = monthly.length >= 25 ? monthly[monthly.length - 25] : null;

            // Get industry info
            const industry = INDUSTRY_SECTORS.find(i => i.id === company?.industrySector);
            
            // Calculate Last 12 months for ratio table
            // Get up to last 12 trend data points (or fewer if less data available)
            const last12Trends = trendData.slice(-12);
            // Get the corresponding months for these trend points
            // trendData starts at month index 12, so we need to match up the months
            const trendStartIndex = Math.max(0, monthly.length - trendData.length);
            const last12Months = monthly.slice(trendStartIndex + Math.max(0, trendData.length - 12));

            return (
              <>
                {/* Section 1: Business Profile */}
                <div className="page-break" style={{ background: 'white', borderRadius: '12px', padding: '32px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div className="print-page-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{company?.name}</div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    </div>
                  </div>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
                    Business Profile
                  </h2>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ fontWeight: '600', color: '#475569' }}>COMPANY NAME</div>
                    <div style={{ color: '#1e293b' }}>{company?.name || 'N/A'}</div>
                    
                    <div style={{ fontWeight: '600', color: '#475569' }}>LEGAL STRUCTURE</div>
                    <input 
                      type="text" 
                      value={profile.legalStructure} 
                      onChange={(e) => updateProfile({ legalStructure: e.target.value })}
                      placeholder="e.g., C Corp, S Corp, LLC"
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    
                    <div style={{ fontWeight: '600', color: '#475569' }}>BUSINESS STATUS</div>
                    <select
                      value={profile.businessStatus}
                      onChange={(e) => updateProfile({ businessStatus: e.target.value })}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    >
                      <option value="">Select status</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                      <option value="PENDING">PENDING</option>
                    </select>
                    
                    <div style={{ fontWeight: '600', color: '#475569' }}>OWNERSHIP</div>
                    <input 
                      type="text" 
                      value={profile.ownership} 
                      onChange={(e) => updateProfile({ ownership: e.target.value })}
                      placeholder="Owner name(s)"
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    
                    <div style={{ fontWeight: '600', color: '#475569' }}>ADDRESS</div>
                    <div style={{ color: '#1e293b' }}>{company?.location || 'Not set'}</div>
                    
                    <div style={{ fontWeight: '600', color: '#475569' }}>INDUSTRY</div>
                    <div style={{ color: '#1e293b' }}>
                      {industry ? `${industry.id} - ${industry.name}` : 'Not set'}
                    </div>
                    
                    <div style={{ fontWeight: '600', color: '#475569' }}>WORKFORCE</div>
                    <input 
                      type="text" 
                      value={profile.workforce} 
                      onChange={(e) => updateProfile({ workforce: e.target.value })}
                      placeholder="e.g., 3 FT, 1 owner"
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    
                    <div style={{ fontWeight: '600', color: '#475569' }}>LTM REVENUE</div>
                    <div style={{ color: '#1e293b' }}>
                      {ltmRev < 500000 ? 'Under $500K' : `$${(ltmRev / 1000).toFixed(0)}K`}
                    </div>
                    
                    <div style={{ fontWeight: '600', color: '#475569' }}>TOTAL ASSETS</div>
                    <div style={{ color: '#1e293b' }}>
                      ${ltmAssets.toLocaleString()}
                    </div>
                    
                    <div style={{ fontWeight: '600', color: '#475569' }}>KEY ADVISORS</div>
                    <input 
                      type="text" 
                      value={profile.keyAdvisors} 
                      onChange={(e) => updateProfile({ keyAdvisors: e.target.value })}
                      placeholder="Advisor names"
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                  </div>
                  
                  <div style={{ marginTop: '24px' }}>
                    <div style={{ fontWeight: '600', color: '#475569', marginBottom: '8px' }}>SPECIAL NOTES</div>
                    <textarea
                      value={profile.specialNotes}
                      onChange={(e) => updateProfile({ specialNotes: e.target.value })}
                      placeholder="Any special notes about sale, buyer requirements, financing, etc."
                      rows={4}
                      style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                  </div>
                  
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Quality of Earnings (QoE)</div>
                    <textarea
                      value={profile.qoeNotes}
                      onChange={(e) => updateProfile({ qoeNotes: e.target.value })}
                      placeholder="Notes on revenue quality, recurring vs. non-recurring, cash vs. credit, etc."
                      rows={3}
                      style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                  </div>
                </div>

                {/* Section 2: Financial Statement Overview */}
                <div className="page-break" style={{ background: 'white', borderRadius: '12px', padding: '32px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div className="print-page-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{company?.name}</div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    </div>
                  </div>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
                    Financial Statement Overview
                  </h2>
                  
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '16px' }}>BALANCE SHEET</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}></th>
                          <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Current</th>
                          <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Yr End 2024</th>
                          <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Yr End 2023</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>Total Assets</td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${latest ? latest.totalAssets.toLocaleString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${oneYearAgo ? oneYearAgo.totalAssets.toLocaleString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${twoYearsAgo ? twoYearsAgo.totalAssets.toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>Total Liabilities</td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${latest ? latest.totalLiab.toLocaleString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${oneYearAgo ? oneYearAgo.totalLiab.toLocaleString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${twoYearsAgo ? twoYearsAgo.totalLiab.toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>Total Equity</td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${latest ? latest.totalEquity.toLocaleString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${oneYearAgo ? oneYearAgo.totalEquity.toLocaleString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${twoYearsAgo ? twoYearsAgo.totalEquity.toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginTop: '32px', marginBottom: '16px' }}>INCOME STATEMENT</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}></th>
                          <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>LTM</th>
                          <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>2024</th>
                          <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#64748b' }}>2023</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>Revenue</td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${ltmRev.toLocaleString()}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${oneYearAgo ? monthly.slice(-24, -12).reduce((sum, m) => sum + m.revenue, 0).toLocaleString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${twoYearsAgo ? monthly.slice(-36, -24).reduce((sum, m) => sum + m.revenue, 0).toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>Margin %</td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            {((ltmData.reduce((sum, m) => sum + (m.revenue - m.cogsTotal), 0) / ltmRev) * 100).toFixed(1)}%
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            {oneYearAgo ? ((monthly.slice(-24, -12).reduce((sum, m) => sum + (m.revenue - m.cogsTotal), 0) / monthly.slice(-24, -12).reduce((sum, m) => sum + m.revenue, 0)) * 100).toFixed(1) + '%' : 'N/A'}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            {twoYearsAgo ? ((monthly.slice(-36, -24).reduce((sum, m) => sum + (m.revenue - m.cogsTotal), 0) / monthly.slice(-36, -24).reduce((sum, m) => sum + m.revenue, 0)) * 100).toFixed(1) + '%' : 'N/A'}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#475569' }}>Total Expenses</td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${ltmData.reduce((sum, m) => sum + m.expense, 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${oneYearAgo ? monthly.slice(-24, -12).reduce((sum, m) => sum + m.expense, 0).toLocaleString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right' }}>
                            ${twoYearsAgo ? monthly.slice(-36, -24).reduce((sum, m) => sum + m.expense, 0).toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Net Income</td>
                          <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#1e293b', textAlign: 'right' }}>
                            ${ltmData.reduce((sum, m) => sum + (m.revenue - m.expense), 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#1e293b', textAlign: 'right' }}>
                            ${oneYearAgo ? monthly.slice(-24, -12).reduce((sum, m) => sum + (m.revenue - m.expense), 0).toLocaleString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: '#1e293b', textAlign: 'right' }}>
                            ${twoYearsAgo ? monthly.slice(-36, -24).reduce((sum, m) => sum + (m.revenue - m.expense), 0).toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section 3: Financial Ratios Overview */}
                <div className="page-break" style={{ background: 'white', borderRadius: '12px', padding: '32px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div className="print-page-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{company?.name}</div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    </div>
                  </div>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
                    Financial Ratios Overview
                  </h2>
                  
                  {/* Liquidity Ratios */}
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>Liquidity Ratios</h3>
                  <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b', minWidth: '120px' }}>Ratio</th>
                          {last12Months.map((m, i) => (
                            <th key={i} style={{ textAlign: 'right', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '60px' }}>
                              {m.month.substring(0, m.month.lastIndexOf('/'))}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Current Ratio</td>
                          {last12Trends.map((data, i) => (
                            <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {data?.currentRatio !== undefined ? data.currentRatio.toFixed(2) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Quick Ratio</td>
                          {last12Trends.map((data, i) => (
                            <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {data?.quickRatio !== undefined ? data.quickRatio.toFixed(2) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Activity Ratios */}
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>Activity Ratios</h3>
                  <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b', minWidth: '120px' }}>Ratio</th>
                          {last12Months.map((m, i) => (
                            <th key={i} style={{ textAlign: 'right', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '60px' }}>
                              {m.month.substring(0, m.month.lastIndexOf('/'))}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Inventory Turnover</td>
                          {last12Trends.map((data, i) => (
                            <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {data?.invTurnover !== undefined ? data.invTurnover.toFixed(2) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Receivables Turnover</td>
                          {last12Trends.map((data, i) => (
                            <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {data?.arTurnover !== undefined ? data.arTurnover.toFixed(2) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Sales/Working Capital</td>
                          {last12Trends.map((data, i) => (
                            <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {data?.salesWC !== undefined ? data.salesWC.toFixed(2) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Coverage Ratios */}
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>Coverage Ratios</h3>
                  <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b', minWidth: '120px' }}>Ratio</th>
                          {last12Months.map((m, i) => (
                            <th key={i} style={{ textAlign: 'right', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '60px' }}>
                              {m.month.substring(0, m.month.lastIndexOf('/'))}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Interest Coverage</td>
                          {last12Trends.map((data, i) => (
                            <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {data?.interestCov !== undefined ? data.interestCov.toFixed(2) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Debt Service Coverage</td>
                          {last12Trends.map((data, i) => (
                            <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {data?.debtSvcCov !== undefined ? data.debtSvcCov.toFixed(2) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Leverage Ratios */}
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>Leverage Ratios</h3>
                  <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b', minWidth: '120px' }}>Ratio</th>
                          {last12Months.map((m, i) => (
                            <th key={i} style={{ textAlign: 'right', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '60px' }}>
                              {m.month.substring(0, m.month.lastIndexOf('/'))}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Debt/Net Worth</td>
                          {last12Trends.map((data, i) => (
                            <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {data?.debtToNW !== undefined ? data.debtToNW.toFixed(2) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>Leverage Ratio</td>
                          {last12Trends.map((data, i) => (
                            <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {data?.leverage !== undefined ? data.leverage.toFixed(2) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Operating Ratios */}
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>Operating Ratios</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', fontWeight: '600', color: '#64748b', minWidth: '120px' }}>Ratio</th>
                          {last12Months.map((m, i) => (
                            <th key={i} style={{ textAlign: 'right', padding: '8px', fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '60px' }}>
                              {m.month.substring(0, m.month.lastIndexOf('/'))}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>ROE</td>
                          {last12Trends.map((data, i) => (
                            <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {data?.roe !== undefined ? data.roe.toFixed(2) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>ROA</td>
                          {last12Trends.map((data, i) => (
                            <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {data?.roa !== undefined ? data.roa.toFixed(2) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>EBITDA/Revenue</td>
                          {last12Trends.map((data, i) => (
                            <td key={i} style={{ padding: '8px', fontSize: '12px', color: '#1e293b', textAlign: 'right' }}>
                              {data?.ebitdaMargin !== undefined ? data.ebitdaMargin.toFixed(2) : 'N/A'}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section 4: Company Disclosures */}
                <div style={{ background: 'white', borderRadius: '12px', padding: '32px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div className="print-page-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>{company?.name}</div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    </div>
                  </div>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
                    Company Disclosures
                  </h2>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '12px' }}>
                    <div style={{ fontWeight: '600', color: '#475569' }}>DISCLOSURE</div>
                    <div style={{ fontWeight: '600', color: '#475569' }}>STATUS</div>
                    
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>Bankruptcies</div>
                    <input 
                      type="text" 
                      value={profile.disclosures.bankruptcies} 
                      onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, bankruptcies: e.target.value } })}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>Liens or Judgements (business, equipment)</div>
                    <input 
                      type="text" 
                      value={profile.disclosures.liens} 
                      onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, liens: e.target.value } })}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>Material Contract Covenants (e.g. on loans)</div>
                    <input 
                      type="text" 
                      value={profile.disclosures.contracts} 
                      onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, contracts: e.target.value } })}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>Lawsuits (as plaintiff a/o defendant)</div>
                    <input 
                      type="text" 
                      value={profile.disclosures.lawsuits} 
                      onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, lawsuits: e.target.value } })}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>Most Favored Nation on contracts</div>
                    <input 
                      type="text" 
                      value={profile.disclosures.mostFavoredNation} 
                      onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, mostFavoredNation: e.target.value } })}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>Equity Control (who/how many needed)</div>
                    <input 
                      type="text" 
                      value={profile.disclosures.equityControl} 
                      onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, equityControl: e.target.value } })}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>Right of First Refusal on sale</div>
                    <input 
                      type="text" 
                      value={profile.disclosures.rightOfFirstRefusal} 
                      onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, rightOfFirstRefusal: e.target.value } })}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>Shareholder Protections (i.e. blocking/approvals)</div>
                    <input 
                      type="text" 
                      value={profile.disclosures.shareholderProtections} 
                      onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, shareholderProtections: e.target.value } })}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>Change-in-Control triggers (i.e. with customers and/or suppliers)</div>
                    <input 
                      type="text" 
                      value={profile.disclosures.changeInControl} 
                      onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, changeInControl: e.target.value } })}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>Regulatory Approvals (local/State/Federal)</div>
                    <input 
                      type="text" 
                      value={profile.disclosures.regulatoryApprovals} 
                      onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, regulatoryApprovals: e.target.value } })}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    />
                    
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>Audited Financial Statements</div>
                    <select
                      value={profile.disclosures.auditedFinancials}
                      onChange={(e) => updateProfile({ disclosures: { ...profile.disclosures, auditedFinancials: e.target.value } })}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    >
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                      <option value="Partial">Partial</option>
                    </select>
                  </div>
                </div>

                <div className="no-print" style={{ textAlign: 'center', padding: '24px' }}>
                  <button
                    onClick={() => {
                      alert('Profile saved successfully!');
                    }}
                    style={{ 
                      padding: '12px 32px', 
                      background: '#667eea', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '8px', 
                      fontSize: '16px', 
                      fontWeight: '600', 
                      cursor: 'pointer',
                      boxShadow: '0 4px 6px rgba(102, 126, 234, 0.3)'
                    }}
                  >
                    Save Profile
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Management Assessment - Questionnaire View */}
      {currentView === 'ma-questionnaire' && selectedCompanyId && (currentUser?.role === 'user' || currentUser?.role === 'consultant') && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Management Assessment Questionnaire</h1>
          
          {currentUser?.role === 'consultant' && (
            <div style={{ background: '#fffbeb', border: '2px solid #fbbf24', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#92400e', marginBottom: '8px' }}>⚠ Consultant View Only</h3>
              <p style={{ fontSize: '14px', color: '#78350f', margin: 0 }}>
                As a consultant, you can view this questionnaire but cannot fill it out. Only company users can complete assessments. 
                Navigate to "View Assessments" in the Administrator Dashboard to see user responses.
              </p>
            </div>
          )}
          
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', opacity: currentUser?.role === 'consultant' ? 0.6 : 1, pointerEvents: currentUser?.role === 'consultant' ? 'none' : 'auto' }}>
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0c4a6e', marginBottom: '8px' }}>Rating Scale</h3>
              <div style={{ fontSize: '13px', color: '#0c4a6e', lineHeight: '1.6' }}>
                <strong>1:</strong> No evidence to support practices or any knowledge of subject<br />
                <strong>2:</strong> Limited practices in place, limited knowledge of subject<br />
                <strong>3:</strong> Basic practices in place, basic awareness of subject<br />
                <strong>4:</strong> Clear practices in place, above average knowledge of subject<br />
                <strong>5:</strong> Extensive practices in place, extensive knowledge of subject
              </div>
            </div>

            {assessmentData.map((category) => (
              <div key={category.id} style={{ marginBottom: '32px', background: '#f8fafc', borderRadius: '8px', padding: '20px', border: '1px solid #e2e8f0' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '16px', borderBottom: '2px solid #cbd5e1', paddingBottom: '8px' }}>
                  {category.id}. {category.name}
                </h2>
                
                {category.questions.map((question) => (
                  <div key={question.id} style={{ marginBottom: '16px', background: 'white', borderRadius: '8px', padding: '16px', border: unansweredQuestions.includes(question.id) ? '2px solid #ef4444' : '1px solid #e2e8f0' }}>
                    <label style={{ display: 'block', fontSize: '14px', color: '#475569', marginBottom: '12px', fontWeight: '500' }}>
                      {question.text}
                    </label>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <label key={rating} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '8px 12px', background: assessmentResponses[question.id] === rating ? '#667eea' : '#f1f5f9', color: assessmentResponses[question.id] === rating ? 'white' : '#475569', borderRadius: '6px', fontSize: '14px', fontWeight: '600', border: assessmentResponses[question.id] === rating ? '2px solid #667eea' : '1px solid #cbd5e1', transition: 'all 0.2s' }}>
                          <input 
                            type="radio" 
                            name={question.id} 
                            value={rating} 
                            checked={assessmentResponses[question.id] === rating}
                            onChange={() => setAssessmentResponses(prev => ({ ...prev, [question.id]: rating }))}
                            style={{ display: 'none' }}
                          />
                          {rating}
                        </label>
                      ))}
                    </div>
                    {unansweredQuestions.includes(question.id) && (
                      <div style={{ marginTop: '8px', fontSize: '12px', color: '#ef4444', fontWeight: '600' }}>
                        ⚠ Please select a rating
                      </div>
                    )}
                  </div>
                ))}
                
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                    Notes for {category.name}:
                  </label>
                  <textarea
                    value={assessmentNotes[category.id] || ''}
                    onChange={(e) => setAssessmentNotes(prev => ({ ...prev, [category.id]: e.target.value }))}
                    style={{ width: '100%', minHeight: '80px', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
                    placeholder="Add notes or action items..."
                  />
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '32px' }}>
              <button 
                onClick={() => {
                  const allQuestions = assessmentData.flatMap(cat => cat.questions.map(q => q.id));
                  const unanswered = allQuestions.filter(qId => !assessmentResponses[qId]);
                  setUnansweredQuestions(unanswered);
                  
                  if (unanswered.length === 0) {
                    const totalScore = Object.values(assessmentResponses).reduce((sum, val) => sum + val, 0) / Object.keys(assessmentResponses).length;
                    const record: AssessmentRecord = {
                      id: Date.now().toString(),
                      userEmail: currentUser?.email || '',
                      userName: currentUser?.name || '',
                      companyId: selectedCompanyId,
                      companyName: company?.name || '',
                      responses: assessmentResponses,
                      notes: assessmentNotes,
                      completedDate: new Date().toISOString(),
                      overallScore: totalScore
                    };
                    setAssessmentRecords(prev => [...prev, record]);
                    alert('Assessment saved successfully!');
                    setCurrentView('ma-your-results');
                  } else {
                    alert(`Please answer all ${unanswered.length} unanswered question(s) before saving.`);
                  }
                }}
                style={{ padding: '14px 32px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 12px rgba(102,126,234,0.3)' }}
              >
                Save Assessment
              </button>
              <button 
                onClick={() => {
                  if (confirm('Are you sure you want to reset all responses?')) {
                    setAssessmentResponses({});
                    setAssessmentNotes({});
                    setUnansweredQuestions([]);
                  }
                }}
                style={{ padding: '14px 32px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Management Assessment - Your Results View */}
      {currentView === 'ma-your-results' && selectedCompanyId && (currentUser?.role === 'user' || currentUser?.role === 'consultant') && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>
            {currentUser?.role === 'consultant' ? 'Assessment Results - All Participants' : 'Your Assessment Results'}
          </h1>
          
          {currentUser?.role === 'consultant' ? (
            // Show all participants' results for consultants
            <>
              {assessmentRecords.filter(r => r.companyId === selectedCompanyId).length === 0 ? (
                <div style={{ background: 'white', borderRadius: '12px', padding: '60px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>No Assessments Yet</h3>
                  <p style={{ fontSize: '14px', color: '#94a3b8' }}>No users have completed assessments for this company</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '24px' }}>
                  {assessmentRecords.filter(r => r.companyId === selectedCompanyId).map((record) => (
                    <div key={record.id} style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
                        <div>
                          <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>{record.userName}</h2>
                          <div style={{ fontSize: '14px', color: '#64748b' }}>
                            Completed: {new Date(record.completedDate).toLocaleDateString()} | 
                            <span style={{ fontWeight: '600', color: '#667eea', marginLeft: '8px' }}>Overall Score: {record.overallScore.toFixed(1)}/5.0</span>
                          </div>
                        </div>
                      </div>
                      
                      <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '16px' }}>Scores by Category</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                        {assessmentData.map((category) => {
                          const categoryQuestions = category.questions.map(q => q.id);
                          const categoryResponses = categoryQuestions.map(qId => record.responses[qId]).filter(r => r !== undefined);
                          const avgScore = categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
                          
                          return (
                            <div key={category.id} style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>{category.name}</div>
                              <div style={{ fontSize: '24px', fontWeight: '700', color: '#667eea' }}>{avgScore.toFixed(1)}</div>
                              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>out of 5.0</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            // Show individual results for users
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px' }}>Score by Category</h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {assessmentData.map((category) => {
                  const categoryQuestions = category.questions.map(q => q.id);
                  const categoryResponses = categoryQuestions.map(qId => assessmentResponses[qId]).filter(r => r !== undefined);
                  const avgScore = categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
                  
                  return (
                    <div key={category.id} style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>{category.name}</div>
                      <div style={{ fontSize: '32px', fontWeight: '700', color: '#667eea' }}>{avgScore.toFixed(1)}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>out of 5.0</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button 
                  onClick={() => setCurrentView('ma-questionnaire')}
                  style={{ padding: '12px 24px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Edit Assessment
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Management Assessment - Welcome View */}
      {currentView === 'ma-welcome' && (currentUser?.role === 'user' || currentUser?.role === 'consultant') && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '40px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h1 style={{ fontSize: '36px', fontWeight: '700', color: '#1e293b', marginBottom: '24px', textAlign: 'center' }}>Management Assessment Questionnaire</h1>
            
            <div style={{ fontSize: '16px', color: '#475569', lineHeight: '1.8', maxWidth: '900px', margin: '0 auto 32px', textAlign: 'left' }}>
              <p style={{ marginBottom: '16px' }}>
                Our Trademarked assessment tool is designed to facilitate the discovery of Management Maturity Level in small businesses. It has been developed to highlight areas under financial management that can be targeted for improvement.
              </p>
              
              <p style={{ marginBottom: '16px' }}>
                The tool is a questionnaire to be completed by the key employees in your company. It is designed as a tool for management to help you better understand the strengths and weaknesses of your processes and communications across teams in your company.
              </p>
              
              <p style={{ marginBottom: '0' }}>
                The Management Assessment service provides detailed evaluation of your company's management practices, leadership effectiveness, and organizational structure to help you optimize performance and drive growth.
              </p>
            </div>
            
            <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '32px', marginTop: '32px', textAlign: 'left' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>Topics Covered</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '14px', color: '#475569' }}>
                {assessmentData.map((cat) => (
                  <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#10b981', fontSize: '18px' }}>✓</span>
                    <span>{cat.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <button 
              onClick={() => setCurrentView('ma-questionnaire')}
              style={{ marginTop: '32px', padding: '16px 48px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 12px rgba(102,126,234,0.3)' }}
            >
              Start Assessment
            </button>
          </div>
        </div>
      )}

      {/* Management Assessment - Scores Summary View */}
      {currentView === 'ma-scores-summary' && selectedCompanyId && (currentUser?.role === 'user' || currentUser?.role === 'consultant') && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Scores Summary - All Participants</h1>
          
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px' }}>Average Scores Across All Participants</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              {assessmentData.map((category) => {
                const companyRecords = assessmentRecords.filter(r => r.companyId === selectedCompanyId);
                const allCategoryScores = companyRecords.map(record => {
                  const categoryQuestions = category.questions.map(q => q.id);
                  const categoryResponses = categoryQuestions.map(qId => record.responses[qId]).filter(r => r !== undefined);
                  return categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
                }).filter(s => s > 0);
                
                const avgScore = allCategoryScores.length > 0 ? allCategoryScores.reduce((sum, val) => sum + val, 0) / allCategoryScores.length : 0;
                
                return (
                  <div key={category.id} style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>{category.name}</div>
                    <div style={{ fontSize: '32px', fontWeight: '700', color: '#667eea' }}>{avgScore.toFixed(1)}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>avg across {allCategoryScores.length} participant(s)</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Management Assessment - Scoring Guide View */}
      {currentView === 'ma-scoring-guide' && (currentUser?.role === 'user' || currentUser?.role === 'consultant') && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Scoring Guide</h1>
          
          <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px' }}>Rating Scale Descriptions</h2>
            
            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{ background: '#fee2e2', borderRadius: '8px', padding: '20px', border: '2px solid #ef4444' }}>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#991b1b', marginBottom: '8px' }}>1 - No Evidence</div>
                <p style={{ fontSize: '14px', color: '#7f1d1d', margin: 0 }}>No evidence to support practices or any knowledge of subject</p>
              </div>
              <div style={{ background: '#fed7aa', borderRadius: '8px', padding: '20px', border: '2px solid #f97316' }}>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#9a3412', marginBottom: '8px' }}>2 - Limited</div>
                <p style={{ fontSize: '14px', color: '#7c2d12', margin: 0 }}>Limited practices in place, limited knowledge of subject</p>
              </div>
              <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '20px', border: '2px solid #f59e0b' }}>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#92400e', marginBottom: '8px' }}>3 - Basic</div>
                <p style={{ fontSize: '14px', color: '#78350f', margin: 0 }}>Basic practices in place, basic awareness of subject</p>
              </div>
              <div style={{ background: '#dbeafe', borderRadius: '8px', padding: '20px', border: '2px solid #3b82f6' }}>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e40af', marginBottom: '8px' }}>4 - Clear Practices</div>
                <p style={{ fontSize: '14px', color: '#1e3a8a', margin: 0 }}>Clear practices in place, above average knowledge of subject</p>
              </div>
              <div style={{ background: '#d1fae5', borderRadius: '8px', padding: '20px', border: '2px solid #10b981' }}>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#065f46', marginBottom: '8px' }}>5 - Extensive</div>
                <p style={{ fontSize: '14px', color: '#064e3b', margin: 0 }}>Extensive practices in place, extensive knowledge of subject</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Management Assessment - Charts View */}
      {currentView === 'ma-charts' && selectedCompanyId && (currentUser?.role === 'user' || currentUser?.role === 'consultant') && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '32px' }}>Assessment Charts</h1>
          
          {Object.keys(assessmentResponses).length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#64748b', marginBottom: '16px' }}>No Assessment Data</h2>
              <p style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '24px' }}>Please complete the questionnaire first to view charts.</p>
              <button 
                onClick={() => setCurrentView('ma-questionnaire')}
                style={{ padding: '12px 32px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}
              >
                Go to Questionnaire
              </button>
            </div>
          ) : (
            <>
              <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px' }}>Category Scores - Bar Chart</h2>
                
                <div style={{ padding: '20px' }}>
              {assessmentData.map((category) => {
                const categoryQuestions = category.questions.map(q => q.id);
                const categoryResponses = categoryQuestions.map(qId => assessmentResponses[qId]).filter(r => r !== undefined);
                const avgScore = categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
                const percentage = (avgScore / 5) * 100;
                
                return (
                  <div key={category.id} style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#475569' }}>{category.name}</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#667eea' }}>{avgScore.toFixed(1)} / 5.0</span>
                    </div>
                    <div style={{ background: '#e2e8f0', borderRadius: '8px', height: '24px', overflow: 'hidden' }}>
                      <div style={{ background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)', height: '100%', width: `${percentage}%`, transition: 'width 0.5s', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px' }}>
                        {percentage > 15 && <span style={{ fontSize: '12px', fontWeight: '600', color: 'white' }}>{percentage.toFixed(0)}%</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px' }}>Category Scores - Radar Chart</h2>
            
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <svg width="500" height="500" viewBox="0 0 500 500">
                <g transform="translate(250, 250)">
                  {/* Draw concentric circles */}
                  {[1, 2, 3, 4, 5].map((level) => (
                    <circle
                      key={level}
                      cx="0"
                      cy="0"
                      r={level * 40}
                      fill="none"
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />
                  ))}
                  
                  {/* Draw axis lines and labels */}
                  {assessmentData.map((category, idx) => {
                    const angle = (idx * 2 * Math.PI) / assessmentData.length - Math.PI / 2;
                    const x2 = Math.cos(angle) * 200;
                    const y2 = Math.sin(angle) * 200;
                    const labelX = Math.cos(angle) * 220;
                    const labelY = Math.sin(angle) * 220;
                    
                    return (
                      <g key={category.id}>
                        <line x1="0" y1="0" x2={x2} y2={y2} stroke="#cbd5e1" strokeWidth="1" />
                        <text
                          x={labelX}
                          y={labelY}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="600"
                          fill="#475569"
                          dominantBaseline="middle"
                        >
                          {category.name.length > 20 ? category.name.substring(0, 18) + '...' : category.name}
                        </text>
                      </g>
                    );
                  })}
                  
                  {/* Draw data polygon */}
                  <polygon
                    points={assessmentData.map((category, idx) => {
                      const categoryQuestions = category.questions.map(q => q.id);
                      const categoryResponses = categoryQuestions.map(qId => assessmentResponses[qId]).filter(r => r !== undefined);
                      const avgScore = categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
                      const angle = (idx * 2 * Math.PI) / assessmentData.length - Math.PI / 2;
                      const radius = (avgScore / 5) * 200;
                      const x = Math.cos(angle) * radius;
                      const y = Math.sin(angle) * radius;
                      return `${x},${y}`;
                    }).join(' ')}
                    fill="rgba(102, 126, 234, 0.2)"
                    stroke="#667eea"
                    strokeWidth="3"
                  />
                  
                  {/* Draw data points */}
                  {assessmentData.map((category, idx) => {
                    const categoryQuestions = category.questions.map(q => q.id);
                    const categoryResponses = categoryQuestions.map(qId => assessmentResponses[qId]).filter(r => r !== undefined);
                    const avgScore = categoryResponses.length > 0 ? categoryResponses.reduce((sum, val) => sum + val, 0) / categoryResponses.length : 0;
                    const angle = (idx * 2 * Math.PI) / assessmentData.length - Math.PI / 2;
                    const radius = (avgScore / 5) * 200;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;
                    
                    return (
                      <circle key={category.id} cx={x} cy={y} r="6" fill="#667eea" stroke="white" strokeWidth="2">
                        <title>{category.name}: {avgScore.toFixed(1)}</title>
                      </circle>
                    );
                  })}
                  
                  {/* Center circle with legend */}
                  <circle cx="0" cy="0" r="30" fill="white" stroke="#cbd5e1" strokeWidth="1" />
                  <text x="0" y="-5" textAnchor="middle" fontSize="10" fontWeight="600" fill="#64748b">Scale</text>
                  <text x="0" y="8" textAnchor="middle" fontSize="10" fill="#64748b">1 to 5</text>
                </g>
              </svg>
            </div>
          </div>
            </>
          )}
        </div>
      )}
        </main>
      </div>
    </div>
  );
}
