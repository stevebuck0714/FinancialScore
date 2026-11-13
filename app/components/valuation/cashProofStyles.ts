import type { CSSProperties } from 'react';

export const cardStyle: CSSProperties = {
  background: 'white',
  borderRadius: '10px',
  padding: '16px',
  marginBottom: '12px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
};

export const buttonStyle = (variant: 'primary' | 'secondary' = 'secondary', disabled = false): CSSProperties => ({
  padding: '7px 12px',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.55 : 1,
  border: variant === 'primary' ? '1px solid #2751d0' : '1px solid #cbd5e1',
  background: variant === 'primary' ? '#2751d0' : 'white',
  color: variant === 'primary' ? 'white' : '#334155',
});

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '12px',
  boxSizing: 'border-box',
};

export const thStyle: CSSProperties = {
  padding: '8px',
  fontSize: '11px',
  fontWeight: 700,
  color: '#475569',
  textAlign: 'right',
  borderBottom: '2px solid #e2e8f0',
  whiteSpace: 'nowrap',
  background: '#f8fafc',
};

export const tdStyle: CSSProperties = {
  padding: '6px 8px',
  fontSize: '12px',
  color: '#1e293b',
  textAlign: 'right',
  borderBottom: '1px solid #f1f5f9',
  whiteSpace: 'nowrap',
};

export const stickyCol = (width: number, left = 0): CSSProperties => ({
  position: 'sticky',
  left,
  zIndex: 1,
  background: 'white',
  minWidth: width,
  maxWidth: width,
  textAlign: 'left',
});
