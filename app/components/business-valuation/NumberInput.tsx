'use client';

import { useState, type CSSProperties } from 'react';
import { input } from './styles';

type Props = {
  value: unknown;
  onChange: (raw: string) => void;
  kind?: 'money' | 'percent' | 'number';
  disabled?: boolean;
  placeholder?: string;
  style?: CSSProperties;
};

const parse = (value: unknown) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(/[$,%\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export function formatNumberInput(value: unknown, kind: Props['kind']) {
  const amount = parse(value);
  if (amount === null) return String(value ?? '');
  if (kind === 'percent') return `${amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}%`;
  if (kind === 'number') return amount.toLocaleString('en-US', { maximumFractionDigits: 4 });
  const formatted = Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return amount < 0 ? `-$${formatted}` : `$${formatted}`;
}

/** Shows formatted dollars or percents at rest and the plain number while editing. */
export default function NumberInput({ value, onChange, kind = 'money', disabled, placeholder, style }: Props) {
  const [editing, setEditing] = useState(false);
  const raw = value === null || value === undefined ? '' : String(value);
  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      placeholder={placeholder}
      value={editing ? raw : formatNumberInput(raw, kind)}
      onFocus={(event) => {
        setEditing(true);
        const target = event.currentTarget;
        requestAnimationFrame(() => target.select());
      }}
      onBlur={() => setEditing(false)}
      onChange={(event) => onChange(event.target.value)}
      style={{ ...input, textAlign: 'right', ...style }}
    />
  );
}
