'use client';

/**
 * Generic editable two-column programs table for ERP integrations whose
 * "programs" map a module/data-domain to a single endpoint/entity/object
 * identifier (Sage Intacct, Acumatica, Odoo, Dynamics, …).
 */

import React from 'react';

export type TwoColumnProgramRow = Record<string, unknown> & {
  module: string;
};

export type TwoColumnProgramsTableProps<TRow extends TwoColumnProgramRow> = {
  programs: TRow[];
  onChange: (next: TRow[]) => void;
  defaults: ReadonlyArray<TRow>;
  /** The non-module field key that this system uses (e.g. 'objectName', 'modelOrEndpoint'). */
  secondKey: keyof TRow & string;
  secondLabel: string;
  secondPlaceholder?: string;
  helpText?: string;
  disabled?: boolean;
};

const cellHeader: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 700,
  color: '#475569',
  background: '#f1f5f9',
  borderBottom: '1px solid #e2e8f0',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const cellBody: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: '13px',
  verticalAlign: 'middle',
};

const inputCell: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #cbd5e1',
  borderRadius: '5px',
  fontSize: '12px',
  background: '#fff',
  color: '#0f172a',
};

export default function TwoColumnProgramsTable<TRow extends TwoColumnProgramRow>({
  programs,
  onChange,
  defaults,
  secondKey,
  secondLabel,
  secondPlaceholder,
  helpText,
  disabled,
}: TwoColumnProgramsTableProps<TRow>) {
  const update = (index: number, patch: Partial<TRow>) => {
    onChange(programs.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const remove = (index: number) => {
    onChange(programs.filter((_, i) => i !== index));
  };

  const add = () => {
    const blank = { module: '', [secondKey]: '' } as unknown as TRow;
    onChange([...programs, blank]);
  };

  const resetToDefaults = () => {
    if (window.confirm('Reset programs to system defaults? Per-company customizations will be lost.')) {
      onChange(defaults.map((row) => ({ ...row })));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          {helpText || 'Add, edit, or remove the data domains this company will sync.'}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={resetToDefaults}
            disabled={disabled}
            style={{
              padding: '6px 10px',
              background: '#fff',
              color: '#475569',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={add}
            disabled={disabled}
            style={{
              padding: '6px 10px',
              background: '#0f172a',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            + Add Program
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
          <thead>
            <tr>
              <th style={cellHeader}>Module</th>
              <th style={cellHeader}>{secondLabel}</th>
              <th style={{ ...cellHeader, width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {programs.length === 0 && (
              <tr>
                <td colSpan={3} style={{ ...cellBody, textAlign: 'center', color: '#94a3b8', padding: '16px' }}>
                  No programs configured. Click <strong>+ Add Program</strong> or <strong>Reset to defaults</strong>.
                </td>
              </tr>
            )}
            {programs.map((row, idx) => (
              <tr key={idx}>
                <td style={cellBody}>
                  <input
                    type="text"
                    value={(row.module ?? '') as string}
                    onChange={(e) => update(idx, { module: e.target.value } as Partial<TRow>)}
                    placeholder="e.g. Chart of Accounts"
                    style={inputCell}
                    disabled={disabled}
                  />
                </td>
                <td style={cellBody}>
                  <input
                    type="text"
                    value={(row[secondKey] ?? '') as string}
                    onChange={(e) => update(idx, { [secondKey]: e.target.value } as Partial<TRow>)}
                    placeholder={secondPlaceholder}
                    style={{ ...inputCell, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                    disabled={disabled}
                  />
                </td>
                <td style={{ ...cellBody, textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    disabled={disabled}
                    title="Remove program"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#dc2626',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      fontSize: '16px',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
