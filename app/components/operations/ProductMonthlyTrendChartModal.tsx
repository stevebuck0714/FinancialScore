'use client';

import React from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  FORECAST_MONTH_LABELS,
  FORECAST_MONTHS,
  type ForecastMonth,
} from '@/lib/operations/product-revenue-forecast';

export type ProductMonthlyTrendPoint = {
  month: string;
  forecast: number;
  forecastAdj: number;
  actual: number;
};

type ProductMonthlyTrendChartModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  unit: 'qty' | 'money';
  rows: ProductMonthlyTrendPoint[];
  loading?: boolean;
};

export function buildProductMonthlyTrendRows(
  months: Record<number, { forecast?: number; adjusted?: number; actual?: number }>
): ProductMonthlyTrendPoint[] {
  return FORECAST_MONTHS.map((month: ForecastMonth) => {
    const bucket = months[month] || {};
    return {
      month: FORECAST_MONTH_LABELS[month],
      forecast: Number(bucket.forecast || 0),
      forecastAdj: Number(bucket.adjusted || 0),
      actual: Number(bucket.actual || 0),
    };
  });
}

function formatValue(value: number, unit: 'qty' | 'money'): string {
  const numeric = Number(value || 0);
  if (unit === 'money') {
    return Math.round(numeric).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  }
  return numeric.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export default function ProductMonthlyTrendChartModal({
  open,
  onClose,
  title,
  subtitle,
  unit,
  rows,
  loading,
}: ProductMonthlyTrendChartModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(920px, 96vw)',
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.28)',
          padding: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{title}</h3>
            {subtitle ? (
              <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>{subtitle}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 700,
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
        {loading ? (
          <div style={{ padding: '28px 0', color: '#64748b', fontSize: 13 }}>Loading monthly trend…</div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={rows} margin={{ top: 12, right: 20, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: 12 }} />
              <YAxis
                stroke="#64748b"
                style={{ fontSize: 12 }}
                tickFormatter={(value) => formatValue(Number(value || 0), unit)}
              />
              <Tooltip
                formatter={(value: any, name: any) => [formatValue(Number(value || 0), unit), String(name)]}
                contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }}
              />
              <Legend />
              <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="forecastAdj" name="Forecast - ADJ" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="actual" name="Actual" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
