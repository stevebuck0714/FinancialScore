'use client';

import { createPortal } from 'react-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Props = {
  label: string;
  subtitle: string;
  columns: string[];
  values: Record<string, number | null | undefined>;
  onClose: () => void;
};

const trendMoney = (value: number) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Fits the Y axis to the data (rounded gridlines) so small period-to-period moves are visible. */
function fitScale(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = max === min ? Math.max(Math.abs(max) * 0.05, 100) : (max - min) * 0.15;
  const rawStep = (max - min + padding * 2) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rawStep) || 10 * magnitude;
  const domain: [number, number] = [Math.floor((min - padding) / step) * step, Math.ceil((max + padding) / step) * step];
  const ticks = Array.from({ length: Math.round((domain[1] - domain[0]) / step) + 1 }, (_, i) => domain[0] + i * step);
  const span = domain[1] - domain[0];
  const tick = (value: number) => (span < 20000
    ? trendMoney(value)
    : `${value < 0 ? '-' : ''}$${(Math.abs(value) / 1000).toLocaleString('en-US', { maximumFractionDigits: span < 200000 ? 1 : 0 })}k`);
  return { domain, ticks, tick };
}

export default function StatementTrendPopup({ label, subtitle, columns, values, onClose }: Props) {
  if (typeof document === 'undefined') return null;
  const data = columns.map((column) => ({ period: column, value: Number(values[column] ?? 0) }));
  const scale = fitScale(data.map((point) => point.value));

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label} trend`}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', zIndex: 2150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(960px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', fontWeight: 800 }}>{label}</h3>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '13px' }}>{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '7px 10px', background: 'white', color: '#475569', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
        {columns.length < 2 ? (
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {columns[0]}: <strong>{trendMoney(data[0]?.value ?? 0)}</strong>. Select a Period with more than one column to see a trend.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis domain={scale.domain} ticks={scale.ticks} tickFormatter={(value) => scale.tick(Number(value))} tick={{ fontSize: 11 }} width={80} />
              <Tooltip formatter={(value: number) => trendMoney(value)} />
              <Line type="monotone" dataKey="value" name={label} stroke="#1e3a8a" strokeWidth={2} dot={{ r: 3, fill: '#1e3a8a' }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>,
    document.body,
  );
}
