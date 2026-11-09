'use client';

import { useMemo, useState } from 'react';
import type { EntityScope } from './PropertyIncomeStatementTable';
import StatementTrendPopup from './StatementTrendPopup';
import TopScrollContainer from './TopScrollContainer';

type Props = {
  lines: any[];
  scope: EntityScope;
  /** Ordered period columns and the source month (YYYY-MM) whose balances each column shows. */
  columns: string[];
  balanceMonthByColumn: Record<string, string>;
};

type Group = { key: string; label: string; total: string; types: string[] };
type Side = { label: string; total: string; groups: Group[] };

const SIDES: Side[] = [
  {
    label: 'ASSETS',
    total: 'TOTAL ASSETS',
    groups: [
      { key: 'currentAssets', label: 'Current Assets', total: 'Total Current Assets', types: ['bank', 'accountsreceivable', 'othercurrentasset'] },
      { key: 'fixedAssets', label: 'Fixed Assets', total: 'Total Fixed Assets', types: ['fixedasset'] },
      { key: 'otherAssets', label: 'Other Assets', total: 'Total Other Assets', types: ['otherasset'] },
    ],
  },
  {
    label: 'LIABILITIES',
    total: 'TOTAL LIABILITIES',
    groups: [
      { key: 'currentLiabilities', label: 'Current Liabilities', total: 'Total Current Liabilities', types: ['accountspayable', 'creditcard', 'othercurrentliability'] },
      { key: 'longTermLiabilities', label: 'Long Term Liabilities', total: 'Total Long Term Liabilities', types: ['longtermdebt', 'longtermliability'] },
    ],
  },
  {
    label: 'EQUITY',
    total: 'TOTAL EQUITY',
    groups: [{ key: 'equity', label: 'Equity', total: 'Total Equity', types: ['equity'] }],
  },
];

const normalizeType = (type: unknown) => String(type || '').toLowerCase().replace(/[^a-z]/g, '');
const canonicalBalanceName = (name: unknown) => {
  const value = String(name || '').trim();
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, string> = {
    projectoperatingacct: 'Operating/Checking Account',
    mmisecuritydeposits: 'Security Deposit Cash',
    securitydepositescrow: 'Security Deposit',
    acctpayableoperating: 'Acct Payable-Operating',
    accountpayableother: 'Account Payable-Other',
    acctpayablesecuritydep: 'Acct Payable-Security Dep',
    accountsreceivablerentprepaidrent: 'Accounts Receivable Rent / (Prepaid Rent)',
    retaxescacctmortgco: 'R/E Tax Esc Acct/Mortg Co',
  };
  return aliases[normalized] || value;
};
const presentationType = (type: unknown, name: unknown) => {
  if (/replacement reserve|operating acct|money market|petty cash/i.test(String(name || ''))) return 'bank';
  return normalizeType(type);
};
const canonicalDisplayCode = (code: unknown, name: unknown) => {
  const existingCode = String(code || '');
  if (!existingCode.startsWith('sln_')) return existingCode;
  const byName: Record<string, string> = {
    'A/R Other': '1390',
    'R/E Tax Esc Acct/Mortg Co': '1110',
    'Insurance Escrow/Mortg Co': '1120',
    'Capital Improvements': '1530',
    'Mortgage Payable': '2501',
  };
  return byName[String(name || '')] || '';
};

const statementNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '';
  const rounded = Math.round(value);
  const text = Math.abs(rounded).toLocaleString('en-US');
  return rounded < 0 ? `(${text})` : text;
};

type Row = {
  kind: 'heading' | 'subheading' | 'section' | 'line' | 'total' | 'grand' | 'warning';
  label: string;
  values: Record<string, number>;
  /** Collapsible equity sub-section the row belongs to (or heads, for `section` rows). */
  section?: string;
};

const EQUITY_SECTIONS = [
  { key: 'contributions', label: 'Contributions', total: 'Total Contributions', pattern: /contribut/i },
  { key: 'distributions', label: 'Distributions', total: 'Total Distributions', pattern: /distribut/i },
];

