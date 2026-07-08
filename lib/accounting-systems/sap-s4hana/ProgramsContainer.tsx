'use client';

import React from 'react';
import type { ProgramsContainerProps } from '../types';
import { DEFAULT_SAP_S4HANA_PROGRAMS, type SapS4HanaProgram } from './index';

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

export default function SapS4HanaProgramsContainer({
  programs,
  onChange,
  disabled,
}: ProgramsContainerProps<SapS4HanaProgram>) {
  const update = (index: number, patch: Partial<SapS4HanaProgram>) => {
    onChange(programs.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const remove = (index: number) => {
    onChange(programs.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...programs, { module: '', odataService: '', priority: 'Medium', enabled: true }]);
  };

  const resetToDefaults = () => {
    if (window.confirm('Reset SAP S/4HANA data domains to defaults? Per-company customizations will be lost.')) {
      onChange(DEFAULT_SAP_S4HANA_PROGRAMS.map((row) => ({ ...row })));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          Configure SAP OData services and data domains Corelytics should synchronize.
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={resetToDefaults} disabled={disabled} style={{ padding: '6px 10px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
            Reset to defaults
          </button>
          <button type="button" onClick={add} disabled={disabled} style={{ padding: '6px 10px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
            + Add Domain
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
          <thead>
            <tr>
              <th style={cellHeader}>Enabled</th>
              <th style={cellHeader}>Data Domain</th>
              <th style={cellHeader}>SAP OData Service / Requirement</th>
              <th style={cellHeader}>Priority</th>
              <th style={{ ...cellHeader, width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {programs.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...cellBody, textAlign: 'center', color: '#94a3b8', padding: '16px' }}>
                  No SAP data domains configured. Click <strong>+ Add Domain</strong> or <strong>Reset to defaults</strong>.
                </td>
              </tr>
            )}
            {programs.map((row, idx) => (
              <tr key={idx}>
                <td style={{ ...cellBody, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={row.enabled !== false}
                    onChange={(event) => update(idx, { enabled: event.target.checked })}
                    disabled={disabled}
                  />
                </td>
                <td style={cellBody}>
                  <input
                    type="text"
                    value={row.module || ''}
                    onChange={(event) => update(idx, { module: event.target.value })}
                    placeholder="e.g. General Ledger"
                    style={inputCell}
                    disabled={disabled}
                  />
                </td>
                <td style={cellBody}>
                  <input
                    type="text"
                    value={row.odataService || ''}
                    onChange={(event) => update(idx, { odataService: event.target.value })}
                    placeholder="e.g. API_JOURNALENTRYITEMBASIC_SRV/A_JournalEntryItem"
                    style={{ ...inputCell, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                    disabled={disabled}
                  />
                </td>
                <td style={cellBody}>
                  <select
                    value={row.priority || 'Medium'}
                    onChange={(event) => update(idx, { priority: event.target.value as SapS4HanaProgram['priority'] })}
                    style={inputCell}
                    disabled={disabled}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Optional">Optional</option>
                  </select>
                </td>
                <td style={{ ...cellBody, textAlign: 'center' }}>
                  <button type="button" onClick={() => remove(idx)} disabled={disabled} title="Remove domain" style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '16px', lineHeight: 1 }}>
                    x
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
