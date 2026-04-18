'use client';

/**
 * Generic credentials/settings form: pass a list of FieldDef objects, render
 * them in a 1- or 2-column responsive grid. Most ERP integrations boil down
 * to a flat key/value form, so this covers the bulk of credential UIs.
 */

import React from 'react';

export type FieldDef<TSettings extends Record<string, unknown>> = {
  key: keyof TSettings & string;
  label: string;
  type?: 'text' | 'password' | 'email' | 'url' | 'number' | 'select';
  placeholder?: string;
  help?: string;
  required?: boolean;
  fullWidth?: boolean;
  options?: Array<{ value: string; label: string }>;
  monospace?: boolean;
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#475569',
  marginBottom: '4px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '13px',
  background: '#fff',
  color: '#0f172a',
};

const helpStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#64748b',
  marginTop: '4px',
};

type Props<TSettings extends Record<string, unknown>> = {
  fields: ReadonlyArray<FieldDef<TSettings>>;
  settings: TSettings;
  onChange: (next: TSettings) => void;
  disabled?: boolean;
  columns?: 1 | 2;
};

export default function FieldGrid<TSettings extends Record<string, unknown>>({
  fields,
  settings,
  onChange,
  disabled,
  columns = 2,
}: Props<TSettings>) {
  const set = (key: keyof TSettings, value: unknown) => {
    onChange({ ...settings, [key]: value } as TSettings);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '14px' }}>
      {fields.map((f) => {
        const value = (settings[f.key] ?? '') as string;
        const cellStyle: React.CSSProperties = f.fullWidth ? { gridColumn: '1 / -1' } : {};
        const monoOverride: React.CSSProperties = f.monospace
          ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }
          : {};

        return (
          <div key={f.key} style={cellStyle}>
            <label style={labelStyle}>
              {f.label}
              {f.required && <span style={{ color: '#dc2626' }}> *</span>}
            </label>
            {f.type === 'select' ? (
              <select
                value={value}
                onChange={(e) => set(f.key, e.target.value)}
                style={inputStyle}
                disabled={disabled}
              >
                {(f.options || []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type || 'text'}
                value={value}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                style={{ ...inputStyle, ...monoOverride }}
                disabled={disabled}
                autoComplete={f.type === 'password' ? 'off' : undefined}
              />
            )}
            {f.help && <div style={helpStyle}>{f.help}</div>}
          </div>
        );
      })}
    </div>
  );
}
