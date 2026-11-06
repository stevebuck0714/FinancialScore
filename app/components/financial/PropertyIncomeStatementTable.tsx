'use client';

import { Fragment, useMemo, useState } from 'react';
import StatementTrendPopup from './StatementTrendPopup';
import { aggregateMappedAmounts, buildPropertyBookSummary, buildPropertyIncomeStatement } from '@/lib/real-estate/property-income-statement';

export type EntityScope = 'BGAH' | 'SLN' | 'COMBINED';

type Props = {
  lines: any[];
  mappings: Array<{ financialFeed: string; accountCode: string; targetField: string; bookTreatment?: string | null }>;
  scope: EntityScope;
  /** 'property' = full operating statement with sub-lines (Ops); 'book' = summarized book income statement. */
  variant?: 'property' | 'book';
  /** Ordered period columns and the column each source month (YYYY-MM) rolls into. */
  columns: string[];
  monthToColumn: (month: string) => string | null;
};

const statementNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '';
  const rounded = Math.round(value);
  const text = Math.abs(rounded).toLocaleString('en-US');
  return rounded < 0 ? `(${text})` : text;
};

export default function PropertyIncomeStatementTable({ lines, mappings, scope, variant = 'property', columns, monthToColumn }: Props) {
  const [hideEmptyLines, setHideEmptyLines] = useState(false);

  const { statement, unmapped } = useMemo(() => {
    const mapped = aggregateMappedAmounts(lines, mappings, scope, monthToColumn);
    return {
      statement: variant === 'book' ? buildPropertyBookSummary(columns, mapped) : buildPropertyIncomeStatement(columns, mapped.amounts),
      unmapped: mapped.unmapped,
    };
  }, [lines, mappings, scope, variant, columns, monthToColumn]);

  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const trendColumns = [...columns].sort();
  const indexedRows = statement.map((row, statementIndex) => ({ row, statementIndex }));
  const visibleRows = hideEmptyLines
    ? indexedRows.filter(({ row }) => row.kind !== 'line' || columns.some((column) => row.values[column] !== null && row.values[column] !== undefined && row.values[column] !== 0))
    : indexedRows;
  const selectedRow = selectedRowIndex === null ? null : statement[selectedRowIndex] || null;

  const cell: React.CSSProperties = { padding: '5px 10px', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {unmapped.length > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12 }}>
          <strong>{unmapped.length} source account{unmapped.length === 1 ? '' : 's'} not mapped</strong> and excluded from this statement. Map them in Site Admin → Data Mapping by selecting the financial feed.
          <div style={{ marginTop: 6 }}>{unmapped.slice(0, 12).map((account) => `${account.feed} ${account.accountCode} · ${account.accountName}`).join('; ')}{unmapped.length > 12 ? '; …' : ''}</div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>Click any line to see its trend.</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
          <input type="checkbox" checked={hideEmptyLines} onChange={(event) => setHideEmptyLines(event.target.checked)} />
          Hide lines with no activity
        </label>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: 'max-content', borderCollapse: 'collapse', minWidth: 220 + columns.length * 84 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ ...cell, width: 220, minWidth: 220, textAlign: 'left', fontSize: 11, color: '#475569', textTransform: 'uppercase' }}>Line</th>
              {columns.map((column) => <th key={column} style={{ ...cell, width: 84, minWidth: 84, padding: '5px 7px', fontSize: 11, color: '#475569' }}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, statementIndex }) => {
              if (row.kind === 'heading') {
                return (
                  <tr key={`${row.label}-${statementIndex}`}>
                    <td colSpan={columns.length + 1} style={{ padding: '14px 10px 4px', fontSize: 12, fontWeight: 800, color: '#1e3a8a', letterSpacing: '0.02em' }}>{row.label}</td>
                  </tr>
                );
              }
              const emphasized = row.kind !== 'line';
              const isKeyResult = row.kind === 'formula';
              const isSelected = selectedRowIndex === statementIndex;
              return (
                <Fragment key={`${row.label}-${statementIndex}`}>
                  <tr style={{ background: isSelected ? '#dbeafe' : isKeyResult ? '#eff6ff' : undefined }}>
                    <td style={{ width: 220, maxWidth: 220, padding: '4px 8px', paddingLeft: row.kind === 'line' ? 20 : 8, fontSize: 13, borderTop: emphasized ? '1px solid #cbd5e1' : undefined }}>
                      <button
                        type="button"
                        title="Show trend"
                        onClick={() => setSelectedRowIndex(isSelected ? null : statementIndex)}
                        style={{ border: 0, padding: 0, background: 'transparent', font: 'inherit', fontWeight: emphasized ? 700 : 400, color: isSelected ? '#1e3a8a' : '#0f172a', cursor: 'pointer', textAlign: 'left' }}
                      >
                        {row.label}
                      </button>
                    </td>
                    {columns.map((column) => (
                      <td key={column} style={{ ...cell, width: 84, minWidth: 84, padding: '4px 7px', fontWeight: emphasized ? 700 : 400, borderTop: emphasized ? '1px solid #cbd5e1' : undefined }}>{statementNumber(row.values[column])}</td>
                    ))}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {selectedRow && (
        <StatementTrendPopup
          label={selectedRow.label}
          subtitle={`${scope === 'COMBINED' ? 'Combined BGAH + SLN' : scope} · ${trendColumns[0]}${trendColumns.length > 1 ? ` – ${trendColumns[trendColumns.length - 1]}` : ''}`}
          columns={trendColumns}
          values={selectedRow.values}
          onClose={() => setSelectedRowIndex(null)}
        />
      )}
    </div>
  );
}