export default function PropertyBalanceSheetTable({ lines, scope, columns, balanceMonthByColumn }: Props) {
  const [hideEmptyLines, setHideEmptyLines] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set(EQUITY_SECTIONS.map((section) => section.key)));
  const toggleSection = (key: string) => setCollapsedSections((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const { rows, unclassified } = useMemo(() => {
    const accounts = new Map<string, { code: string; name: string; type: string; values: Record<string, number> }>();
    lines.forEach((line) => {
      if (String(line.reportType).toUpperCase() !== 'BALANCE') return;
      if (scope !== 'COMBINED' && line.sourceEntity !== scope) return;
      const month = String(line.periodEnd).slice(0, 7);
      columns.forEach((column) => {
        if (balanceMonthByColumn[column] !== month) return;
        const name = canonicalBalanceName(line.accountName);
        const type = presentationType(line.accountType, line.accountName);
        const key = `${type}|${name}`;
        const sourceCode = line.canonicalAccountCode || line.accountCode;
        const account = accounts.get(key) || { code: canonicalDisplayCode(sourceCode, name), name, type, values: {} };
        if (/^\d/.test(String(sourceCode)) && !/^\d/.test(account.code)) account.code = sourceCode;
        account.values[column] = (account.values[column] || 0) + Number(line.amount || 0);
        accounts.set(key, account);
      });
    });
    const sorted = [...accounts.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    const sum = (items: Array<{ values: Record<string, number> }>) =>
      Object.fromEntries(columns.map((column) => [column, items.reduce((total, item) => total + (item.values[column] || 0), 0)]));

    const output: Row[] = [];
    const sideTotals: Record<string, Record<string, number>> = {};
    SIDES.forEach((side) => {
      output.push({ kind: 'heading', label: side.label, values: {} });
      const sideAccounts: typeof sorted = [];
      side.groups.forEach((group) => {
        const groupAccounts = sorted.filter((account) => group.types.includes(account.type));
        sideAccounts.push(...groupAccounts);
        if (side.groups.length > 1) output.push({ kind: 'subheading', label: group.label, values: {} });
        const lineLabel = (account: (typeof sorted)[number]) => (account.code ? `${account.code} · ${account.name}` : account.name);
        let ungrouped = groupAccounts;
        if (group.key === 'equity') {
          EQUITY_SECTIONS.forEach((section) => {
            const sectionAccounts = ungrouped.filter((account) => section.pattern.test(account.name));
            if (!sectionAccounts.length) return;
            ungrouped = ungrouped.filter((account) => !sectionAccounts.includes(account));
            output.push({ kind: 'section', label: section.label, values: {}, section: section.key });
            sectionAccounts.forEach((account) => output.push({ kind: 'line', label: lineLabel(account), values: account.values, section: section.key }));
            output.push({ kind: 'total', label: section.total, values: sum(sectionAccounts) });
          });
        }
        ungrouped.forEach((account) => output.push({ kind: 'line', label: lineLabel(account), values: account.values }));
        if (side.groups.length > 1) output.push({ kind: 'total', label: group.total, values: sum(groupAccounts) });
      });
      sideTotals[side.label] = sum(sideAccounts);
      output.push({ kind: 'grand', label: side.total, values: sideTotals[side.label] });
    });
    const liabilitiesAndEquity = Object.fromEntries(columns.map((column) => [column, (sideTotals.LIABILITIES[column] || 0) + (sideTotals.EQUITY[column] || 0)]));
    output.push({ kind: 'grand', label: 'TOTAL LIABILITIES & EQUITY', values: liabilitiesAndEquity });
    const difference = Object.fromEntries(columns.map((column) => [column, (sideTotals.ASSETS[column] || 0) - liabilitiesAndEquity[column]]));
    if (columns.some((column) => Math.abs(difference[column]) >= 1)) {
      output.push({ kind: 'warning', label: 'Out of balance (Assets − Liabilities & Equity)', values: difference });
    }
    const knownTypes = new Set(SIDES.flatMap((side) => side.groups.flatMap((group) => group.types)));
    return { rows: output, unclassified: sorted.filter((account) => !knownTypes.has(account.type)) };
  }, [lines, scope, columns, balanceMonthByColumn]);

  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const trendColumns = [...columns].sort();
  const indexedRows = rows.map((row, rowIndex) => ({ row, rowIndex }));
  const visibleRows = indexedRows.filter(({ row }) => {
    if (row.kind !== 'line') return true;
    if (row.section && collapsedSections.has(row.section)) return false;
    return !hideEmptyLines || columns.some((column) => Math.abs(row.values[column] || 0) >= 0.5);
  });
  const selectedRow = selectedRowIndex === null ? null : rows[selectedRowIndex] || null;
  const cell: React.CSSProperties = { padding: '5px 10px', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {unclassified.length > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12 }}>
          <strong>{unclassified.length} balance sheet account{unclassified.length === 1 ? '' : 's'} with an unrecognized account type</strong> excluded: {unclassified.map((account) => `${account.code} · ${account.name} (${account.type})`).join('; ')}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>Click any line to see its trend.</span>
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
              if (row.kind === 'section' && row.section) {
                const sectionKey = row.section;
                const collapsed = collapsedSections.has(sectionKey);
                return (
                  <tr key={`${row.label}-${index}`}>
                    <td colSpan={columns.length + 1} style={{ padding: '8px 10px 2px 14px' }}>
                      <button
                        type="button"
                        aria-expanded={!collapsed}
                        onClick={() => toggleSection(sectionKey)}
                        style={{ border: 0, padding: 0, background: 'transparent', font: 'inherit', fontSize: 12, fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                      >
                        <span style={{ display: 'inline-block', width: 12, color: '#64748b' }}>{collapsed ? '▸' : '▾'}</span>
                        {row.label}
                      </button>
                    </td>
                  </tr>
                );
              }
              if (row.kind === 'heading' || row.kind === 'subheading') {
                return (
                  <tr key={`${row.label}-${index}`}>
                    <td colSpan={columns.length + 1} style={{ padding: row.kind === 'heading' ? '14px 10px 4px' : '8px 10px 2px 16px', fontSize: 12, fontWeight: row.kind === 'heading' ? 800 : 700, color: row.kind === 'heading' ? '#1e3a8a' : '#334155' }}>{row.label}</td>
                  </tr>
                );
              }
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
          subtitle={`${scope === 'COMBINED' ? 'Combined BGAH + SLN' : scope} · Balance as of period end · ${trendColumns[0]}${trendColumns.length > 1 ? ` – ${trendColumns[trendColumns.length - 1]}` : ''}`}
          columns={trendColumns}
          values={selectedRow.values}
          onClose={() => setSelectedRowIndex(null)}
        />
      )}
    </div>
  );
}
