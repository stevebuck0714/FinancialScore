'use client';

import { useMemo, useState } from 'react';
import StatementTrendPopup from './StatementTrendPopup';
import TopScrollContainer from './TopScrollContainer';

type CashFlowLine = { periodEnd: string; lineKey: string; lineName: string; lineOrder: number; amount: number };

type Props = {
  lines: CashFlowLine[];
  /** Ordered period columns; `monthToColumn` maps a source month (YYYY-MM) to its column, or null when out of range. */
  columns: string[];
  monthToColumn: (month: string) => string | null;
};

const BEGINNING = 'cash_beginning_of_period';
const ENDING = 'cash_end_of_period';

const statementNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '';
  const rounded = Math.round(value);
  const text = Math.abs(rounded).toLocaleString('en-US');
  return rounded < 0 ? `(${text})` : text;
};

type Row = { kind: 'line' | 'total' | 'grand' | 'warning'; label: string; values: Record<string, number> };

export default function PropertyCashFlowTable({ lines, columns, monthToColumn }: Props) {
  const [hideEmptyLines, setHideEmptyLines] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  const rows = useMemo(() => {
    // A multi-month column starts with its first month's beginning cash and ends with its last month's ending cash.
    const firstMonth: Record<string, string> = {};
    const lastMonth: Record<string, string> = {};
    lines.forEach((line) => {
      const month = String(line.periodEnd).slice(0, 7);
      const column = monthToColumn(month);
      if (!column) return;
      if (!firstMonth[column] || month < firstMonth[column]) firstMonth[column] = month;
      if (!lastMonth[column] || month > lastMonth[column]) lastMonth[column] = month;
    });

    const beginning: Record<string, number> = {};
    const ending: Record<string, number> = {};
    const flows = new Map<string, { label: string; latestMonth: string; order: number; values: Record<string, number> }>();
    lines.forEach((line) => {
      const month = String(line.periodEnd).slice(0, 7);
      const column = monthToColumn(month);
      if (!column) return;
      const amount = Number(line.amount || 0);
      if (line.lineKey === BEGINNING) {
        if (firstMonth[column] === month) beginning[column] = amount;
        return;
      }
      if (line.lineKey === ENDING) {
        if (lastMonth[column] === month) ending[column] = amount;
        return;
      }
      const flow = flows.get(line.lineKey) || { label: line.lineName, latestMonth: '', order: line.lineOrder, values: {} };
      // Line order and label follow the most recent statement that reports the line.
      if (month >= flow.latestMonth) Object.assign(flow, { label: line.lineName, latestMonth: month, order: line.lineOrder });
      flow.values[column] = (flow.values[column] || 0) + amount;
      flows.set(line.lineKey, flow);
    });

    const flowRows = [...flows.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    const netChange = Object.fromEntries(columns.map((column) => [column, flowRows.reduce((total, flow) => total + (flow.values[column] || 0), 0)]));
    const output: Row[] = [
      { kind: 'grand', label: 'Cash Beginning of Period', values: beginning },
      ...flowRows.map((flow) => ({ kind: 'line' as const, label: flow.label, values: flow.values })),
      { kind: 'total', label: 'Net Change in Cash', values: netChange },
      { kind: 'grand', label: 'Cash End of Period', values: ending },
    ];
    const difference = Object.fromEntries(columns.map((column) => [column, (beginning[column] || 0) + netChange[column] - (ending[column] || 0)]));
    if (columns.some((column) => Math.abs(difference[column]) >= 5)) {
      output.push({ kind: 'warning', label: 'Unreconciled (Beginning + Net Change − Ending)', values: difference });
    }
    return output;
  }, [lines, columns, monthToColumn]);

  const trendColumns = [...columns].sort();
  const indexedRows = rows.map((row, rowIndex) => ({ row, rowIndex }));
  const visibleRows = indexedRows.filter(({ row }) => row.kind !== 'line' || !hideEmptyLines || columns.some((column) => Math.abs(row.values[column] || 0) >= 0.5));
  const selectedRow = selectedRowIndex === null ? null : rows[selectedRowIndex] || null;
  const cell: React.CSSProperties = { padding: '5px 10px', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>From the Cash Flow Summary on each SLN monthly income statement. Click any line to see its trend.</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
          <input type="checkbox" checked={hideEmptyLines} onChange={(event) => setHideEmptyLines(event.target.checked)} />
          Hide lines with no activity
        </label>
      </div>
      <TopScrollContainer style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
        <table style={{ width: 'max-content', borderCollapse: 'collapse', minWidth: 220 + columns.length * 84 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ ...cell, width: 220, minWidth: 220, textAlign: 'left', fontSize: 11, color: '#475569', textTransform: 'uppercase' }}>Line</th>
              {columns.map((column) => <th key={column} style={{ ...cell, width: 84, minWidth: 84, padding: '5px 7px', fontSize: 11, color: '#475569' }}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, rowIndex: index }) => {
              const emphasized = row.kind !== 'line';
              const background = row.kind === 'grand' ? '#eff6ff' : row.kind === 'warning' ? '#fffbeb' : undefined;
              const color = row.kind === 'warning' ? '#92400e' : '#0f172a';
              const isSelected = selectedRowIndex === index;
              return (
                <tr key={`${row.label}-${index}`} style={{ background: isSelected ? '#dbeafe' : background }}>
                  <td style={{ width: 220, maxWidth: 220, padding: '4px 8px', paddingLeft: row.kind === 'line' ? 20 : row.kind === 'total' ? 14 : 8, fontSize: 13, borderTop: emphasized ? '1px solid #cbd5e1' : undefined }}>
                    <button
                      type="button"
                      title="Show trend"
                      onClick={() => setSelectedRowIndex(isSelected ? null : index)}
                      style={{ border: 0, padding: 0, background: 'transparent', font: 'inherit', fontWeight: emphasized ? 700 : 400, color: isSelected ? '#1e3a8a' : color, cursor: 'pointer', textAlign: 'left' }}
                    >
                      {row.label}
                    </button>
                  </td>
                  {columns.map((column) => (
                    <td key={column} style={{ ...cell, width: 84, minWidth: 84, padding: '4px 7px', color, fontWeight: emphasized ? 700 : 400, borderTop: emphasized ? '1px solid #cbd5e1' : undefined }}>{statementNumber(row.values[column])}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </TopScrollContainer>
      {selectedRow && (
        <StatementTrendPopup
          label={selectedRow.label}
          subtitle={`SLN · Cash flow · ${trendColumns[0]}${trendColumns.length > 1 ? ` – ${trendColumns[trendColumns.length - 1]}` : ''}`}
          columns={trendColumns}
          values={selectedRow.values}
          onClose={() => setSelectedRowIndex(null)}
        />
      )}
    </div>
  );
}
