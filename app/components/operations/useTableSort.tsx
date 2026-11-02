'use client';

import { useState } from 'react';

type SortState = Record<string, { key: string; direction: 'asc' | 'desc' }>;

export function compareSortValues(a: unknown, b: unknown) {
  return typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

export function useTableSort(th: React.CSSProperties) {
  const [sorts, setSorts] = useState<SortState>({});
  const toggleSort = (table: string, key: string) => setSorts((current) => {
    const previous = current[table];
    return { ...current, [table]: { key, direction: previous?.key === key && previous.direction === 'asc' ? 'desc' : 'asc' } };
  });
  const sortRows = <T,>(table: string, rows: T[], value: (row: T, key: string) => unknown) => {
    const sort = sorts[table];
    if (!sort) return rows;
    return [...rows].sort((left, right) => {
      const result = compareSortValues(value(left, sort.key), value(right, sort.key));
      return sort.direction === 'asc' ? result : -result;
    });
  };
  const sortableHeader = (table: string, key: string, label: React.ReactNode, align: 'left' | 'right' = 'left') => {
    const active = sorts[table];
    const direction = active?.key === key ? (active.direction === 'asc' ? ' ↑' : ' ↓') : '';
    return <th key={key} style={{ ...th, textAlign: align }}><button type="button" onClick={() => toggleSort(table, key)} style={{ border: 0, padding: 0, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', textTransform: 'inherit' }}>{label}{direction}</button></th>;
  };
  return { sortRows, sortableHeader };
}
