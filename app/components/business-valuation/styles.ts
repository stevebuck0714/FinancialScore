import type { CSSProperties } from 'react';

export const CARD: CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' };
export const input: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', height: '24px', fontSize: '12px', color: '#1e293b', background: '#fff' };
export const th: CSSProperties = { padding: '4px 6px', fontSize: '11px', fontWeight: 700, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', whiteSpace: 'nowrap' };
export const td: CSSProperties = { padding: '3px 6px', fontSize: '12px', color: '#1e293b', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
export const button: CSSProperties = { border: 0, borderRadius: '4px', padding: '4px 10px', color: '#fff', background: '#2751d0', cursor: 'pointer', fontWeight: 600, fontSize: '12px' };
export const fieldLabel: CSSProperties = { fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block' };
export const cardTitle: CSSProperties = { fontSize: '13px', fontWeight: 700, color: '#0f172a' };
export const cardSubtitle: CSSProperties = { fontSize: '11px', color: '#64748b' };
export const pendingNote: CSSProperties = { fontSize: '11px', fontWeight: 600, color: '#b45309' };
export const formRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', minHeight: '26px', borderBottom: '1px solid #f1f5f9' };
export const formRowLabel: CSSProperties = { width: '140px', flexShrink: 0, fontSize: '12px', color: '#475569' };
export const groupTitle: CSSProperties = { fontSize: '11px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '.03em', padding: '2px 0 3px', borderBottom: '1px solid #e2e8f0' };
export const formColumns: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 360px))', gap: '0 28px' };

export const money = (value: unknown) => {
  const amount = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(amount)) return '—';
  const formatted = Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return amount < 0 ? `($${formatted})` : `$${formatted}`;
};
