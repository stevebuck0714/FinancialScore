'use client';
import { formatEstDateTime } from '@/lib/time/eastern';

/**
 * Sage Intacct Programs editor.
 *
 * On top of the basic module ↔ objectName editor, two operator affordances:
 *
 *   1. Enabled toggle — checkbox per row (right of Object Name). Sweep
 *      operations (Sync Now / Backfill / cron) loop only enabled programs.
 *   2. Last synced badge — compact relative-time string sourced from the
 *      panel's lastSyncedByObject map (originally
 *      `connectionMetadata.lastSyncedPerObject`).
 */

import React from 'react';
import type { ProgramsContainerProps } from '../types';
import { DEFAULT_SAGE_INTACCT_PROGRAMS, type SageIntacctProgram } from './index';

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
  boxSizing: 'border-box',
  minWidth: 0,
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

export default function SageIntacctProgramsContainer({
  programs,
  onChange,
  disabled,
  lastSyncedByObject,
}: ProgramsContainerProps<SageIntacctProgram>) {
  const update = (index: number, patch: Partial<SageIntacctProgram>) => {
    onChange(programs.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const remove = (index: number) => {
    onChange(programs.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...programs, { module: '', objectName: '', enabled: true }]);
  };

  const resetToDefaults = () => {
    if (window.confirm('Reset programs to system defaults? Per-company customizations will be lost.')) {
      onChange(DEFAULT_SAGE_INTACCT_PROGRAMS.map((row) => ({ ...row })));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          Map each Corelytics data domain to a Sage Intacct object name. Uncheck <strong>Enabled</strong>
          to skip a program during Sync Now / Backfill without losing the row.
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
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
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '440px' }}>
          <thead>
            <tr>
              <th style={cellHeader}>Module</th>
              <th style={cellHeader}>Object Name (Intacct)</th>
              <th style={{ ...cellHeader, width: '64px', textAlign: 'center' }}>Enabled</th>
              <th style={{ ...cellHeader, width: '72px', textAlign: 'right', paddingRight: '12px' }}>Synced</th>
              <th style={{ ...cellHeader, width: '36px' }}></th>
            </tr>
          </thead>
          <tbody>
            {programs.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...cellBody, textAlign: 'center', color: '#94a3b8', padding: '16px' }}>
                  No programs configured. Click <strong>+ Add Program</strong> or <strong>Reset to defaults</strong>.
                </td>
              </tr>
            )}
            {programs.map((row, idx) => {
              const enabled = row.enabled !== false;
              const lastSynced = lastSyncedByObject?.[row.objectName];
              return (
                <tr key={idx} style={{ opacity: enabled ? 1 : 0.55 }}>
                  <td style={cellBody}>
                    <input
                      type="text"
                      value={row.module ?? ''}
                      onChange={(e) => update(idx, { module: e.target.value })}
                      placeholder="e.g. Chart of Accounts"
                      style={inputCell}
                      disabled={disabled}
                    />
                  </td>
                  <td style={cellBody}>
                    <input
                      type="text"
                      value={row.objectName ?? ''}
                      onChange={(e) => update(idx, { objectName: e.target.value })}
                      placeholder="e.g. GLACCOUNT"
                      style={{ ...inputCell, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                      disabled={disabled}
                    />
                  </td>
                  <td style={{ ...cellBody, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => update(idx, { enabled: e.target.checked })}
                      disabled={disabled}
                      title={enabled ? 'Enabled — included in sweep syncs' : 'Disabled — skipped by sweep syncs'}
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
                    <span title={lastSynced ? formatEstDateTime(lastSynced) : 'Never synced'}>
                      {relativeTime(lastSynced)}
                    </span>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
