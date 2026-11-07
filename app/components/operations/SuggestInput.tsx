'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type Suggestion = {
  value: string;
  label?: string;
};

type SuggestInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Called when a suggestion is picked. Defaults to onChange(suggestion.value). */
  onSelect?: (suggestion: Suggestion) => void;
  /** Local options, filtered as the user types. */
  suggestions?: Suggestion[];
  /** Remote options for the typed text. Ignored when suggestions is set. */
  loadSuggestions?: (query: string, signal: AbortSignal) => Promise<Suggestion[]>;
  minChars?: number;
  maxResults?: number;
  placeholder?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  onBlur?: () => void;
};

const REMOTE_DEBOUNCE_MS = 300;

export function labeledSuggestionsFor(
  entries: Array<{ value?: string | null; label?: string | null }>
): Suggestion[] {
  const seen = new Set<string>();
  const result: Suggestion[] = [];
  for (const entry of entries) {
    const value = String(entry.value || '').trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    const label = String(entry.label || '').trim();
    result.push(label && label.toLowerCase() !== key ? { value, label } : { value });
  }
  return result;
}

export function customerIdSuggestionsFor(
  customers: Array<{ customerId?: string | null; label?: string | null }>
): Suggestion[] {
  return labeledSuggestionsFor(customers.map((customer) => ({ value: customer.customerId, label: customer.label })));
}

export function valueSuggestionsFor(values: Array<string | null | undefined>): Suggestion[] {
  return labeledSuggestionsFor(values.map((value) => ({ value })));
}

export async function fetchSuggestions(
  path: string,
  params: Record<string, string>,
  signal: AbortSignal
): Promise<Suggestion[]> {
  const response = await fetch(`${path}?${new URLSearchParams(params).toString()}`, { cache: 'no-store', signal });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  return Array.isArray(payload?.suggestions) ? (payload.suggestions as Suggestion[]) : [];
}

export function rankSuggestions(options: Suggestion[], query: string, maxResults: number): Suggestion[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  const starts: Suggestion[] = [];
  const contains: Suggestion[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    const key = option.value.toLowerCase();
    if (!key || seen.has(key)) continue;
    const label = String(option.label || '').toLowerCase();
    if (key.startsWith(term)) {
      seen.add(key);
      starts.push(option);
    } else if (key.includes(term) || label.includes(term)) {
      seen.add(key);
      contains.push(option);
    }
  }
  const byValue = (a: Suggestion, b: Suggestion) =>
    a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' });
  return [...starts.sort(byValue), ...contains.sort(byValue)].slice(0, maxResults);
}

export default function SuggestInput({
  value,
  onChange,
  onSelect,
  suggestions,
  loadSuggestions,
  minChars = 2,
  maxResults = 20,
  placeholder,
  ariaLabel,
  style,
  disabled,
  onBlur,
}: SuggestInputProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [remote, setRemote] = useState<{ query: string; items: Suggestion[] } | null>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const query = value.trim();
  const usesRemote = !suggestions && Boolean(loadSuggestions);
  const active = open && query.length >= minChars;

  useEffect(() => {
    if (!usesRemote || !active || !loadSuggestions) return;
    if (remote?.query === query) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      loadSuggestions(query, controller.signal)
        .then((items) => {
          if (!controller.signal.aborted) setRemote({ query, items });
        })
        .catch(() => {
          if (!controller.signal.aborted) setRemote({ query, items: [] });
        });
    }, REMOTE_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [active, loadSuggestions, query, remote?.query, usesRemote]);

  const items = useMemo(() => {
    if (!active) return [];
    if (suggestions) return rankSuggestions(suggestions, query, maxResults);
    return remote?.query === query ? remote.items.slice(0, maxResults) : [];
  }, [active, maxResults, query, remote, suggestions]);

  const visible = active && items.length > 0;

  const measure = useCallback(() => {
    const node = inputRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    setRect({ left: box.left, top: box.bottom + 2, width: Math.max(box.width, 240) });
  }, []);

  useEffect(() => {
    if (!visible) return;
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [measure, visible]);

  const pick = (suggestion: Suggestion) => {
    if (onSelect) onSelect(suggestion);
    else onChange(suggestion.value);
    setOpen(false);
    setHighlight(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!visible) {
      if (event.key === 'ArrowDown' && query.length >= minChars) {
        measure();
        setOpen(true);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((current) => (current + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((current) => (current <= 0 ? items.length - 1 : current - 1));
    } else if (event.key === 'Enter' && highlight >= 0 && items[highlight]) {
      event.preventDefault();
      pick(items[highlight]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          measure();
          setOpen(true);
          setHighlight(-1);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setOpen(false);
          onBlur?.();
        }}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? listId : undefined}
        autoComplete="off"
        disabled={disabled}
        style={style}
      />
      {visible && rect && typeof document !== 'undefined'
        ? createPortal(
            <ul
              id={listId}
              role="listbox"
              style={{
                position: 'fixed',
                left: rect.left,
                top: rect.top,
                minWidth: rect.width,
                maxWidth: 420,
                maxHeight: 280,
                overflowY: 'auto',
                margin: 0,
                padding: 4,
                listStyle: 'none',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
                zIndex: 1000,
              }}
            >
              {items.map((item, index) => (
                <li
                  key={item.value}
                  role="option"
                  aria-selected={index === highlight}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(item);
                  }}
                  onMouseEnter={() => setHighlight(index)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    color: '#0f172a',
                    background: index === highlight ? '#e0e7ff' : 'transparent',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{item.value}</span>
                  {item.label ? <span style={{ color: '#64748b' }}>{` · ${item.label}`}</span> : null}
                </li>
              ))}
            </ul>,
            document.body
          )
        : null}
    </>
  );
}
