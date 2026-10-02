'use client';

import React from 'react';
import type { ProgramsContainerProps } from '../types';
import { DEFAULT_EPICOR_P21_PROGRAMS, type EpicorP21Program } from './index';

const headerStyle: React.CSSProperties = {
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

const cellStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: '13px',
  verticalAlign: 'middle',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #cbd5e1',
  borderRadius: '5px',
  fontSize: '12px',
  background: '#fff',
  color: '#0f172a',
  boxSizing: 'border-box',
};

export default function EpicorP21ProgramsContainer({
  programs,
  onChange,
  disabled,
}: ProgramsContainerProps<EpicorP21Program>) {
  const update = (index: number, patch: Partial<EpicorP21Program>) => {
    onChange(programs.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  const add = () => {
    onChange([...programs, { dataDomain: '', endpointOrEntity: '', dateField: '', enabled: true }]);
  };

  const remove = (index: number) => {
    onChange(programs.filter((_, rowIndex) => rowIndex !== index));
  };

  const resetToDefaults = () => {
    if (window.confirm('Reset P21 data domains to the standard default set? Customizations will be lost.')) {
      onChange(DEFAULT_EPICOR_P21_PROGRAMS.map((row) => ({ ...row })));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          Map Corelytics data domains to Filtech’s approved P21 resources. Set the OData date field for any domain that must support range syncs.
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button type="button" onClick={resetToDefaults} disabled={disabled} style={{ padding: '6px 10px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' }}>
            Reset defaults
          </button>
          <button type="button" onClick={add} disabled={disabled} style={{ padding: '6px 10px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' }}>
            + Add domain
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
          <thead>
            <tr>
              <th style={headerStyle}>Data Domain</th>
              <th style={headerStyle}>P21 API Resource</th>
              <th style={headerStyle}>Date Filter Field</th>
              <th style={{ ...headerStyle, width: '76px', textAlign: 'center' }}>Enabled</th>
              <th style={{ ...headerStyle, width: '66px', textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {programs.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...cellStyle, textAlign: 'center', color: '#94a3b8', padding: '16px' }}>
                  No data domains configured. Click <strong>+ Add domain</strong> or <strong>Reset defaults</strong>.
                </td>
              </tr>
            )}
            {programs.map((row, index) => (
              <tr key={index}>
                <td style={cellStyle}>
                  <input type="text" value={row.dataDomain} onChange={(event) => update(index, { dataDomain: event.target.value })} placeholder="e.g. Customers" style={inputStyle} disabled={disabled} />
                </td>
                <td style={cellStyle}>
                  <input type="text" value={row.endpointOrEntity} onChange={(event) => update(index, { endpointOrEntity: event.target.value })} placeholder="e.g. Customers" style={{ ...inputStyle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} disabled={disabled} />
                </td>
                <td style={cellStyle}>
                  <input type="text" value={row.dateField} onChange={(event) => update(index, { dateField: event.target.value })} placeholder="e.g. transactionDate" style={{ ...inputStyle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} disabled={disabled} />
                </td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  <input type="checkbox" checked={row.enabled} onChange={(event) => update(index, { enabled: event.target.checked })} disabled={disabled} aria-label={`Enable ${row.dataDomain || 'data domain'}`} />
                </td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  <button type="button" onClick={() => remove(index)} disabled={disabled} title="Remove data domain" style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '16px', lineHeight: 1 }}>
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
