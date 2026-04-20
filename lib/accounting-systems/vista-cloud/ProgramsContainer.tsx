'use client';

import React from 'react';
import type { ProgramsContainerProps } from '../types';
import { DEFAULT_VISTA_CLOUD_PROGRAMS, type VistaCloudProgram } from './programs';

const MODULES = [
  { value: 'jc', label: 'Job Cost (JC)' },
  { value: 'po', label: 'Purchase Orders (PO)' },
  { value: 'sl', label: 'Subcontract Ledger (SL)' },
  { value: 'ar', label: 'Accounts Receivable (AR)' },
  { value: 'ap', label: 'Accounts Payable (AP)' },
  { value: 'gl', label: 'General Ledger (GL)' },
  { value: 'pm', label: 'Project Management (PM)' },
  { value: 'cm', label: 'Cash Management (CM)' },
  { value: 'pr', label: 'Payroll (PR)' },
  { value: 'eq', label: 'Equipment (EQ)' },
];

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

function relativeTime(iso: string | undefined): string {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '—';
  const deltaSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const deltaMin = Math.round(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const deltaHr = Math.round(deltaMin / 60);
  if (deltaHr < 24) return `${deltaHr}h ago`;
  const deltaDay = Math.round(deltaHr / 24);
  if (deltaDay < 30) return `${deltaDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function VistaCloudProgramsContainer({
  programs,
  onChange,
  disabled,
  lastSyncedByObject,
}: ProgramsContainerProps<VistaCloudProgram>) {
  const update = (index: number, patch: Partial<VistaCloudProgram>) => {
    onChange(programs.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const remove = (index: number) => {
    onChange(programs.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([
      ...programs,
      { module: 'jc', resource: '', resourcePath: '', enabled: true, historyMonths: 12 },
    ]);
  };

  const resetToDefaults = () => {
    if (window.confirm('Reset programs to the Vista Cloud system defaults? Per-company customizations will be lost.')) {
      onChange(DEFAULT_VISTA_CLOUD_PROGRAMS.map((row) => ({ ...row })));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          Toggle resources on/off, edit the URL path, or override the history window per resource.
          Trimble&apos;s default history window is 12 months for several Job Cost / PO / SL / AR / GL endpoints.
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
            + Add Resource
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
          <thead>
            <tr>
              <th style={{ ...cellHeader, width: '170px' }}>Module</th>
              <th style={cellHeader}>Resource (label)</th>
              <th style={cellHeader}>Resource Path</th>
              <th style={{ ...cellHeader, width: '64px', textAlign: 'center' }}>Enabled</th>
              <th style={{ ...cellHeader, width: '72px', textAlign: 'right', paddingRight: '12px' }}>Synced</th>
              <th style={{ ...cellHeader, width: '64px', textAlign: 'right', paddingRight: '12px' }}>Hist&nbsp;(mo)</th>
              <th style={{ ...cellHeader, width: '36px' }}></th>
            </tr>
          </thead>
          <tbody>
            {programs.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...cellBody, textAlign: 'center', color: '#94a3b8', padding: '16px' }}>
                  No resources configured. Click <strong>+ Add Resource</strong> or <strong>Reset to defaults</strong>.
                </td>
              </tr>
            )}
            {programs.map((row, idx) => {
              // Sync route keys per-program last-synced state by `<module>/<resourcePath>`
              // so e.g. ar/invoices and ap/invoices don't collide.
              const lastSynced = lastSyncedByObject?.[`${row.module}/${row.resourcePath}`];
              return (
              <tr key={idx} style={{ opacity: row.enabled ? 1 : 0.55 }}>
                <td style={cellBody}>
                  <select
                    value={row.module}
                    onChange={(e) => update(idx, { module: e.target.value })}
                    style={inputCell}
                    disabled={disabled}
                  >
                    {MODULES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </td>
                <td style={cellBody}>
                  <input
                    type="text"
                    value={row.resource}
                    onChange={(e) => update(idx, { resource: e.target.value })}
                    placeholder="e.g. Cost Details"
                    style={inputCell}
                    disabled={disabled}
                  />
                </td>
                <td style={cellBody}>
                  <input
                    type="text"
                    value={row.resourcePath}
                    onChange={(e) => update(idx, { resourcePath: e.target.value })}
                    placeholder="e.g. cost_details"
                    style={{ ...inputCell, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                    disabled={disabled}
                  />
                </td>
                <td style={{ ...cellBody, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => update(idx, { enabled: e.target.checked })}
                    disabled={disabled}
                    title={row.enabled ? 'Enabled — included in syncs' : 'Disabled — skipped by syncs'}
                    style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                  />
                </td>
                <td
                  style={{
                    ...cellBody,
                    fontSize: '11px',
                    color: lastSynced ? '#475569' : '#94a3b8',
                    textAlign: 'right',
                    paddingRight: '12px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span title={lastSynced ? new Date(lastSynced).toLocaleString() : 'Never synced'}>
                    {relativeTime(lastSynced)}
                  </span>
                </td>
                <td style={{ ...cellBody, paddingRight: '12px' }}>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={row.historyMonths}
                    onChange={(e) => update(idx, { historyMonths: Math.max(1, Number(e.target.value) || 12) })}
                    style={{ ...inputCell, textAlign: 'right', padding: '6px 6px' }}
                    disabled={disabled}
                  />
                </td>
                <td style={{ ...cellBody, textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    disabled={disabled}
                    title="Remove resource"
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
