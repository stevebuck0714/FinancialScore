import React from 'react';

interface FinancialRowProps {
  label: string;
  values: number[];
  periodsCount: number;
  indent?: number;
  bold?: boolean;
}

export const FinancialRow = ({ label, values, periodsCount, indent = 0, bold = false }: FinancialRowProps) => (
  <div style={{ 
    display: 'grid', 
    gridTemplateColumns: `180px repeat(${periodsCount}, 110px)`, 
    gap: '4px', 
    padding: '4px 0', 
    fontSize: bold ? '14px' : '13px', 
    fontWeight: bold ? '600' : 'normal' 
  }}>
    <div style={{ color: bold ? '#475569' : '#64748b', paddingLeft: `${indent}px` }}>{label}</div>
    {values.map((v, i) => (
      <div key={i} style={{ textAlign: 'right', color: bold ? '#475569' : '#64748b' }}>
        ${(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </div>
    ))}
  </div>
);

