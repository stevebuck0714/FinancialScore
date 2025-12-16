// Data processing and transformation utilities

import { parseDateLike, monthKey, sum, pctChange } from './financial';
import type { Mappings, NormalRow } from '../types';
import { KPI_TO_BENCHMARK_MAP } from '../constants';

export function getBenchmarkValue(benchmarks: any[], metricName: string): number | null {
  if (!benchmarks || benchmarks.length === 0) {
    console.log(`[getBenchmarkValue] No benchmarks array for "${metricName}"`);
    return null;
  }
  
  // Normalize metric name (trim whitespace)
  const normalizedMetricName = metricName.trim();
  
  // Try exact match first (case-insensitive)
  const exactMatch = benchmarks.find(b => 
    b.metricName && b.metricName.trim().toLowerCase() === normalizedMetricName.toLowerCase()
  );
  if (exactMatch && exactMatch.fiveYearValue != null && !isNaN(exactMatch.fiveYearValue)) {
    console.log(`[getBenchmarkValue] Found exact match for "${metricName}": ${exactMatch.fiveYearValue}`);
    return exactMatch.fiveYearValue;
  }
  
  // Try all possible mapped names
  const possibleNames = KPI_TO_BENCHMARK_MAP[metricName];
  if (possibleNames && Array.isArray(possibleNames)) {
    for (const name of possibleNames) {
      const match = benchmarks.find(b => 
        b.metricName && b.metricName.trim().toLowerCase() === name.trim().toLowerCase()
      );
      if (match && match.fiveYearValue != null && !isNaN(match.fiveYearValue)) {
        console.log(`[getBenchmarkValue] Found mapped match for "${metricName}" via "${name}": ${match.fiveYearValue}`);
        return match.fiveYearValue;
      }
    }
  }
  
  // Try case-insensitive partial match as fallback
  const partialMatch = benchmarks.find(b => 
    b.metricName && b.metricName.trim().toLowerCase().includes(normalizedMetricName.toLowerCase()) ||
    normalizedMetricName.toLowerCase().includes(b.metricName?.trim().toLowerCase() || '')
  );
  if (partialMatch && partialMatch.fiveYearValue != null && !isNaN(partialMatch.fiveYearValue)) {
    console.log(`[getBenchmarkValue] Found partial match for "${metricName}" via "${partialMatch.metricName}": ${partialMatch.fiveYearValue}`);
    return partialMatch.fiveYearValue;
  }
  
  // Log missing benchmark for debugging
  if (benchmarks.length > 0) {
    const availableNames = benchmarks.map(b => b.metricName).filter(Boolean).slice(0, 10);
    console.warn(`[getBenchmarkValue] No benchmark found for "${metricName}". Available metrics (first 10):`, availableNames);
    console.warn(`[getBenchmarkValue] Total benchmarks loaded: ${benchmarks.length}`);
  }
  
  return null;
}

export function sixMonthGrowthFromMonthly(series: Array<{ month: string; value: number }>) {
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

export function normalizeRows(raw: any[], mapping: Mappings): NormalRow[] {
  const rows: NormalRow[] = [];
  for (const r of raw) {
    const d = parseDateLike(r[mapping.date]);
    if (!d) continue;
    const N = (col?: string) => {
      const v = col ? r[col] : null;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
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

export function ltmVsPrior(series: Array<{ month: string; value: number }>) {
  if (series.length < 24) return { curr: null, prior: null, pct: null };
  const values = [...series].sort((a, b) => a.month.localeCompare(b.month));
  const last12 = values.slice(-12);
  const prev12 = values.slice(-24, -12);
  const curr = sum(last12.map(r => r.value));
  const prior = sum(prev12.map(r => r.value));
  return { curr, prior, pct: pctChange(curr, prior) };
}

